// src/api/client.ts
//
// The one place that talks to the network. A thin, typed wrapper over `fetch`.
//
// Design rules that keep this honest:
//   - It NEVER decides anything the server decides. It shuttles JSON.
//   - The JWT lives in memory, mirrored to sessionStorage so a refresh doesn't
//     drop the session. No service tokens, no secrets, ever.
//   - Any 401 from an Agent call means the session is dead: it clears state and
//     notifies the app to route to login. A hidden button is UX; this is not
//     the gate — the server is.
//   - Non-2xx responses throw an ApiError carrying the SERVER's message, so the
//     UI can surface it verbatim instead of inventing one.

import type {
  Agent,
  BatchStats,
  CommittedRubricSummary,
  DraftDetail,
  DraftSummary,
  ListAgentsResponse,
  ListBatchesResponse,
  ListDraftsResponse,
  ListRubricsResponse,
  LoginResponse,
  ResolveAgentResponse,
  Role,
  Rubric,
  RubricUpdateResult,
  RunBatchResponse,
  SaveDraftResponse,
  Session,
  TokenClaims,
  ValidateDraftResponse,
} from "./types";

// ---------------------------------------------------------------------------
// Config — the two fixed services. Agents are DISCOVERED, never configured.
// ---------------------------------------------------------------------------

const DISCOVERY_URL = import.meta.env.VITE_DISCOVERY_URL ?? "http://localhost:3005";
const IDSERVER_URL = import.meta.env.VITE_IDSERVER_URL ?? "http://localhost:3001";

const SESSION_KEY = "qms.session";

// ---------------------------------------------------------------------------
// Typed errors — always carry the server's own message when there is one.
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** Thrown when the selected agent's address can't be reached / resolved. */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

// ---------------------------------------------------------------------------
// Session state — in memory, mirrored to sessionStorage.
// ---------------------------------------------------------------------------

let session: Session | null = loadSession();
let onUnauthorized: (() => void) | null = null;

/** The app registers a handler so a 401 can bounce the user to login. */
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    // Drop an already-expired token rather than sending a dead one.
    if (parsed.exp * 1000 <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persist(s: Session | null): void {
  session = s;
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // sessionStorage may be unavailable (private mode); memory is enough.
  }
}

export function getSession(): Session | null {
  return session;
}

export function getToken(): string | null {
  return session?.token ?? null;
}

/** Decode a JWT payload WITHOUT verifying it. The token is not a secret to its
 *  holder, but the claims are only ever used for UI convenience — the Agent
 *  re-verifies the signature on every call. Returns null if unparseable. */
