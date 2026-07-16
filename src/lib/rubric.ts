// src/lib/rubric.ts — client-side rubric SHAPE helpers (never scoring/validation).
//
// These build/mutate the structured content the editor hands back to the server.
// The server validates and scores; nothing here decides validity or weight
// totals — it only assembles the JSON the API expects.

import type { Criterion, Rubric } from "../api/types";

/** A minimal, well-formed-enough starting point for a blank draft. The server
 *  will validate it and report what's missing — this just gives the editor
 *  something to render. */
export function blankRubric(documentType = "new-document-type"): Rubric {
  return {
    documentType,
    displayName: "New Rubric",
    version: "0.1.0",
    aliases: [],
    reviewThreshold: 0.8,
    criteria: [blankCriterion("criterion-1")],
    recipe: { steps: [] },
    trajectory: { description: "", required: [], forbidden: [] },
  };
}

export function blankCriterion(id = "new-criterion"): Criterion {
  return {
    id,
    criterion: "PASS if the condition is met. FAIL otherwise.",
    explanation: "",
    weight: 1,
    primary: false,
    assessmentType: "llm_judge",
    gate: "major",
    scope: "all_output",
    forbiddenPatterns: [],
    requiredPatterns: [],
  };
}
