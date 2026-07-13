import { expect, test } from "vitest";
import { parsePreviewQuery } from "./query";

test("missing preview values use the supported case without a level override", () => {
  expect(parsePreviewQuery("")).toEqual({ caseId: "first_episode_001" });
  expect(parsePreviewQuery("?case=first_episode_001")).toEqual({
    caseId: "first_episode_001",
  });
});

test("valid learner levels are preserved as explicit overrides", () => {
  expect(parsePreviewQuery("?level=ms3")).toEqual({
    caseId: "first_episode_001",
    levelOverride: "ms3",
  });
  expect(parsePreviewQuery("?level=resident")).toEqual({
    caseId: "first_episode_001",
    levelOverride: "resident",
  });
});

test("invalid supplied values fall back without throwing", () => {
  expect(parsePreviewQuery("?case=unknown&level=attending")).toEqual({
    caseId: "first_episode_001",
    levelOverride: "ms3",
  });
  expect(parsePreviewQuery("?case=%E0%A4%A&level=%00")).toEqual({
    caseId: "first_episode_001",
    levelOverride: "ms3",
  });
});

test("unsupported cases never change the one supported preview case", () => {
  expect(parsePreviewQuery("?case=legacy_case&level=resident")).toEqual({
    caseId: "first_episode_001",
    levelOverride: "resident",
  });
});
