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

import type { BatchComparison, BatchStats, CriterionStat } from "../api/types";
import { pct } from "../lib/format";

export function BatchStatsView({ stats }: { stats: BatchStats }) {
  return (
    <div>
      <ScoreDistributionView stats={stats} />

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
              <CriterionRow key={c.id} c={c} />
            ))}
          </tbody>
        </table>
      </div>
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

function CriterionRow({ c }: { c: CriterionStat }) {
  return (
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
