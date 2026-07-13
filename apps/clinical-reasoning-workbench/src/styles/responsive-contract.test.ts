import { expect, test } from "vitest";
import baseCss from "./base.css?raw";
import featuresCss from "./features.css?raw";
import shellCss from "./shell.css?raw";
import tokensCss from "./tokens.css?raw";

function betweenBreakpoints(css: string, start: "1099" | "767", end?: "767") {
  const startMarker = `@media (max-width: ${start}px)`;
  const startIndex = css.indexOf(startMarker);
  expect(startIndex, `${startMarker} must exist`).toBeGreaterThanOrEqual(0);
  const endIndex = end
    ? css.indexOf(`@media (max-width: ${end}px)`, startIndex + 1)
    : css.length;
  expect(endIndex, `end breakpoint ${end ?? "EOF"} must exist`).toBeGreaterThan(
    startIndex,
  );
  return css.slice(startIndex, endIndex);
}

test("1100px keeps the base three-column, 64px desktop contract", () => {
  const base = shellCss.slice(
    0,
    shellCss.indexOf("@media (max-width: 1099px)"),
  );
  expect(tokensCss).toContain("--header-height: 64px");
  expect(tokensCss).toContain("--control-height: 36px");
  expect(base).toContain(
    "grid-template-columns: 280px minmax(520px, 1fr) 300px",
  );
});

test.each([1099, 768])(
  "%ipx keeps a 64px single-row header with reachable 44px controls",
  () => {
    const tabletTokens = betweenBreakpoints(tokensCss, "1099", "767");
    const tabletShell = betweenBreakpoints(shellCss, "1099", "767");

    expect(tabletTokens).toContain("--control-height: 44px");
    expect(tabletTokens).not.toContain("--header-height: 112px");
    expect(tabletShell).not.toContain("grid-template-rows: 56px 56px");
    expect(tabletShell).toContain("overflow-x: auto");
    expect(tabletShell).toContain("inset: var(--header-height) 0 0 auto");
  },
);

test("767px switches to the 112px two-row header and full sheet rails", () => {
  const compactTokens = betweenBreakpoints(tokensCss, "1099", "767");
  const mobileTokens = betweenBreakpoints(tokensCss, "767");
  const mobileShell = betweenBreakpoints(shellCss, "767");

  expect(mobileTokens).toContain("--header-height: 112px");
  expect(compactTokens).toContain("--control-height: 44px");
  expect(mobileShell).toContain("grid-template-rows: 56px 56px");
  expect(mobileShell).toMatch(/\.evidence-rail,[\s\S]*?inset: 0;/);
});

test("evidence interactions consume the shared 36px desktop and 44px compact target", () => {
  expect(featuresCss).toMatch(
    /\.evidence-drawer__selected-only,[\s\S]*?\.evidence-row__identity label,[\s\S]*?\.evidence-row__identity \.button[\s\S]*?min-height: var\(--control-height\)/,
  );
  expect(featuresCss).not.toContain("min-height: 30px");
  expect(tokensCss).toContain("--control-height: 36px");
  expect(betweenBreakpoints(tokensCss, "1099", "767")).toContain(
    "--control-height: 44px",
  );
});

test("timeline keeps a 720px internal semantic table with sticky lane and time headers", () => {
  expect(featuresCss).toMatch(
    /\.timeline-grid-scroll\s*\{[\s\S]*?overflow-x: auto/,
  );
  expect(featuresCss).toMatch(/\.timeline-grid\s*\{[\s\S]*?min-width: 720px/);
  expect(featuresCss).toMatch(
    /\.timeline-grid thead th[\s\S]*?position: sticky[\s\S]*?top: 0/,
  );
  expect(featuresCss).toMatch(
    /\.timeline-grid__lane[\s\S]*?position: sticky[\s\S]*?left: 0/,
  );
});

test("timeline actions consume shared targets and FactChips reach 44px in compact layouts", () => {
  expect(featuresCss).toMatch(
    /\.timeline-mark__edit\s*\{[\s\S]*?min-height: var\(--control-height\)/,
  );
  expect(featuresCss).not.toMatch(
    /\.timeline-mark__edit\s*\{[\s\S]*?min-height: 32px/,
  );
  const compactBaseStart = baseCss.indexOf("@media (max-width: 1099px)");
  const compactBaseEnd = baseCss.indexOf(
    "@media (prefers-reduced-motion: reduce)",
    compactBaseStart,
  );
  expect(baseCss.slice(compactBaseStart, compactBaseEnd)).toMatch(
    /\.fact-chip\s*\{[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px/,
  );
});
