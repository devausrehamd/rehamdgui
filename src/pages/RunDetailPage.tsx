// src/pages/RunDetailPage.tsx
//
// One run, stage by stage: what each node was given, what it returned.
//
// This is the screen for attributing a bad score. The graph is linear, so it
// reads top to bottom — understand, retrieve, sql_retrieve, draft, reconcile,
// finalize — and the question is always "which stage first went wrong?".
//
// Two rendering decisions worth stating:
//
//   Failed steps open by default. A run with a red step has exactly one
//   interesting row, and making someone hunt for it wastes the trace.
//
//   Retrieved chunks get their own view rather than raw JSON. "Was the value
//   retrieved at all?" is the question this page exists to answer, and it
//   should not require reading a nested object to find out.

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, NetworkError, getRun } from "../api/client";
import type { LlmCall, RunDetail, RunStep } from "../api/types";
import { useAgent } from "../context/AgentContext";
import { dateTime } from "../lib/format";
import { Alert, CenterMessage, Spinner } from "../components/ui";

export function RunDetailPage() {
  const { correlationId = "" } = useParams();
  const { agent } = useAgent();
  const navigate = useNavigate();
  const addr = agent!.address;

  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    getRun(addr, correlationId)
      .then((r) => alive && setRun(r))
      .catch((err) => {
        if (!alive) return;
        setError(
          err instanceof ApiError || err instanceof NetworkError
            ? err.message
            : "Could not load the run trace.",
        );
      });
    return () => {
      alive = false;
    };
  }, [addr, correlationId]);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!run) {
    return (
      <CenterMessage>
        <Spinner label="Loading trace…" />
      </CenterMessage>
    );
  }

  const failedAt = run.steps.find((s) => s.status === "error");

  return (
    <div>
      <div className="row" style={{ marginBottom: "0.5rem" }}>
        <button className="small" onClick={() => navigate("/runs")}>
          ← Runs
        </button>
        {run.mode === "debug" && <span className="badge coinflip right">debug run</span>}
      </div>

      <h1>Run trace</h1>
      <p className="muted small mono">
        {run.correlationId}
        {run.queryId && <> · query {run.queryId}</>}
        {run.userId && <> · {run.userId}</>}
      </p>

      {/* Name the first failure up front: in a linear graph everything after it
          is either absent or downstream of the fault. */}
      {failedAt && (
        <Alert kind="error">
          The graph stopped at <strong>{failedAt.node}</strong>: {failedAt.error}. Stages
          after it did not run, so their absence below is a consequence, not a
          second fault.
        </Alert>
      )}

      <Alert kind="info">
        Secrets are redacted at write time — the graph state carries the caller's
        bearer token, so <code>[redacted]</code> means a value existed and was
        deliberately not stored.
      </Alert>

      <div className="stack">
        {run.steps.map((s) => (
          <StepCard key={s.seq} step={s} />
        ))}
      </div>
    </div>
  );
}

function StepCard({ step }: { step: RunStep }) {
  const failed = step.status === "error";
  const [open, setOpen] = useState(failed);

  return (
    <div
      className="card"
      style={{ marginBottom: 0, borderColor: failed ? "var(--error)" : undefined }}
    >
      <div className="row">
        <span className="badge neutral mono">{step.seq}</span>
        <strong className="mono">{step.node}</strong>
        {failed ? <span className="badge error">error</span> : <span className="badge ok">ok</span>}
        <span className="small muted">{step.latencyMs}ms</span>
        <span className="small muted" title={dateTime(step.recordedAt)}>
          {new Date(step.recordedAt).toLocaleTimeString()}
        </span>
        <button className="small right" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "In / Out"}
        </button>
      </div>

      {failed && step.error && (
        <div className="small" style={{ color: "var(--error)", marginTop: "0.35rem" }}>
          {step.error}
        </div>
      )}

      {open && (
        <div style={{ marginTop: "0.6rem" }}>
          <Retrieved output={step.output} />
          <Prompts calls={step.llmCalls} />
          <Panel title="IN — what this stage was given" value={step.input} />
          <Panel title="OUT — what it returned" value={step.output} />
        </div>
      )}
    </div>
  );
}

/**
 * What this node actually SENT to the model, and what came back.
 *
 * The step's input tells you what a node held; this tells you what it passed
 * on, and the gap between the two is where most bad answers live. A chunk can
 * be retrieved, sit in the node's input, and still never reach the prompt —
 * from the input alone that is indistinguishable from the model ignoring it.
 *
 * Shown verbatim and in full: the point of reading a prompt is to search it for
 * the value you expected to be there, and a truncated prompt cannot answer that
 * question — it can only fail to.
 */
