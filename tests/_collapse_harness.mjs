/* Minimal DOM harness for the in-page collapsible-section pass.
 *
 * WHY IT EXISTS: `makeCollapsible()` in spa_index.html decides, at render time, which parts of a
 * long page a learner can see without touching anything. That decision is not visible in any
 * source file -- asserting "the crisis marker is present in the markdown" passes happily while the
 * rendered 988 line sits inside a `display:none` section. So the regression guard has to run the
 * REAL function over the REAL rendered markup and read back what a learner would actually see.
 *
 * The root node test suite has no dependencies (CI runs `node --test tests/*.test.mjs` with no
 * npm install), so jsdom is not available. This is a deliberately small stand-in: marked emits
 * well-formed, balanced block-level HTML, and `makeCollapsible` only ever inspects `tagName` on
 * the body's direct children -- everything else it treats as an opaque node to move. Modelling
 * each top-level block as an opaque chunk is therefore faithful for this function, and nothing
 * else is claimed for the harness.
 *
 * Visibility mirrors the shipped CSS: `.sec-b{display:none}` / `.sec-c.open .sec-b{display:block}`.
 * tests/fd-crisis-visibility.test.mjs pins that those two rules are still the ones in the shell,
 * so the harness cannot drift away from the stylesheet it is modelling.
 */
import { readFileSync } from 'node:fs';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

export function loadMarked(buildDir) {
  const src = readFileSync(`${buildDir}/marked.min.js`, 'utf8');
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  return new Function('module', 'exports', `${src}; return module.exports;`)(mod, mod.exports);
}

/* Byte-for-byte the preprocessing fd_wire.js applies before handing markdown to marked. */
export function preprocessMarkdown(markdown) {
  const split = String(markdown || '').indexOf('\n## ');
  const head = split > -1 ? String(markdown).slice(0, split) : String(markdown || '');
  const rest = split > -1 ? String(markdown).slice(split) : '';
  let clean = `${head.replace(/^[ \t]*(Generated|Audience):.*$/gim, '').replace(/\n{3,}/g, '\n\n')}${rest}`;
  clean = clean.replace(/^﻿?(?:[ \t]*\r?\n)*[ \t]*#[ \t]+[^\r\n]*(?:\r?\n|$)/, '');
  return clean;
}

function stripTags(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

/* Split marked's output into its top-level blocks. Tag depth only -- marked never emits an
   unbalanced or implicitly-closed block tag, and comments/void elements are handled explicitly. */
export function parseTopLevel(html) {
  const out = [];
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g;
  let depth = 0;
  let start = 0;
  let tag = null;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[0].startsWith('<!--')) continue;
    const name = m[1].toLowerCase();
    const selfClosing = m[2] === '/' || VOID.has(name);
    if (m[0][1] === '/') {
      depth -= 1;
      if (depth === 0) { out.push({ tag, html: html.slice(start, re.lastIndex) }); tag = null; }
      continue;
    }
    if (selfClosing) { if (depth === 0) out.push({ tag: name, html: m[0] }); continue; }
    if (depth === 0) { start = m.index; tag = name; }
    depth += 1;
  }
  return out;
}

class El {
  constructor(tag, rawHtml) {
    this.tagName = String(tag || 'div').toUpperCase();
    this._raw = rawHtml || '';
    this._children = [];
    this._attrs = {};
    this._text = rawHtml ? stripTags(rawHtml) : '';
    this.parentNode = null;
    const self = this;
    this.classList = {
      add(c) { self._classes().indexOf(c) === -1 && self._setClass(self._classes().concat([c])); },
      remove(c) { self._setClass(self._classes().filter((x) => x !== c)); },
      contains(c) { return self._classes().indexOf(c) !== -1; },
      toggle(c, on) { const want = on === undefined ? !this.contains(c) : !!on; if (want) this.add(c); else this.remove(c); },
    };
  }

  _classes() { return String(this.className || '').split(/\s+/).filter(Boolean); }

  _setClass(list) { this.className = list.join(' '); }

  get children() { return this._children.slice(); }

  get textContent() {
    if (this._children.length) return this._children.map((c) => c.textContent).join(' ').replace(/\s+/g, ' ').trim();
    return this._text;
  }

