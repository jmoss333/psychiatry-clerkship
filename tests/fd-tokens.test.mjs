// Pins the token contract rather than the pixels. Tasks 3-9 reference token NAMES only, so a
// renamed or dropped token silently breaks a surface that no unit test renders -- this catches it.
// Also pins that every token has a dark counterpart, which is the half of the palette the source
// design does not provide and is therefore the half most likely to be forgotten.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const warm = readFileSync(new URL(`${BUILD}/clinical-warm.css`, import.meta.url), 'utf8');
const fd = readFileSync(new URL(`${BUILD}/frontdoor/frontdoor.css`, import.meta.url), 'utf8');
const inventory = readFileSync(new URL('../docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md', import.meta.url), 'utf8');

const TOKENS = [
  'fd-bg', 'fd-surface', 'fd-surface-warm', 'fd-line', 'fd-line-strong', 'fd-line-hover',
  'fd-text', 'fd-text-mid', 'fd-text-dim', 'fd-terracotta', 'fd-terracotta-dark',
  'fd-teal', 'fd-teal-deep', 'fd-teal-wash', 'fd-success', 'fd-danger', 'fd-danger-dark',
  'fd-danger-wash', 'fd-olive', 'fd-selected', 'fd-chip', 'fd-callout',
];

// Comments are stripped before locating a block. clinical-warm.css's file header legitimately
// names the selectors it defines, and a bare indexOf(':root') otherwise matches that prose and
// then walks into the NEXT block -- which would silently read the dark values as the light ones
// and make the "palettes differ" assertion below compare the dark block against itself.
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

function block(css, selector) {
  const text = strip(css);
  const i = text.indexOf(selector);
  assert.ok(i !== -1, `no ${selector} block in clinical-warm.css`);
  const open = text.indexOf('{', i);
  const close = text.indexOf('}', open);
  return text.slice(open + 1, close);
}

function rule(css, selector) {
  return block(css, selector);
}

const AUDIENCE_TOKEN = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;

function lexCss(css) {
  assert.doesNotMatch(css, /\\/, 'CSS escapes are forbidden in audience-sensitive CSS');
  const mask = css.split('');
  const structural = new Set();
  const delimiters = [];
  let quote = null;
  let inComment = false;

  for (let index = 0; index < css.length; index += 1) {
    const char = css[index];
    const next = css[index + 1];
    if (inComment) {
      mask[index] = ' ';
      if (char === '*' && next === '/') {
        mask[index + 1] = ' ';
        index += 1;
        inComment = false;
      }
      continue;
    }
    if (quote) {
      mask[index] = ' ';
      assert.ok(char !== '\n' && char !== '\r', 'CSS strings cannot contain raw newlines');
      if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '*') {
      mask[index] = ' ';
      mask[index + 1] = ' ';
      index += 1;
      inComment = true;
      continue;
    }
    assert.ok(!(char === '*' && next === '/'), 'CSS comment closes without an opener');
    if (char === '"' || char === "'") {
      mask[index] = ' ';
      quote = char;
      continue;
    }
    if (char === '(' || char === '[') {
      delimiters.push(char);
      continue;
    }
    if (char === '{' && delimiters.length > 0) {
      delimiters.push(char);
      continue;
    }
    if (char === ')' || char === ']' || (char === '}' && delimiters.length > 0)) {
      const expected = char === ')' ? '(' : char === ']' ? '[' : '{';
      assert.equal(delimiters.at(-1), expected, `${char} closes without its matching opener`);
      delimiters.pop();
      continue;
    }
    if (delimiters.length === 0 && (char === '{' || char === '}' || char === ';')) {
      structural.add(index);
    }
  }

  assert.equal(quote, null, 'CSS string is unfinished');
  assert.equal(inComment, false, 'CSS comment is unfinished');
  assert.deepEqual(delimiters, [], 'CSS delimiter is unfinished');
  return { mask: mask.join(''), structural };
}

