// A scoped copy of the in-page contrast probe in contrast.spec.js, for the packet preview and sheet. The canary spec itself is
// deliberately not touched or imported: it runs against production (where the packet is off) on a fixed four-route budget
// (tests/canary-scope.test.mjs). The measuring logic is the same: the ground is the first ancestor background that is at
// least half opaque, normal text needs 4.5:1, and large text (>= 24px, or >= 18.66px at weight 700) needs 3:1.
//
// Pass to page.evaluate with a root selector; it must stay self-contained because it is serialised into the page.
export function probeContrastWithin(rootSelector) {
  const rgb = value => {
    const parts = String(value).match(/[\d.]+/g);
    return parts ? { c: parts.slice(0, 3).map(Number), a: parts.length > 3 ? Number(parts[3]) : 1 } : null;
  };
  const luminance = ([r, g, b]) => {
    const f = v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const groundOf = el => {
    let node = el;
    while (node && node !== document.documentElement) {
      const bg = rgb(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0.5) return bg.c;
      node = node.parentElement;
    }
    return [255, 255, 255];
  };
  const findings = [];
  let examined = 0;
  for (const el of document.querySelectorAll(rootSelector + ' *')) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.1) continue;
    if (el.closest('.fd-packet-vh')) continue;
    const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim().length > 1).map(n => n.textContent.trim()).join(' ');
    if (!own) continue;
    const box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    const ink = rgb(style.color);
    if (!ink || ink.a < 0.1) continue;
    examined += 1;
    const size = parseFloat(style.fontSize);
    const bar = (size >= 24 || (size >= 18.66 && parseInt(style.fontWeight, 10) >= 700)) ? 3 : 4.5;
    const measured = ratio(ink.c, groundOf(el));
    if (measured < bar) findings.push({ ratio: Number(measured.toFixed(2)), bar, size, where: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''), text: own.slice(0, 50) });
  }
  return { examined, findings };
}

// Non-text contrast (WCAG 1.4.11) for the boundary of a text field: the border is the only thing that marks a field out, so it
// needs 3:1 against the field's fill AND against the ground around it. Checkboxes and radios use the browser's own rendering and
// are not examined. Self-contained, for page.evaluate.
export function probeBoundariesWithin(rootSelector) {
  const rgb = value => {
    const parts = String(value).match(/[\d.]+/g);
    return parts ? { c: parts.slice(0, 3).map(Number), a: parts.length > 3 ? Number(parts[3]) : 1 } : null;
  };
  const luminance = ([r, g, b]) => {
    const f = v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const groundOf = el => {
    let node = el;
    while (node && node !== document.documentElement) {
      const bg = rgb(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0.5) return bg.c;
      node = node.parentElement;
    }
    return [255, 255, 255];
  };
  const findings = [];
  let examined = 0;
  for (const el of document.querySelectorAll(rootSelector + ' input[type="text"], ' + rootSelector + ' input[type="tel"], ' + rootSelector + ' textarea')) {
    if (el.getClientRects().length === 0) continue;
    const style = getComputedStyle(el), border = rgb(style.borderTopColor);
    examined += 1;
    if (!border || parseFloat(style.borderTopWidth) < 1 || style.borderTopStyle === 'none') { findings.push({ where: el.id || el.tagName, problem: 'no visible border' }); continue; }
    const fill = rgb(style.backgroundColor), inside = fill && fill.a > 0.5 ? fill.c : groundOf(el.parentElement), outside = groundOf(el.parentElement);
    for (const [label, other] of [['fill', inside], ['ground', outside]]) {
      const measured = ratio(border.c, other);
      if (measured < 3) findings.push({ where: el.id || el.tagName, against: label, ratio: Number(measured.toFixed(2)) });
    }
  }
  return { examined, findings };
}
