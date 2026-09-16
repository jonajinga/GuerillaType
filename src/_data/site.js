export default {
  title: "GuerillaType",
  shortTitle: "GuerillaType",
  description: "A free, open-source typing tutor for everyone — beginners learning home row, pros chasing 100 wpm, writers warming up. Lessons, drills, challenges, adaptive practice, custom text. No accounts.",
  url: process.env.SITE_URL || "https://guerillatype.com",
  author: "Pikes Peak Web Designs",
  email: "hello@guerillatype.com",
  language: "en",
  locale: "en_US",
  themeColor: "#14161e",
  // Share card. PNG, not SVG: every major platform (X, Facebook,
  // LinkedIn, Slack, iMessage) refuses an SVG og:image and shows no
  // preview at all. Regenerate with `npm run og-default` after
  // changing the design in src/assets/img/og-default.svg.
  ogImage: "/assets/img/og-default.png",
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: "GuerillaType, a free typing tutor for everyone",
  repo: "https://github.com/jonajinga/GuerillaType",
  // Analytics — fill these in to enable. Both are optional; both are
  // privacy-friendly and require no cookie banner.
  umami: { enabled: true, src: "https://cloud.umami.is/script.js", websiteId: "7627d387-9e08-4f42-92cd-a36f19785920" },
  cloudflare: { enabled: false, token: "" },
};
