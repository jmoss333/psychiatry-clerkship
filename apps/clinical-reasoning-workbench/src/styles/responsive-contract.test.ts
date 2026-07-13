import { expect, test } from "vitest";
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
