export type PreviewSelection = {
  caseId: "first_episode_001";
  levelOverride?: "ms3" | "resident";
};

export function parsePreviewQuery(search: string): PreviewSelection {
  const params = new URLSearchParams(search);
  const rawLevel = params.get("level");
  const levelOverride =
    rawLevel === null
      ? undefined
      : rawLevel === "resident"
        ? "resident"
        : "ms3";
  return {
    caseId: "first_episode_001",
    ...(levelOverride ? { levelOverride } : {}),
  };
}