function selectorCompassRanges(css, start, end) {
  // Parse a conservative selector subset, not substrings of a masked prelude. In particular,
  // strings are attribute values, comments do not create descendant whitespace, and non-ASCII
  // code units (including both halves of a surrogate pair) continue a CSS identifier.
  // Unsupported syntax grants NO exceptions, including container properties in that rule.
  // Functional pseudos, namespaces, nesting and nonterminal pseudo-elements are deliberately
  // unsupported: extending this grammar requires explicit positive and negative fixtures.
  const prelude = css.slice(start, end);
  const ranges = [];
  const identSource = '(?:--|-?[A-Za-z_\\u0080-\\uFFFF])[A-Za-z0-9_\\u0080-\\uFFFF-]*';
  const identifier = new RegExp(`^${identSource}`);
  const space = '[ \\t\\r\\n\\f]';
  const attribute = new RegExp(
    `^\\[${space}*${identSource}${space}*` +
    `(?:[~|^$*]?=${space}*(?:${identSource}|"[^"\\r\\n\\f]*"|'[^'\\r\\n\\f]*')` +
    `(?:${space}+[iIsS])?${space}*)?\\]`,
  );
  const classes = new Set(['ms3-compass', 'ms3-compass__weeks']);
  const pseudoClasses = new Set([
    'root', 'hover', 'active', 'focus', 'focus-visible', 'focus-within',
    'first-child', 'last-child', 'only-child', 'first-of-type', 'last-of-type',
    'only-of-type', 'empty', 'disabled', 'enabled', 'checked', 'link', 'visited', 'target',
  ]);
  const pseudoElements = new Set(['before', 'after', 'marker', 'backdrop', 'first-line', 'first-letter']);
  let cursor = 0;

  function take(pattern) {
    const match = prelude.slice(cursor).match(pattern);
    if (!match) return null;
    cursor += match[0].length;
    return match[0];
  }

  function comments() {
    // lexCss has already proved every comment closes. Keep its original code-unit offsets.
    while (prelude.startsWith('/*', cursor)) cursor = prelude.indexOf('*/', cursor + 2) + 2;
  }

  function trivia() {
    let whitespace = false;
    for (;;) {
      comments();
      if (!take(/^[ \t\r\n\f]+/)) return whitespace;
      whitespace = true;
    }
  }

  trivia();
  for (;;) {
    // A compound has at most one type/universal selector, and it must be first.
    let hasSimple = Boolean(take(/^\*/) || take(identifier));
    let hasPseudoElement = false;
    for (;;) {
      comments();
      const tokenStart = cursor;
      const char = prelude[cursor];
      if (char === '.' || char === '#') {
        cursor += 1;
        const name = take(identifier);
        if (!name) return null;
        if (char === '.' && classes.has(name)) ranges.push([start + tokenStart, start + cursor]);
      } else if (char === '[') {
        const token = take(attribute);
        if (!token) return null;
        if (/^\[data-ms3-compass-(?:root|safety|scope|prompt|link|orientation)\]$/.test(token)) {
          ranges.push([start + tokenStart, start + cursor]);
        }
      } else if (char === ':') {
        cursor += 1;
        hasPseudoElement = prelude[cursor] === ':';
        if (hasPseudoElement) cursor += 1;
        const name = take(identifier);
        if (!(hasPseudoElement ? pseudoElements : pseudoClasses).has(name)) return null;
      } else {
        break;
      }
      hasSimple = true;
      if (hasPseudoElement) break;
    }
    if (!hasSimple) return null; // empty branch or a leading/doubled combinator
    const separated = trivia();
    if (cursor === prelude.length) return ranges;
    if (prelude[cursor] === ',') {
      cursor += 1;
      trivia();
      continue; // the next iteration must consume a nonempty compound
    }
    if (hasPseudoElement) return null;
    if (take(/^[>+~]/)) trivia();
    else if (!separated) return null;
    // Descendant/explicit combinators must also be followed by a nonempty compound.
  }
}

