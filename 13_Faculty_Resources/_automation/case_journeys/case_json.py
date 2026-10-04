"""House JSON style for case-journey files: 2-space indent, scalar arrays and short flat
objects (resource links) on one line, everything else expanded. Deterministic."""
import json

INLINE_MAX = 200


def _scalar(v):
    return v is None or isinstance(v, (str, int, float, bool))


def _inline(v):
    return json.dumps(v, ensure_ascii=False)


def dumps(obj, indent=0):
    pad = '  ' * indent
    if isinstance(obj, list):
        if not obj:
            return '[]'
        if all(_scalar(x) for x in obj):
            line = '[' + ', '.join(_inline(x) for x in obj) + ']'
            if len(line) <= INLINE_MAX:
                return line
        return '[\n' + ',\n'.join(pad + '  ' + dumps(x, indent + 1) for x in obj) + '\n' + pad + ']'
    if isinstance(obj, dict):
        if not obj:
            return '{}'
        if all(_scalar(v) for v in obj.values()):
            line = '{' + ', '.join(_inline(k) + ': ' + _inline(v) for k, v in obj.items()) + '}'
            if len(line) <= INLINE_MAX:
                return line
        return '{\n' + ',\n'.join(pad + '  ' + _inline(k) + ': ' + dumps(v, indent + 1) for k, v in obj.items()) + '\n' + pad + '}'
    return _inline(obj)


def dump_text(obj):
    return dumps(obj) + '\n'
