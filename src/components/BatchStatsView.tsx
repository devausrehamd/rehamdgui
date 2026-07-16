// src/components/BatchStatsView.tsx
//
// The heart of the tool: an HONEST view of k-sampled scoring. A single judge run
// has ~40% variance, so nothing here is shown as a point estimate:
//   - each criterion is a PASS RATE with a confidence interval (passCount/runCount)
//   - a coin-flip criterion (the model can't decide) is flagged prominently — it
//     means the wording is ambiguous and needs tightening
//   - the score is a DISTRIBUTION (mean, min–max, stddev), never a lone number
//   - the gate pass rate shows that approvability itself may be unstable
//
// Every value comes from the server's BatchStats. The GUI computes nothing.

import { useState } from "react";
import type { BatchComparison, BatchRuns, BatchStats, CriterionStat, CriterionVerdict } from "../api/types";
import { pct } from "../lib/format";

export function BatchStatsView({ stats, runs }: { stats: BatchStats; runs?: BatchRuns }) {
  return (
    <div>
      <ScoreDistributionView stats={stats} />

      {runs === null && (
        <div className="small muted" style={{ marginTop: "0.6rem" }}>
          Per-run verdicts were not captured for this batch, so the rationales behind
          these rates are unavailable. Re-run it to record them.
        </div>
      )}

      <div className="table-scroll" style={{ marginTop: "1rem" }}>
        <table>
          <thead>
            <tr>
              <th>Criterion</th>
              <th>Gate</th>
              <th style={{ minWidth: 160 }}>Pass rate</th>
              <th>Passes</th>
              <th>95% CI</th>
              <th>Signal</th>
            </tr>
          </thead>
          <tbody>
            {stats.perCriterion.map((c) => (
              <CriterionRow key={c.id} c={c} runs={runs} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * The judge's own reasoning for one criterion across the k runs, split by what
 * it decided.
 *
 * The split is the whole point. A rate of 12/20 says the model could not decide;
 * reading the PASS rationales against the FAIL rationales shows which two
 * readings of the wording it was oscillating between — which is the thing you
 * actually rewrite. Presented as a list rather than a summary because there is
 * no honest way to average an explanation.
 */
function Rationales({ criterionId, runs }: { criterionId: string; runs: CriterionVerdict[][] }) {
  const mine = runs
    .map((run, i) => ({ run: i + 1, v: run.find((v) => v.id === criterionId) }))
    .filter((x): x is { run: number; v: CriterionVerdict } => Boolean(x.v));

  if (mine.length === 0) return <div className="small muted">No verdicts recorded for this criterion.</div>;

  const passes = mine.filter((x) => x.v.verdict === "pass");
  const fails = mine.filter((x) => x.v.verdict === "fail");

  const group = (label: string, items: typeof mine, cls: string) =>
    items.length === 0 ? null : (
      <div style={{ marginBottom: "0.5rem" }}>
        <span className={`badge ${cls}`}>
          {label} ({items.length})
        </span>
        {items.map((x) => (
          <div key={x.run} className="small" style={{ margin: "0.25rem 0 0 0.25rem" }}>
            <span className="mono muted">run {x.run}</span>{" "}
            <span className="muted">[{x.v.source}]</span> {x.v.rationale || <em className="muted">(no rationale given)</em>}
          </div>
        ))}
      </div>
    );

  return (
    <div style={{ padding: "0.6rem", background: "var(--surface-2)", borderRadius: 6, marginTop: "0.4rem" }}>
      {group("PASSED", passes, "ok")}
      {group("FAILED", fails, "error")}
    </div>
  );
}

function ScoreDistributionView({ stats }: { stats: BatchStats }) {
  const { score, gatePassRate, k } = stats;
  // Position the min–max range and mean marker on a 0–100% track.
  const left = pct(score.min);
  const width = pct(Math.max(0, score.max - score.min));
  const meanLeft = pct(score.mean);

  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="row">
        <div>
          <div className="small muted">Score (distribution over {k} runs)</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            {pct(score.mean, 1)} <span className="small muted">mean</span>
          </div>
          <div className="small muted">
            range {pct(score.min, 0)}–{pct(score.max, 0)} · sd {pct(score.stddev, 1)}
          </div>
        </div>
        <div className="right" style={{ textAlign: "right" }}>
          <div className="small muted">Gate passed</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>
            {Math.round(gatePassRate * k)}/{k} runs
          </div>
          <div className="small muted">{pct(gatePassRate)} of runs</div>
        </div>
      </div>

      <div className="dist-bar" title={`min ${pct(score.min)} · mean ${pct(score.mean)} · max ${pct(score.max)}`}>
        <div className="range" style={{ left, width }} />
        <div className="mean" style={{ left: meanLeft }} />
      </div>
      {score.stddev > 0.05 && (
        <div className="small" style={{ color: "var(--warn)", marginTop: "0.35rem" }}>
          High run-to-run spread — the mean alone would hide this variance.
        </div>
      )}
    </div>
  );
}

function CriterionRow({ c, runs }: { c: CriterionStat; runs?: BatchRuns }) {
  // Coin-flips open by default: the flag is a question ("why can't it decide?")
  // and the rationales are the answer, so making someone click for them buries
  // the point of the flag.
  const [open, setOpen] = useState(c.coinFlip);
  const hasRuns = Array.isArray(runs) && runs.length > 0;

  return (
    <>
    <tr>
      <td className="mono">
        {c.id}
        {c.coinFlip && (
          <div>
            <span className="badge coinflip" title="The CI straddles 50% — the model can't consistently decide. Tighten the wording.">
              COIN-FLIP — ambiguous wording
            </span>
          </div>
        )}
        {hasRuns && (
          <div>
            <button className="small" style={{ marginTop: 4 }} onClick={() => setOpen((o) => !o)}>
              {open ? "Hide" : "Why?"}
            </button>
          </div>
        )}
      </td>
      <td className="small">{c.gate}</td>
      <td>
        <RateBar stat={c} />
      </td>
      <td className="mono">
        {c.passCount}/{c.runCount}
      </td>
      <td className="small mono">
        [{pct(c.ci.low)}–{pct(c.ci.high)}]
      </td>
      <td className="small">
        {c.coinFlip ? (
          <span className="badge coinflip">unstable</span>
        ) : c.stability === "stable_pass" ? (
          <span className="badge ok">stable pass</span>
        ) : (
          <span className="badge error">stable fail</span>
        )}
      </td>
    </tr>
    {open && hasRuns && (
      <tr>
        <td colSpan={6} style={{ paddingTop: 0 }}>
          <Rationales criterionId={c.id} runs={runs} />
        </td>
      </tr>
    )}
    </>
  );
}

export function RateBar({ stat }: { stat: CriterionStat }) {
  const fill = pct(stat.rate);
  const ciLeft = pct(stat.ci.low);
  const ciWidth = pct(Math.max(0, stat.ci.high - stat.ci.low));
  return (
    <div className={`ratebar ${stat.coinFlip ? "coinflip" : ""}`}>
      <div className="fill" style={{ width: fill }} />
      <div className="ci" style={{ left: ciLeft, width: ciWidth }} />
      <div className="label">{pct(stat.rate)}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comparison — "did the last change move a rate beyond the noise?"
// ---------------------------------------------------------------------------

export function ComparisonView({ comparison }: { comparison: BatchComparison }) {
  const moved = comparison.perCriterion.filter((c) => c.likelySignal);

  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <h3>Change vs previous batch</h3>

      {comparison.underpowered && (
        <div className="alert warn">
          <strong>Underpowered.</strong> Too few runs to distinguish these changes
          from noise — increase <code>k</code> before trusting the comparison.
        </div>
      )}

      <div className="row small" style={{ marginBottom: "0.5rem" }}>
        <span>
          Score mean Δ:{" "}
          <strong>
            {comparison.scoreMeanDelta >= 0 ? "+" : ""}
            {pct(comparison.scoreMeanDelta, 1)}
          </strong>
        </span>
        {comparison.scoreMoved ? (
          <span className="badge ok">score moved</span>
        ) : (
          <span className="badge neutral">within noise</span>
        )}
      </div>

      {!comparison.underpowered && moved.length === 0 && (
        <p className="muted small">
          No criterion moved beyond its confidence interval. Any rate changes below
          are within the noise — not evidence the change worked.
        </p>
      )}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Criterion</th>
              <th>From</th>
              <th>To</th>
              <th>Δ</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {comparison.perCriterion.map((c) => (
              <tr key={c.id}>
                <td className="mono">{c.id}</td>
                <td>{pct(c.fromRate)}</td>
                <td>{pct(c.toRate)}</td>
                <td className={c.rateDelta === 0 ? "muted" : ""}>
                  {c.rateDelta > 0 ? "+" : ""}
                  {pct(c.rateDelta)}
                </td>
                <td className="small">
                  {c.likelySignal ? (
                    <span className="badge ok">likely real</span>
                  ) : (
                    <span className="badge neutral">noise</span>
                  )}
                  {c.stabilised && <span className="badge ok" style={{ marginLeft: 4 }}>stabilised</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
