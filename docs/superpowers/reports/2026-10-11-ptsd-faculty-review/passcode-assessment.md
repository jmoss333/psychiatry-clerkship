# Reading companion passcode warning — October 12, 2026

Both AI features remain disabled. This assessment does not approve activation.

## Disposition

[CodeQL alert 121](https://github.com/jmoss333/psychiatry-clerkship/security/code-scanning/121), `js/insufficient-password-hash`, is not actionable for the reported stored-password-hash flaw. Static-review confidence is high; this is not a full authentication audit.

The alert's sole recorded instance is at `15ec232b2b34d1245d32bfd62a11ae2ec685adc8`. The handler is byte-identical at the reviewed PR head, `64e670139ba430c852c7d2cae15e35a2a1fbc085`. The follow-up adds an explanatory source comment without changing the comparison.

## Evidence

`sp-preview/lib/reading-companion/handler.mjs` hashes the supplied header and configured server secret only to produce equal-length buffers for `timingSafeEqual`. The helper returns a boolean. Neither digest is stored, logged, returned, included in quota records, or passed to the provider. The server environment holds the configured credential.

The request path checks origin and the disabled flag before comparison. Failed authentication returns before source disclosure, quota reservation or a provider request. Existing handler tests cover wrong access, cross-origin rejection, disabled behavior and authenticated responses without keys; validation results are recorded separately in the follow-up validation receipt.

The [CodeQL rule explanation](https://codeql.github.com/codeql-query-help/javascript/js-insufficient-password-hash/) addresses recovery of passwords from obtained stored hashes. That storage sink is absent here. [Node 22's documentation](https://nodejs.org/docs/latest-v22.x/api/crypto.html#cryptotimingsafeequala-b) requires equal-length comparison inputs and warns that surrounding code must also be considered.

Retain the comparison. Adding an expensive password derivation function to every request would not protect a stored verifier because this handler stores none. No suppression or external alert dismissal was made.

## Limits

No credentials, passcode entropy, hosted access controls or online guessing protections were inspected. No provider call, hosting-setting change, faculty approval or merge was performed. The GitHub warning remains open for human disposition; the static assessment alone is not deployment or activation clearance.
