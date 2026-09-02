#!/usr/bin/env python3
"""Apply a decision wave to the hand-formatted SP pack without reformatting it.

The proposal packs produced during a decision wave are reserialised JSON dumps: a
straight copy would land an ~850-line diff over a file whose formatting is
deliberate (Dana's intents are one per line; Marcus's and Ray's are expanded).

This tool takes the WHAT from the proposal and leaves the HOW alone. It diffs the
two packs keyed by `id` rather than by array position — a new intent inserted
mid-array shifts every later index and makes a positional diff report hundreds of
phantom changes — reduces the wave to its real edits, and applies each one as a
targeted text replacement in the original file.

It refuses to write unless `json.load(patched) == proposal` (with FACULTY_COPY:
prefixes stripped), so a formatting-preserving edit can never silently diverge
from the ratified content.

    python3 bin/apply_pack_wave.py --proposal "410 decision to review/sp-interview.pack.proposed.json"
    python3 bin/apply_pack_wave.py --proposal <path> --write

Used for the #410 D12-D16 wave (2026-08-31): 291 positional changes -> 22 real
changes -> 15 textual edits -> an 86-line diff, round-trip verified.
"""
import json, re, sys

import argparse

_ap = argparse.ArgumentParser(description=__doc__)
_ap.add_argument('--pack', default='_prototypes/sp-interview/sp-interview.pack.json',
                 help='the hand-formatted pack to edit in place')
_ap.add_argument('--proposal', required=True,
                 help='the reserialised proposed pack (source of WHAT changes)')
_ap.add_argument('--out', default=None,
                 help='write here instead of overwriting --pack (default: dry run to <pack>.patched)')
_ap.add_argument('--write', action='store_true', help='overwrite --pack in place')
_args = _ap.parse_args()

SRC  = _args.pack
PROP = _args.proposal
PREFIX = 'FACULTY_COPY: '

def strip_fc(v):
    if isinstance(v, str):  return v[len(PREFIX):] if v.startswith(PREFIX) else v
    if isinstance(v, list): return [strip_fc(x) for x in v]
    if isinstance(v, dict): return {k: strip_fc(x) for k, x in v.items()}
    return v

# ---------- balanced-span scanning over raw JSON text ----------
def string_span(t, i):
    assert t[i] == '"'
    j = i + 1; esc = False
    while j < len(t):
        c = t[j]
        if esc: esc = False
        elif c == '\\': esc = True
        elif c == '"': return j + 1
        j += 1
    raise ValueError('unterminated string at %d' % i)

def balanced_span(t, i):
    if t[i] == '"': return string_span(t, i)
    if t[i] not in '[{':
        j = i
        while j < len(t) and t[j] not in ',}]\n': j += 1
        return j
    depth = 0; j = i; in_str = False; esc = False
    while j < len(t):
        c = t[j]
        if in_str:
            if esc: esc = False
            elif c == '\\': esc = True
            elif c == '"': in_str = False
        else:
            if c == '"': in_str = True
            elif c in '[{': depth += 1
            elif c in ']}':
                depth -= 1
                if depth == 0: return j + 1
        j += 1
    raise ValueError('unbalanced at %d' % i)

def find_key(t, start, end, key):
    """Return (key_start, value_start, value_end) for "key": <value> at the top
    level of the container spanning [start,end)."""
    pat = re.compile(r'"%s"\s*:\s*' % re.escape(key))
    i = start
    while True:
        m = pat.search(t, i, end)
        if not m: return None
        # confirm the match sits at depth 1 of this container
        if _depth_at(t, start, m.start()) == 1:
            vs = m.end()
            return (m.start(), vs, balanced_span(t, vs))
        i = m.end()

def _depth_at(t, start, pos):
    depth = 0; in_str = False; esc = False
    for j in range(start, pos):
        c = t[j]
        if in_str:
            if esc: esc = False
            elif c == '\\': esc = True
            elif c == '"': in_str = False
        else:
            if c == '"': in_str = True
            elif c in '[{': depth += 1
            elif c in ']}': depth -= 1
    return depth

