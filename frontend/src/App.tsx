import { startTransition, useDeferredValue, useRef, useState } from "react";

function KaggleLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", flexShrink: 0 }}>
      <rect width="24" height="24" rx="5" fill="#20BEFF"/>
      <rect x="5" y="4" width="3" height="16" rx="1.2" fill="#F7F8F0"/>
      <polygon points="8,9 8,14 19.5,4" fill="#F7F8F0"/>
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
} from "./components";

type MainTab = "run" | "graph";
const DEFAULT_RESEARCH_BRIEF =
  "Test a simple cross-sectional equity factor on this dataset.";

// Nav height: 52px top bar + 42px workflow bar = 94px
const NAV_H = 94;

export default function App() {
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<MainTab>("run");
  const [briefDraft, setBriefDraft] = useState(DEFAULT_RESEARCH_BRIEF);
  const [datasetFile, setDatasetFile] = useState<File | null>(null);
  const [kaggleSuggestions, setKaggleSuggestions] = useState<KaggleDataset[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Resizable split
  const [splitPct, setSplitPct] = useState(50);
  const [dragging, setDragging] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);

  const deferredSnapshot = useDeferredValue(snapshot);

  function handleDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setDragging(true);

    function onMouseMove(ev: MouseEvent) {
      const x = ev.clientX - rect.left;
      setSplitPct(Math.max(25, Math.min(72, (x / rect.width) * 100)));
    }
    function onMouseUp() {
      setDragging(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  async function handleRunResearch() {
    setBusy(true);
    setError(null);
    try {
      const next = await createRun({ brief: briefDraft, datasetFile });
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
    <div className="bg-grid" style={{ height: "100vh", overflow: "hidden", background: "var(--bg)", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Top nav */}
      <StatusHeader
        snapshot={deferredSnapshot}
        busy={busy}
        activeTab={mainTab}
        onTabChange={setMainTab}
        onRun={handleRunResearch}
        hasDataset={!!datasetFile}
      />

      {mainTab === "run" ? (
        /* ── Resizable split ─────────────────────────────────────────── */
        <div
          style={{
            flex: 1,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            ref={splitContainerRef}
            style={{
              flex: 1,
              minHeight: 0,
              maxWidth: 1400,
              width: "100%",
              margin: "0 auto",
              padding: "0 20px",
              display: "flex",
              cursor: dragging ? "col-resize" : "auto",
              userSelect: dragging ? "none" : "auto",
            }}
          >
          {/* ── Left panel ──────────────────────────────────────────── */}
          <div
            style={{
              width: `${splitPct}%`,
              minWidth: 0,
              flexShrink: 0,
              overflowY: "auto",
              overflowX: "hidden",
              paddingTop: 20,
              paddingBottom: 32,
              paddingRight: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {/* Brief */}
            <div className="panel" style={{ padding: 16 }}>
              <p className="eyebrow">Research Brief</p>
              <textarea
                className="app-textarea"
                value={briefDraft}
                onChange={(e) => setBriefDraft(e.target.value)}
                placeholder="Test 5-day reversal on this equity dataset."
                style={{ lineHeight: 1.55, minHeight: 100 }}
              />
            </div>

            {/* Dataset */}
            <div className="panel" style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <p className="eyebrow" style={{ margin: 0 }}>Dataset</p>
                {datasetFile && (
                  <button
                    onClick={() => setDatasetFile(null)}
                    style={{ fontSize: "0.7rem", color: "var(--subtle)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
                  >
                    clear
                  </button>
                )}
              </div>
              <label className="file-picker">
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {datasetFile?.name ?? "Choose CSV file…"}
                </span>
                <input type="file" accept=".csv,text/csv" onChange={(e) => setDatasetFile(e.target.files?.[0] ?? null)} />
              </label>
              <p style={{ fontSize: "0.7rem", color: "var(--subtle)", margin: "6px 0 0" }}>
                Columns: <code>date</code> · <code>ticker</code> · <code>close</code>
              </p>

              {/* Kaggle row */}
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <KaggleLogo size={12} />
                    <span className="section-label" style={{ margin: 0 }}>Suggest from Kaggle</span>
                  </div>
                  <button
                    onClick={handleFindDatasets}
                    disabled={loadingSuggestions || !briefDraft.trim()}
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      color: loadingSuggestions ? "var(--muted)" : "var(--accent)",
                      background: "transparent",
                      border: "1px solid " + (loadingSuggestions ? "var(--border)" : "rgba(156,213,255,0.25)"),
                      borderRadius: 6,
                      padding: "3px 9px",
                      cursor: loadingSuggestions || !briefDraft.trim() ? "not-allowed" : "pointer",
                      fontFamily: "inherit",
                      opacity: !briefDraft.trim() ? 0.4 : 1,
                    }}
                  >
                    {loadingSuggestions ? "Searching…" : "Find ↗"}
                  </button>
                </div>

                {kaggleSuggestions.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {kaggleSuggestions.map((ds) => (
                      <a key={ds.ref} href={ds.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                        <div
                          style={{ background: "var(--raised)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 10px", transition: "border-color 150ms" }}
                          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(156,213,255,0.3)")}
                          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                        >
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                            <p style={{ margin: 0, fontSize: "0.76rem", fontWeight: 600, color: "var(--text)", lineHeight: 1.3 }}>{ds.title}</p>
                            <span style={{ fontSize: "0.66rem", color: "var(--accent)", flexShrink: 0 }}>↗</span>
                          </div>
                          {ds.subtitle && (
                            <p style={{ margin: "3px 0 0", fontSize: "0.68rem", color: "var(--muted)", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                              {ds.subtitle}
                            </p>
                          )}
                          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                            {ds.size_bytes > 0 && <span style={{ fontSize: "0.64rem", color: "var(--subtle)" }}>{ds.size_bytes >= 1_048_576 ? `${(ds.size_bytes / 1_048_576).toFixed(0)} MB` : `${(ds.size_bytes / 1024).toFixed(0)} KB`}</span>}
                            {ds.vote_count > 0 && <span style={{ fontSize: "0.64rem", color: "var(--subtle)" }}>▲ {ds.vote_count.toLocaleString()}</span>}
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Active dataset banner */}
            {deferredSnapshot?.dataset_label && (
              <div className="panel-elevated" style={{ padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                  <p className="section-label" style={{ margin: 0 }}>Active Dataset</p>
                </div>
                <p style={{ fontSize: "0.8rem", color: "var(--text)", margin: 0, fontWeight: 500 }}>{deferredSnapshot.dataset_label}</p>
                {deferredSnapshot.dataset_summary && (
                  <p style={{ fontSize: "0.7rem", color: "var(--muted)", margin: "3px 0 0" }}>
                    {deferredSnapshot.dataset_summary.ticker_count} tickers · {deferredSnapshot.dataset_summary.row_count} rows · {deferredSnapshot.dataset_summary.start_date} – {deferredSnapshot.dataset_summary.end_date}
                  </p>
                )}
              </div>
            )}

            {/* Attempt comparison */}
            {(deferredSnapshot?.attempts.length ?? 0) >= 2 && (
              <AttemptComparisonCard snapshot={deferredSnapshot!} />
            )}

            {/* Status / controls */}
            {(awaitingApproval || error || deferredSnapshot) && (
              <div className="panel" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Run meta */}
                {deferredSnapshot && (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {[
                      { label: "Phase",    value: deferredSnapshot.phase },
                      { label: "Node",     value: deferredSnapshot.current_node ?? "—" },
                      { label: "Decision", value: deferredSnapshot.supervisor_decision ?? "—" },
                    ].map(({ label, value }) => (
                      <div key={label} className="kv-row">
                        <span className="kv-label">{label}</span>
                        <span className="kv-value" style={{ fontSize: "0.74rem", fontFamily: "monospace" }}>{value}</span>
                      </div>
                    ))}
                  </div>
                )}

                {awaitingApproval && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: deferredSnapshot ? 4 : 0 }}>
                    <button className="btn-secondary" disabled={busy} onClick={() => handleApproval(true)}>Approve Result</button>
                    <button className="btn-ghost" disabled={busy} onClick={() => handleApproval(false)}>Reject</button>
                  </div>
                )}

                {error && (
                  <p style={{ fontSize: "0.78rem", color: "var(--danger)", margin: 0, lineHeight: 1.45 }}>{error}</p>
                )}
              </div>
            )}
          </div>

          {/* ── Divider ─────────────────────────────────────────────── */}
          <Divider onMouseDown={handleDividerMouseDown} active={dragging} />

          {/* ── Right panel (artifact) ──────────────────────────────── */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              paddingTop: 20,
              paddingBottom: 32,
              paddingLeft: 16,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <ArtifactPane snapshot={deferredSnapshot} />
          </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: "auto" }}>
          <div style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 20px 40px" }}>
            <WorkflowGraphView snapshot={deferredSnapshot} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Divider handle ────────────────────────────────────────────────────────────

function Divider({ onMouseDown, active }: { onMouseDown: (e: React.MouseEvent) => void; active: boolean }) {
  const [hovered, setHovered] = useState(false);
  const lit = active || hovered;

  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 12,
        flexShrink: 0,
        cursor: "col-resize",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px 0 32px",
      }}
    >
      <div
        style={{
          width: lit ? 2 : 1,
          height: "100%",
          borderRadius: 2,
          background: lit ? "var(--accent)" : "var(--border)",
          transition: "width 120ms ease, background 120ms ease",
        }}
      />
    </div>
  );
}
