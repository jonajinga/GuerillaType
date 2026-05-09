/* Curated testimonials. New entries land in the project inbox via
   /contribute/testimonial/; only the ones the user opted in to publish
   AND that pass a manual read-through get added here.

   Schema: { id, rating (1-5), name, role?, length, body, date, source }
     - rating is the star count
     - name is the public display name; role is optional context
     - length is one of "first-week" | "first-month" | "few-months" | "regular" | "power-user"
     - body is the testimonial text (trim to 600 chars; no em-dashes)
     - date is ISO YYYY-MM-DD

   Empty by default -- the /reviews/ page renders a friendly empty
   state until the first approved testimonial lands here. */

export default [
  // Example shape (commented out until real reviews arrive):
  // {
  //   id: "r-2026-05-08-ada",
  //   rating: 5,
  //   name: "Ada L.",
  //   role: "Software engineer",
  //   length: "regular",
  //   body: "Adaptive mode finally cured my pinky-letter blind spot. I went from 70 to 92 wpm in two months without grinding through tutorials I'd already done a dozen times.",
  //   date: "2026-05-08",
  // },
];
