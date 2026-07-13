import { expect, test } from "vitest";
import baseCss from "./base.css?raw";
import tokensCss from "./tokens.css?raw";

function token(block: string, name: string) {
  return block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
}

function relativeLuminance(hex: string) {
  const channels = [1, 3, 5].map(
    (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

const darkStart = tokensCss.indexOf('[data-theme="dark"]');
const mediaStart = tokensCss.indexOf("@media");
const lightTokens = tokensCss.slice(0, darkStart);
const darkTokens = tokensCss.slice(darkStart, mediaStart);

test.each([
  ["light", lightTokens],
  ["dark", darkTokens],
] as const)(
  "%s primary action tokens meet WCAG AA contrast",
  (_theme, block) => {
    const background = token(block, "--action-bg");
    const foreground = token(block, "--action-fg");

    expect(background, "theme-safe --action-bg token").toBeDefined();
    expect(foreground, "theme-safe --action-fg token").toBeDefined();
    expect(contrastRatio(foreground!, background!)).toBeGreaterThanOrEqual(4.5);
  },
);

test("solid primary buttons consume the action contrast tokens", () => {
  const primaryRule = baseCss.match(/\.button--primary\s*{([\s\S]*?)}/)?.[1];

  expect(primaryRule).toContain("border-color: var(--action-bg)");
  expect(primaryRule).toContain("background: var(--action-bg)");
  expect(primaryRule).toContain("color: var(--action-fg)");
});