function groupingCompassRanges(css, start, end) {
  // One complete-prelude policy controls BOTH rule-list descent and container-name masking.
  // This is not a full CSS grammar: only the canonical media forms and the two approved named
  // queries are supported. Any other wrapper remains a value context, granting no exceptions.
  // Read original bytes: masked strings/comments must never manufacture valid query syntax.
  const prelude = css.slice(start, end);
  const leading = prelude.match(/^(?:[ \t\r\n\f]|\/\*[\s\S]*?\*\/)*/)[0].length;
  const text = prelude.slice(leading);
  const ws = '[ \\t\\r\\n\\f]';
  const media = new RegExp(
    `^@media${ws}+\\(${ws}*(?:pointer${ws}*:${ws}*coarse|` +
    `(?:min|max)-width${ws}*:${ws}*[0-9]+px|` +
    `prefers-reduced-motion${ws}*:${ws}*reduce)${ws}*\\)${ws}*$`,
  );
  if (media.test(text)) return [];
  const container = new RegExp(
    `^@container${ws}+(ms3-compass)${ws}+\\(${ws}*min-width${ws}*:${ws}*` +
    `(?:22|30)rem${ws}*\\)${ws}*$`,
  );
  const match = text.match(container);
  if (!match) return null;
  const tokenStart = start + leading + match[0].indexOf(match[1]);
  return [[tokenStart, tokenStart + match[1].length]];
}

function containerDeclarationRange(css, start, end) {
  // Strings cannot turn into whitespace here: the browser would discard that declaration.
  const declaration = css.slice(start, end);
  const match = declaration.match(/^[ \t\r\n\f]*container[ \t\r\n\f]*:[ \t\r\n\f]*(ms3-compass)[ \t\r\n\f]*\/[ \t\r\n\f]*inline-size[ \t\r\n\f]*$/);
  if (!match) return [];
  const tokenOffset = match.index + match[0].indexOf(match[1]);
  return [[start + tokenOffset, start + tokenOffset + match[1].length]];
}

test('container declarations reject hidden strings and non-CSS whitespace', () => {
  for (const value of [
    '"hidden" ms3-compass / inline-size', "'hidden' ms3-compass / inline-size",
    'ms3-compass "hidden" / inline-size', 'ms3-compass / "hidden" inline-size',
    'ms3-compass / inline-size "hidden"',
    '\u00a0ms3-compass / inline-size', 'ms3-compass\u00a0/ inline-size',
    'ms3-compass /\u2028inline-size', 'ms3-compass / inline-size\u2029',
  ]) {
    assert.throws(() => assertNoUnapprovedAudienceTokens(`.ms3-compass{container:${value}}`), value);
  }
  for (const declaration of [
    'container:ms3-compass / inline-size',
    '\tcontainer\n:\rms3-compass\f/\tinline-size\n',
  ]) assert.doesNotThrow(() => assertNoUnapprovedAudienceTokens(`.ms3-compass{${declaration}}`));
});

function approvedCompassRanges(css) {
  const { mask, structural } = lexCss(css);
  const ranges = [];
  const blocks = [{ kind: 'rule-list', segmentStart: 0 }];
  for (let index = 0; index < mask.length; index += 1) {
    if (!structural.has(index)) continue;
    const block = blocks.at(-1);
    if (mask[index] === ';') {
      if (block.kind === 'style') {
        ranges.push(...containerDeclarationRange(css, block.segmentStart, index));
      }
      block.segmentStart = index + 1;
    } else if (mask[index] === '{') {
      let childKind = 'value';
      if (block.kind === 'rule-list') {
        const prelude = mask.slice(block.segmentStart, index);
        if (/^\s*@/.test(prelude)) {
          const grouping = groupingCompassRanges(css, block.segmentStart, index);
          if (grouping !== null) {
            childKind = 'rule-list';
            ranges.push(...grouping);
          }
        } else {
          const selectors = selectorCompassRanges(css, block.segmentStart, index);
          if (selectors !== null) {
            childKind = 'style';
            ranges.push(...selectors);
          }
        }
      }
      blocks.push({ kind: childKind, segmentStart: index + 1 });
    } else if (mask[index] === '}') {
      assert.ok(blocks.length > 1, 'CSS block closes without an opener');
      if (block.kind === 'style') {
        ranges.push(...containerDeclarationRange(css, block.segmentStart, index));
      }
      blocks.pop();
      const parent = blocks.at(-1);
      if (parent.kind === 'rule-list') parent.segmentStart = index + 1;
    }
  }
  assert.equal(blocks.length, 1, 'CSS block is unfinished');
  return ranges;
}

function assertNoUnapprovedAudienceTokens(css) {
  // Only the exact identifiers in selector preludes or a named-container construct are exempt.
  // The original comments and strings remain visible to the copy ban.
  const checked = css.split('');
  for (const [start, end] of approvedCompassRanges(css)) {
    checked.fill('x', start, end);
  }
  assert.doesNotMatch(checked.join(''), AUDIENCE_TOKEN);
}

