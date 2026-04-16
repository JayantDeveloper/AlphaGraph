import { Fragment, useEffect, useState } from "react";
import type { AttemptRecord, RunSnapshot, WorkflowNode } from "./api";

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
  if (p === "awaiting_approval" || p === "critic_complete") return "critique";
  if (p === "execution_complete") return "metrics";
  if (p === "code_ready") return "code";
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
  { node: "supervisor", label: "Supervisor", desc: "Orchestrates the research pipeline" },
  { node: "hypothesis_agent", label: "Hypothesis", desc: "Generates factor specification" },
  { node: "coding_agent", label: "Coding", desc: "Writes backtest script" },
  { node: "execution_tool", label: "Execution", desc: "Runs backtest on equities data" },
  { node: "factor_critic", label: "Critic", desc: "Evaluates and critiques results" },
  { node: "human_in_the_loop", label: "Approval", desc: "Human review checkpoint" },
  { node: "finalize_run", label: "Finalize", desc: "Saves artifact bundle to disk" },
];

// ─── StatusHeader ─────────────────────────────────────────────────────────────

export function StatusHeader({
  snapshot,
  busy,
  activeTab,
  onTabChange,
  onRun,
  hasDataset,
}: {
  snapshot: RunSnapshot | null;
  busy: boolean;
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  onRun: () => void;
  hasDataset: boolean;
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
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.8rem",
              fontWeight: 700,
              color: "#0d1117",
              flexShrink: 0,
            }}
          >
            αG
          </div>
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

        {/* Run button */}
        <button
          onClick={onRun}
          disabled={busy}
          style={{
            flexShrink: 0,
            padding: "6px 18px",
            background: busy ? "var(--raised)" : "var(--success)",
            color: busy ? "var(--muted)" : "#0b1520",
            border: busy ? "1px solid var(--border)" : "1px solid transparent",
            borderRadius: 8,
            fontSize: "0.8rem",
            fontWeight: 700,
            cursor: busy ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            transition: "filter 150ms ease, transform 150ms ease",
            boxShadow: busy ? "none" : "0 0 10px rgba(74,222,128,0.25)",
          }}
          onMouseEnter={(e) => {
            if (!busy) {
              e.currentTarget.style.filter = "brightness(1.08)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = "brightness(1)";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          {busy ? "Running…" : hasDataset ? "Run Dataset" : "Run"}
        </button>

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
              {attempt.critique.summary && (
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

export function ArtifactPane({ snapshot }: { snapshot: RunSnapshot | null }) {
  const [activeTab, setActiveTab] = useState<ArtifactTab>("factor");
  const latest = snapshot?.attempts[snapshot.attempts.length - 1] ?? null;

  useEffect(() => {
    setActiveTab(defaultArtifactTab(snapshot));
  }, [snapshot?.phase]);

  const hasAttempt = !!latest;
  const isFinalized = snapshot?.phase === "finalized";

  const tabs: Array<{ id: ArtifactTab; label: string; available: boolean }> = [
    { id: "factor", label: "Factor", available: hasAttempt },
    { id: "code", label: "Code", available: hasAttempt },
    { id: "metrics", label: "Metrics", available: hasAttempt },
    { id: "critique", label: "Critique", available: hasAttempt },
    { id: "final", label: "Final", available: isFinalized },
  ];

  return (
    <div className="panel animate-fade-up" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* Tab bar header */}
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
        <p className="eyebrow" style={{ margin: 0 }}>
          Artifact
        </p>
        <div className="tab-bar">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`tab-item${activeTab === t.id ? " active" : ""}`}
              onClick={() => t.available && setActiveTab(t.id)}
              disabled={!t.available}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, padding: 16, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {!snapshot ? (
          <EmptyArtifactState />
        ) : !latest && activeTab !== "final" ? (
          <EmptyArtifactState />
        ) : activeTab === "factor" && latest ? (
          <FactorTab attempt={latest} />
        ) : activeTab === "code" && latest ? (
          <CodeTab attempt={latest} />
        ) : activeTab === "metrics" && latest ? (
          <MetricsTab attempt={latest} />
        ) : activeTab === "critique" && latest ? (
          <CritiqueTab attempt={latest} />
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
          width: 48,
          height: 48,
          borderRadius: 12,
          background: "var(--raised)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.5rem",
        }}
      >
        αG
      </div>
      <p style={{ fontSize: "0.82rem", color: "var(--subtle)", margin: 0 }}>
        Start a run to see artifacts
      </p>
    </div>
  );
}

function FactorTab({ attempt }: { attempt: AttemptRecord }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="animate-fade-up">
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
        <p className="section-label" style={{ marginBottom: 6 }}>
          Expression
        </p>
        <div className="expr-block">{attempt.factor_spec.expression}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {[
          { label: "Universe", value: attempt.factor_spec.universe },
          { label: "Rebalance", value: attempt.factor_spec.rebalance },
          { label: "Direction", value: attempt.factor_spec.direction },
        ].map(({ label, value }) => (
          <div key={label} className="panel-elevated" style={{ padding: "10px 12px" }}>
            <p className="section-label" style={{ marginBottom: 4 }}>
              {label}
            </p>
            <p style={{ fontSize: "0.82rem", color: "var(--text)", margin: 0, fontWeight: 500 }}>{value}</p>
          </div>
        ))}
      </div>

      {attempt.evaluation.reasons.length > 0 && (
        <div>
          <p className="section-label" style={{ marginBottom: 8 }}>
            Evaluation Notes
          </p>
          <ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 4 }}>
            {attempt.evaluation.reasons.map((r, i) => (
              <li key={i} style={{ fontSize: "0.8rem", color: "var(--muted)", lineHeight: 1.45 }}>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CodeTab({ attempt }: { attempt: AttemptRecord }) {
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
          {attempt.critique.summary}
        </p>
      </div>

      {/* Root cause */}
      <div className="panel-raised" style={{ padding: "12px 14px" }}>
        <p className="section-label" style={{ marginBottom: 6 }}>
          Issue Detected
        </p>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.55, margin: 0 }}>
          {attempt.critique.root_cause}
        </p>
      </div>

      {/* Revision instructions */}
      {attempt.critique.revision_instructions && (
        <div
          className="panel-raised"
          style={{ padding: "12px 14px", borderLeft: "3px solid var(--accent)" }}
        >
          <p className="section-label" style={{ marginBottom: 6 }}>
            Revision Guidance
          </p>
          <p style={{ fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.55, margin: 0 }}>
            {attempt.critique.revision_instructions}
          </p>
        </div>
      )}
    </div>
  );
}

function FinalTab({ snapshot }: { snapshot: RunSnapshot }) {
  const lastAttempt = snapshot.attempts[snapshot.attempts.length - 1];
  const metrics = lastAttempt ? Object.entries(lastAttempt.execution_result.metrics).slice(0, 6) : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="animate-fade-up">
      {/* Approval banner */}
      <div
        style={{
          background: "var(--success-dim)",
          border: "1px solid rgba(63,185,80,0.2)",
          borderRadius: 10,
          padding: "16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "rgba(63,185,80,0.15)",
            border: "1.5px solid var(--success)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--success)",
            flexShrink: 0,
          }}
        >
          <CheckIcon size={16} />
        </div>
        <div>
          <p style={{ margin: "0 0 2px", fontSize: "0.9rem", fontWeight: 600, color: "var(--success)" }}>
            Run Finalized
          </p>
          <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--muted)" }}>
            Factor approved and artifact bundle saved
          </p>
        </div>
      </div>

      {lastAttempt && (
        <>
          <div>
            <p className="section-label" style={{ marginBottom: 6 }}>
              Approved Factor
            </p>
            <p style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>
              {lastAttempt.factor_spec.name}
            </p>
            <div className="expr-block">{lastAttempt.factor_spec.expression}</div>
          </div>

          {metrics.length > 0 && (
            <div>
              <p className="section-label" style={{ marginBottom: 8 }}>
                Final Metrics
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {metrics.map(([key, value]) => (
                  <div key={key} className="metric-chip">
                    <p className="section-label" style={{ marginBottom: 3 }}>
                      {key.replaceAll("_", " ")}
                    </p>
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
          <p className="section-label" style={{ marginBottom: 6 }}>
            Artifact Path
          </p>
          <code
            style={{
              fontSize: "0.78rem",
              fontFamily: "monospace",
              color: "var(--accent)",
              wordBreak: "break-all",
            }}
          >
            {snapshot.final_report_path}
          </code>
        </div>
      )}
    </div>
  );
}

// ─── WorkflowGraphView ────────────────────────────────────────────────────────
export { WorkflowGraphView } from "./GraphScene";