  set textContent(v) { this._text = String(v); this._children = []; }

  set innerHTML(v) { this._raw = String(v); this._text = stripTags(String(v)); this._children = []; }

  get innerHTML() { return this._raw; }

  /* Both of these DETACH first: in a real DOM appendChild/insertBefore MOVE a node, and
     makeCollapsible relies on that -- it appends the body nodes into the new section body and
     expects them to leave the article body. Copying instead of moving would leave every node
     visible at top level and quietly turn this harness into a rubber stamp. */
  appendChild(node) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this._children.push(node);
    return node;
  }

  insertBefore(node, ref) {
    if (node.parentNode) node.parentNode.removeChild(node);
    const i = this._children.indexOf(ref);
    node.parentNode = this;
    if (i === -1) this._children.push(node); else this._children.splice(i, 0, node);
    return node;
  }

  removeChild(node) {
    const i = this._children.indexOf(node);
    if (i !== -1) this._children.splice(i, 1);
    node.parentNode = null;
    return node;
  }

  setAttribute(k, v) { this._attrs[k] = String(v); }

  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; }

  _matches(sel) {
    if (sel.charAt(0) === '.') return this._classes().indexOf(sel.slice(1)) !== -1 || this._raw.indexOf(`class="${sel.slice(1)}`) !== -1;
    if (sel.indexOf('[') !== -1) {
      const tag = sel.slice(0, sel.indexOf('[')).toUpperCase();
      const attr = sel.slice(sel.indexOf('[') + 1, sel.indexOf(']'));
      return this.tagName === tag && this.getAttribute(attr) !== null;
    }
    return this.tagName === sel.toUpperCase() || (!!this._raw && new RegExp(`<${sel}\\b`, 'i').test(this._raw));
  }

  querySelectorAll(sel) {
    const out = [];
    this._children.forEach((c) => {
      if (c._matches(sel)) out.push(c);
      out.push(...c.querySelectorAll(sel));
    });
    return out;
  }

  querySelector(sel) { const all = this.querySelectorAll(sel); return all.length ? all[0] : null; }
}

/* Text a learner sees on first paint, honouring `.sec-b{display:none}` unless the owning
   `.sec-c` carries `.open`. */
export function visibleText(node) {
  if (node._classes().indexOf('sec-b') !== -1) {
    const owner = node.parentNode;
    const open = owner && owner._classes().indexOf('open') !== -1;
    if (!open) return '';
  }
  if (!node._children.length) return node._text;
  return node._children.map(visibleText).join(' ').replace(/\s+/g, ' ').trim();
}

/* Extract the real makeCollapsible() out of the shell and run it over `html`. */
export function runCollapsible(shellSource, html) {
  const fnStart = shellSource.indexOf('  function makeCollapsible(body){');
  if (fnStart === -1) throw new Error('makeCollapsible() not found in the shell');
  const end = shellSource.indexOf('\n  function tableLabel(', fnStart);
  if (end === -1) throw new Error('could not delimit makeCollapsible()');
  /* The function leans on one document-scoped free variable, the disclosure-id counter declared
     immediately above it. Pull it in rather than stubbing it, so the ids the harness sees are the
     ids the page emits. Renaming it here fails loudly with a ReferenceError. */
  const seqStart = shellSource.lastIndexOf('  var SEC_SEQ=', fnStart);
  const start = seqStart === -1 ? fnStart : seqStart;
  const fnSrc = shellSource.slice(start, end);

  const document = { createElement: (t) => new El(t) };
  const body = new El('div');
  body.className = 'fd-article__body';
  parseTopLevel(html).forEach((block) => body.appendChild(new El(block.tag, block.html)));

  // eslint-disable-next-line no-new-func
  new Function('document', 'requestAnimationFrame', 'refreshTableScrollCues', `${fnSrc}\n  return makeCollapsible;`)(
    document, () => {}, () => {},
  )(body);

  return {
    body,
    sections: body.querySelectorAll('.sec-c'),
    visible: visibleText(body),
    all: body._children.map((c) => c.textContent).join(' '),
  };
}

export { El };
