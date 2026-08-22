# Therapy Evidence Library — Verification Gate Result

**Run:** 2026-08-21 · **Scope:** all 43 KEEPs + 3 HOLD→D10 + the retracted tombstone + the Flückiger add-by-hand DOI = **48 identifiers**
**Verdict:** clean enough to stage, with **three defects caught** and **one tooling problem to fix**.

---

## 1. Headline

| Check | Result |
|---|---|
| Retracted | **1** — PMID 27810717, already tombstoned. No new retractions. |
| Expressions of concern | **0** |
| Title mismatches (wrong paper at the identifier) | **0 of 48** |
| Failed to resolve | **0** |
| Errata / corrections | **1** — PMID 32428905 |
| Corrupt DOI | **1** — PMID 40471224 |
| Possible superseded version | **1** — PMID 21154340 (needs a human look, see §3) |
| Open-access status upgrades | **14** |

**The annotations were not citing wrong papers.** Every expected title matched its resolved record, including the four that scored below full token overlap only because the expected string carried a parenthetical (Pharoah, Cochrane MI, StatPearls, the TFP/GPM family paper). That is the single most important thing this gate was checking for, and it passed.

---

## 2. ⚠️ Tooling — fix before the next run

**Scholar Sidekick failed on every call.** `resolveIdentifier` returned *"You are not subscribed to this API"*; `checkRetraction` and `checkOpenAccess` alternated between that and *"Too many requests"*. Persistent across ~4 minutes and two backoffs. No `SCHOLAR_API_KEY` or `RAPIDAPI_KEY` in the environment.

**Fix:** a free `ssk_` key from `scholar-sidekick.com/account`, set as `SCHOLAR_API_KEY`. This matters beyond convenience — the whole documented pipeline (`resolveIdentifier → checkOpenAccess → checkRetraction → formatCitation`) is the gate this project keeps insisting on, and right now it does not run.

**What was used instead:** NCBI E-utilities + Crossref for resolution, Crossref `updated-by` (the Retraction Watch feed) plus PubMed `CommentsCorrectionsList` and publication types for retraction, and Unpaywall v2 for OA. These are the same upstream sources Scholar Sidekick wraps, and retraction status was checked **twice independently** — Crossref and PubMed agreed exactly on all 48.

The data is sound. **The provenance chain does not match the documented pipeline**, so once the key is in place, re-run the gate through Scholar Sidekick so the recorded `verifiedAt` provenance is the one the runbook claims.

---

## 3. Three defects that would have shipped

**① PMID 40471224 — PubMed's DOI is corrupt.**
PubMed carries `10.4081/ripppo.2025.2025.841` — the year is duplicated, and it 404s at Crossref. Correct DOI: **`10.4081/ripppo.2025.841`** (same title, author Difronzo, same year). If the harvest copied the DOI from PubMed, the reading list ships a dead link on the *only rupture-repair paper in the entire 250-candidate harvest*.

**② PMID 32428905 — carries an erratum.**
*Psychother Psychosom* 2020;89(6):408 · DOI `10.1159/000508894`. Not a retraction, and the paper stands — but a teaching library that cites a corrected paper without noting the correction is making the same class of claim the attestation work is trying to eliminate. Add the erratum to the registry entry.

**③ PMID 21154340 — possible version confusion. Needs your eyes.**
The resolved DOI is `10.1002/14651858.CD000088.**pub2**`, and Crossref flags it as superseded by `.pub3` dated 2010-12-08. But PMID 21154340 is itself dated December 2010, which is the `.pub3` date — so either the PMID→DOI mapping is off, or the list is citing a superseded version.

**Do not guess this one.** Open the Cochrane record and confirm which version PMID 21154340 is, then cite that version explicitly. Citing a superseded Cochrane review in a curated teaching library is exactly the kind of error a clerkship director would notice — and it is the anchor paper for your strongest domain.

---

## 4. Open-access upgrades — 14 papers can carry public links

Europe PMC's `isOpenAccess` field disagreed with Unpaywall on 14 items, **always in the same direction**: EPMC said closed, Unpaywall found a free legal copy. No reverse cases. That is 14 papers a student can open at 11pm without a proxy.

**But three of them need an editorial decision, and I'd argue against the free link in two cases:**

| Caveat | PMIDs | Why it matters |
|---|---|---|
| **`submittedVersion`** — preprint or author manuscript, **not the version of record** | 42018336 (BOOTS RCT), 38084817 (Cochrane MI), 32428905 (STPP somatic) | A student reading the submitted version of a JAMA Psychiatry trial is not reading the published paper. For a teaching library, **link the version of record via proxy** and note that a free author manuscript exists — don't substitute one for the other. |
| **`bronze`** — free to read at the publisher, **no open licence** | 31050757 (FEP family intervention), 36525623 (Dodo bird) | Bronze links can be withdrawn without notice. Usable, but flag them as fragile in the registry so a future link-check failure is expected rather than alarming. |

The remaining 11 are gold or hybrid published-version links — safe to use publicly.

**Suggested `linkType` policy for `evidence_registry.json`:**
```
open        → gold or hybrid, publishedVersion        (public link, no proxy)
open-fragile→ bronze                                   (public link, flagged for link-check)
proxy       → closed, OR free copy is submittedVersion (institutional link only)
```

---

## 5. Ready to stage

**43 KEEPs verified and clear.** Nothing on the list is retracted, none carries an expression of concern, and every identifier resolves to the paper the annotation describes.

Before staging into `therapy_library.json`:
1. Correct the 40471224 DOI.
2. Add the 32428905 erratum note.
3. Resolve the 21154340 version question by hand.
4. Apply the `linkType` policy above rather than copying EPMC's OA flag.
5. Set `verifiedAt: 2026-08-21` — and re-stamp it after the Scholar Sidekick re-run.

**Still outstanding from the annotation pass, unchanged by this gate:**
- Four domains need the §4 query re-runs (D7 MI, D8 trauma-informed, D9 mentalization, D10 meaning-centred) before their triage is final.
- Four add-by-hand papers: Flückiger 2018 (**verified — `10.1037/pst0000172`, "The alliance in adult psychotherapy: A meta-analytic synthesis," Psychotherapy 2018;55(4)** — matches, and it fixes the WP-26 "Norcross 2011" miscitation), the Eubanks/Muran rupture-repair meta, the two Stanley & Brown foundational papers, and an MI concept primer.
- D10 is held for the Kaitlin merge.
- The annotations themselves were written from titles. Now that DOIs and OA links are confirmed, **tighten each KEEP's annotation against the actual abstract before it ships to students** — the annotated file flags this itself for every 2025–26 title.

---

## 6. What the gate proves

Two runs, two catches. The pilot found a retracted meta-analysis sitting at the top of a relevance-ranked search. This run found a dead DOI, an unflagged erratum, and a possible superseded Cochrane version — none of which a title-level read would have surfaced, and all of which would have reached students.

Neither catch required clinical judgment. Both required running the check.
