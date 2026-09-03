/**
 * instrument-rights-gate.mjs — the executable form of the instrument-reproduction rule.
 *
 * INV-IR1: a build may publish a page naming a listed instrument only in the state its
 * recorded disposition allows. Dispositions live in instrument_rights.json (root registry,
 * schema-paired); every entry cites the decision record that established it, and status
 * changes are governance acts, never agent inferences (CLAUDE.md, Option A 2026-08-23).
 *
 * Pure module: check-static-site.mjs (§11) feeds it the shipped pages and the parsed
 * registries and hard-fails the build on every violation; tests/instrument-rights-gate.test.mjs
 * drives it directly with fixtures. No filesystem access here.
 *
 * Scan-scope decisions (deliberate, verified empirically before seeding the registry):
 *  - Signatures are matched against learner-RENDERED html text only. Matcher vocabulary in
 *    *.pack.json is how the SP engine recognizes plain clinical language and is not
 *    reproduction of any instrument.
 *  - Signatures detect the reproduction that shipped, never bedside phrasing: "thoughts of
 *    killing yourself" lives legitimately in mse.html, the SP pack, and the shell, so it is
 *    not a signature and must never become one.
 *  - Waivers and provisional standings are FILE-scoped: the recorded interim covers the
 *    page it names; the same content appearing in any new file fails hard.
 *  - requireNoScript is a pin on BUILT output and the build injects scripted chrome (theme
 *    bootstrap, surface-governance block) into every standard tool page — so it fits only
 *    pages shipped outside that chrome. The "a rights stub ships no script" invariant is
 *    enforced at SOURCE level by tests/cssrs-retirement.test.mjs, which is the right layer.
 *
 * INV-IR2 (added 2026-09-03): a withdrawal must leave a route. Removing a reproduction takes
 * away the only copy of the instrument a learner had; a page that says "not reproduced here"
 * and names no way to get the real form is a dead end, which is the failure mode ODC-4 already
 * cost this library once. officialSource records the custodian's own download; a page pinned
 * requireOfficialSourceLink must actually ship it (check A). And the route is a LINK, never a
 * mirror — hosting a whole form is broader redistribution than the excerpts that came down —
 * so a link-only entry cannot record a repo-relative path as its official source (check B).
 * Check B guards the registry itself and therefore runs whether or not a build claims
 * governance: mirroring is a rights change, not a per-site presentation choice.
 */

const NOT_REPRODUCED = /no longer reproduces|not reproduced/i;

/** Absolute https, and not this site pretending to be the custodian. */
function isCustodianUrl(url) {
  return typeof url === 'string' && /^https:\/\/[^/\s]+\./i.test(url);
}

/**
 * @param {object} args
 * @param {object} args.rights          parsed instrument_rights.json
 * @param {Array<{file:string, rel:string, text:string}>} args.pages shipped html pages
 * @param {Array|null} args.nav         parsed nav.json (sections) or null
 * @param {object|null} args.toolRegistry parsed tool_registry.json or null
 * @param {boolean} args.claimsGovernance same tri-state gate as §10 — governed-page pins
 *                                      apply only to builds that claim surface governance,
 *                                      so unrelated fixture sites are never dragged in.
 *                                      The signature scan ALWAYS runs.
 * @returns {{hard: string[], info: string[]}}
 */