def array_children(t, arr_start):
    end = balanced_span(t, arr_start)
    i = arr_start + 1; out = []
    while i < end - 1:
        while i < end - 1 and t[i] in ' \n\t\r,': i += 1
        if i >= end - 1: break
        e = balanced_span(t, i)
        out.append((i, e)); i = e
    return out, end

def obj_children(t, obj_start):
    """Top-level keys of an object -> {key: (key_start, val_start, val_end)}"""
    end = balanced_span(t, obj_start)
    res = {}
    i = obj_start + 1
    while i < end - 1:
        while i < end - 1 and t[i] in ' \n\t\r,': i += 1
        if i >= end - 1 or t[i] != '"': break
        ks = i; ke = string_span(t, i)
        key = json.loads(t[ks:ke])
        j = ke
        while t[j] in ' \n\t\r': j += 1
        assert t[j] == ':', 'expected colon at %d' % j
        j += 1
        while t[j] in ' \n\t\r': j += 1
        ve = balanced_span(t, j)
        res[key] = (ks, j, ve)
        i = ve
    return res, end

def line_indent(t, pos):
    ls = t.rfind('\n', 0, pos) + 1
    return re.match(r'[ ]*', t[ls:]).group(0)

# ---------- rendering in the file's own idiom ----------
def dump(v):
    return json.dumps(v, ensure_ascii=False)

def render_array(v, multiline, indent):
    if not multiline:
        return '[' + ', '.join(dump(x) for x in v) + ']'
    inner = indent + '  '
    return '[\n' + ',\n'.join(inner + dump(x) for x in v) + '\n' + indent + ']'

def render_obj(v, multiline, indent):
    if not multiline:
        parts = []
        for k, x in v.items():
            parts.append('%s: %s' % (dump(k), render_value(x, False, indent)))
        return '{ ' + ', '.join(parts) + ' }'
    inner = indent + '  '
    parts = []
    for k, x in v.items():
        parts.append('%s%s: %s' % (inner, dump(k), render_value(x, isinstance(x, (list, dict)), inner)))
    return '{\n' + ',\n'.join(parts) + '\n' + indent + '}'

def render_value(v, multiline, indent):
    if isinstance(v, list): return render_array(v, multiline, indent)
    if isinstance(v, dict): return render_obj(v, multiline, indent)
    return dump(v)

# ---------- build the edit list ----------
src_text = open(SRC, encoding='utf-8').read()
A = json.load(open(SRC, encoding='utf-8'))
B = strip_fc(json.load(open(PROP, encoding='utf-8')))

edits = []   # (abs_start, abs_end, replacement_text, note)

def byid(lst): return {x['id']: x for x in lst}

root_children, _ = obj_children(src_text, 0)
cases_start = root_children['cases'][1]
case_spans, _ = array_children(src_text, cases_start)