export function decodeToken(token: string): TokenClaims | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json) as Partial<TokenClaims>;
    if (typeof claims.sub !== "string" || typeof claims.role !== "string") return null;
    return { sub: claims.sub, role: claims.role as Role, exp: claims.exp ?? 0 };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function login(userId: string, password: string): Promise<Session> {
  const res = await fetchJson<LoginResponse>(`${IDSERVER_URL}/v1/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, password }),
  });
  // Prefer the token's own exp; fall back to expiresIn if the claim is absent.
  const claims = decodeToken(res.token);
  const exp = claims?.exp ?? Math.floor(Date.now() / 1000) + res.expiresIn;
  const s: Session = { token: res.token, userId: res.userId, role: res.role, exp };
  persist(s);
  return s;
}

export function logout(): void {
  persist(null);
}

// ---------------------------------------------------------------------------
// Discovery — list and resolve agents. No auth required (a phone book).
// ---------------------------------------------------------------------------

export async function listAgents(): Promise<Agent[]> {
  const res = await fetchJson<ListAgentsResponse>(`${DISCOVERY_URL}/v1/agents`, {
    method: "GET",
  });
  return res.agents;
}

/** Resolve a stored GUID to its current card (incl. live address). Returns null
 *  on 404 — the agent's lease expired and it fell out of the registry. */
export async function resolveAgent(guid: string): Promise<Agent | null> {
  try {
    const res = await fetchJson<ResolveAgentResponse>(
      `${DISCOVERY_URL}/v1/agents/${encodeURIComponent(guid)}`,
      { method: "GET" },
    );
    return res.agent;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Agent calls — Bearer token, 401 => session expired.
// ---------------------------------------------------------------------------

export async function agentFetch<T>(
  agentAddress: string,
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(opts.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (opts.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`${agentAddress}${path}`, { ...opts, headers });
  } catch {
    throw new NetworkError(
      `Could not reach agent at ${agentAddress}. It may have gone offline.`,
    );
  }

  if (res.status === 401) {
    // Session is dead. Clear it and let the app route to login. We still throw
    // so the caller stops — but the handler is what drives the redirect.
    persist(null);
    onUnauthorized?.();
    throw new ApiError(401, await extractError(res, "Session expired. Please log in again."));
  }

  return parse<T>(res);
}

// ---------------------------------------------------------------------------
// Rubric endpoints (§6) — each takes the selected agent's address.
// ---------------------------------------------------------------------------

export function listRubrics(addr: string): Promise<CommittedRubricSummary[]> {
  return agentFetch<ListRubricsResponse>(addr, "/api/v1/rubrics").then((r) => r.rubrics);
}

/** Pull the released rubric set from git into this agent. The server decides
 *  what moved and whether it's allowed; we display the result. Throws
 *  ApiError(409) on uncommitted local rubric edits, (400) on a missing release
 *  ref, (422) when the released set doesn't validate against this agent. */
export function updateRubrics(addr: string): Promise<RubricUpdateResult> {
  return agentFetch<RubricUpdateResult>(addr, "/api/v1/rubrics/update", { method: "POST" });
}

export function getRubric(
  addr: string,
  type: string,
): Promise<{ documentType: string; hash: string; rubric: Rubric }> {
  return agentFetch(addr, `/api/v1/rubrics/${encodeURIComponent(type)}`);
}

export function listDrafts(addr: string): Promise<DraftSummary[]> {
  return agentFetch<ListDraftsResponse>(addr, "/api/v1/rubric-drafts").then((r) => r.drafts);
}

export function getDraft(addr: string, id: string): Promise<DraftDetail> {
  return agentFetch<DraftDetail>(addr, `/api/v1/rubric-drafts/${encodeURIComponent(id)}`);
}

/** Create (no id) or update (id present) a draft. Always validates server-side
 *  and returns the validation result. */
export function saveDraft(
  addr: string,
  body: { id?: string; documentType: string; content: Rubric },
): Promise<SaveDraftResponse> {
  return agentFetch<SaveDraftResponse>(addr, "/api/v1/rubric-drafts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function validateDraft(addr: string, id: string): Promise<ValidateDraftResponse> {
  return agentFetch<ValidateDraftResponse>(
    addr,
    `/api/v1/rubric-drafts/${encodeURIComponent(id)}/validate`,
    { method: "POST" },
  );
}

/** Fetch the export blob (clean JSON) for a VALID draft. Throws ApiError(422)
 *  with the validation result in `body` if the draft is invalid. */
export async function exportDraft(
  addr: string,
  id: string,
): Promise<{ filename: string; json: string }> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(
      `${addr}/api/v1/rubric-drafts/${encodeURIComponent(id)}/export`,
      { method: "GET", headers },
    );
  } catch {
    throw new NetworkError(`Could not reach agent at ${addr}.`);
  }

  if (res.status === 401) {
    persist(null);
    onUnauthorized?.();
    throw new ApiError(401, "Session expired. Please log in again.");
  }
  if (!res.ok) {
    const body = await res.clone().json().catch(() => undefined);
    throw new ApiError(res.status, await extractError(res, "Export failed."), body);
  }

  const disp = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^"]+)"?/.exec(disp);
  const filename = match?.[1] ?? `${id}.json`;
  const json = await res.text();
  return { filename, json };
}

export function runBatch(
  addr: string,
  id: string,
  body: { documentText: string; documentRef: string; k?: number },
): Promise<RunBatchResponse> {
  return agentFetch<RunBatchResponse>(
    addr,
    `/api/v1/rubric-drafts/${encodeURIComponent(id)}/score-batch`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function listBatches(addr: string, id: string): Promise<ListBatchesResponse> {
  return agentFetch<ListBatchesResponse>(
    addr,
    `/api/v1/rubric-drafts/${encodeURIComponent(id)}/batches`,
  );
}

// Re-export so callers can reference the type without a second import.
export type { BatchStats };

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string, opts: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new NetworkError(`Could not reach ${url}.`);
  }
  return parse<T>(res);
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.clone().json().catch(() => undefined);
    throw new ApiError(res.status, await extractError(res, `Request failed (${res.status}).`), body);
  }
  // 204 / empty body.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Pull the server's `error` message out of a response, falling back to a
 *  generic one. We never swallow a server message — honesty rule §10. */
async function extractError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return body.error ?? body.message ?? fallback;
  } catch {
    return fallback;
  }
}