export function evaluateInstrumentRights({ rights, pages, nav, toolRegistry, claimsGovernance }) {
  const hard = [];
  const info = [];
  const infoSeen = new Set(); // one info line per (instrument, page), not per signature
  const instruments = (rights && Array.isArray(rights.instruments)) ? rights.instruments : [];
  const shipped = new Map((pages || []).map((p) => [p.file, p]));

  for (const entry of instruments) {
    const label = entry.instrument || entry.id || '(unnamed instrument)';

    if (!entry.decisionRef || !String(entry.decisionRef).trim()) {
      hard.push(`instrument-rights: ${label} has no decisionRef — a disposition without its `
        + 'decision record is not a disposition; cite the plan-doc anchor that established it');
      continue;
    }
    if (entry.status === 'cleared') continue;

    // INV-IR2 check B — the recorded route must point at the custodian, not at us. This runs
    // before the governance gate below because a mirrored form is a rights problem on every
    // site that ships it, not a presentation pin one build can opt out of.
    const src = entry.officialSource || null;
    if (src && src.redistribution === 'link-only') {
      for (const [field, url] of [['formUrl', src.formUrl], ['trainingUrl', src.trainingUrl]]) {
        if (url === undefined) continue;
        if (!isCustodianUrl(url)) {
          hard.push(`instrument-rights: ${label} officialSource.${field} is "${url}" — a `
            + 'link-only route must be an absolute https URL at the custodian. Hosting the form '
            + 'here is broader redistribution than the excerpts that were withdrawn; mirroring '
            + 'is a governance decision with its own decisionRef, not a registry edit');
        }
      }
    }
    if ((entry.status === 'retired' || entry.status === 'restricted') && !src) {
      hard.push(`instrument-rights: ${label} is ${entry.status} with no officialSource — a `
        + 'withdrawal must leave a route. Record where the learner gets the real form; '
        + `disposition: ${entry.decisionRef}`);
    }

    const waiver = entry.interimWaiver || null;
    const waiverFiles = new Set(waiver && Array.isArray(waiver.files) ? waiver.files : []);
    const declaredPages = new Set((entry.pages || []).map((p) => p.file));

    for (const sig of entry.signatures || []) {
      const needle = sig.toLowerCase();
      for (const page of pages || []) {
        if (!page.text.toLowerCase().includes(needle)) continue;
        if (entry.status === 'retired' || entry.status === 'restricted') {
          hard.push(`instrument-rights: ${entry.status} ${label} content in ${page.rel}: `
            + `matched signature "${sig}" — disposition: ${entry.decisionRef}`);
        } else if (entry.status === 'flagged-interim' || entry.status === 'unresolved') {
          if (waiver && waiverFiles.has(page.file)) {
            const key = `${entry.id}:${page.rel}:waived`;
            if (!infoSeen.has(key)) {
              infoSeen.add(key);
              info.push(`instrument-rights: ${label} signature in ${page.rel} covered by recorded `
                + `interim waiver (${waiver.recordedIn})`);
            }
          } else {
            hard.push(`instrument-rights: ${entry.status} ${label} signature "${sig}" in `
              + `${page.rel} with no recorded interim waiver covering that file — `
              + `disposition: ${entry.decisionRef}`);
          }
        } else if (entry.status === 'provisional') {
          if (declaredPages.has(page.file)) {
            const key = `${entry.id}:${page.rel}:provisional`;
            if (!infoSeen.has(key)) {
              infoSeen.add(key);
              info.push(`instrument-rights: provisional ${label} content in ${page.rel} `
                + `(pending: ${entry.decisionRef})`);
            }
          } else {
            hard.push(`instrument-rights: provisional ${label} signature "${sig}" in ${page.rel} `
              + '— the provisional standing covers only its declared page(s), not new surfaces');
          }
        }
      }
    }

    if (!claimsGovernance) continue;
    for (const pin of entry.pages || []) {
      const page = shipped.get(pin.file);
      if (!page) continue; // absence from the build is §2/§6's finding, not a rights pin
      if (pin.requiredTitle && Array.isArray(nav)) {
        for (const sec of nav) {
          for (const item of sec.items || []) {
            if (item && item.f === pin.file && item.t !== pin.requiredTitle) {
              hard.push(`instrument-rights: governed title drift for ${pin.file}: nav says `
                + `"${item.t}" but the recorded title is "${pin.requiredTitle}" — titles on `
                + 'rights-governed pages change via instrument_rights.json, not ad hoc');
            }
          }
        }
      }
      if (pin.requiredDisclaimerType && toolRegistry && Array.isArray(toolRegistry.tools)) {
        const reg = toolRegistry.tools.find((t) => t && t.file === pin.file);
        if (!reg || reg.disclaimerType !== pin.requiredDisclaimerType) {
          hard.push(`instrument-rights: ${pin.file} must carry disclaimerType `
            + `"${pin.requiredDisclaimerType}" in tool_registry.json`
            + (reg ? ` (found "${reg.disclaimerType}")` : ' (no registry entry found)'));
        }
      }
      if (pin.requireNotReproducedStatement && !NOT_REPRODUCED.test(page.text)) {
        hard.push(`instrument-rights: ${pin.file} lost its not-reproduced statement — the page `
          + 'must say on its face that the instrument is not reproduced');
      }
      if (pin.requireNoScript && /<script\b/i.test(page.text)) {
        hard.push(`instrument-rights: ${pin.file} ships a script — a rights stub is static by `
          + 'design; a script is a step back toward a functional form');
      }
      // INV-IR2 check A. A substring match over the whole shipped page, deliberately: two of
      // the four routed pages build their anchors in React, so the URL reaches the learner
      // inside a script string rather than as a literal href="…" — requiring the attribute
      // form would pass the static stubs and fail the tools. What this pins is that the
      // recorded URL is present in what ships; that it is wrapped in an anchor is pinned per
      // page by tests/cssrs-retirement.test.mjs and tests/bfcrs-presentation.test.mjs.
      if (pin.requireOfficialSourceLink) {
        if (!src || !src.formUrl) {
          hard.push(`instrument-rights: ${pin.file} is pinned requireOfficialSourceLink but `
            + `${label} records no officialSource.formUrl — the pin demands a route the `
            + 'registry never named');
        } else if (!page.text.includes(src.formUrl)) {
          hard.push(`instrument-rights: ${pin.file} lost its official-source link — the page `
            + `must send the learner to ${src.formUrl}. A page that says the instrument is not `
            + 'reproduced and names no route is a dead end, not a rights stub');
        }
      }
    }
  }

  return { hard, info };
}
