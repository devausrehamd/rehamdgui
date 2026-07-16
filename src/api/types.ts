// src/api/types.ts
//
// TypeScript mirrors of the shapes the servers return. These are DISPLAY
// contracts, not sources of truth: the GUI renders these values, it never
// recomputes them. If the server says a criterion is a coin-flip, it is a
// coin-flip — this file just names the field.
//
// Shapes are drawn 1:1 from the running services:
//   - ID Server   POST /v1/login
//   - Discovery   GET  /v1/agents, GET /v1/agents/{guid}
//   - Agent       /api/v1/rubrics*, /api/v1/rubric-drafts*

// ---------------------------------------------------------------------------
// Auth (ID Server)
// ---------------------------------------------------------------------------

export type Role = "engineer" | "reviewer" | "admin" | "service";

export interface LoginResponse {
  token: string;
  userId: string;
  role: Role;
  expiresIn: number; // seconds
}

/** The subset of JWT claims the GUI reads for convenience. Never trusted for
 *  security — the Agent re-verifies every call. */
export interface TokenClaims {
  sub: string;
  role: Role;
  exp: number; // unix seconds
}

/** In-memory (and sessionStorage-mirrored) session state. */
export interface Session {
  token: string;
  userId: string;
  role: Role;
  /** exp from the token, unix seconds. */
  exp: number;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export type Health = "healthy" | "degraded" | "unknown";

/** An agent instance's operating mode, fixed for the life of its process.
 *  Displayed, never decided here — the server enforces what each mode allows. */
export type AgentMode = "production" | "debug";

/** An Agent Card as resolved by Discovery. `address` is a lease — never
 *  persisted; the GUI stores `guid` and re-resolves. */
export interface Agent {
  guid: string;
  name: string;
  gitCommit: string;
  address: string;
  /** production | debug. Optional because an older agent may not advertise it;
   *  treat a missing value as production (the stricter reading), never debug. */
  mode?: AgentMode;
  /** The deployment this instance belongs to. Agents sharing a group are listed
   *  together. A label the operator set — intent, not proof. */
  group?: string;
  /** Fingerprint of the committed rubric set the agent actually loaded. THIS is
   *  the proof: agents agreeing here serve identical rubrics, whatever their
   *  group label or git commit claims. Absent means unknown — never treat a
   *  missing value as agreement. */
  rubricSetHash?: string;
  observabilityUrl?: string;
  capabilities: string[];
  health: Health;
  lastSeen: string; // ISO
  registeredAt: string; // ISO
}

export interface ListAgentsResponse {
  agents: Agent[];
}

export interface ResolveAgentResponse {
  agent: Agent;
}

// ---------------------------------------------------------------------------
// Rubrics — committed (read-only)
// ---------------------------------------------------------------------------

export interface CommittedRubricSummary {
  documentType: string;
  displayName: string;
  version: string;
  hash: string;
  criteriaCount: number;
  hasRecipe: boolean;
  committed: true;
}

export interface ListRubricsResponse {
  rubrics: CommittedRubricSummary[];
}

/** What one document type's rubric did across a release pull. */
export interface RubricChange {
  documentType: string;
  change: "added" | "updated" | "removed" | "unchanged";
  fromHash: string | null;
  toHash: string | null;
}

/** Result of pulling the released rubric set from git. */
export interface RubricUpdateResult {
  /** The configured release ref, e.g. "origin/rubrics-release". */
  ref: string;
  /** The commit it resolved to — the exact standard now loaded. */
  refCommit: string;
  fromSetHash: string;
  toSetHash: string;
  changed: RubricChange[];
  /** True when nothing moved — the agent was already on the released set. */
  upToDate: boolean;
}

export interface GetRubricResponse {
  documentType: string;
  hash: string;
  committed: true;
  rubric: Rubric;
}

// ---------------------------------------------------------------------------
// Rubric content — the editable, typed shape (mirrors rubric-schema.ts)
// ---------------------------------------------------------------------------

export const GATE_LEVELS = ["critical", "major", "minor", "advisory"] as const;
export type Gate = (typeof GATE_LEVELS)[number];

export const ASSESSMENT_TYPES = ["llm_judge", "deterministic", "hybrid"] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export interface PatternRule {
  pattern: string;
  label: string;
}

export interface Criterion {
  id: string;
  criterion: string;
  explanation: string;
  weight: number;
  primary: boolean;
  assessmentType: AssessmentType;
  gate: Gate;
  scope: string;
  forbiddenPatterns: PatternRule[];
  requiredPatterns: PatternRule[];
}

/** A trajectory requirement: what the agent must have DONE to earn the
 *  document. A `document` rule demands a corpus document of that type was
 *  retrieved; an `agent` rule demands another agent was asked. A miss is an
 *  auto-fail, decided server-side. */
export type TrajectoryRule =
  | { kind: "document"; id: string; documentType: string; reason: string }
  | { kind: "agent"; id: string; agent: string; query: string; reason: string };

export interface RubricRequire {
  documentType: string;
  domain: string;
  consume: string[];
  reason: string;
}

export interface RubricTrajectory {
  description: string;
  /** All must be satisfied by the run; any miss is an auto-fail. */
  required: TrajectoryRule[];
  /** None may be present; a hit is an auto-fail. */
  forbidden: TrajectoryRule[];
}

// --- Sections: the document's declared structure (mirrors section-schema.ts) ---

export const FIELD_TYPES = ["string", "integer", "number", "enum", "identifier", "reference"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_PROVENANCE = ["retrieved", "generated", "computed"] as const;
export type FieldProvenance = (typeof FIELD_PROVENANCE)[number];

export interface SectionField {
  name: string;
  type: FieldType;
  /** retrieved = cite a source; generated = model prose; computed = code formula. */
  provenance: FieldProvenance;
  required?: boolean;
  /** enum domain, when type is enum. */
  domain?: (string | number)[];
  min?: number;
  max?: number;
  /** the formula, when provenance is computed (e.g. "severity * occurrence"). */
  formula?: string;
  /** the export a reference field points at, when type is reference. */
  referenceExport?: string;
  /** the SOP clause this field came from — provenance for the auditor. */
  sopClause?: string;
}

export interface RubricSection {
  id: string;
  title: string;
  /** single = one row; array = many. */
  cardinality: "single" | "array";
  /** step ids whose outputs ground this section. */
  groundedIn: string[];
  fields: SectionField[];
}

// --- Recipe: the ordered program that produces the document (mirrors recipe.ts) ---

export const RECIPE_STEP_KINDS = [
  "retrieve_sections",
  "query_table",
  "recall_prior",
  "generate_section",
  "validate_section",
  "judge",
  "require_human",
] as const;
export type RecipeStepKind = (typeof RECIPE_STEP_KINDS)[number];

/** One recipe step. Fields beyond id/kind/inputs are kind-specific; kept loose
 *  here and validated server-side on save. */
export interface RecipeStep {
  id: string;
  kind: RecipeStepKind;
  /** ids of prior steps this one consumes (the intra-document DAG). */
  inputs?: string[];
  // retrieve_sections
  source?: string;
  sections?: string[];
  // query_table
  collection?: string;
  // recall_prior
  documentType?: string;
  export?: string;
  // generate_section / validate_section
  sectionId?: string;
  bestOf?: number;
  // judge
  criteria?: string[];
  // require_human
  prompt?: string;
}

export interface RubricRecipe {
  steps: RecipeStep[];
}

/** The full rubric document. The editor mutates `criteria`, the top-level
 *  scalar fields, and now `trajectory`; recipe/sections/requires/exports are
 *  preserved verbatim (authored elsewhere, the editor must not corrupt them). */
export interface Rubric {
  documentType: string;
  displayName: string;
  version: string;
  aliases: string[];
  reviewThreshold: number;
  criteria: Criterion[];
  trajectory?: RubricTrajectory;
  // Pass-through sub-trees — held verbatim, not edited here.
  requires?: RubricRequire[];
  exports?: Record<string, { description: string; schema: string }>;
  sections?: RubricSection[];
  recipe?: RubricRecipe;
}

// ---------------------------------------------------------------------------
// Rubric drafts (mutable staging)
// ---------------------------------------------------------------------------

export type DraftStatus = "draft" | "validated" | string;

export interface DraftSummary {
  id: string;
  documentType: string;
  status: DraftStatus;
  updatedAt: string; // ISO
}

export interface ListDraftsResponse {
  drafts: DraftSummary[];
}

export interface RubricValidationIssue {
  severity: "error" | "warning";
  path: string;
  message: string;
}

export interface RubricValidationSummary {
  documentType: string;
  criteriaCount: number;
  totalWeight: number;
  criticalCount: number;
  hasRecipe: boolean;
  sectionCount: number;
}

export interface RubricValidationResult {
  valid: boolean;
  issues: RubricValidationIssue[];
  summary?: RubricValidationSummary;
}

export interface DraftDetail {
  id: string;
  documentType: string;
  status: DraftStatus;
  committed: false;
  content: Rubric;
  validation: RubricValidationResult | null;
}

/** Response from POST /rubric-drafts (create or update) and .../validate. */
export interface SaveDraftResponse {
  id: string;
  status: DraftStatus;
  committed: false;
  validation: RubricValidationResult;
}

export interface ValidateDraftResponse {
  id: string;
  validation: RubricValidationResult;
}

// ---------------------------------------------------------------------------
// k-sampling batches (the variance instrument)
// ---------------------------------------------------------------------------

export interface Interval {
  low: number;
  high: number;
  center: number;
}

export type CriterionStability = "stable_pass" | "stable_fail" | "unstable";

export interface CriterionStat {
  id: string;
  gate: string;
  weight: number;
  passCount: number;
  runCount: number;
  rate: number; // 0..1
  ci: Interval;
  stability: CriterionStability;
  coinFlip: boolean;
}

export interface ScoreDistribution {
  mean: number;
  min: number;
  max: number;
  stddev: number;
  values: number[];
}

export interface BatchStats {
  k: number;
  perCriterion: CriterionStat[];
  score: ScoreDistribution;
  gatePassRate: number;
}

/** One criterion's verdict on ONE run, with the judge's own reasoning.
 *  This is the evidence behind the aggregate: `stats` says a criterion is a
 *  coin-flip, these say what the model was thinking each time it flipped. */
export interface CriterionVerdict {
  id: string;
  verdict: "pass" | "fail";
  /** Who decided: a pattern match, the LLM, or both. */
  source: "deterministic" | "llm_judge" | "hybrid";
  rationale: string;
  patternHits?: unknown;
}

/** Verdicts for every criterion, for each of the k runs. Null on batches
 *  recorded before runs were kept — "not captured", never "no verdicts". */
export type BatchRuns = CriterionVerdict[][] | null;

export interface RunBatchResponse {
  batchId: string;
  k: number;
  documentRef: string;
  stats: BatchStats;
  runs?: BatchRuns;
}

export interface BatchRecord {
  batchId: string;
  documentRef: string;
  k: number;
  stats: BatchStats;
  runs?: BatchRuns;
  createdAt: string; // ISO
}

export interface CriterionComparison {
  id: string;
  fromRate: number;
  toRate: number;
  rateDelta: number;
  likelySignal: boolean;
  fromStability: CriterionStability;
  toStability: CriterionStability;
  stabilised: boolean;
}

export interface BatchComparison {
  perCriterion: CriterionComparison[];
  scoreMeanDelta: number;
  scoreMoved: boolean;
  underpowered: boolean;
}

export interface ListBatchesResponse {
  batches: BatchRecord[];
  latestComparison: BatchComparison | null;
}

// ---------------------------------------------------------------------------
// Run trace — what went in and out of every graph node
// ---------------------------------------------------------------------------

/** One run, summarised. `errors > 0` means a node threw. */
export interface RunSummary {
  correlationId: string;
  steps: number;
  startedAt: string;
  finishedAt: string;
  totalLatencyMs: number;
  errors: number;
  userId: string | null;
  mode: string | null;
}

/** Whether the caller is seeing every run or only their own. Retrieval is
 *  label-filtered per user, so a run's evidence is scoped to whoever ran it. */
export interface ListRunsResponse {
  runs: RunSummary[];
  scope: "own" | "all";
}

/** One graph node's execution: what it was given, what it returned.
 *  `input`/`output` are redacted server-side — the graph state carries the
 *  caller's bearer token, so `[redacted]` appears in place of any secret. */
/** One prompt sent to the model from within a node, and what came back.
 *  This is what answers "was the retrieved value actually IN the prompt?" —
 *  the step's input tells you what the node held, this tells you what it sent. */
export interface LlmCall {
  seq: number;
  model: string | null;
  prompt: string;
  completion: string | null;
  status: "ok" | "error" | string;
  error: string | null;
  latencyMs: number;
}

export interface RunStep {
  seq: number;
  node: string;
  status: "ok" | "error" | string;
  error: string | null;
  latencyMs: number;
  recordedAt: string;
  input: unknown;
  output: unknown;
  /** Prompts made beneath this node. Empty for nodes that call no model. */
  llmCalls: LlmCall[];
}

export interface RunDetail {
  correlationId: string;
  runId: string;
  queryId: string | null;
  userId: string | null;
  mode: string | null;
  steps: RunStep[];
}

// ---------------------------------------------------------------------------
// Review flow — draft queue, review detail, disposition
// ---------------------------------------------------------------------------

/** One draft set awaiting review. */
export interface PendingDraft {
  setId: string;
  /** The review detail is keyed by this; all docs in a set share it. */
  correlationId: string | null;
  documentType: string;
  subject: string | null;
  status: string;
  createdAt: string; // ISO
}

/** A trajectory verdict as persisted with the draft — WHY a required source
 *  was or was not consulted. Present when the run recorded one. */
export interface DraftTrajectory {
  passed: boolean;
  unknown: boolean;
  findings: { ruleId: string; kind: string; violation: string; detail: string; reason: string }[];
}

/** The rubric result stored on a draft document — everything the server
 *  decided. The GUI displays these, never recomputes them. */
export interface DraftCriterionResults {
  score: number;
  gatePassed: boolean;
  approved: boolean;
  reviewRequired: boolean;
  criticalFailures: string[];
  primaryFailures: string[];
  trajectory: DraftTrajectory | null;
  perCriterion: {
    id: string;
    verdict: "pass" | "fail";
    source: string;
    rationale: string;
  }[];
}

/** One document within a draft set, as the reviewer sees it. */
export interface ReviewDocument {
  documentId: string;
  sectionId: string;
  /** Typed rows — the reviewer edits THESE, never the markdown. */
  rows: Record<string, unknown>[];
  /** Read-only rendering for human reading. */
  markdown: string;
  criterionResults: DraftCriterionResults | null;
  annotations: Record<string, unknown> | null;
  /** Fields the reviewer may edit. */
  editableFields: string[];
  /** Fields the reviewer may NOT edit — computed by code (e.g. RPN). */
  lockedFields: string[];
}

export interface ReviewDetail {
  correlationId: string;
  documentType: string;
  status: string;
  documents: ReviewDocument[];
}

export type Disposition = "approve" | "reject" | "rerun";

export interface DispositionResult {
  correlationId: string;
  decision: Disposition;
  status: string;
  editsRecorded: number;
}
