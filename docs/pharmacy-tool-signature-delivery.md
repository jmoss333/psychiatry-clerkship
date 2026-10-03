# Deliver the existing Pharmacy tool review

The Pharmacy tool duplicated its review status in its HTML metadata and in the
faculty ledger. Its HTML said pending even after the console recorded a genuine
review. Setting the HTML to reviewed first would create the reverse mismatch on
main and prevent the preparatory change from passing.

This change removes only the optional HTML `status` field. The existing metadata
parser requires `tool` and `audience`, not `status`; the existing learner projection
takes review state from the validated, hash-checked ledger. No parser, validator,
hash rule, clinical text, medication record, or signature is changed. The entire
HTML, including its metadata, remains inside both signature hashes.

The main ledger remains pending. The older Pharmacy signature on `attest/pending`
will be stale against the changed bytes and must not be manually refreshed. The
regression fixture checks pending, old-signature drift, fresh-signature review,
later drift, reopening, and rejection of an unbound reviewed row. The existing
Pharmacy tests separately keep unreviewed medication cards out of learner feeds.

## Order of operations

1. Obtain approval to merge this preparatory PR, then merge it ordinarily after
   exact-head checks pass. Preparing this PR does not authorize its merge.
2. Normally merge current main into `attest/pending` (never rebase or squash),
   retaining both original console commits and all four genuine rows. Verify the
   branch contains this metadata fix. PR #946 stays unmerged while Pharmacy's old
   signature is stale. The other three signatures must still match unchanged.
3. Ask Josh to re-sign **Psychiatric Pharmacy, the tool, only**, using the steps
   below. Do not re-sign Communication Practice, Daily Review, or Screeners.
4. Fetch the console's new commit. Verify only Pharmacy's attestation changed,
   both hashes match current main, console author/committer provenance is intact,
   and the other three rows are unchanged. Run strict signature checks and all
   required CI on that exact head. Then the existing four-signature delivery
   approval permits an ordinary merge of #946.
5. Let the next existing scheduled release train publish. Verify its receipt,
   authenticated production deployments, and both canonical sites' governance
   status before reporting the signatures live. No manual release or dispatch.

A separate production release before step 3 is unnecessary: this fix changes only
an HTML comment, not the learner-visible tool. If the scheduled train publishes
the preparatory fix before signature delivery, Pharmacy correctly remains pending
until the subsequent signed release. Never describe a main merge as already live.

## Josh's single-tool step — only after step 2 is confirmed

Open the [faculty console](https://clerkship-faculty-attest.netlify.app/) in a
separate tab and reload its repository view. In **Search pages, tools, and
questions**, find **Psychiatric Pharmacy** and select the tool (`pharmacy.html`),
not a medication card. It should show that its content changed since signing;
inspect **What changed since you signed** to confirm the only source change is
the removed metadata status.

Complete the console's **Review** and **Resolve** steps for that tool. The
learner-visible content is unchanged. Use **Open learner surface (new tab)** if
needed, and record the requested review and interaction checks. In **Confirm**,
choose **Attest this tool** (the Ready button may append “reviewed · accurate … ·
links tested”). Wait for the confirming reload and commit receipt.

If it still appears complete with no attestation action, stop and refresh/check
the branch integration rather than reopening other items or signing a batch.
Only Pharmacy needs a fresh signature. This workflow does not approve the new
medication cards in #944; their independent pending review states remain intact.
