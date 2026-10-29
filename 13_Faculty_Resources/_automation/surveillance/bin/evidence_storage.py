"""Lossless storage envelope; logical packet identities and audit records never change."""
from copy import deepcopy
from collections import Counter
import hashlib
import json

EXPANDED_LIMIT = 64_000_000
FIELDS = {'candidates', 'questionSnapshots', 'passages', 'diff', 'readings'}


def serialized(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def targets(state):
    for index, packet in enumerate(state.get('packets', [])):
        for field in sorted(FIELDS & packet.keys()):
            yield ['packets', index, field], packet[field]
    for source, row in state.get('latestValid', {}).items():
        if 'text' in row:
            yield ['latestValid', source, 'text'], row['text']


def parent(state, path):
    if not isinstance(path, list) or len(path) != 3:
        raise ValueError('Invalid snapshot path')
    group, key, field = path
    if group == 'packets' and type(key) is int and 0 <= key < len(state.get('packets', [])) and field in FIELDS:
        return state['packets'][key]
    if group == 'latestValid' and isinstance(key, str) and key in state.get('latestValid', {}) and field == 'text':
        return state['latestValid'][key]
    raise ValueError('Invalid snapshot path')


def encode_inbox(state):
    if 'storageVersion' in state:
        raise ValueError('Expected expanded evidence')
    if len(serialized(state).encode()) > EXPANDED_LIMIT:
        raise ValueError('Expanded evidence exceeds supported size')
    values = [(path, serialized(value)) for path, value in targets(state)]
    counts = Counter(value for _, value in values)
    stored = deepcopy(state)
    snapshots, references = {}, []
    for path, value in values:
        if counts[value] < 2 or len(value.encode()) < 256:
            continue
        digest = hashlib.sha256(value.encode()).hexdigest()
        if digest in snapshots and snapshots[digest] != value:
            raise ValueError('Snapshot digest collision')
        snapshots[digest] = value
        del parent(stored, path)[path[-1]]
        references.append({'path': path, 'snapshot': digest})
    if not references:
        return stored
    envelope = {'storageVersion': 1, 'state': stored, 'snapshots': snapshots, 'references': references}
    # Escaping the shared JSON strings can occasionally cost more than inline data.
    return envelope if len(serialized(envelope).encode()) < len(serialized(state).encode()) else deepcopy(state)


def decode_inbox(stored):
    if 'storageVersion' not in stored:
        return deepcopy(stored)
    if stored.get('storageVersion') != 1 or set(stored) != {'storageVersion', 'state', 'snapshots', 'references'}:
        raise ValueError('Unsupported evidence storage')
    state, snapshots, refs = stored['state'], stored['snapshots'], stored['references']
    if not isinstance(state, dict) or 'storageVersion' in state or not isinstance(snapshots, dict) or not isinstance(refs, list):
        raise ValueError('Malformed shared snapshots')
    parsed = {}
    for digest, value in snapshots.items():
        if not isinstance(value, str) or hashlib.sha256(value.encode()).hexdigest() != digest:
            raise ValueError('Snapshot integrity check failed')
        parsed[digest] = json.loads(value)
    state = deepcopy(state)
    used = set()
    expanded_bytes = len(serialized(state).encode())
    for ref in refs:
        if not isinstance(ref, dict) or set(ref) != {'path', 'snapshot'} or ref['snapshot'] not in parsed:
            raise ValueError('Missing shared snapshot')
        target = parent(state, ref['path'])
        field = ref['path'][-1]
        if field in target:
            raise ValueError('Snapshot would overwrite evidence')
        expanded_bytes += len(snapshots[ref['snapshot']].encode()) + len(serialized(field).encode()) + 2
        if expanded_bytes > EXPANDED_LIMIT:
            raise ValueError('Expanded evidence exceeds supported size')
        target[field] = deepcopy(parsed[ref['snapshot']])
        used.add(ref['snapshot'])
    if used != set(snapshots):
        raise ValueError('Unreferenced shared snapshot')
    return state