test('rule exposes only declarations, so an empty selector cannot satisfy a non-empty assertion', () => {
  const empty = rule('.fixture{}', '.fixture');
  assert.equal(empty, '');
  assert.doesNotMatch(empty, /\S/);
});

test('every front-door token is defined in the light palette', () => {
  const light = block(warm, ':root');
  for (const t of TOKENS) assert.match(light, new RegExp(`--${t}\\s*:`), `missing --${t}`);
});

test('every front-door token has a dark counterpart', () => {
  const dark = block(warm, '[data-theme="dark"]');
  for (const t of TOKENS) assert.match(dark, new RegExp(`--${t}\\s*:`), `--${t} has no dark value`);
});

test('the dark palette actually differs from the light one', () => {
  const light = block(warm, ':root');
  const dark = block(warm, '[data-theme="dark"]');
  const grab = (css, t) => (css.match(new RegExp(`--${t}\\s*:\\s*([^;]+);`)) || [])[1];
  // Backgrounds and text must invert; an accidental copy-paste of the light block would pass the
  // presence tests above while shipping an unreadable dark mode.
  for (const t of ['fd-bg', 'fd-surface', 'fd-text']) {
    assert.notEqual(grab(light, t), grab(dark, t), `--${t} is identical in both themes`);
  }
});

test('the light palette is declared before the dark one, or dark never wins', () => {
  // `:root` and `[data-theme="dark"]` have identical specificity (0,1,0) and both match <html>,
  // so source order is the ONLY thing that decides. A light block appended after the dark one
  // would override every dark value and the toggle would render light-on-light.
  const text = strip(warm);
  assert.ok(text.indexOf(':root') < text.indexOf('[data-theme="dark"]'),
    ':root must precede [data-theme="dark"] in clinical-warm.css');
});

test('frontdoor.css references tokens, never raw hex colours', () => {
  const hex = fd.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepEqual(hex, [],
    `frontdoor.css must use var(--fd-*), found raw hex: ${hex.join(', ')}`);
});

