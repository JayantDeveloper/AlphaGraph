import { startTransition, useDeferredValue, useState } from "react";

function KaggleLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", flexShrink: 0 }}>
      <rect width="24" height="24" rx="5" fill="#20BEFF"/>
      {/* Vertical bar */}
      <rect x="5" y="4" width="3" height="16" rx="1.2" fill="#F7F8F0"/>
      {/* Upper arm */}
      <polygon points="8,9 8,14 19.5,4" fill="#F7F8F0"/>
      {/* Lower arm */}
      <polygon points="8,14 8,19 19.5,20" fill="#F7F8F0"/>
    </svg>
  );
}

import { approveRun, createRun, suggestDatasets, type KaggleDataset, type RunSnapshot } from "./api";
import {
  ArtifactPane,
  AttemptComparisonCard,
  StatusHeader,
  WorkflowGraphView,
  WorkflowRail,
} from "./components";

type MainTab = "run" | "graph";
const DEFAULT_RESEARCH_BRIEF =
  "Test a simple cross-sectional equity factor on this dataset.";

export default function App() {
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<MainTab>("run");
  const [briefDraft, setBriefDraft] = useState(DEFAULT_RESEARCH_BRIEF);
  const [datasetFile, setDatasetFile] = useState<File | null>(null);
  const [kaggleSuggestions, setKaggleSuggestions] = useState<KaggleDataset[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const deferredSnapshot = useDeferredValue(snapshot);

  async function handleRunResearch() {
    setBusy(true);
    setError(null);
    try {
      const next = await createRun({
        brief: briefDraft,
        datasetFile,
      });
      startTransition(() => setSnapshot(next));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start run.");
    } finally {
      setBusy(false);
    }
  }

  async function handleFindDatasets() {
    if (!briefDraft.trim()) return;
    setLoadingSuggestions(true);
    setKaggleSuggestions([]);
    try {
      const results = await suggestDatasets(briefDraft.trim());
      setKaggleSuggestions(results);
    } finally {
      setLoadingSuggestions(false);
    }
  }

  async function handleApproval(approved: boolean) {
    if (!snapshot) return;
    setBusy(true);
    setError(null);
    try {
      const next = await approveRun(snapshot.run_id, approved);
      startTransition(() => setSnapshot(next));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit approval.");
    } finally {
      setBusy(false);
    }
  }

  const awaitingApproval = snapshot?.approval_status === "pending";

  return (
    <div
      className="bg-grid"
      style={{ minHeight: "100vh", background: "var(--bg)" }}
    >
      {/* Top nav */}
      <StatusHeader
        snapshot={deferredSnapshot}
        busy={busy}
        activeTab={mainTab}
        onTabChange={setMainTab}
      />

      {mainTab === "run" ? (
        <div
          style={{
            maxWidth: 1520,
            margin: "0 auto",
            padding: "20px 20px 40px",
            display: "grid",
            gridTemplateColumns: "minmax(280px, 340px) minmax(0, 1fr)",
            gap: 16,
            alignItems: "start",
          }}
        >
          {/* ── Left column ───────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Brief / run info */}
            <div className="panel" style={{ padding: 16 }}>
              <p className="eyebrow">Research Brief</p>
              <textarea
                className="app-textarea"
                value={briefDraft}
                onChange={(event) => setBriefDraft(event.target.value)}
                placeholder="Test 5-day reversal on this equity dataset."
                style={{
                  lineHeight: 1.55,
                  minHeight: 116,
                }}
              />
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                <p style={{ fontSize: "0.74rem", color: "var(--muted)", margin: 0 }}>
                  Upload one long-format CSV per run. If you skip the file, AlphaGraph uses the bundled demo dataset.
                </p>
                <div className="panel-elevated" style={{ padding: "10px 12px" }}>
                  <p className="section-label" style={{ marginBottom: 6 }}>
                    Dataset
                  </p>
                  <label className="file-picker">
                    <span>{datasetFile?.name ?? "Choose CSV file"}</span>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(event) => setDatasetFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  <p style={{ fontSize: "0.72rem", color: "var(--subtle)", margin: "8px 0 0" }}>
                    Required columns: <code>date</code>, <code>ticker</code>, <code>close</code>
                  </p>
                  <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <KaggleLogo size={13}/>
                        <p className="section-label" style={{ margin: 0 }}>Suggest from Kaggle</p>
                      </div>
                      <button
                        onClick={handleFindDatasets}
                        disabled={loadingSuggestions || !briefDraft.trim()}
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          color: loadingSuggestions ? "var(--muted)" : "var(--accent)",
                          background: "transparent",
                          border: "1px solid " + (loadingSuggestions ? "var(--border)" : "rgba(45,212,191,0.3)"),
                          borderRadius: 6,
                          padding: "3px 10px",
                          cursor: loadingSuggestions || !briefDraft.trim() ? "not-allowed" : "pointer",
                          fontFamily: "inherit",
                          opacity: !briefDraft.trim() ? 0.4 : 1,
                        }}
                      >
                        {loadingSuggestions ? "Searching…" : "Find datasets ↗"}
                      </button>
                    </div>
                    <p style={{ fontSize: "0.7rem", color: "var(--subtle)", margin: "0 0 8px" }}>
                      Searches Kaggle for CSV datasets matching your research brief.
                    </p>
                    {kaggleSuggestions.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {kaggleSuggestions.map((ds) => (
                          <a
                            key={ds.ref}
                            href={ds.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ textDecoration: "none" }}
                          >
                            <div
                              style={{
                                background: "var(--raised)",
                                border: "1px solid var(--border)",
                                borderRadius: 8,
                                padding: "9px 11px",
                                cursor: "pointer",
                                transition: "border-color 150ms",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(45,212,191,0.4)")}
                              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                            >
                              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                                <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 600, color: "var(--text)", lineHeight: 1.3 }}>
                                  {ds.title}
                                </p>
                                <span style={{ fontSize: "0.68rem", color: "var(--accent)", flexShrink: 0, marginTop: 1 }}>↗</span>
                              </div>
                              {ds.subtitle && (
                                <p style={{
                                  margin: "3px 0 0",
                                  fontSize: "0.7rem",
                                  color: "var(--muted)",
                                  lineHeight: 1.35,
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                }}>
                                  {ds.subtitle}
                                </p>
                              )}
                              <div style={{ display: "flex", gap: 10, marginTop: 5 }}>
                                {ds.size_bytes > 0 && (
                                  <span style={{ fontSize: "0.66rem", color: "var(--subtle)" }}>
                                    {ds.size_bytes >= 1_048_576
                                      ? `${(ds.size_bytes / 1_048_576).toFixed(0)} MB`
                                      : `${(ds.size_bytes / 1024).toFixed(0)} KB`}
                                  </span>
                                )}
                                {ds.vote_count > 0 && (
                                  <span style={{ fontSize: "0.66rem", color: "var(--subtle)" }}>
                                    ▲ {ds.vote_count.toLocaleString()}
                                  </span>
                                )}
                                {ds.download_count > 0 && (
                                  <span style={{ fontSize: "0.66rem", color: "var(--subtle)" }}>
                                    ↓ {ds.download_count.toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {deferredSnapshot?.dataset_label && (
                  <div className="panel-elevated" style={{ padding: "10px 12px" }}>
                    <p className="section-label" style={{ marginBottom: 4 }}>
                      Active Dataset
                    </p>
                    <p style={{ fontSize: "0.8rem", color: "var(--text)", margin: 0, fontWeight: 500 }}>
                      {deferredSnapshot.dataset_label}
                    </p>
                    {deferredSnapshot.dataset_summary && (
                      <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "4px 0 0" }}>
                        {deferredSnapshot.dataset_summary.ticker_count} tickers ·{" "}
                        {deferredSnapshot.dataset_summary.row_count} rows ·{" "}
                        {deferredSnapshot.dataset_summary.start_date} to {deferredSnapshot.dataset_summary.end_date}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Workflow rail */}
            <WorkflowRail snapshot={deferredSnapshot} />

            {/* Attempt comparison — only when ≥2 attempts */}
            {(deferredSnapshot?.attempts.length ?? 0) >= 2 && (
              <AttemptComparisonCard snapshot={deferredSnapshot!} />
            )}

            {/* Action controls */}
            <div
              className="panel"
              style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}
            >
              <p className="eyebrow">Controls</p>

              <button
                className="btn-primary"
                disabled={busy}
                onClick={handleRunResearch}
              >
                {busy ? "Running…" : datasetFile ? "Run Uploaded Dataset" : "Run Research"}
              </button>

              {awaitingApproval && (
                <>
                  <button
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => handleApproval(true)}
                  >
                    Approve Result
                  </button>
                  <button
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() => handleApproval(false)}
                  >
                    Reject
                  </button>
                </>
              )}

              {error && (
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--danger)",
                    margin: 0,
                    lineHeight: 1.45,
                  }}
                >
                  {error}
                </p>
              )}

              {/* Run meta */}
              {deferredSnapshot && (
                <div style={{ display: "flex", flexDirection: "column", gap: 0, marginTop: 4 }}>
                  {[
                    { label: "Phase", value: deferredSnapshot.phase },
                    { label: "Node", value: deferredSnapshot.current_node ?? "—" },
                    { label: "Decision", value: deferredSnapshot.supervisor_decision ?? "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="kv-row">
                      <span className="kv-label">{label}</span>
                      <span
                        className="kv-value"
                        style={{ fontSize: "0.75rem", fontFamily: "monospace" }}
                      >
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Right column ──────────────────────────────────── */}
          <ArtifactPane snapshot={deferredSnapshot} />
        </div>
      ) : (
        <div
          style={{
            maxWidth: 1680,
            margin: "0 auto",
            padding: "20px 20px 40px",
          }}
        >
          <WorkflowGraphView snapshot={deferredSnapshot} />
        </div>
      )}
    </div>
  );
}
