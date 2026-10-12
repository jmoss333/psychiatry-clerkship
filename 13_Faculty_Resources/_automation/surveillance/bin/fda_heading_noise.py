"""Recognize the observed FDA clozapine heading-ID batch, not arbitrary link edits."""
import re

SOURCE_URL = ('https://www.fda.gov/drugs/drug-safety-communications/'
              'fda-removes-risk-evaluation-and-mitigation-strategy-rems-program-antipsychotic-drug-clozapine')
HEADINGS = frozenset((
    'What Is FDA Announcing?', 'What Is FDA Doing?',
    'What Is Clozapine, and How Can It Help Me?', 'What Should Patients and Caregivers Do?',
    'What Should Health Care Professionals Do?', 'What Did FDA Find?', 'Data Summary',
    'What Is My Risk?', 'How Do I Report Side Effects of Clozapine?',
    'How Can I Get New Safety Information on Medicines I’m Prescribing or Taking?',
))
# Preserve the entire heading/link spelling except its generated identifier.
# In normalized Firecrawl snapshots the literal fragment separator has two escapes.
HEADING_LINK = re.compile(r'(?<![#\\])## \[([^\]\n]+)\]\(('
                          + re.escape(SOURCE_URL) + r'\\{2}#)(6[0-9a-f]{12})\)')


def generated_heading_ids_only(prior, row):
    if any(r.get('source_id') != 'clozapine-rems' or r.get('source_url') != SOURCE_URL
           or r.get('extractor') != 'firecrawl-markdown-main-v1' for r in (prior, row)):
        return False
    before, after = prior.get('text'), row.get('text')
    if not isinstance(before, str) or not isinstance(after, str) or before == after:
        return False
    # Do not interpret heading-like strings in code or HTML as headings.
    if any(c in text for text in (before, after) for c in ('`', '~', '<', '>')):
        return False
    old, new = list(HEADING_LINK.finditer(before)), list(HEADING_LINK.finditer(after))
    for matches in (old, new):
        if len(matches) != len(HEADINGS) or {m[1] for m in matches} != HEADINGS:
            return False
        ids = [m[3] for m in matches]
        # Observed PHP-style IDs share an eight-hex batch prefix and are unique.
        if len(set(ids)) != len(ids) or len({value[:8] for value in ids}) != 1:
            return False
    if old[0][3][:8] == new[0][3][:8]:
        return False
    def without_ids(text, matches):
        # Remove only verified spans; no sentinel text can collide with source text.
        pieces, end = [], 0
        for match in matches:
            pieces.append(text[end:match.start(3)])
            end = match.end(3)
        pieces.append(text[end:])
        return pieces
    return without_ids(before, old) == without_ids(after, new)
