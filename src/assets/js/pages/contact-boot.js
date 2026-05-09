/* Contact form — submit via fetch to Web3Forms with a friendly inline
   confirmation. Falls back to a normal POST + redirect if JS is off
   (the form's action attribute does that natively). */

const form = document.getElementById("contact-form");
const status = document.getElementById("contact-status");
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    if (data.get("botcheck")) return; // honeypot
    status.textContent = "Sending…";
    status.className = "contact-status contact-status--pending";
    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        body: data,
        headers: { Accept: "application/json" },
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        status.textContent = "Sent. Thanks — I'll read it.";
        status.className = "contact-status contact-status--ok";
        form.reset();
        setTimeout(() => { window.location.href = "/contact-thanks/"; }, 1200);
      } else {
        status.textContent = json.message || "Something went wrong. Try again, or email hello@guerillatype.com.";
        status.className = "contact-status contact-status--bad";
      }
    } catch (err) {
      status.textContent = "Network error. Try again, or email hello@guerillatype.com.";
      status.className = "contact-status contact-status--bad";
    }
  });
}
