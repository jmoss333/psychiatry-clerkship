#!/usr/bin/env python3
"""Project reviewed case-journey drafts into the learner layer.

    python3 13_Faculty_Resources/_automation/case_journeys/project_case_journeys.py --write
    python3 13_Faculty_Resources/_automation/case_journeys/project_case_journeys.py --check

Source of truth: docs/case-journeys/reviewed-snapshot/*.json (faculty drafts, with facultyNotes)
plus docs/case-journeys/sources.json and docs/case-journeys/release-review.json.
Target: 08_Cases_and_Simulation/case-journeys/<case>.json (learner layer).

Rules (r2, see docs/case-journeys/README.md):
  * every chapter field is carried verbatim except `facultyNotes`;
  * facultyNotes.advancedPrompt -> residentExtension, facultyNotes.pitfall -> commonMisstep,
    facultyNotes.sourceIds -> sourceIds (teachingPoint stays faculty-only);
  * top-level `sources` is the subset of sources.json actually cited (id, title, url);
  * status/learnerRelease/authorship/audience/disclaimer come from release-review.json;
  * the historical "DRAFT - FACULTY REVIEW REQUIRED." prefix is removed from the disclaimer;
  * ids drop the `_draft` marker;
  * a tool link carrying an `anchor` (a pharmacy drug card) ships only while that card's
    facultyReview.status is `reviewed` in pharmacy.json; otherwise the link is held back and the
    learner file carries the chapter without it. Re-run --write when the card is attested;
  * each chapter carries `practiceTasks` (which connected-practice tasks fit it) from
    docs/case-journeys/practice-coverage.json so the renderer can mark them as suggested.
The script never edits the snapshot. `--check` exits 1 if any learner file differs.
"""
import argparse, hashlib, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import case_json

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SNAP = os.path.join(ROOT, 'docs', 'case-journeys', 'reviewed-snapshot')
OUT = os.path.join(ROOT, '08_Cases_and_Simulation', 'case-journeys')
SOURCES = os.path.join(ROOT, 'docs', 'case-journeys', 'sources.json')
REVIEW = os.path.join(ROOT, 'docs', 'case-journeys', 'release-review.json')
PHARMACY = os.path.join(ROOT, 'pharmacy.json')
COVERAGE = os.path.join(ROOT, 'docs', 'case-journeys', 'practice-coverage.json')
CASES = ['eli-psychosis', 'leah-depression-trauma', 'marisol-delirium-capacity']
DRAFT_PREFIX = 'DRAFT — FACULTY REVIEW REQUIRED. '
TOP_ORDER = ['id', 'title', 'status', 'learnerRelease', 'releaseRevision', 'clinicalAuthorship', 'setting',
             'disclaimer', 'audience', 'timeFrame', 'suggestedAccent', 'patient', 'learningObjectives',
             'sources', 'weeks']
WEEK_ORDER = ['id', 'label', 'title', 'focus', 'objectiveIds', 'practiceTasks', 'patientState', 'learnerTask', 'checklist',
              'handoff', 'reflectionPrompt', 'residentExtension', 'commonMisstep', 'localNote', 'sourceIds', 'links']


def load(path):
    with open(path, encoding='utf-8') as fh:
        return json.load(fh)


def dump(obj):
    return case_json.dump_text(obj)


def sha256(path):
    with open(path, 'rb') as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def attested_cards():
    if not os.path.exists(PHARMACY):
        return set()
    return {r['id'] for r in load(PHARMACY).get('records', []) if (r.get('facultyReview') or {}).get('status') == 'reviewed'}


def coverage_tasks():
    if not os.path.exists(COVERAGE):
        return {}
    return load(COVERAGE).get('chapters', {})


def project_week(week, cards, coverage):
    notes = week.get('facultyNotes') or {}
    out = {k: v for k, v in week.items() if k != 'facultyNotes'}
    if week['id'] in coverage:
        out['practiceTasks'] = list(coverage[week['id']])
    out['links'] = [l for l in week.get('links', []) if not l.get('anchor') or l['anchor'] in cards]
    out['residentExtension'] = notes.get('advancedPrompt', '')
    out['commonMisstep'] = notes.get('pitfall', '')
    out['sourceIds'] = list(notes.get('sourceIds', []))
    if 'localNote' in week and week['localNote'] in (None, ''):
        out.pop('localNote')
    return {k: out[k] for k in WEEK_ORDER if k in out} | {k: v for k, v in out.items() if k not in WEEK_ORDER}


def project(snapshot, sources, review):
    cited = sorted({sid for w in snapshot['weeks'] for sid in (w.get('facultyNotes') or {}).get('sourceIds', [])})
    by_id = {s['id']: s for s in sources['sources']}
    missing = [sid for sid in cited if sid not in by_id]
    if missing:
        raise SystemExit('unknown sourceIds: %s' % missing)
    out = dict(snapshot)
    out['id'] = snapshot['id'].replace('_draft', '')
    out['status'] = 'released'
    out['learnerRelease'] = True
    out['releaseRevision'] = review['revision']
    out['clinicalAuthorship'] = review['clinicalAuthorship']
    out['audience'] = review['audienceLabel']
    disclaimer = snapshot['disclaimer']
    if disclaimer.startswith(DRAFT_PREFIX):
        disclaimer = disclaimer[len(DRAFT_PREFIX):]
    out['disclaimer'] = disclaimer
    out['sources'] = [{'id': by_id[s]['id'], 'title': by_id[s]['title'], 'url': by_id[s]['url']} for s in cited]
    cards = attested_cards()
    coverage = coverage_tasks()
    out['weeks'] = [project_week(w, cards, coverage) for w in snapshot['weeks']]
    return {k: out[k] for k in TOP_ORDER if k in out} | {k: v for k, v in out.items() if k not in TOP_ORDER}


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--write', action='store_true')
    g.add_argument('--check', action='store_true')
    g.add_argument('--hashes', action='store_true', help='print snapshot SHA-256s for release-review.json')
    args = ap.parse_args()
    sources = load(SOURCES)
    review = load(REVIEW)
    if args.hashes:
        print(json.dumps({c + '.json': sha256(os.path.join(SNAP, c + '.json')) for c in CASES}, indent=2))
        return 0
    bad = 0
    for case in CASES:
        snap_path = os.path.join(SNAP, case + '.json')
        recorded = review['sources'].get(case + '.json')
        if recorded != sha256(snap_path):
            print('release-review.json hash does not match %s' % snap_path)
            bad += 1
        text = dump(project(load(snap_path), sources, review))
        target = os.path.join(OUT, case + '.json')
        if args.write:
            with open(target, 'w', encoding='utf-8') as fh:
                fh.write(text)
            print('wrote', os.path.relpath(target, ROOT))
        else:
            current = open(target, encoding='utf-8').read() if os.path.exists(target) else ''
            if current != text:
                print('learner file differs from projection:', os.path.relpath(target, ROOT))
                bad += 1
    if args.check:
        print('projection check:', 'OK' if not bad else '%d problem(s)' % bad)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
