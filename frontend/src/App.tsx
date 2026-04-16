import { startTransition, useDeferredValue, useEffect, useRef, useState } from "react";

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

import { approveRun, createRun, getRun, injectGuidance, suggestDatasets, type KaggleDataset, type RunSnapshot } from "./api";
import {
  ArtifactPane,
  AttemptComparisonCard,
  RunTerminal,
  StatusHeader,
  WorkflowGraphView,
} from "./components";

type MainTab = "run" | "graph";
const DEFAULT_RESEARCH_BRIEF = "";

const POLL_INTERVAL_MS = 2000;

export default function App() {
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<MainTab>("run");
  const [briefDraft, setBriefDraft] = useState(DEFAULT_RESEARCH_BRIEF);
  const [datasetFile, setDatasetFile] = useState<File | null>(null);
  const [kaggleSuggestions, setKaggleSuggestions] = useState<KaggleDataset[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selectedKaggleDataset, setSelectedKaggleDataset] = useState<KaggleDataset | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Mid-run guidance
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [guidanceDraft, setGuidanceDraft] = useState("");
  const [guidanceSent, setGuidanceSent] = useState<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resizable split
  const [splitPct, setSplitPct] = useState(50);
  const [dragging, setDragging] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);

  const deferredSnapshot = useDeferredValue(snapshot);

  // ── Polling loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeRunId) return;
    let cancelled = false;

    const doPoll = async () => {
      if (cancelled) return;
      try {
        const next = await getRun(activeRunId);
        if (!cancelled) {
          startTransition(() =>
            setSnapshot((prev) => {
              // Anti-regression: never roll back the workflow trace or attempts.
              // This prevents a race where get_state briefly returns an early
              // checkpoint (e.g. initial empty state) and wipes visible progress.
              const prevTraceLen = prev?.workflow_trace?.length ?? 0;
              const nextTraceLen = next.workflow_trace?.length ?? 0;
              if (prevTraceLen > nextTraceLen && prev) {
                return {
                  ...next,
                  workflow_trace: prev.workflow_trace,
                  attempts: prev.attempts.length > next.attempts.length ? prev.attempts : next.attempts,
                };
              }
              return next;
            })
          );
          const isDone = next.status === "completed" || next.status === "failed";
          const isPaused = next.approval_status === "pending";
          if (isDone || isPaused) {
            setActiveRunId(null);
            setBusy(false);
            return;
          }
        }
      } catch {
        // Transient error — retry on next tick
      }
      if (!cancelled) {
        pollRef.current = setTimeout(doPoll, POLL_INTERVAL_MS);
      }
    };

    // First poll after a short delay so the backend has time to write the first checkpoint
    pollRef.current = setTimeout(doPoll, 800);
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [activeRunId]);

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
    setGuidanceSent([]);
    setGuidanceDraft("");
    try {
      const initial = await createRun({
        brief: briefDraft,
        datasetFile,
        kaggleRef: selectedKaggleDataset?.ref,
        kaggleTitle: selectedKaggleDataset?.title,
      });
      startTransition(() => setSnapshot(initial));
      setActiveRunId(initial.run_id); // starts the polling effect
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start run.");
      setBusy(false);
    }
  }

  async function handleFindDatasets() {
    if (!briefDraft.trim()) return;
    setLoadingSuggestions(true);
    setKaggleSuggestions([]);
    setSelectedKaggleDataset(null);
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

  async function handleSendGuidance() {
    if (!snapshot || !guidanceDraft.trim()) return;
    const text = guidanceDraft.trim();
    setGuidanceDraft("");
    setGuidanceSent((prev) => [...prev, text]);
    try {
      await injectGuidance(snapshot.run_id, text);
    } catch {
      // Best-effort — guidance will be retried on next run if it fails
    }
  }

  const awaitingApproval = snapshot?.approval_status === "pending";
  const isRunActive = !!activeRunId;

  return (
    <div className="bg-grid" style={{ height: "100vh", overflow: "hidden", background: "var(--bg)", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Top nav */}
      <StatusHeader
        snapshot={deferredSnapshot}
        busy={busy}
        activeTab={mainTab}
        onTabChange={setMainTab}
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
                placeholder="Describe your research brief — e.g. test a 5-day reversal factor on this dataset."
                style={{ lineHeight: 1.55, minHeight: 100 }}
              />
            </div>

            {/* Dataset */}
            <div className="panel" style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <p className="eyebrow" style={{ margin: 0 }}>Dataset</p>
                {(datasetFile || selectedKaggleDataset) && (
                  <button
                    onClick={() => { setDatasetFile(null); setSelectedKaggleDataset(null); }}
                    style={{ fontSize: "0.7rem", color: "var(--subtle)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
                  >
                    clear
                  </button>
                )}
              </div>
              <label
                className="file-picker"
                style={{
                  ...(selectedKaggleDataset ? { borderColor: "rgba(156,213,255,0.35)", borderStyle: "solid" } : {}),
                  ...(dragOver ? { borderColor: "var(--accent)", borderStyle: "solid", background: "rgba(156,213,255,0.06)" } : {}),
                }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file && (file.type === "text/csv" || file.name.endsWith(".csv"))) {
                    setDatasetFile(file);
                    setSelectedKaggleDataset(null);
                  }
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: selectedKaggleDataset ? "var(--accent)" : dragOver ? "var(--accent)" : undefined }}>
                  {dragOver ? "Drop CSV here" : selectedKaggleDataset?.title ?? datasetFile?.name ?? "Choose or drop CSV file…"}
                </span>
                <input type="file" accept=".csv,text/csv" onChange={(e) => {
                  setDatasetFile(e.target.files?.[0] ?? null);
                  setSelectedKaggleDataset(null);
                }} />
              </label>
              <p style={{ fontSize: "0.7rem", color: "var(--subtle)", margin: "6px 0 0" }}>
                Columns: <code>date</code> · <code>ticker</code> · <code>close</code>
              </p>

              {/* Kaggle row */}
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                <button
                  onClick={handleFindDatasets}
                  disabled={loadingSuggestions || !briefDraft.trim()}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    color: loadingSuggestions ? "var(--muted)" : "var(--accent)",
                    background: "transparent",
                    border: "1px solid " + (loadingSuggestions ? "var(--border)" : "rgba(156,213,255,0.25)"),
                    borderRadius: 7,
                    padding: "6px 10px",
                    cursor: loadingSuggestions || !briefDraft.trim() ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    opacity: !briefDraft.trim() ? 0.4 : 1,
                  }}
                >
                  <KaggleLogo size={13} />
                  {loadingSuggestions ? "Searching Kaggle…" : "Suggest from Kaggle"}
                </button>

                {/* Suggestion list */}
                {kaggleSuggestions.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
                    {kaggleSuggestions.map((ds) => (
                      <div
                        key={ds.ref}
                        onClick={() => { setSelectedKaggleDataset(ds); setKaggleSuggestions([]); }}
                        style={{ background: "var(--raised)", border: "1px solid var(--border)", borderRadius: 7, padding: "8px 10px", cursor: "pointer", transition: "border-color 150ms" }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(156,213,255,0.3)")}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                          <p style={{ margin: 0, fontSize: "0.76rem", fontWeight: 600, color: "var(--text)", lineHeight: 1.3 }}>{ds.title}</p>
                          <span style={{ fontSize: "0.65rem", color: "var(--accent)", flexShrink: 0, whiteSpace: "nowrap" }}>Select ↵</span>
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
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Run button */}
            {(() => {
              const hasDataset = !!(datasetFile || selectedKaggleDataset);
              const isDisabled = busy || !hasDataset;
              return (
                <button
                  onClick={handleRunResearch}
                  disabled={isDisabled}
                  style={{
                    width: "100%",
                    padding: "10px 18px",
                    background: busy ? "var(--raised)" : !hasDataset ? "var(--raised)" : "var(--success)",
                    color: busy || !hasDataset ? "var(--muted)" : "#0b1520",
                    border: isDisabled ? "1px solid var(--border)" : "1px solid transparent",
                    borderRadius: 8,
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    cursor: isDisabled ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    transition: "filter 150ms ease, transform 150ms ease",
                    boxShadow: !isDisabled ? "0 0 12px rgba(74,222,128,0.22)" : "none",
                    opacity: !hasDataset && !busy ? 0.45 : 1,
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => { if (!isDisabled) { e.currentTarget.style.filter = "brightness(1.08)"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.filter = ""; e.currentTarget.style.transform = ""; }}
                >
                  {busy ? "Running…" : !hasDataset ? "Select a dataset to run" : selectedKaggleDataset ? "Run on Kaggle Dataset" : "Run on Uploaded Dataset"}
                </button>
              );
            })()}

            {/* Terminal */}
            <RunTerminal snapshot={deferredSnapshot} busy={busy} error={error} />

            {/* ── Researcher Guidance ────────────────────────────────── */}
            {isRunActive && (
              <div className="panel" style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <p className="eyebrow" style={{ margin: 0 }}>Researcher Guidance</p>
                  <span style={{ fontSize: "0.66rem", color: "var(--subtle)" }}>picked up on next revision</span>
                </div>

                {/* Sent guidance history */}
                {guidanceSent.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                    {guidanceSent.map((g, i) => (
                      <div
                        key={i}
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--muted)",
                          padding: "4px 10px",
                          background: "var(--raised)",
                          borderRadius: 5,
                          borderLeft: "2px solid var(--accent)",
                          lineHeight: 1.4,
                        }}
                      >
                        {g}
                      </div>
                    ))}
                  </div>
                )}

                {/* Input row */}
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={guidanceDraft}
                    onChange={(e) => setGuidanceDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSendGuidance(); } }}
                    placeholder="e.g. try longer windows, switch to momentum…"
                    style={{
                      flex: 1,
                      background: "var(--raised)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      padding: "6px 10px",
                      fontSize: "0.78rem",
                      color: "var(--text)",
                      fontFamily: "inherit",
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={handleSendGuidance}
                    disabled={!guidanceDraft.trim()}
                    style={{
                      padding: "6px 12px",
                      background: guidanceDraft.trim() ? "var(--accent)" : "var(--raised)",
                      color: guidanceDraft.trim() ? "#0b1520" : "var(--muted)",
                      border: "1px solid " + (guidanceDraft.trim() ? "transparent" : "var(--border)"),
                      borderRadius: 6,
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      cursor: guidanceDraft.trim() ? "pointer" : "not-allowed",
                      fontFamily: "inherit",
                      flexShrink: 0,
                    }}
                  >
                    Send
                  </button>
                </div>
              </div>
            )}

            {/* Attempt comparison */}
            {(deferredSnapshot?.attempts.length ?? 0) >= 2 && (
              <AttemptComparisonCard snapshot={deferredSnapshot!} />
            )}

            {/* Approval buttons */}
            {awaitingApproval && (() => {
              const isInterim = !!snapshot?.interim_hil_next;
              return (
                <div className="panel" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <p className="eyebrow" style={{ margin: 0 }}>Human Review</p>
                    {isInterim && (
                      <span style={{ fontSize: "0.65rem", color: "var(--warning)", fontWeight: 600 }}>
                        Interim — attempt {snapshot?.attempt}
                      </span>
                    )}
                  </div>
                  {isInterim && (
                    <p style={{ fontSize: "0.75rem", color: "var(--muted)", margin: "0 0 4px", lineHeight: 1.4 }}>
                      This factor needs revision. Continue to apply the next revision, or skip to the next candidate.
                    </p>
                  )}
                  <button
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => handleApproval(true)}
                  >
                    {isInterim ? "Continue to Revision" : "Approve Result"}
                  </button>
                  <button
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() => handleApproval(false)}
                  >
                    {isInterim ? "Skip to Next Candidate" : "Reject"}
                  </button>
                </div>
              );
            })()}
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
            <ArtifactPane snapshot={deferredSnapshot} busy={busy} />
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
