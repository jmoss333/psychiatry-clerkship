#!/usr/bin/env python3
"""Hard publish gate: inspect every staged Anki card against released sources."""
import argparse
from collections import Counter
from contextlib import closing
import html
import json
from pathlib import Path
import re
import sqlite3
import tempfile
import zipfile
import export_anki as qb
import export_anki_content as concepts

FILES = ('psychiatry_clerkship_library.apkg', 'psychiatry_clerkship_concepts.apkg', 'psychiatry_clerkship_library_ALL.apkg')
CLOZE = re.compile(r'\{\{c(\d+)::(.*?)\}\}', re.S)


def read_cards(path):
    with zipfile.ZipFile(path) as archive, tempfile.TemporaryDirectory() as tmp:
        names = [n for n in archive.namelist() if n in ('collection.anki2','collection.anki21')]
        if len(names) != 1: raise ValueError('expected exactly one Anki collection')
        db = Path(tmp)/'collection.db'
        db.write_bytes(archive.read(names[0]))
        with closing(sqlite3.connect(db)) as conn:
            models=json.loads(conn.execute('select models from col').fetchone()[0])
            rows=conn.execute('select n.guid,n.mid,n.flds,n.tags,c.ord,c.did from cards c join notes n on n.id=c.nid').fetchall()
            if len(rows) != conn.execute('select count(*) from cards').fetchone()[0]:
                raise ValueError('cards with missing notes in package')
            orphan=conn.execute('select count(*) from notes n where not exists (select 1 from cards c where c.nid=n.id)').fetchone()[0]
            if orphan: raise ValueError('orphaned notes in package')
        return [dict(guid=g,model=m,fields=f.split('\x1f'),tags=sorted(t.split()),ordinal=o,deck=d,template=models[str(m)]['tmpls'],fieldNames=[f['name'] for f in models[str(m)]['flds']]) for g,m,f,t,o,d in rows]


def check_concepts(rows, feed, crosswalk, deck_id):
    expected={}
    for note_id,cards,guid in concepts.note_groups(feed,crosswalk):
        for c in cards:
            expected[(note_id,c['ordinal']-1)]=(guid,c['q'],c['reveal'],concepts.source_field(c),html.escape(c['topic']))
    actual={}
    for row in rows:
        fields=row['fields']
        if row['model'] != concepts.MODEL_CLOZE_ID or row['deck'] != deck_id or len(fields)!=4 or row['fieldNames'] != ['UID','Topic','Text','Source']:
            raise ValueError('unexpected concept model/deck/fields')
        if [(t['qfmt'],t['afmt']) for t in row['template']] != [(t['qfmt'],t['afmt']) for t in concepts.CLOZE_MODEL.templates]:
            raise ValueError('concept template mismatch')
        uid,topic,text,source=fields
        key=(uid,row['ordinal'])
        if key in actual: raise ValueError('duplicate concept card')
        if row['ordinal']+1 not in {int(m.group(1)) for m in CLOZE.finditer(text)}: raise ValueError('missing cloze ordinal')
        front=html.unescape(CLOZE.sub(lambda m:'[…]' if int(m.group(1))==row['ordinal']+1 else m.group(2),text))
        back=html.unescape(CLOZE.sub(lambda m:m.group(2),text))
        actual[key]=(row['guid'],front,back,source,topic)
    if actual != expected:
        differing=set(actual)^set(expected) | {k for k in actual.keys() & expected.keys() if actual[k]!=expected[k]}
        raise ValueError('concept card parity mismatch: '+repr(sorted(differing)))


def check_qbank(rows, items, deck_id):
    deck,_,_=qb.build_deck(items,include_drafts=False,deck_id=deck_id)
    expected=Counter((n.guid,n.model.model_id,tuple(n.fields),tuple(sorted(n.tags)),0,deck_id) for n in deck.notes)
    actual=Counter((r['guid'],r['model'],tuple(r['fields']),tuple(r['tags']),r['ordinal'],r['deck']) for r in rows)
    if actual != expected: raise ValueError('question-bank card parity mismatch against current overlaid source')
    for r in rows:
        if r['fieldNames'] != [f['name'] for f in qb.MODEL.fields]:
            raise ValueError('question-bank field names mismatch')
        if [(t['qfmt'],t['afmt']) for t in r['template']] != [(t['qfmt'],t['afmt']) for t in qb.MODEL.templates]:
            raise ValueError('question-bank template mismatch')


def check_output(out, bank=None, crosswalk=None):
    out=Path(out)
    root=Path(__file__).resolve().parents[3]
    feed=json.loads((out/'tools/concepts.json').read_text())
    items=json.loads(Path(bank or root/'question_bank.json').read_text())['items']
    crosswalk=crosswalk or concepts.load_crosswalk()
    if {p.name for p in (out/'anki').glob('*.apkg')} != set(FILES): raise ValueError('expected exactly three staged packages')
    q,c,combined=[read_cards(out/'anki'/name) for name in FILES]
    check_concepts(c,feed,crosswalk,concepts.DECK_ID)
    check_qbank(q,items,qb.DECK_ID)
    cc=[r for r in combined if r['deck']==2059400194]
    cq=[r for r in combined if r['deck']==2059400193]
    if len(cc)+len(cq)!=len(combined): raise ValueError('unexpected combined subdeck')
    check_concepts(cc,feed,crosswalk,2059400194)
    check_qbank(cq,items,2059400193)
    signature=lambda rows: sorted((r['guid'],r['ordinal'],tuple(r['fields'])) for r in rows)
    if signature(c)!=signature(cc): raise ValueError('standalone/combined concept note mismatch')
    print(f'Anki parity PASS: Concepts {len(c)} cards; Qbank {len(q)} cards; combined {len(combined)} cards')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('out')
    parser.add_argument('site',nargs='?',choices=['ms3','res'])
    args=parser.parse_args()
    check_output(args.out)
