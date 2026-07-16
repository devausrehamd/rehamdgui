// src/components/BatchPanel.tsx
//
// The k-sampling steering loop. The editor pastes a sample document, picks k,
// and runs the judge k times. We show the resulting distribution (via
// BatchStatsView) and the trajectory of past batches with the server's
// comparison — honestly flagging signal vs noise vs underpowered.
//
// Comparison is server-side and only between the two most recent batches on the
// SAME documentRef. So the ref is a stable label the user controls: keep it the
// same across runs to steer one document; change it to test another.

import { useCallback, useEffect, useState } from "react";
import { ApiError, NetworkError, listBatches, runBatch } from "../api/client";
import type { BatchComparison, BatchRecord } from "../api/types";
import { dateTime } from "../lib/format";
import { Alert, Spinner } from "./ui";
import { BatchStatsView, ComparisonView } from "./BatchStatsView";

export function BatchPanel({ addr, draftId }: { addr: string; draftId: string }) {
  const [documentText, setDocumentText] = useState("");
  const [documentRef, setDocumentRef] = useState("sample-1");
  const [k, setK] = useState(10);

  const [batches, setBatches] = useState<BatchRecord[] | null>(null);
  const [comparison, setComparison] = useState<BatchComparison | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await listBatches(addr, draftId);
      setBatches(res.batches);
      setComparison(res.latestComparison);
      setSelectedId((prev) => prev ?? res.batches[0]?.batchId ?? null);
    } catch (err) {
      setError(errMsg(err, "Could not load batch history."));
    }
  }, [addr, draftId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run() {
    setError(null);
    setRunning(true);
    try {
      const clampedK = Math.min(Math.max(Math.round(k) || 1, 1), 30);
      const res = await runBatch(addr, draftId, {
        documentText,
        documentRef: documentRef.trim() || "sample",
        k: clampedK,
      });
      setSelectedId(res.batchId);
      await load();
    } catch (err) {
      setError(errMsg(err, "Batch run failed."));
    } finally {
      setRunning(false);
    }
  }

  const selected = batches?.find((b) => b.batchId === selectedId) ?? batches?.[0] ?? null;

  return (
    <div>
      <div className="card">
        <h3>Run a k-sampling batch</h3>
        <p className="muted small">
          The judge has ~40% run-to-run variance. Running it k times turns a single
          verdict into a pass rate with a confidence interval — the only honest way
          to tell whether a wording change actually moved scoring.
        </p>

        <div className="field">
          <label htmlFor="doctext">Sample document text</label>
          <textarea
            id="doctext"
            value={documentText}
            onChange={(e) => setDocumentText(e.target.value)}
            placeholder="Paste a document to score this rubric against…"
          />
        </div>

        <div className="row" style={{ alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: "10rem" }}>
            <label htmlFor="docref">Document label</label>
            <input
              id="docref"
              value={documentRef}
              onChange={(e) => setDocumentRef(e.target.value)}
              title="Keep this the same across runs to compare batches on the same document."
            />
          </div>
          <div style={{ flex: "0 0 7rem" }}>
            <label htmlFor="k">k (1–30)</label>
            <input
              id="k"
              type="number"
              min={1}
              max={30}
              value={k}
              onChange={(e) => setK(e.target.valueAsNumber || 1)}
            />
          </div>
          <button
            className="primary"
            style={{ marginBottom: "0.05rem" }}
            onClick={() => void run()}
            disabled={running || documentText.trim().length === 0}
          >
            {running ? <Spinner label={`Running ${Math.min(Math.max(k, 1), 30)} judge passes…`} /> : "Run batch"}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: "0.75rem" }}>
            <Alert kind="error">{error}</Alert>
          </div>
        )}
      </div>

      {comparison && (
        <div style={{ marginBottom: "1rem" }}>
          <ComparisonView comparison={comparison} />
        </div>
      )}

      {batches && batches.length === 0 && !running && (
        <p className="muted">No batches yet. Paste a document and run one.</p>
      )}

      {batches && batches.length > 0 && (
        <div className="card">
          <div className="row">
            <h3 style={{ margin: 0 }}>Trajectory</h3>
            <span className="small muted right">{batches.length} batch{batches.length === 1 ? "" : "es"} (newest first)</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Document</th>
                  <th>k</th>
                  <th>Score (mean)</th>
                  <th>Gate</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.batchId} style={b.batchId === selected?.batchId ? { background: "var(--surface-2)" } : undefined}>
                    <td className="small">{dateTime(b.createdAt)}</td>
                    <td className="mono small">{b.documentRef}</td>
                    <td>{b.k}</td>
                    <td>{(b.stats.score.mean * 100).toFixed(1)}%</td>
                    <td>{Math.round(b.stats.gatePassRate * b.k)}/{b.k}</td>
                    <td>
                      <button className="small" onClick={() => setSelectedId(b.batchId)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <div className="card">
          <h3>
            Batch detail <span className="mono small muted">{selected.documentRef} · k={selected.k}</span>
          </h3>
          <BatchStatsView stats={selected.stats} runs={selected.runs} />
        </div>
      )}
    </div>
  );
}

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError || err instanceof NetworkError) return err.message;
  return fallback;
}
