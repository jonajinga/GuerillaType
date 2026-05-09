/* Web3Forms config. The access key routes form submissions to the
   project inbox tied to it on web3forms.com. Pages submit directly
   to https://api.web3forms.com/submit; on success Web3Forms redirects
   to `redirectBase` carrying any query params we set (kind, source). */

export default {
  accessKey: process.env.WEB3FORMS_KEY || "99e924f9-d456-4c02-9b8d-cca354b3f5f4",
  endpoint: "https://api.web3forms.com/submit",
  // Web3Forms reads each form's `redirect` hidden input. Every form
   // points at /thank-you/ with ?for=<kind> so a single smart page
   // can tailor the confirmation message.
  redirectBase: "https://guerillatype.com/thank-you/",
};
