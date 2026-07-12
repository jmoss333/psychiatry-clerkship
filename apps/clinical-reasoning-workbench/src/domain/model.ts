export type FactSource =
  | "direct_observation"
  | "patient_report"
  | "collateral"
  | "chart"
  | "objective_data";

export type CaseFactKind =
  | "symptom"
  | "observation"
  | "collateral"
  | "medication"
  | "substance"
  | "medical_event"
  | "laboratory"
  | "function"
  | "stressor";

export type FactReliability = "high" | "moderate" | "low" | "unknown";

export type FactCertainty = "confirmed" | "probable" | "possible" | "unclear";

export type TemporalPrecision =
  "exact" | "day" | "week" | "month" | "year" | "relative";

export type CaseFact = {
  id: string;
  kind: CaseFactKind;
  text: string;
  source: FactSource;
  reliability: FactReliability;
  certainty: FactCertainty;
  start?: string;
  end?: string;
  temporalPrecision?: TemporalPrecision;
  tags: string[];
};

export type TimelineLane =
  | "mood"
  | "psychosis"
  | "sleep_energy"
  | "anxiety_trauma"
  | "substance_use"
  | "medication"
  | "medical_neurologic"
  | "function"
  | "stressors"
  | "treatment";

export type TemporalRelationKind =
  | "preceded"
  | "coincided"
  | "continued_after"
  | "occurred_only_during"
  | "improved_after"
  | "worsened_after"
  | "independent_of"
  | "unclear";

export type TimelineItem = {
  id: string;
  factIds: string[];
  lane: TimelineLane;
  label: string;
  start?: string;
  end?: string;
  approximate: boolean;
  episodeId?: string;
  learnerEdited: boolean;
  sortOrder: number;
};

export type TemporalRelation = {
  id: string;
  fromFactId: string;
  toFactId: string;
  kind: TemporalRelationKind;
};

export type MseTranslation = {
  id: string;
  factIds: string[];
  rawObservation: string;
  descriptiveWording: string;
  acceptedRevision?: string;
  termIds: string[];
  limitationOrAlternative: string;
  discriminatingAnswer?: string;
};

export type HypothesisPosition =
  "favored" | "plausible" | "less_likely" | "cannot_exclude";

export type EvidenceGap = {
  id: string;
  text: string;
  relatedFactIds: string[];
};

export type FactLinkedText = {
  text: string;
  factIds: string[];
};

export type Hypothesis = {
  id: string;
  label: string;
  category: string;
  position: HypothesisPosition;
  supportingFactIds: string[];
  contradictingFactIds: string[];
  missingInformation: EvidenceGap[];
  dangerousIfMissed: boolean;
  managementImplications: FactLinkedText;
  rationale: FactLinkedText;
};

export type DisconfirmationRecord = {
  favoredHypothesisId: string;
  claim: FactLinkedText;
  phenomenologyCheck: FactLinkedText;
  timeCourseChallenge: FactLinkedText;
  exclusionsReview: FactLinkedText;
  rivalHypothesisId: string;
  rivalExplainsBetter: FactLinkedText;
  rivalExplainsWorse: FactLinkedText;
  findingFavoringRival: FactLinkedText;
  findingWeakeningRival: FactLinkedText;
  confidenceDecreaser: FactLinkedText;
  unresolved: FactLinkedText;
  nextDiscriminator: FactLinkedText;
  proposedPosition: HypothesisPosition;
};

export type DisconfirmationDraft = Omit<
  DisconfirmationRecord,
  "rivalHypothesisId" | "proposedPosition"
> & {
  rivalHypothesisId?: string;
  proposedPosition?: HypothesisPosition;
};

export type AppliedDisconfirmationRecord = DisconfirmationRecord & {
  appliedAt: string;
};

export type SummaryClause = {
  id: string;
  text: string;
  factIds: string[];
};

export type LearnerLevel = "ms3" | "resident";

export type WorkspaceState = {
  schemaVersion: 1;
  caseId: string;
  caseVersion: number;
  learnerLevel: LearnerLevel;
  facts: CaseFact[];
  timelineItems: TimelineItem[];
  temporalRelations: TemporalRelation[];
  mseTranslations: MseTranslation[];
  hypotheses: Hypothesis[];
  disconfirmationDraft?: DisconfirmationDraft;
  disconfirmation?: AppliedDisconfirmationRecord;
  summary: SummaryClause[];
  syntheticDataAcknowledged: boolean;
  updatedAt: string;
};

export type FacultyReview = {
  status: "draft" | "pending" | "reviewed";
  reviewedAt?: string;
  reviewedBy?: string;
};

export type CaseDefinition = {
  id: string;
  version: number;
  fictional: true;
  learnerTitle: string;
  facultyReview: FacultyReview;
  facts: CaseFact[];
  timelineItems: TimelineItem[];
  hypotheses: Hypothesis[];
};

export type WorkspaceAction =
  | { type: "acknowledgeSyntheticData" }
  | { type: "setLearnerLevel"; level: LearnerLevel }
  | { type: "upsertFact"; fact: CaseFact }
  | { type: "upsertTimelineItem"; item: TimelineItem }
  | { type: "upsertTemporalRelation"; relation: TemporalRelation }
  | { type: "saveMseTranslation"; translation: MseTranslation }
  | { type: "upsertHypothesis"; hypothesis: Hypothesis }
  | { type: "selectFavored"; hypothesisId: string }
  | { type: "saveDisconfirmationDraft"; draft: DisconfirmationDraft }
  | { type: "applyChallenge"; record: DisconfirmationRecord }
  | { type: "setSummary"; clauses: SummaryClause[] }
  | { type: "resetWorkspace"; workspace: WorkspaceState };