test('every --fd-* frontdoor.css consumes is actually defined in both themes', () => {
  // Broader than the fixed TOKENS list above: it also covers the derived tokens this stylesheet
  // needed beyond the design's 22 (ink-on-accent, elevation, scrim, focus ring). An undefined
  // custom property resolves to nothing, so a typo here paints transparent rather than erroring.
  const referenced = new Set(
    [...fd.matchAll(/var\(\s*(--fd-[a-z0-9-]+)/g)].map((m) => m[1]),
  );
  const declaredLocally = new Set(
    [...fd.matchAll(/(--fd-[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
  );
  const light = block(warm, ':root');
  const dark = block(warm, '[data-theme="dark"]');
  for (const name of referenced) {
    if (declaredLocally.has(name)) continue; // scoped to a component, not a palette token
    assert.match(light, new RegExp(`${name}\\s*:`), `${name} used but absent from :root`);
    assert.match(dark, new RegExp(`${name}\\s*:`), `${name} used but absent from the dark block`);
  }
});

test('frontdoor.css carries no audience token outside the exact approved Compass identifiers', () => {
  assertNoUnapprovedAudienceTokens(fd);
});

test('the audience-token guard permits only the exact approved Compass CSS identifiers', () => {
  const approved = [
    '.ms3-compass{}',
    '.ms3-compass__weeks{}',
    '[data-ms3-compass-root]{}',
    '[data-ms3-compass-safety]{}',
    '[data-ms3-compass-scope]{}',
    '[data-ms3-compass-prompt]{}',
    '[data-ms3-compass-link]{}',
    '[data-ms3-compass-orientation]{}',
    `${'😀'.repeat(16)}.ms3-compass{}`,
    '.ms3-compass{container:ms3-compass / inline-size}',
    '@container ms3-compass (min-width:22rem){.ms3-compass__weeks{display:grid}}',
  ];
  for (const css of approved) assert.doesNotThrow(() => assertNoUnapprovedAudienceTokens(css), css);
});

// Each regression is its own test so a RED run independently proves all four bypasses.
for (const css of ['.ms3-compassé{}', '.ms3-compass😀{}', '.ms3-compass,{}', '[foo=.ms3-compass]{}']) {
  test(`the audience-token guard rejects the selector regression ${css}`, () => {
    assert.throws(() => assertNoUnapprovedAudienceTokens(css));
  });
}

test('Compass exceptions require complete selector tokens and valid complete selector lists', () => {
  const rejected = [
    ...['é', '😀', '\u0080', '\u00a0', '\u0301', '\u200d', '中', '\ufffd', '_', '-', '9'].flatMap((suffix) => [
      `.ms3-compass${suffix}{}`, `.ms3-compass__weeks${suffix}{}`,
      `[data-ms3-compass-root${suffix}]{}`,
    ]),
    ',.ms3-compass{}', '.fixture,,.ms3-compass{}', '.ms3-compass, ,a{}',
    '.ms3-compass,/* gap */{}', '.ms3-compass,.fixture,{}',
    '[foo=.ms3-compass]{}', '[foo=[data-ms3-compass-root]]{}',
    '[foo=".ms3-compass"]{}', "[foo='[data-ms3-compass-root]']{}",
    '.ms3-compass[foo=]{}', '.ms3-compass[foo=123]{}', '.ms3-compass[foo==bar]{}',
    '.ms3-compass[foo="bar" wrong]{}', '.ms3-compass[foo bar]{}',
    '> .ms3-compass{}', '.ms3-compass >{}', '.ms3-compass + ~ a{}',
    '.ms3-compass >> a{}', '.ms3-compass .{}', '.ms3-compass #{}',
    '.ms3-compass *a{}', '.ms3-compass*{}', '.ms3-compass!{}',
    '.ms3-compass:​​{}', '.ms3-compass:{}', '.ms3-compass::{}',
    '.ms3-compass:unknown{}', '.ms3-compass:hover(){}', '.ms3-compass:nth-child(){}',
    ':is(.ms3-compass,){}', ':not(.ms3-compass >){}', ':lang(.ms3-compass){}',
    '.ms3-compass(foo){}', '.ms3-compass::before.x{}', '.ms3-compass::before > a{}',
    '.ms3-compass"hidden"{}', '.ms3-compass/**/a{}', '.ms3-compass/**/-tail{}',
    '[data-ms3-compass-root]/**/a{}', '.ms3-compass/* student */{}',
    '.ms3-compass, a[foo="x"]?{}', '.fixture,{container:ms3-compass / inline-size}',
    '.ms3-compass([)]{}', '.ms3-compass[(]){}',
  ];
  for (const css of rejected) assert.throws(() => assertNoUnapprovedAudienceTokens(css), css);
});

test('Compass selector validation preserves supported compounds, branches, and UTF-16 offsets', () => {
  const approved = [
    '/* heading */ .ms3-compass > h2{}',
    '.ms3-compass__weeks > li > span{}',
    '[data-ms3-compass-safety] p,\n[data-ms3-compass-scope],[data-ms3-compass-prompt]{}',
    '.ms3-compass, .fixture{}', '.fixture, .ms3-compass{}',
    'section.ms3-compass[data-mode="wide"] > a:hover{}',
    '.ms3-compass[data-mode=wide i]{}', '.ms3-compass[title="a,b > c"]{}',
    '.ms3-compass[data-mode~="wide"]{}', '#panel.ms3-compass + p ~ a{}',
    '.ms3-compass:focus-visible{}', '.ms3-compass::before{content:""}',
    '.ms3-compass/**/.fixture{}', '.ms3-compass /* gap */ a{}',
    `${'😀'.repeat(16)}.ms3-compass > é[data-ms3-compass-link]{}`,
  ];
  for (const css of approved) assert.doesNotThrow(() => assertNoUnapprovedAudienceTokens(css), css);
});

test('the audience-token guard rejects audience copy, unrelated selectors, comments, and unapproved hooks', () => {
  const rejected = [
    '.fixture{content:"MS3"}',
    '.student-card{}',
    '/* resident-only styling */ .fixture{}',
    '[data-ms3-compass-score]{}',
    'a{--audience:.ms3-compass}',
    'a{--audience:[data-ms3-compass-root]}',
    'a{--audience:.ms3-compass{}}',
    'a{--audience:{[data-ms3-compass-root]{}}}',
    'a{--x:{container:ms3-compass / inline-size}}',
    'a{--x:{}container:ms3-compass / inline-size}',
    'a{--x:";container:ms3-compass / inline-size}',
    "a{--x:';container:ms3-compass / inline-size}",
    'a{--x:/*;container:ms3-compass / inline-size}',
    'a{--x:(;container:ms3-compass / inline-size}',
    'a{--x:[;container:ms3-compass / inline-size}',
    '.ms3-compass{',
    '.ms3-compass{}}',
    '.ms3-compass){}',
    '.ms3-compass]{}',
    '.\\4d S3-unapproved{}',
    'a::before{content:"\\4d S3"}',
  ];
  for (const css of rejected) assert.throws(() => assertNoUnapprovedAudienceTokens(css), css);
});

// Each reviewer regression runs independently: an earlier failure cannot hide another bypass.
for (const css of [
  '@supports {.ms3-compass{}}',
  '@layer (){[data-ms3-compass-root]{}}',
  '@container ???{.ms3-compass{}}',
  '@scope (){.ms3-compass{}}',
  '@document {.ms3-compass{}}',
  '@starting-style garbage{.ms3-compass{}}',
  '@supports {.fixture{container:ms3-compass / inline-size}}',
  '@media (pointer:coarse){@supports {.ms3-compass{}}}',
  '@container ms3-compass (min-width:22rem) garbage (x){.x{}}',
  '@container ms3-compass (x)(y){.x{}}',
  '@container ms3-compass (min-width:22rem)(y){.x{}}',
]) {
  test(`the audience-token guard rejects the at-rule regression ${css}`, () => {
    assert.throws(() => assertNoUnapprovedAudienceTokens(css));
  });
}

test('malformed or unsupported grouping preludes grant no exceptions at any nesting depth', () => {
  const wrappers = [
    '@supports', '@layer ()', '@container ???', '@scope ()', '@document',
    '@starting-style garbage', '@media', '@media ()', '@media ???',
    '@media (pointer:coarse) garbage', '@media (pointer:coarse)(min-width:320px)',
    '@media (min-width:1 px)', '@media (min-width:-1px)',
    '@media (min-width:320px) "hidden"', '@media "hidden" (pointer:coarse)',
    '@media\u00a0(pointer:coarse)', '@media/**/(pointer:coarse)',
    '@media (pointer:coarse)\u2028', '@media (pointer:coarse)\u2029',
    '@container ms3-compass (min-width:22rem) garbage (x)',
    '@container ms3-compass (x)(y)', '@container ms3-compass (min-width:22rem)(y)',
    '@container ms3-compass ()', '@container ms3-compass (min-width:22rem) trailing',
    '@container ms3-compass (min-width:22 rem)',
    '@container ms3-compass "hidden" (min-width:22rem)',
    '@container ms3-compass (min-width:22rem) "hidden"',
    '@container ms3-compass/**/(min-width:22rem)',
    '@container ms3-compass\u00a0(min-width:22rem)',
    '@container ms3-compass (min-width:22rem)\u2028',
    '@container ms3-compass (min-width:22rem)\u2029',
    '@container ms3-compassé (min-width:22rem)',
    // These can be valid CSS, but are outside the deliberately supported grouping subset.
    '@supports (display:grid)', '@layer theme', '@scope (.fixture)', '@starting-style',
    '@container other (min-width:22rem)', '@container ms3-compass (min-width:24rem)',
    '@media screen', '@media (pointer:coarse) and (min-width:320px)',
  ];
  for (const wrapper of wrappers) {
    for (const body of [
      '.ms3-compass{}', '[data-ms3-compass-root]{}',
      '.fixture{container:ms3-compass / inline-size}',
      '@container ms3-compass (min-width:30rem){.fixture{}}',
    ]) {
      const invalid = `${wrapper}{${body}}`;
      for (const css of [
        invalid,
        `@media (pointer:coarse){${invalid}}`,
        `${wrapper}{@media (min-width:320px){${body}}}`,
        `@media (pointer:coarse){${wrapper}{@media (min-width:320px){${body}}}}`,
      ]) assert.throws(() => assertNoUnapprovedAudienceTokens(css), css);
    }
  }
});

test('complete supported grouping preludes preserve selector and declaration exceptions', () => {
  const wrappers = [
    '@media (pointer:coarse)', '@media (min-width:1000px)',
    '@media (max-width:390px)', '@media (prefers-reduced-motion:reduce)',
    '@container ms3-compass (min-width:22rem)', '@container ms3-compass (min-width:30rem)',
    '/* heading 😀 */\n@media \t( pointer : coarse )\n',
    '/* heading 😀 */\n@container\tms3-compass\n( min-width : 22rem )\t',
  ];
  for (const wrapper of wrappers) {
    for (const body of [
      '.ms3-compass{}', '[data-ms3-compass-root]{}',
      '.fixture{container:ms3-compass / inline-size}',
      '@container ms3-compass (min-width:30rem){.ms3-compass__weeks{}}',
    ]) {
      const css = `${wrapper}{${body}}`;
      assert.doesNotThrow(() => assertNoUnapprovedAudienceTokens(css), css);
    }
  }
  assert.doesNotThrow(() => assertNoUnapprovedAudienceTokens(
    '@supports {}.ms3-compass{}', // A rejected, empty sibling cannot poison the next rule.
  ));
  for (const css of [
    '@media (pointer:coarse){.ms3-compass{content:"MS3"}}',
    '@container ms3-compass (min-width:22rem){/* resident */.ms3-compass{}}',
    '@media (pointer:coarse){.ms3-compassé{}}',
    '@media (pointer:coarse){.fixture,{container:ms3-compass / inline-size}}',
    '@media (pointer:coarse){.fixture{--x:{container:ms3-compass / inline-size}}}',
  ]) assert.throws(() => assertNoUnapprovedAudienceTokens(css), css);
});

test('the desktop breakpoint is 1000px, as the design specifies', () => {
  assert.match(fd, /min-width:\s*1000px/,
    'desktop rails appear at >=1000px (design handoff, Global Frame)');
});

test('animations are disabled under prefers-reduced-motion', () => {
  assert.match(fd, /@media\s*\(prefers-reduced-motion:\s*reduce\)/,
    'the source prototype ships no reduced-motion handling; this repo requires it');
});

test('reader body gives rendered long-form content a readable token-based type scale', () => {
  const body = rule(fd, '.fd-article__body');
  assert.match(body, /font-size:\s*16\.5px/);
  assert.match(body, /line-height:\s*1\.72/);
  assert.match(body, /max-width:\s*62ch/);
  assert.match(body, /color:\s*var\(--fd-text\)/);
  for (const descendant of ['h2', 'h3', 'ul', 'ol', 'li', 'a', 'code', 'blockquote']) {
    const descendantRule = rule(fd, `.fd-article__body ${descendant}`);
    assert.match(descendantRule, /\S/, `rendered article ${descendant} elements need a non-empty treatment`);
  }
  assert.match(rule(fd, '.fd-article__body h2'), /font-family:|font-size:|line-height:/,
    'section headings need representative typography rather than an empty selector');
  assert.match(rule(fd, '.fd-article__body a'), /color:\s*var\(--fd-/,
    'article links must retain a token-based visible treatment');
  assert.match(rule(fd, '.fd-article__body code'), /font-family:|background:\s*var\(--fd-/,
    'inline code needs a readable typography or token-based surface treatment');
});

test('portalled overlays retain a visible keyboard focus indicator', () => {
  const focus = rule(fd, '.fd-search :focus-visible,.fd-sheet :focus-visible,.fd-nudge :focus-visible');
  assert.match(focus, /outline:\s*2px solid var\(--fd-focus\)/,
    'overlays may mount outside .fd-shell and need their own visible outline');
  assert.match(focus, /outline-offset:\s*2px/,
    'overlay focus needs separation from the control edge');
});

test('the class inventory documents the exact distinct front-door selector count', () => {
  const selectorNames = new Set(
    [...strip(fd).matchAll(/\.((?:fd-[A-Za-z0-9_-]+))/g)].map((m) => m[1]),
  );
  const documented = inventory.match(/\((\d+) distinct `fd-\*` selector names,/);
  assert.ok(documented, 'CLASS-INVENTORY must state the distinct fd-* selector count');
  assert.equal(Number(documented[1]), selectorNames.size,
    'CLASS-INVENTORY must stay synchronized with comment-stripped frontdoor.css selectors');
});