function Prompts({ calls }: { calls: LlmCall[] }) {
  if (!calls || calls.length === 0) return null;

  return (
    <div className="card" style={{ background: "var(--surface-2)", marginBottom: "0.6rem" }}>
      <h3 style={{ marginTop: 0 }}>
        Model calls <span className="small muted">({calls.length})</span>
      </h3>
      {calls.map((c) => (
        <div key={c.seq} style={{ marginBottom: "0.75rem" }}>
          <div className="row" style={{ gap: "0.4rem" }}>
            <span className="badge neutral mono">#{c.seq}</span>
            <span className="small mono muted">{c.model ?? "model unknown"}</span>
            <span className="small muted">{c.latencyMs}ms</span>
            {c.status === "error" && <span className="badge error">failed</span>}
          </div>
          {c.error && (
            <div className="small" style={{ color: "var(--error)" }}>
              {c.error}
            </div>
          )}
          <div className="small muted" style={{ marginTop: "0.3rem" }}>
            PROMPT — exactly what the model was asked
          </div>
          <pre
            className="table-scroll"
            style={{ margin: 0, fontSize: "0.72rem", maxHeight: "18rem", overflowY: "auto", whiteSpace: "pre-wrap" }}
          >
            {c.prompt}
          </pre>
          <div className="small muted" style={{ marginTop: "0.3rem" }}>
            COMPLETION — what it answered
          </div>
          <pre
            className="table-scroll"
            style={{ margin: 0, fontSize: "0.72rem", maxHeight: "14rem", overflowY: "auto", whiteSpace: "pre-wrap" }}
          >
            {c.completion ?? "— no completion (the call failed)"}
          </pre>
        </div>
      ))}
    </div>
  );
}

/**
 * Surface retrieved chunks as a list rather than leaving them buried in the
 * output JSON.
 *
 * "Was this value ever retrieved?" is the first question of most low-score
 * investigations, and answering it should not require expanding a nested
 * object. Everything shown here is also in the raw OUT panel below — this is a
 * lens on it, not a separate source.
 */
function Retrieved({ output }: { output: unknown }) {
  const byTier = (output as { chunksByTier?: Record<string, unknown[]> } | null)?.chunksByTier;
  if (!byTier || typeof byTier !== "object") return null;

  const tiers = Object.entries(byTier);
  if (tiers.length === 0) return null;

  return (
    <div className="card" style={{ background: "var(--surface-2)", marginBottom: "0.6rem" }}>
      <h3 style={{ marginTop: 0 }}>Retrieved</h3>
      {tiers.map(([tier, chunks]) => (
        <div key={tier} style={{ marginBottom: "0.5rem" }}>
          <span className="badge neutral">{tier}</span>{" "}
          <span className="small muted">
            {Array.isArray(chunks) ? chunks.length : 0} chunk
            {Array.isArray(chunks) && chunks.length === 1 ? "" : "s"}
          </span>
          {Array.isArray(chunks) && chunks.length === 0 && (
            <div className="small" style={{ color: "var(--warn)" }}>
              Nothing retrieved for this tier — if the answer needed something here,
              this is where it went missing.
            </div>
          )}
          {Array.isArray(chunks) &&
            chunks.map((c, i) => {
              const ch = c as { source?: string; text?: string; score?: number };
              return (
                <div key={i} className="small" style={{ margin: "0.35rem 0 0 0.5rem" }}>
                  <span className="mono muted">{ch.source ?? `chunk ${i + 1}`}</span>
                  {typeof ch.score === "number" && (
                    <span className="muted"> · score {ch.score.toFixed(3)}</span>
                  )}
                  {ch.text && (
                    <div className="muted" style={{ whiteSpace: "pre-wrap" }}>
                      {ch.text.slice(0, 400)}
                      {ch.text.length > 400 && "…"}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}

/** The verbatim value. JSON because this is evidence: a prettier rendering that
 *  dropped a field would be worse than one that is merely dense. */
function Panel({ title, value }: { title: string; value: unknown }) {
  if (value === null || value === undefined) {
    return (
      <div style={{ marginBottom: "0.5rem" }}>
        <div className="small muted">{title}</div>
        <div className="small muted">— nothing recorded (the stage returned no value)</div>
      </div>
    );
  }
  return (
    <div style={{ marginBottom: "0.5rem" }}>
      <div className="small muted">{title}</div>
      <pre
        className="table-scroll"
        style={{ margin: 0, fontSize: "0.75rem", maxHeight: "22rem", overflowY: "auto" }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
