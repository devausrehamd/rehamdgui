# QMS GUI — `4 · GUI`

A **thin web client** for the QMS agent stack. Part of the four-project stack in
`~/projects` (open `qms-stack.code-workspace` to load all four):

| # | Project | Directory | Port |
|---|---------|-----------|------|
| 1 | Agent | `rehamdmacflow` | 4000+ (**discovered**, never configured) |
| 2 | ID Server | `idserver` | 3001 |
| 3 | Discovery | `discovery` | 3005 |
| 4 | **GUI (this)** | `gui` | 5173 |

## The one rule: the GUI computes nothing

Everything hard already exists server-side and is tested. This client **displays
what the servers return and submits what the user does** — nothing more.

Rubric scores, gate pass/fail, coin-flip flags, validation results, whether a
draft may be exported, which fields are editable — all of it comes from API
responses. **None of it is recalculated in the browser.** Violating this
recreates bugs the backend spent weeks closing.

Corollaries that shape the code:

- **Role-based UI is convenience, not security.** We hide controls a user's role
  can't use (e.g. draft editing without `rubric:edit`), but the server enforces
  every call regardless. A hidden button is UX; the endpoint's check is the gate.
- **Edit typed rows, never markdown.** The editor mutates the structured JSON the
  API returns. Edited markdown is never parsed back into data. (A read-only JSON
  view exists as a power-user affordance, not as the primary editor.)
- **No secrets in the browser.** The JWT is obtained by user login and held in
  memory + `sessionStorage`. No service tokens, no shared secrets.
- **No server layer.** Pure SPA (Vite, not Next.js) — there is deliberately no
  server tier where logic could accidentally accrete.

## Configuration

Only **two** URLs are configured. Copy `.env.example` to `.env`:

```
VITE_DISCOVERY_URL=http://localhost:3005
VITE_IDSERVER_URL=http://localhost:3001
```

**There is no agent URL, by design.** Agents are *discovered*: the GUI lists them
from Discovery, stores the selected agent's stable **GUID**, and resolves
GUID → current address at runtime. The address is a lease and is never persisted.
If a selected agent's lease expires and it drops out of Discovery, the GUI
surfaces that and prompts a re-pick rather than firing calls into a dead address.

## Running

```bash
npm install
cp .env.example .env
npm run dev        # http://localhost:5173
```

The three backend services must be running — from `~/projects`, use
`./stack.sh start` (or the "Stack: START all" task in the workspace).

| Script | Does |
|--------|------|
| `npm run dev` | Vite dev server on :5173 |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Serve the built bundle |
| `npm run typecheck` | `tsc --noEmit` |

## Flow (slice one)

**Login → Agent picker → Rubric list → Rubric editor → k-sampling steering**

1. **Login** — against the ID Server; returns a JWT sent as `Authorization:
   Bearer <token>` on every agent call. Any 401 = session expired → clear + login.
2. **Agent picker** — lists agents from Discovery with name, short git commit
   (which codebase), health, and last-seen age. Rubrics are **per-agent**, so the
   selected agent (name + commit) is pinned in the header at all times.
3. **Rubric list** — committed rubrics (live, git-backed, **read-only**) and your
   drafts (editable staging).
4. **Rubric editor** — structured form over criteria. Save validates server-side;
   issues render inline (errors red, warnings amber).
5. **Batch steering** — the variance instrument, below.

## Committed vs drafts, and why the GUI is not a deploy path

- **Committed** rubrics are the live, git-backed ones that govern real
  evaluations. The GUI can only **read** them.
- **Drafts** are mutable working copies. The agent's evaluation pipeline
  physically cannot load them, so a half-baked draft can never judge a real
  document.
- **Promotion happens through git**, not through this API: export the draft's
  clean JSON and commit it, with human review. The server refuses to export an
  invalid draft (and the Export button is disabled until validation passes — but
  the server's check is the real one).

## The k-sampling instrument (and why it looks like this)

A single LLM judge run has **~40% run-to-run variance**. One PASS/FAIL is not a
measurement — it's one draw from a distribution. So the editor steers by pass
**rates** over k runs (k clamped 1–30):

- Each criterion shows its pass rate as a bar, the raw `passCount/runCount`, and
  a 95% confidence interval — never a bare verdict.
- **Coin-flip criteria are flagged prominently.** A CI straddling 50% means the
  model genuinely can't decide: the wording is ambiguous. This is the single most
  useful signal the tool produces.
- **The score is shown as a distribution** — mean with min–max range and stddev.
  A lone "84.6%" would hide that it ranged 78–91% across runs.
- **Gate pass rate** is shown as "gate passed 6/10 runs", because approvability
  itself can be unstable.
- **Comparisons only claim a change is real when the server says `likelySignal`**
  (disjoint CIs). When `underpowered` is true, the UI says so plainly and tells
  the user to raise k.

The instrument exists to **prevent false confidence**. When a result is a
coin-flip or a comparison is underpowered, the UI must say so — never present an
uncertain result as certain.

## Layout

```
src/
  api/
    types.ts      TS mirrors of every server response shape
    client.ts     the only module that touches the network
  context/
    AuthContext   session; can() = which controls to SHOW (server still enforces)
    AgentContext  selected agent GUID -> resolved address; stale detection
  components/
    Layout, guards, CriteriaEditor, ValidationView,
    BatchPanel, BatchStatsView (pass-rate bars, CIs, coin-flips, distribution)
  pages/
    LoginPage, AgentPickerPage, RubricListPage,
    CommittedRubricPage (read-only), RubricEditorPage
```

## Not in this slice

Deferred deliberately (see the build spec): the review flow (draft queue,
disposition, human-edit provenance), Langfuse trace deep-links, live status
streaming (the picker polls on load/refresh), and starting/stopping agents.
