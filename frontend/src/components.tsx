import { Fragment, useEffect, useRef, useState } from "react";
import type { AttemptRecord, RunSnapshot, WorkflowNode } from "./api";
import { BrandLogo } from "./BrandLogo";

// ─── Types ────────────────────────────────────────────────────────────────────

type MainTab = "run" | "graph";
type ArtifactTab = "factor" | "code" | "metrics" | "critique" | "final";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMetric(value: number | string): string {
  if (typeof value === "string") return value;
  if (Math.abs(value) >= 1_000) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

function defaultArtifactTab(snapshot: RunSnapshot | null): ArtifactTab {
  if (!snapshot) return "factor";
  const p = snapshot.phase;
  if (p === "finalized") return "final";
  if (p === "awaiting_approval" || p === "evaluation_complete") return "critique";
  if (p === "execution_complete") return "metrics";
  if (p === "code_ready") return "code";
  if (p === "candidates_ready" || p === "plan_ready" || p === "dataset_validated") return "factor";
  return "factor";
}

function getKeyMetrics(attempt: AttemptRecord): Array<{ label: string; value: string }> {
  const m = attempt.execution_result.metrics;
  const result: Array<{ label: string; value: string }> = [];
  const tryAdd = (keys: string[], label: string) => {
    for (const k of keys) {
      if (k in m) { result.push({ label, value: formatMetric(m[k]) }); return; }
    }
  };
  tryAdd(["sharpe_ratio", "sharpe", "Sharpe Ratio"], "Sharpe");
  tryAdd(["annual_return", "annual_ret", "Annual Return"], "Annual Ret");
  tryAdd(["ic_mean", "ic", "IC Mean"], "IC Mean");
  tryAdd(["max_drawdown", "Max Drawdown"], "Max DD");
  if (result.length === 0) {
    Object.entries(m).slice(0, 3).forEach(([k, v]) => {
      result.push({ label: k.replace(/_/g, " "), value: formatMetric(v) });
    });
  }
  return result.slice(0, 4);
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CheckIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DotIcon() {
  return <div style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />;
}

// ─── Workflow steps (shared between nav bar and rail) ─────────────────────────

const RAIL_STEPS: Array<{ node: WorkflowNode; label: string; desc: string }> = [
  { node: "ingest_brief", label: "Brief", desc: "Captures the research prompt" },
  { node: "ingest_dataset", label: "Dataset", desc: "Loads the uploaded market data" },
  { node: "validate_dataset", label: "Validate", desc: "Checks schema and data quality" },
  { node: "parse_research_plan", label: "Plan", desc: "Parses signal intent and constraints" },
  { node: "generate_candidates", label: "Candidates", desc: "Seeds a bounded factor search space" },
  { node: "generate_code", label: "Coding", desc: "Materializes the strategy template" },
  { node: "execute_backtest", label: "Execution", desc: "Runs the backtest locally" },
  { node: "evaluate_results", label: "Critic", desc: "Classifies failures and factor quality" },
  { node: "human_in_the_loop", label: "Approval", desc: "Human review checkpoint" },
  { node: "finalize_run", label: "Finalize", desc: "Saves artifact bundle to disk" },
];

// ─── StatusHeader ─────────────────────────────────────────────────────────────

export function StatusHeader({
  snapshot,
  busy,
  activeTab,
  onTabChange,
}: {
  snapshot: RunSnapshot | null;
  busy: boolean;
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
}) {
  const status = snapshot?.status ?? (busy ? "running" : "idle");
  const pillClass =
    busy || status === "running"
      ? "status-pill status-running"
      : status === "completed"
        ? "status-pill status-completed"
        : snapshot?.approval_status === "pending"
          ? "status-pill status-approval"
          : "status-pill";

  const visited = new Set(snapshot?.workflow_trace ?? []);
  const activeNode = snapshot?.current_node;
  if (snapshot && snapshot.approval_status !== "not_requested") visited.add("human_in_the_loop");

  return (
    <header
      className="sticky top-0 z-50"
      style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
    >
      {/* ── Main nav row ──────────────────────────────────────────────── */}
      <div
        className="max-w-[1400px] mx-auto px-5"
        style={{ height: 52, display: "flex", alignItems: "center", gap: 20 }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 4, flexShrink: 0 }}>
          <BrandLogo size={26} radius={7} />
          <span style={{ fontWeight: 600, fontSize: "0.88rem", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
            AlphaGraph
          </span>
        </div>

        {/* Main tabs */}
        <div className="tab-bar" style={{ flexShrink: 0 }}>
          <button
            className={`tab-item${activeTab === "run" ? " active" : ""}`}
            onClick={() => onTabChange("run")}
          >
            Research Run
          </button>
          <button
            className={`tab-item${activeTab === "graph" ? " active" : ""}`}
            onClick={() => onTabChange("graph")}
          >
            Workflow Graph
          </button>
        </div>

        <div style={{ flex: 1 }} />

        {/* Run metadata */}
        {snapshot && (
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
            <span style={{ fontSize: "0.72rem", color: "var(--muted)", fontFamily: "monospace" }}>
              {snapshot.run_id.slice(0, 8)}
            </span>
            {snapshot.attempt > 0 && (
              <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                attempt {snapshot.attempt} / {snapshot.max_attempts}
              </span>
            )}
          </div>
        )}

        {/* Status pill */}
        <div className={pillClass} style={{ flexShrink: 0 }}>
          <div className="dot" />
          <span style={{ textTransform: "capitalize" }}>
            {snapshot?.approval_status === "pending" ? "awaiting approval" : status}
          </span>
        </div>
      </div>

      {/* ── Workflow progress bar ──────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid var(--border)", background: "var(--bg)" }}>
        <div
          className="max-w-[1400px] mx-auto px-5"
          style={{ height: 42, display: "flex", alignItems: "center" }}
        >
          {RAIL_STEPS.map((step, i) => {
            const isActive = activeNode === step.node;
            const isComplete = visited.has(step.node) && !isActive;
            const isLast = i === RAIL_STEPS.length - 1;

            return (
              <Fragment key={step.node}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                  <div
                    className={`rail-dot${isActive ? " active" : isComplete ? " complete" : ""}`}
                    style={{ width: 16, height: 16 }}
                  >
                    {isComplete && <CheckIcon size={8} />}
                    {isActive && (
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: "0.71rem",
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? "var(--accent)" : isComplete ? "var(--text)" : "var(--subtle)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {step.label}
                  </span>
                </div>
                {!isLast && (
                  <div
                    style={{
                      flex: 1,
                      height: 1,
                      minWidth: 8,
                      background: isComplete ? "rgba(74,222,128,0.3)" : "var(--border)",
                      margin: "0 8px",
                    }}
                  />
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
    </header>
  );
}

// ─── RunTerminal ──────────────────────────────────────────────────────────────

type TerminalLine = { prefix: string; text: string; color: string };

const NODE_LABEL: Record<string, string> = {
  ingest_brief: "ingest brief",
  ingest_dataset: "ingest dataset",
  validate_dataset: "validate dataset",
  parse_research_plan: "parse research plan",
  generate_candidates: "generate candidates",
  route_next_candidate: "route candidates",
  generate_code: "generate code",
  execute_backtest: "execute backtest",
  evaluate_results: "evaluate results",
  code_fix: "code fix",
  revise_factor: "revise factor",
  human_in_the_loop: "awaiting approval",
  finalize_run: "finalize run",
};

function buildTerminalLines(
  snapshot: RunSnapshot | null,
  busy: boolean,
  error: string | null,
): TerminalLine[] {
  const lines: TerminalLine[] = [];
  if (!snapshot && !busy && !error) return lines;

  lines.push({ prefix: "$", text: "alphagraph run started", color: "var(--subtle)" });
  if (!snapshot) return lines;

  const trace = snapshot.workflow_trace as unknown as string[];
  let attemptIdx = 0;

  for (const node of trace) {
    const label = NODE_LABEL[node] ?? node.replace(/_/g, " ");

    if (node === "validate_dataset") {
      const s = snapshot.dataset_summary;
      const suffix = s
        ? `  · ${s.ticker_count} tickers · ${s.row_count.toLocaleString()} rows · ${s.start_date} → ${s.end_date}`
        : "";
      const valid = !snapshot.workflow_trace.includes("finalize_run" as WorkflowNode) || trace.indexOf("parse_research_plan") > -1;
      lines.push({ prefix: valid ? "✓" : "✗", text: label + suffix, color: valid ? "var(--text)" : "var(--danger)" });

    } else if (node === "parse_research_plan") {
      const brief = (snapshot as unknown as Record<string, unknown>);
      const parsed = brief.parsed_brief as Record<string, unknown> | null;
      const intent = parsed?.signal_intent as string | undefined;
      lines.push({ prefix: "✓", text: label + (intent ? `  · intent: ${intent.replace(/_/g, " ")}` : ""), color: "var(--text)" });

    } else if (node === "generate_candidates") {
      lines.push({ prefix: "✓", text: `${label}  · 4 candidates seeded`, color: "var(--text)" });

    } else if (node === "route_next_candidate" || node === "route_candidates") {
      // silent routing node — skip visual noise

    } else if (node === "generate_code") {
      const attempt = snapshot.attempts[attemptIdx];
      const name = attempt?.factor_spec?.name ?? "";
      lines.push({ prefix: "→", text: `${label}${name ? `  · ${name}` : ""}`, color: "var(--accent)" });

    } else if (node === "execute_backtest") {
      const attempt = snapshot.attempts[attemptIdx];
      if (attempt) {
        const ok = attempt.execution_result.success;
        const stdout = attempt.execution_result.stdout?.trim();
        if (stdout) {
          for (const l of stdout.split("\n").filter(Boolean)) {
            lines.push({ prefix: " ", text: l, color: "var(--subtle)" });
          }
        }
        if (!ok) {
          const raw = (attempt.execution_result.stderr || (attempt.execution_result as unknown as Record<string, string>).traceback || "").trim();
          const errLines = raw.split("\n").filter(Boolean).slice(-4);
          for (const l of errLines) {
            lines.push({ prefix: " ", text: l, color: "var(--danger)" });
          }
        }
        lines.push({ prefix: ok ? "✓" : "✗", text: label, color: ok ? "var(--text)" : "var(--danger)" });
      }

    } else if (node === "evaluate_results") {
      const attempt = snapshot.attempts[attemptIdx];
      if (attempt) {
        const m = attempt.execution_result.metrics;
        const sharpe = m["sharpe_ratio"] ?? m["sharpe"] ?? null;
        const quality = attempt.evaluation.factor_quality ?? "";
        const suffix = sharpe !== null
          ? `  · sharpe ${typeof sharpe === "number" ? sharpe.toFixed(2) : sharpe} · ${quality.replace(/_/g, " ")}`
          : quality ? `  · ${quality.replace(/_/g, " ")}` : "";
        lines.push({
          prefix: attempt.evaluation.needs_revision ? "~" : "✓",
          text: label + suffix,
          color: attempt.evaluation.needs_revision ? "var(--warning)" : "var(--success)",
        });
        attemptIdx++;
      }

    } else if (node === "code_fix") {
      lines.push({ prefix: "↻", text: `${label}  · retrying code generation`, color: "var(--warning)" });

    } else if (node === "revise_factor") {
      lines.push({ prefix: "↻", text: `${label}  · adjusting expression`, color: "var(--warning)" });

    } else if (node === "finalize_run") {
      const approved = snapshot.approval_status === "approved";
      const rejected = snapshot.approval_status === "rejected";
      const ts = (snapshot as unknown as Record<string, unknown>).terminal_state as string | null;
      const suffix = ts ? `  · ${ts.replace(/_/g, " ")}` : "";
      lines.push({
        prefix: approved ? "✓" : rejected ? "✗" : snapshot.status === "completed" ? "✓" : "✗",
        text: label + suffix,
        color: approved || snapshot.status === "completed" ? "var(--success)" : "var(--danger)",
      });
    } else {
      lines.push({ prefix: "→", text: label, color: "var(--text)" });
    }
  }

  if (error) {
    lines.push({ prefix: "!", text: `error: ${error}`, color: "var(--danger)" });
  }

  if (snapshot.approval_status === "pending") {
    lines.push({ prefix: "$", text: "approve or reject to continue", color: "var(--warning)" });
  } else if (snapshot.status === "completed") {
    lines.push({ prefix: "$", text: "run complete", color: "var(--success)" });
  } else if (snapshot.status === "failed") {
    lines.push({ prefix: "$", text: "run failed — no reviewable candidates survived", color: "var(--danger)" });
  }

  return lines;
}

export function RunTerminal({
  snapshot,
  busy,
  error,
}: {
  snapshot: RunSnapshot | null;
  busy: boolean;
  error: string | null;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lines = buildTerminalLines(snapshot, busy, error);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length, busy]);

  const isEmpty = lines.length === 0 && !busy;

  return (
    <div
      style={{
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
        fontSize: "0.72rem",
        lineHeight: 1.7,
        background: "#080c12",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "12px 14px",
        overflowY: "auto",
        minHeight: 72,
        maxHeight: 300,
      }}
    >
      {isEmpty ? (
        <span style={{ color: "var(--subtle)" }}>$ waiting for run…</span>
      ) : (
        lines.map((line, i) => (
          <div key={i} style={{ display: "flex", gap: 10 }}>
            <span style={{ color: "var(--subtle)", flexShrink: 0, userSelect: "none" }}>{line.prefix}</span>
            <span style={{ color: line.color, wordBreak: "break-all" }}>{line.text}</span>
          </div>
        ))
      )}
      {busy && (
        <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
          <span style={{ color: "var(--subtle)", userSelect: "none" }}>→</span>
          <span style={{ color: "var(--accent)" }}>
            running
            <span style={{ animation: "pulse-dot 1.2s ease-in-out infinite", display: "inline-block" }}>…</span>
          </span>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// ─── WorkflowRail ─────────────────────────────────────────────────────────────

export function WorkflowRail({ snapshot }: { snapshot: RunSnapshot | null }) {
  const visited = new Set(snapshot?.workflow_trace ?? []);
  const active = snapshot?.current_node;
  if (snapshot && snapshot.approval_status !== "not_requested") visited.add("human_in_the_loop");

  return (
    <div className="panel" style={{ padding: "16px 14px" }}>
      <p className="eyebrow">Workflow</p>
      <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: 14 }}>
        Sequential · {RAIL_STEPS.length} nodes
      </p>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {RAIL_STEPS.map((step, i) => {
          const isActive = active === step.node;
          const isComplete = visited.has(step.node) && !isActive;
          const isLast = i === RAIL_STEPS.length - 1;

          return (
            <div key={step.node}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                {/* Dot */}
                <div
                  className={`rail-dot${isActive ? " active" : isComplete ? " complete" : ""}`}
                  style={{ marginTop: 1 }}
                >
                  {isComplete && <CheckIcon />}
                  {isActive && <DotIcon />}
                </div>

                {/* Content */}
                <div style={{ flex: 1, paddingBottom: isLast ? 0 : 4 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <span
                      style={{
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        color: isActive
                          ? "var(--accent)"
                          : isComplete
                            ? "var(--text)"
                            : "var(--subtle)",
                        lineHeight: 1.3,
                      }}
                    >
                      {step.label}
                    </span>
                    {isActive && <span className="badge-accent">Active</span>}
                    {isComplete && <span className="badge-success">Done</span>}
                  </div>
                  <p
                    style={{
                      fontSize: "0.72rem",
                      color: "var(--subtle)",
                      margin: "2px 0 0",
                      lineHeight: 1.4,
                    }}
                  >
                    {step.desc}
                  </p>
                </div>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ width: 22, display: "flex", justifyContent: "center" }}>
                    <div
                      style={{
                        width: 1.5,
                        height: 20,
                        background: isComplete ? "var(--success)" : "var(--border)",
                        opacity: isComplete ? 0.4 : 1,
                        margin: "2px 0",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── AttemptComparisonCard ────────────────────────────────────────────────────

export function AttemptComparisonCard({ snapshot }: { snapshot: RunSnapshot }) {
  if (snapshot.attempts.length < 2) return null;
  const attempts = snapshot.attempts.slice(0, 2);

  return (
    <div className="panel" style={{ padding: 16 }}>
      <p className="eyebrow">Revision Comparison</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
        {attempts.map((attempt) => {
          const metrics = getKeyMetrics(attempt);
          return (
            <div key={attempt.attempt_number} className="panel-raised" style={{ padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span className="section-label">Attempt {attempt.attempt_number}</span>
                <span className={attempt.evaluation.needs_revision ? "badge-warning" : "badge-success"}>
                  {attempt.evaluation.needs_revision ? "Revised" : "Pass"}
                </span>
              </div>
              <p
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--text)",
                  marginBottom: 8,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {attempt.factor_spec.name}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {metrics.map(({ label, value }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{label}</span>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontFamily: "monospace",
                        fontWeight: 500,
                        color: "var(--text)",
                      }}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
              {attempt.critique?.summary && (
                <p
                  style={{
                    fontSize: "0.7rem",
                    color: "var(--muted)",
                    marginTop: 8,
                    lineHeight: 1.4,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {attempt.critique.summary}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ArtifactPane ─────────────────────────────────────────────────────────────

const ATTEMPT_TAB_SEQUENCE: ArtifactTab[] = ["factor", "code", "metrics", "critique"];
const TAB_STEP_MS = 900; // time between auto-advances

export function ArtifactPane({ snapshot, busy }: { snapshot: RunSnapshot | null; busy: boolean }) {
  const [activeTab, setActiveTab] = useState<ArtifactTab>("factor");
  const [selectedAttemptIdx, setSelectedAttemptIdx] = useState(0);
  const prevAttemptCount = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const attempts = snapshot?.attempts ?? [];
  const isFinalized = snapshot?.phase === "finalized";
  const selectedAttempt = attempts[selectedAttemptIdx] ?? null;
  const hasAttempt = !!selectedAttempt;

  // When new attempt data arrives, animate through that attempt's tabs sequentially.
  useEffect(() => {
    const count = attempts.length;
    if (count === 0 || count === prevAttemptCount.current) return;

    // Clear any in-flight timers from a previous animation
    timers.current.forEach(clearTimeout);
    timers.current = [];

    const latestIdx = count - 1;
    setSelectedAttemptIdx(latestIdx);

    ATTEMPT_TAB_SEQUENCE.forEach((tab, i) => {
      const t = setTimeout(() => setActiveTab(tab), i * TAB_STEP_MS);
      timers.current.push(t);
    });

    prevAttemptCount.current = count;
    return () => timers.current.forEach(clearTimeout);
  }, [attempts.length]);

  // After animation completes (or on phase change), settle on the right tab.
  useEffect(() => {
    if (busy) return; // don't snap while running — let the animation play
    const settled = setTimeout(
      () => setActiveTab(defaultArtifactTab(snapshot)),
      attempts.length > prevAttemptCount.current ? ATTEMPT_TAB_SEQUENCE.length * TAB_STEP_MS + 100 : 0,
    );
    return () => clearTimeout(settled);
  }, [snapshot?.phase, busy]);

  const tabs: Array<{ id: ArtifactTab; label: string; available: boolean }> = [
    { id: "factor", label: "Factor", available: hasAttempt },
    { id: "code", label: "Code", available: hasAttempt },
    { id: "metrics", label: "Metrics", available: hasAttempt },
    { id: "critique", label: "Critique", available: hasAttempt },
    { id: "final", label: "Final", available: isFinalized },
  ];

  return (
    <div className="panel animate-fade-up" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: "1px solid var(--border)",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <p className="eyebrow" style={{ margin: 0 }}>Artifact</p>
        <div className="tab-bar">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`tab-item${activeTab === t.id ? " active" : ""}`}
              onClick={() => { if (t.available) { timers.current.forEach(clearTimeout); setActiveTab(t.id); } }}
              disabled={!t.available}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>


      {/* Content */}
      <div style={{ flex: 1, padding: 16, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {!snapshot ? (
          <EmptyArtifactState />
        ) : !selectedAttempt && activeTab !== "final" ? (
          <EmptyArtifactState />
        ) : activeTab === "factor" && attempts.length > 0 ? (
          <FactorTab
            attempts={attempts}
            selectedIdx={selectedAttemptIdx}
            onSelect={(idx) => { timers.current.forEach(clearTimeout); setSelectedAttemptIdx(idx); }}
          />
        ) : activeTab === "code" && selectedAttempt ? (
          <CodeTab attempt={selectedAttempt} />
        ) : activeTab === "metrics" && selectedAttempt ? (
          <MetricsTab attempt={selectedAttempt} />
        ) : activeTab === "critique" && selectedAttempt ? (
          <CritiqueTab attempt={selectedAttempt} />
        ) : activeTab === "final" && isFinalized ? (
          <FinalTab snapshot={snapshot} />
        ) : (
          <EmptyArtifactState />
        )}
      </div>
    </div>
  );
}

function EmptyArtifactState() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        color: "var(--subtle)",
      }}
    >
      <div
        style={{
          padding: 4,
          borderRadius: 12,
          background: "var(--raised)",
          border: "1px solid var(--border)",
        }}
      >
        <BrandLogo size={40} radius={10} />
      </div>
      <p style={{ fontSize: "0.82rem", color: "var(--subtle)", margin: 0 }}>
        Start a run to see artifacts
      </p>
    </div>
  );
}

function qualityColor(q: string): string {
  if (q === "passed") return "var(--success)";
  if (q === "promising") return "var(--accent)";
  if (q === "suspicious") return "var(--warning)";
  return "var(--subtle)";
}

function FactorTab({
  attempts,
  selectedIdx,
  onSelect,
}: {
  attempts: AttemptRecord[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
}) {
  const attempt = attempts[selectedIdx];
  if (!attempt) return null;

  return (
    <div style={{ display: "flex", gap: 0, flex: 1, minHeight: 0, height: "100%" }} className="animate-fade-up">
      {/* Left vertical nav — only shown when there are multiple attempts */}
      {attempts.length > 1 && (
        <div
          style={{
            width: 180,
            flexShrink: 0,
            borderRight: "1px solid var(--border)",
            overflowY: "auto",
            paddingRight: 0,
            marginRight: 16,
          }}
        >
          {attempts.map((a, idx) => {
            const q = a.evaluation.factor_quality ?? "";
            const isSelected = idx === selectedIdx;
            return (
              <button
                key={idx}
                onClick={() => onSelect(idx)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "7px 10px 7px 0",
                  background: "transparent",
                  border: "none",
                  borderRight: `2px solid ${isSelected ? qualityColor(q) : "transparent"}`,
                  color: isSelected ? "var(--text)" : "var(--muted)",
                  fontSize: "0.7rem",
                  fontWeight: isSelected ? 600 : 400,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                  lineHeight: 1.35,
                }}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: qualityColor(q),
                    flexShrink: 0,
                  }}
                />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {idx + 1} · {a.factor_spec.name}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Right content */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <h2
              style={{
                margin: 0,
                fontSize: "1.15rem",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "var(--text)",
              }}
            >
              {attempt.factor_spec.name}
            </h2>
            <span className={attempt.evaluation.needs_revision ? "badge-warning" : "badge-success"}>
              {attempt.evaluation.needs_revision ? "Needs Revision" : "Pass"}
            </span>
          </div>
          <p style={{ fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.55, margin: 0 }}>
            {attempt.factor_spec.thesis}
          </p>
        </div>

        <div>
          <p className="section-label" style={{ marginBottom: 6 }}>Expression</p>
          <div className="expr-block">{attempt.factor_spec.expression}</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            { label: "Universe", value: attempt.factor_spec.universe },
            { label: "Rebalance", value: attempt.factor_spec.rebalance },
            { label: "Direction", value: attempt.factor_spec.direction },
          ].map(({ label, value }) => (
            <div key={label} className="panel-elevated" style={{ padding: "10px 12px" }}>
              <p className="section-label" style={{ marginBottom: 4 }}>{label}</p>
              <p style={{ fontSize: "0.82rem", color: "var(--text)", margin: 0, fontWeight: 500 }}>{value}</p>
            </div>
          ))}
        </div>

        {attempt.evaluation.reasons.length > 0 && (
          <div>
            <p className="section-label" style={{ marginBottom: 8 }}>Evaluation Notes</p>
            <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 4 }}>
              {attempt.evaluation.reasons.map((r, i) => (
                <li key={i} style={{ fontSize: "0.8rem", color: "var(--muted)", lineHeight: 1.45 }}>
                  {r.replace(/_/g, " ")}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function CodeTab({ attempt }: { attempt: AttemptRecord }) {
  if (!attempt.generated_code) {
    return (
      <div className="panel-raised" style={{ padding: "12px 14px" }}>
        <p style={{ fontSize: "0.84rem", color: "var(--muted)", margin: 0 }}>
          No generated code was saved for this attempt.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }} className="animate-fade-up">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            fontFamily: "monospace",
            fontSize: "0.78rem",
            background: "var(--elevated)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "3px 8px",
            color: "var(--muted)",
          }}
        >
          {attempt.generated_code.filename}
        </span>
      </div>
      {attempt.generated_code.commentary && (
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.55, margin: 0 }}>
          {attempt.generated_code.commentary}
        </p>
      )}
      <div className="code-block" style={{ maxHeight: 480 }}>
        {attempt.generated_code.script}
      </div>
    </div>
  );
}

function MetricsTab({ attempt }: { attempt: AttemptRecord }) {
  const metrics = Object.entries(attempt.execution_result.metrics);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="animate-fade-up">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {metrics.map(([key, value]) => (
          <div key={key} className="metric-chip">
            <p className="section-label" style={{ marginBottom: 4 }}>
              {key.replaceAll("_", " ")}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: "1.05rem",
                fontWeight: 600,
                fontFamily: "monospace",
                color: "var(--text)",
              }}
            >
              {formatMetric(value)}
            </p>
          </div>
        ))}
      </div>

      <div
        className="panel-raised"
        style={{ padding: "12px 14px", borderLeft: "3px solid var(--accent)" }}
      >
        <p className="section-label" style={{ marginBottom: 4 }}>
          Evaluation Summary
        </p>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.55, margin: 0 }}>
          {attempt.evaluation.summary}
        </p>
      </div>

      {Object.keys(attempt.evaluation.scorecard).length > 0 && (
        <div>
          <p className="section-label" style={{ marginBottom: 8 }}>
            Scorecard
          </p>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {Object.entries(attempt.evaluation.scorecard).map(([k, v]) => (
              <div key={k} className="kv-row">
                <span className="kv-label">{k.replaceAll("_", " ")}</span>
                <span className="kv-value" style={{ fontFamily: "monospace" }}>
                  {formatMetric(v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CritiqueTab({ attempt }: { attempt: AttemptRecord }) {
  if (!attempt.critique) {
    return (
      <div className="panel-raised" style={{ padding: "12px 14px" }}>
        <p style={{ fontSize: "0.84rem", color: "var(--muted)", margin: 0 }}>
          No critique was generated for this attempt.
        </p>
      </div>
    );
  }

  const critique = attempt.critique;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }} className="animate-fade-up">
      {/* Summary — prominent */}
      <div
        style={{
          background: attempt.evaluation.needs_revision ? "var(--warning-dim)" : "var(--success-dim)",
          border: `1px solid ${attempt.evaluation.needs_revision ? "rgba(210,153,34,0.2)" : "rgba(63,185,80,0.2)"}`,
          borderRadius: 10,
          padding: "14px 16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span className={attempt.evaluation.needs_revision ? "badge-warning" : "badge-success"}>
            {attempt.evaluation.needs_revision ? "Revision Required" : "Approved"}
          </span>
        </div>
        <p
          style={{
            fontSize: "0.9rem",
            color: "var(--text)",
            lineHeight: 1.55,
            margin: 0,
            fontWeight: 500,
          }}
        >
          {critique.summary}
        </p>
      </div>

      {/* Root cause */}
      <div className="panel-raised" style={{ padding: "12px 14px" }}>
        <p className="section-label" style={{ marginBottom: 6 }}>
          Issue Detected
        </p>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.55, margin: 0 }}>
          {critique.root_cause}
        </p>
      </div>

      {/* Revision instructions */}
      {critique.revision_instructions && (
        <div
          className="panel-raised"
          style={{ padding: "12px 14px", borderLeft: "3px solid var(--accent)" }}
        >
          <p className="section-label" style={{ marginBottom: 6 }}>
            Revision Guidance
          </p>
          <p style={{ fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.55, margin: 0 }}>
            {critique.revision_instructions}
          </p>
        </div>
      )}
    </div>
  );
}

function XIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function FinalTab({ snapshot }: { snapshot: RunSnapshot }) {
  const lastAttempt = snapshot.attempts[snapshot.attempts.length - 1];
  const metrics = lastAttempt ? Object.entries(lastAttempt.execution_result.metrics).slice(0, 6) : [];

  const failed = snapshot.status === "failed";
  const rejected = snapshot.approval_status === "rejected";
  const terminalState = (snapshot as unknown as Record<string, string | null>).terminal_state ?? null;

  const bannerBg = failed ? "var(--danger-dim)" : rejected ? "var(--warning-dim)" : "var(--success-dim)";
  const bannerBorder = failed
    ? "1px solid rgba(248,113,113,0.2)"
    : rejected
    ? "1px solid rgba(210,153,34,0.2)"
    : "1px solid rgba(63,185,80,0.2)";
  const bannerColor = failed ? "var(--danger)" : rejected ? "var(--warning)" : "var(--success)";
  const iconBg = failed
    ? "rgba(248,113,113,0.12)"
    : rejected
    ? "rgba(210,153,34,0.12)"
    : "rgba(63,185,80,0.15)";

  const title = failed ? "Run Failed" : rejected ? "Result Rejected" : "Run Finalized";
  const subtitle = failed
    ? terminalState === "failed_data_validation"
      ? "Dataset validation failed — ensure your CSV has date, ticker, and close columns with ≥2 tickers"
      : "No factor candidates met the quality bar"
    : rejected
    ? "Factor rejected — results archived"
    : "Factor approved and artifact bundle saved";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="animate-fade-up">
      {/* Status banner */}
      <div style={{ background: bannerBg, border: bannerBorder, borderRadius: 10, padding: "16px", display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 36, height: 36, borderRadius: "50%",
            background: iconBg, border: `1.5px solid ${bannerColor}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: bannerColor, flexShrink: 0,
          }}
        >
          {failed ? <XIcon size={16} /> : rejected ? <XIcon size={16} /> : <CheckIcon size={16} />}
        </div>
        <div>
          <p style={{ margin: "0 0 2px", fontSize: "0.9rem", fontWeight: 600, color: bannerColor }}>
            {title}
          </p>
          <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--muted)", lineHeight: 1.45 }}>
            {subtitle}
          </p>
        </div>
      </div>

      {/* Final recommendation */}
      {snapshot.final_recommendation && (
        <div className="panel-raised" style={{ padding: "12px 14px" }}>
          <p className="section-label" style={{ marginBottom: 4 }}>Recommendation</p>
          <p style={{ fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.55, margin: 0 }}>
            {snapshot.final_recommendation}
          </p>
        </div>
      )}

      {/* Factor + metrics only for successful runs */}
      {!failed && lastAttempt && (
        <>
          <div>
            <p className="section-label" style={{ marginBottom: 6 }}>
              {rejected ? "Reviewed Factor" : "Approved Factor"}
            </p>
            <p style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>
              {lastAttempt.factor_spec.name}
            </p>
            <div className="expr-block">{lastAttempt.factor_spec.expression}</div>
          </div>

          {metrics.length > 0 && (
            <div>
              <p className="section-label" style={{ marginBottom: 8 }}>Final Metrics</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {metrics.map(([key, value]) => (
                  <div key={key} className="metric-chip">
                    <p className="section-label" style={{ marginBottom: 3 }}>{key.replaceAll("_", " ")}</p>
                    <p style={{ margin: 0, fontSize: "1rem", fontWeight: 600, fontFamily: "monospace", color: "var(--text)" }}>
                      {formatMetric(value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {snapshot.final_report_path && (
        <div className="panel-raised" style={{ padding: "12px 14px" }}>
          <p className="section-label" style={{ marginBottom: 6 }}>Artifact Path</p>
          <code style={{ fontSize: "0.78rem", fontFamily: "monospace", color: "var(--accent)", wordBreak: "break-all" }}>
            {snapshot.final_report_path}
          </code>
        </div>
      )}
    </div>
  );
}

// ─── WorkflowGraphView ────────────────────────────────────────────────────────
export { WorkflowGraphView } from "./GraphScene";
