// src/lib/pattern-suggest.ts
//
// Propose deterministic patterns from a "PASS if ... FAIL otherwise." rule.
//
// Mirrors the agent's pattern-suggest.ts, and carries the same hard limit:
// patterns can only ever be NECESSARY conditions, never sufficient ones. The
// rule "PASS if the output states Helix is within §742.4 scope" names §742.4,
// so if §742.4 never appears the rule cannot be met — a safe fail. But §742.4
// appearing does NOT mean the rule holds: the document could say Helix is OUT
// of scope, which the rule calls a FAIL. A regex cannot tell those apart.
//
// So a suggestion is only ever a REQUIRED pattern the author reviews and
// accepts, wired for hybrid assessment (pattern pre-check AND the judge). It is
// proposed, never applied — a regex nobody reviewed in the deterministic layer
// mis-scores every future document while looking authoritative.

export interface PatternSuggestion {
  pattern: string;
  label: string;
  rationale: string;
}

const IDENTIFIER_PATTERNS: { re: RegExp; kind: string }[] = [
  { re: /§\s?\d+(?:\.\d+)*/g, kind: "regulatory clause" },
  { re: /\b\d[A-Z]\d{3}[A-Za-z0-9.]*\b/g, kind: "export-control classification" },
  { re: /\bISO\s?\d{3,5}(?:-\d+)?\b/g, kind: "ISO standard" },
  { re: /\bIEC\s?\d{3,5}(?:-\d+)?\b/g, kind: "IEC standard" },
  { re: /\b[A-Z]{2,}[A-Z0-9]*\d[A-Z0-9]*\b/g, kind: "part or model code" },
];

export function suggestPatterns(criterion: string): PatternSuggestion[] {
  const passClause = /PASS if\b([\s\S]*?)\.\s*FAIL\b/i.exec(criterion)?.[1] ?? criterion;
  const seen = new Set<string>();
  const out: PatternSuggestion[] = [];

  for (const { re, kind } of IDENTIFIER_PATTERNS) {
    for (const m of passClause.matchAll(re)) {
      const literal = m[0].trim();
      const key = literal.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        pattern: literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        label: literal,
        rationale: `Names the ${kind} "${literal}" — if it never appears the rule cannot be met. Necessary, not sufficient: keep as a hybrid pre-check, the judge still decides.`,
      });
    }
  }
  return out;
}
