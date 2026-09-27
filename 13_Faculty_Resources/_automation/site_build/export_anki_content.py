#!/usr/bin/env python3
"""Export Concepts exclusively from the built, governance-filtered native feed."""
import argparse
from collections import defaultdict
import html
import json
from pathlib import Path
import genanki

MODEL_BASIC_ID = 1740111001
MODEL_CLOZE_ID = 1740111002
DECK_ID = 2059400192
DECK_NAME = "Psychiatry Clerkship Library — Concepts (Moss)"

CSS = """
.card { font-family:-apple-system,Segoe UI,Roboto,sans-serif; font-size:18px;
        line-height:1.55; color:#1a1a1a; background:#fbf7f0;
        text-align:left; padding:16px 20px; }
.topic { font-size:13px; font-weight:700; letter-spacing:.04em;
         text-transform:uppercase; color:#8a5a1a; margin-bottom:10px; }
.cloze { font-weight:700; color:#1f6f54; }
.src { margin-top:14px; font-size:13px; color:#777; }
hr { border:none; border-top:1px solid #d9cdb8; margin:12px 0; }
"""

BASIC_MODEL = genanki.Model(
    MODEL_BASIC_ID, "PCL Concept Basic (Moss)",
    fields=[{"name": "UID"}, {"name": "Topic"}, {"name": "Front"},
            {"name": "Back"}, {"name": "Source"}],
    templates=[{
        "name": "Card 1",
        "qfmt": '<div class="topic">{{Topic}}</div>{{Front}}',
        "afmt": '<div class="topic">{{Topic}}</div>{{Front}}<hr>{{Back}}'
                '{{#Source}}<div class="src">{{Source}}</div>{{/Source}}',
    }],
    css=CSS,
)

CLOZE_MODEL = genanki.Model(
    MODEL_CLOZE_ID, "PCL Concept Cloze (Moss)",
    model_type=genanki.Model.CLOZE,
    fields=[{"name": "UID"}, {"name": "Topic"}, {"name": "Text"},
            {"name": "Source"}],
    templates=[{
        "name": "Cloze",
        "qfmt": '<div class="topic">{{Topic}}</div>{{cloze:Text}}',
        "afmt": '<div class="topic">{{Topic}}</div>{{cloze:Text}}'
                '{{#Source}}<div class="src">{{Source}}</div>{{/Source}}',
    }],
    css=CSS,
)


def load_crosswalk():
    return json.loads(Path(__file__).with_name('concept_guid_crosswalk.json').read_text())


def note_groups(feed, crosswalk=None):
    crosswalk = crosswalk if crosswalk is not None else load_crosswalk()
    identities = {c['editorialId']: c for c in crosswalk['cards'] if c['identityAction'] != 'withdrawn'}
    groups = defaultdict(list)
    for card in feed['cards']:
        row = identities.get(card['editorialId'])
        if row is None or row['noteId'] != card['noteId'] or row['newFront'] != card['q'] or row['newBack'] != card['reveal']:
            raise ValueError('crosswalk face/identity mismatch: ' + card['editorialId'])
        groups[card['noteId']].append(card)
    for note_id, cards in sorted(groups.items()):
        cards.sort(key=lambda c: c['ordinal'])
        rows = [identities[c['editorialId']] for c in cards]
        actions = {r['identityAction'] for r in rows}
        old_guids = {r['oldGuid'] for r in rows}
        if len(actions) != 1 or len(old_guids) != 1 or [c['ordinal'] for c in cards] != list(range(1,len(cards)+1)):
            raise ValueError('inconsistent grouped note: ' + note_id)
        if actions == {'preserve-guid'}:
            if any(r.get('oldFront') != c['q'] or r.get('oldBack') != c['reveal'] for r,c in zip(rows,cards)):
                raise ValueError('preserved face changed: ' + note_id)
            if any(r['oldOrdinal'] != c['ordinal']-1 for r,c in zip(rows,cards)):
                raise ValueError('preserved ordinal changed: ' + note_id)
            guid = rows[0]['oldGuid']
        else:
            identity = [(c['editorialId'],c['revision'],c['ordinal'],c['q'],c['reveal']) for c in cards]
            guid = genanki.guid_for('native-concepts-v1', note_id, json.dumps(identity,ensure_ascii=False))
            if guid in old_guids: raise ValueError('changed note reused old GUID')
        yield note_id, cards, guid


def source_field(card):
    return html.escape(card['page'] + ' | ' + card['source'])


def build_deck(feed, deck_id=DECK_ID, deck_name=DECK_NAME, crosswalk=None):
    if not isinstance(feed, dict):
        feed = json.loads(Path(feed).read_text())
    deck = genanki.Deck(deck_id, deck_name)
    churn = []
    for note_id, cards, guid in note_groups(feed, crosswalk):
        first = cards[0]
        text = first['reveal']
        output, cursor = [], 0
        for c in sorted(cards, key=lambda c:c['targetStart']):
            start,end = c['targetStart'],c['targetEnd']
            if c['reveal'] != text or start < cursor or text[start:end] != c['target']:
                raise ValueError('invalid target span: ' + c['editorialId'])
            output.extend([html.escape(text[cursor:start]), '{{c%d::%s}}' % (c['ordinal'], html.escape(c['target']))])
            cursor=end
        output.append(html.escape(text[cursor:]))
        deck.add_note(genanki.Note(model=CLOZE_MODEL, fields=[note_id,html.escape(first['topic']),''.join(output),source_field(first)], guid=guid,
            tags=['PsychClerkship','Deck::Concepts','Status::attested',
                  'Source::'+Path(first['page']).stem, 'Type::'+first['kind'], 'Format::cloze']))
        if len(cards)>1 and guid not in {r['oldGuid'] for r in (crosswalk or load_crosswalk())['cards']}: churn.append(note_id)
    stats={'total':len(feed['cards']), 'notes':len(deck.notes), 'siblingChurn':churn}
    return deck,stats


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--feed',required=True)
    ap.add_argument('--out',required=True)
    args=ap.parse_args()
    Path(args.out).mkdir(parents=True,exist_ok=True)
    deck,stats=build_deck(args.feed)
    genanki.Package(deck).write_to_file(str(Path(args.out)/'psychiatry_clerkship_concepts.apkg'))
    print('Concepts:',json.dumps(stats))

if __name__ == '__main__': main()
