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

/** An Agent Card as resolved by Discovery. `address` is a lease — never
 *  persisted; the GUI stores `guid` and re-resolves. */
export interface Agent {
  guid: string;
  name: string;
  gitCommit: string;
  address: string;
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

export interface SourceRule {
  id: string;
  match: string;
  reason: string;
}

export interface RubricRequire {
  documentType: string;
  domain: string;
  consume: string[];
  reason: string;
}

export interface RubricTrajectory {
  description: string;
  requiredSources: SourceRule[];
  forbiddenSources: SourceRule[];
}

/** The full rubric document. The editor mutates `criteria` and the top-level
 *  scalar fields; the recipe/sections/trajectory sub-trees are preserved
 *  verbatim (they are authored elsewhere, and the editor must not corrupt
 *  them). `unknown`-typed sub-trees are pass-through: we hold them, we don't
 *  interpret them. */
export interface Rubric {
  documentType: string;
  displayName: string;
  version: string;
  aliases: string[];
  reviewThreshold: number;
  criteria: Criterion[];
  // Pass-through sub-trees — held verbatim, not edited in this slice.
  requires?: RubricRequire[];
  exports?: Record<string, { description: string; schema: string }>;
  sections?: unknown[];
  recipe?: unknown;
  trajectory?: RubricTrajectory;
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

export interface RunBatchResponse {
  batchId: string;
  k: number;
  documentRef: string;
  stats: BatchStats;
}

export interface BatchRecord {
  batchId: string;
  documentRef: string;
  k: number;
  stats: BatchStats;
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
