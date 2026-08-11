/* Shared PHI heuristic — single source for shell consumers.
   Mirrors _prototypes/sp-interview/sp-interview.html:222-223, which KEEPS its inline copy:
   its test suite eval()s the SOURCE html (tests/smoke.test.js:4-17) and build injection never
   reaches source. tests/ward-capture.test.mjs T3b pins the PHI_PATTERNS line byte-identical
   in both files so they cannot drift. Injected via the PHI_HEURISTIC marker (see
   common.py SNIPPET_MARKERS). Function is reformatted multi-line so the dup-probe signature
   (first 'function ' line) stays short and stable — do not collapse to one line. */
var PHI_PATTERNS=[/\b\d{6,}\b/, /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/, /\bmrn\b/i, /\bmy patient\b/i, /\bdate of birth\b/i, /\bdob\b/i];
function looksLikePhi(t){
  for(var i=0;i<PHI_PATTERNS.length;i++){ if(PHI_PATTERNS[i].test(t)) return true; }
  return false;
}
