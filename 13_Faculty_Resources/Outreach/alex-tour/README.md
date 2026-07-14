# Alex Tour

Single-page, public-by-link discussion guide for Alex Keuroghlian.

## Canonical source

- `index.html`: complete semantic page, visual system, and local-only interactions
- `netlify.toml`: publish configuration and exact CSP hashes
- `tests/alex-tour-static.test.mjs`: link, privacy, content, and security contract

## Credential separation

The page never contains, stores, sends, or logs the standardized-patient passcode or the
production faculty-console key. Joshua shares the simulation passcode separately. The faculty
console remains a secondary credential-gated link; the embedded preview is synthetic and read
only.

## Publication

- Production URL: `https://psychiatry-workforce-tour.netlify.app`
- Netlify site ID: `89d110aa-c3b2-488e-8180-ebc9687c4b4e`
- Base directory: `13_Faculty_Resources/Outreach/alex-tour`
- Build command: none
- Publish directory: `.`
- Production branch after integration: `main`

`noindex` reduces discovery but is not access control. The page must remain safe if forwarded.

## Required checks

1. Run `node --test tests/alex-tour-static.test.mjs` from the repository root.
2. Run both canonical MS3 and resident builds.
3. Verify all destination URLs and deployed response headers.
4. Verify desktop, mobile, keyboard, reduced-motion, print, and no-JavaScript paths.
5. Joshua performs the real standardized-patient credential check manually.