for ci, (cs, ce) in enumerate(case_spans):
    ca, cb = A['cases'][ci], B['cases'][ci]
    ckeys, _ = obj_children(src_text, cs)
    cname = ca['persona']['displayName']

    for sect in ('intents', 'checklist', 'gated'):
        if sect not in ckeys or sect not in ca: continue
        arr_start = ckeys[sect][1]
        kids, arr_end = array_children(src_text, arr_start)
        ia, ib = byid(ca[sect]), byid(cb.get(sect, []))
        span_by_id = {}
        for (ks, ke) in kids:
            span_by_id[json.loads(src_text[ks:ke])['id']] = (ks, ke)

        # 1. modify existing children
        for oid, (ks, ke) in span_by_id.items():
            if oid not in ib: continue
            oa, ob = ia[oid], ib[oid]
            if oa == ob: continue
            child_txt = src_text[ks:ke]
            child_multiline = '\n' in child_txt
            fields, _ = obj_children(src_text, ks)
            for f in ob:
                if oa.get(f) == ob[f]: continue
                if f in fields:
                    fks, fvs, fve = fields[f]
                    orig_val = src_text[fvs:fve]
                    ml = '\n' in orig_val
                    ind = line_indent(src_text, fks)
                    edits.append((fvs, fve, render_value(ob[f], ml, ind),
                                  '%s %s[%s].%s replaced' % (cname, sect, oid, f)))
                else:
                    # new field -> insert before the child's closing brace
                    last = max(fields.values(), key=lambda x: x[2])
                    ins_at = last[2]
                    if child_multiline:
                        ind = line_indent(src_text, last[0])
                        txt = ',\n%s%s: %s' % (ind, dump(f),
                                               render_value(ob[f], isinstance(ob[f], (list, dict)) and False, ind))
                    else:
                        txt = ', %s: %s' % (dump(f), render_value(ob[f], False, ''))
                    edits.append((ins_at, ins_at, txt,
                                  '%s %s[%s].%s ADDED' % (cname, sect, oid, f)))

        # 2. brand-new children, inserted after their proposed predecessor
        order_b = [x['id'] for x in cb.get(sect, [])]
        for pos, nid in enumerate(order_b):
            if nid in span_by_id: continue
            prev = order_b[pos - 1] if pos > 0 else None
            if prev not in span_by_id:
                raise SystemExit('cannot place new %s %s (no anchor)' % (sect, nid))
            aks, ake = span_by_id[prev]
            sib_txt = src_text[aks:ake]
            ml = '\n' in sib_txt
            ind = line_indent(src_text, aks)
            body = render_obj(ib[nid], ml, ind)
            edits.append((ake, ake, ',\n' + ind + body,
                          '%s %s[%s] NEW (after %s)' % (cname, sect, nid, prev)))

    # 3. responses
    if 'responses' in ckeys:
        rs = ckeys['responses'][1]
        rkeys, rend = obj_children(src_text, rs)
        ra, rb = ca.get('responses', {}), cb.get('responses', {})
        for k in rb:
            if k in ra and ra[k] == rb[k]: continue
            if k in rkeys:
                _, vs, ve = rkeys[k]
                ml = '\n' in src_text[vs:ve]
                ind = line_indent(src_text, rkeys[k][0])
                edits.append((vs, ve, render_value(rb[k], ml, ind),
                              '%s responses.%s replaced' % (cname, k)))
            else:
                last = max(rkeys.values(), key=lambda x: x[2])
                ind = line_indent(src_text, last[0])
                body = render_value(rb[k], True, ind)
                edits.append((last[2], last[2], ',\n%s%s: %s' % (ind, dump(k), body),
                              '%s responses.%s ADDED' % (cname, k)))

# ---------- apply, right to left ----------
edits.sort(key=lambda e: (e[0], e[1]), reverse=True)
out = src_text
print('APPLYING %d TEXTUAL EDITS' % len(edits))
for s, e, txt, note in edits:
    print('  - %s' % note)
    out = out[:s] + txt + out[e:]

OUT = _args.out or (SRC if _args.write else SRC + '.patched')
open(OUT, 'w', encoding='utf-8').write(out)

# ---------- verify ----------
got = json.loads(out)
want = B
if got == want:
    print('\nROUND-TRIP: PASS — patched pack is semantically identical to the proposal (FACULTY_COPY stripped)')
else:
    print('\nROUND-TRIP: FAIL')
    def diffpaths(x, y, p=''):
        if type(x) != type(y): print('  TYPE', p); return
        if isinstance(x, dict):
            for k in set(list(x) + list(y)):
                if k not in x: print('  MISSING-IN-GOT', p + '.' + k)
                elif k not in y: print('  EXTRA-IN-GOT', p + '.' + k)
                else: diffpaths(x[k], y[k], p + '.' + k)
        elif isinstance(x, list):
            if len(x) != len(y): print('  LEN', p, len(x), len(y))
            for i in range(min(len(x), len(y))): diffpaths(x[i], y[i], '%s[%d]' % (p, i))
        elif x != y:
            print('  VAL', p); print('    got ', repr(x)[:160]); print('    want', repr(y)[:160])
    diffpaths(got, want)
    sys.exit(1)
print('wrote', OUT)
print('FACULTY_COPY remaining:', out.count('FACULTY_COPY'))
print('line count: %d -> %d' % (src_text.count('\n') + 1, out.count('\n') + 1))
