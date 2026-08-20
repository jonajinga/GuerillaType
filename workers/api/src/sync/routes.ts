import { HttpError, assertTrustedOrigin, corsHeaders, json } from "../http.js";
import { requireUser } from "../auth/session.js";
import { nowIso, sha256Hex } from "../crypto.js";
import type { Env } from "../env.js";

/* Sync.

   The server is a conflict-free blob store and nothing more. It does not
   understand the data, does not merge it, and holds no opinion about its
   schema beyond "these are bytes belonging to this device".

   That falls out of the client's slot rule: every accumulating counter is
   stored per device, and a device only ever writes its OWN slot. So each
   device gets exactly one object, writes only that object, and the client
   folds them on read.

   The alternative -- one shared object the server merges into -- needs a
   read-modify-write, which races when two devices push at once and loses
   an update. Per-device objects have no such race: no version guard, no
   compare-and-swap, no retry loop. The conflict is designed out rather
   than handled.

   It also keeps the merge rule in exactly one place (the client) instead
   of being reimplemented here and slowly drifting out of agreement. */

const MAX_BLOB_BYTES = 8 * 1024 * 1024;
const UUID_RE = /^[a-f0-9-]{36}$/i;
const DEVICE_RE = /^[a-zA-Z0-9_-]{8,64}$/;

/* Anything that becomes an R2 key segment is validated first. This is
   path-traversal defense, not tidiness. */
function keyFor(userId: string, profileId: string, deviceId: string): string {
  if (!UUID_RE.test(profileId)) throw new HttpError(400, "bad_profile_id", "Malformed profile id.");
  if (!DEVICE_RE.test(deviceId)) throw new HttpError(400, "bad_device_id", "Malformed device id.");
  return `u/${userId}/p/${profileId}/d/${deviceId}.json.gz`;
}

/* GET /sync -- the manifest. Lists every blob the account has so a client
   can fetch only what changed, and skip its own. */
export async function manifest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { user } = await requireUser(request, env, ctx);
  const { results } = await env.DB.prepare(
    `SELECT profile_id, device_id, name, updated_at, bytes, checksum
       FROM profile_blobs WHERE user_id = ? ORDER BY updated_at DESC`,
  ).bind(user.id).all<any>();

  const profiles = new Map<string, any>();
  for (const r of results ?? []) {
    if (!profiles.has(r.profile_id)) {
      profiles.set(r.profile_id, { id: r.profile_id, name: r.name, devices: [] });
    }
    profiles.get(r.profile_id).devices.push({
      deviceId: r.device_id, updatedAt: r.updated_at, bytes: r.bytes, checksum: r.checksum,
    });
  }
  return json({ profiles: [...profiles.values()] }, request, env);
}

/* GET /sync/:profileId/:deviceId -- one device's bytes. */
export async function pull(
  request: Request, env: Env, ctx: ExecutionContext, profileId: string, deviceId: string,
): Promise<Response> {
  const { user } = await requireUser(request, env, ctx);
  const obj = await env.SYNC.get(keyFor(user.id, profileId, deviceId));
  if (!obj) throw new HttpError(404, "not_found", "No such sync blob.");
  // Served as opaque bytes the client gunzips itself -- no
  // Content-Encoding, so behaviour never depends on which fetch stack
  // transparently inflates and which does not.
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/gzip",
      "Cache-Control": "private, no-store",
      ...corsHeaders(request, env),
    },
  });
}

/* PUT /sync/:profileId?device=&name= -- write THIS device's blob.

   A device may only write its own slot, so there is nothing to reconcile
   and no version to check. Re-sending the same body is a no-op by
   construction, which is what lets the client's outbox retry freely. */
export async function push(
  request: Request, env: Env, ctx: ExecutionContext, profileId: string,
): Promise<Response> {
  assertTrustedOrigin(request, env);
  const { user } = await requireUser(request, env, ctx);
  const url = new URL(request.url);
  const deviceId = url.searchParams.get("device") ?? "";
  const name = (url.searchParams.get("name") ?? "").slice(0, 120);

  const key = keyFor(user.id, profileId, deviceId);

  // Check the declared length first so an oversized upload is rejected
  // without buffering it.
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > MAX_BLOB_BYTES) throw new HttpError(413, "too_large", "That profile is too large to sync.");

  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_BLOB_BYTES) throw new HttpError(413, "too_large", "That profile is too large to sync.");
  if (body.byteLength === 0) throw new HttpError(400, "empty_body", "Nothing to sync.");

  await env.SYNC.put(key, body);

  const ts = nowIso();
  const checksum = await sha256Hex(`${body.byteLength}:${key}:${ts}`);
  await env.DB.prepare(
    `INSERT INTO profile_blobs (user_id, profile_id, device_id, name, updated_at, bytes, checksum)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, profile_id, device_id)
     DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at,
                   bytes = excluded.bytes, checksum = excluded.checksum`,
  ).bind(user.id, profileId, deviceId, name, ts, body.byteLength, checksum).run();

  return json({ ok: true, bytes: body.byteLength, updatedAt: ts }, request, env);
}

/* DELETE /sync/:profileId -- forget a profile across every device. Part
   of making "delete my account" mean what it says. */
export async function forget(
  request: Request, env: Env, ctx: ExecutionContext, profileId: string,
): Promise<Response> {
  assertTrustedOrigin(request, env);
  const { user } = await requireUser(request, env, ctx);
  if (!UUID_RE.test(profileId)) throw new HttpError(400, "bad_profile_id", "Malformed profile id.");

  const { results } = await env.DB.prepare(
    `SELECT device_id FROM profile_blobs WHERE user_id = ? AND profile_id = ?`,
  ).bind(user.id, profileId).all<{ device_id: string }>();

  await Promise.all((results ?? []).map((r) => env.SYNC.delete(keyFor(user.id, profileId, r.device_id))));
  await env.DB.prepare(`DELETE FROM profile_blobs WHERE user_id = ? AND profile_id = ?`)
    .bind(user.id, profileId).run();

  return json({ ok: true, removed: (results ?? []).length }, request, env);
}
