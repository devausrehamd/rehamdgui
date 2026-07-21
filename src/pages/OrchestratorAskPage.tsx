// src/pages/OrchestratorAskPage.tsx
//
// Ask the orchestrator (the Talk Agent). Type a question; the orchestrator
// selects the capability closest to it, then orchestrates the answer. The
// selection is shown for transparency — the GUI displays what the server
// decided, it does not classify anything itself.

import { useState, type FormEvent } from "react";
import { ApiError, NetworkError, orchestratorAsk, type OrchestratorAskResult } from "../api/client";
import { useAgent } from "../context/AgentContext";
import { Alert, Spinner } from "../components/ui";

export function OrchestratorAskPage() {
  const { agent } = useAgent();
  const addr = agent!.address;

  const [question, setQuestion] = useState("How many risks are in the risk register?");
  const [result, setResult] = useState<OrchestratorAskResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await orchestratorAsk(addr, q));
    } catch (err) {
      setError(err instanceof ApiError || err instanceof NetworkError ? err.message : "Ask failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>Ask the orchestrator</h1>
      <Alert kind="info">
        The Talk Agent selects the capability closest to your question, then
        orchestrates the answer under your access. One session per question.
      </Alert>

      <form onSubmit={submit} className="stack" style={{ marginBottom: "1rem" }}>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder="Ask a question about the QMS…"
          style={{ width: "100%" }}
        />
        <button className="primary" disabled={loading}>
          {loading ? "Thinking…" : "Ask"}
        </button>
      </form>

      {error && <Alert kind="error">{error}</Alert>}
      {loading && <Spinner label="Selecting a capability and orchestrating the answer…" />}

      {result && (
        <section className="card">
          <div className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
            <span className="badge ok">selected: {result.selection.capability}</span>
            <span className="badge neutral">{result.selection.kind}</span>
            <span className="badge neutral">confidence {(result.selection.confidence * 100).toFixed(0)}%</span>
          </div>

          {result.needsClarification ? (
            <Alert kind="warn">
              The orchestrator needs clarification — the request didn't map cleanly
              to a capability. Try naming the document or rephrasing the question.
            </Alert>
          ) : (
            <>
              <h3>Answer</h3>
              <pre className="table-scroll" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                {result.answer || "(no answer returned)"}
              </pre>
              <p className="small muted" style={{ marginTop: "0.5rem" }}>
                session {result.correlationId}
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
