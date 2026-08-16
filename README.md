# OriFlows Website — Phase 1+2 Build

## Structure
Static HTML site (no build step, no framework) — deploy as-is to Netlify/any static host.

- `index.html` — homepage (merged best-of index.html + index-2.html)
- `book.html` — audit booking (Formspree + Cal.com, unchanged, working)
- `privacy.html`, `thank-you.html` — unchanged except SEO meta added
- `/dental-clinic-automation/`, `/dental-lead-generation/`, `/ai-receptionist-dental-practice/`,
  `/missed-call-text-back-dental/`, `/dental-patient-follow-up/`, `/dental-no-show-automation/`,
  `/dental-recall-automation/` — 7 new service pages
- `/free-dental-automation-audit/` — new SEO landing page (funnels to /book.html for the actual form)
- `/resources/` — resource hub + 6 article pages
- `sitemap.xml`, `robots.txt` — new

## To deploy
Upload this whole folder as the site root (Netlify: drag-and-drop deploy, or connect to a repo).
Nested folders like `/dental-clinic-automation/index.html` resolve automatically to
`/dental-clinic-automation/` on Netlify/Vercel/GitHub Pages — no extra config needed.

## Still needed from you
See the "remaining recommendations" list in chat.
