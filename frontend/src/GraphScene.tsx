import { useState } from "react";
import type { ReactNode } from "react";
import type { RunSnapshot, WorkflowNode } from "./api";

import geminiLogo   from "../model-logos-square/gemini.webp";
import claudeLogo   from "../model-logos-square/claude.webp";
import deepseekLogo from "../model-logos-square/deepseek.webp";

// ─── Node definitions ─────────────────────────────────────────────────────────

interface NodeMeta {
  id: WorkflowNode;
  shortName: string;
  label: string;
  typeLabel: string;
  provider: string | null;
  model: string;
  color: string;           // accent / border / glow color
  activeTopBg: string;     // solid opaque gradient stop (top)
  activeBotBg: string;     // solid opaque gradient stop (bottom)
}

const NODES: NodeMeta[] = [
  {
    id: "supervisor",
    shortName: "Supervisor",
    label: "Supervisor",
    typeLabel: "ORCHESTRATOR",
    provider: null,
    model: "deterministic",
    color: "#9CD5FF",
    activeTopBg: "#0e1e30",
    activeBotBg: "#091522",
  },
  {
    id: "hypothesis_agent",
    shortName: "Hypothesis",
    label: "Hypothesis Agent",
    typeLabel: "AI AGENT",
    provider: "Google",
    model: "gemini-2.5-flash",
    color: "#4285f4",
    activeTopBg: "#0d1c3a",
    activeBotBg: "#081426",
  },
  {
    id: "coding_agent",
    shortName: "Coding",
    label: "Coding Agent",
    typeLabel: "AI AGENT",
    provider: "Anthropic",
    model: "claude-sonnet-4-20250514",
    color: "#fb923c",
    activeTopBg: "#201208",
    activeBotBg: "#150d06",
  },
  {
    id: "execution_tool",
    shortName: "Execution",
    label: "Execution Tool",
    typeLabel: "SYSTEM TOOL",
    provider: null,
    model: "local subprocess",
    color: "#7AAACE",
    activeTopBg: "#111e2e",
    activeBotBg: "#0c1520",
  },
  {
    id: "factor_critic",
    shortName: "Critic",
    label: "Factor Critic",
    typeLabel: "AI AGENT",
    provider: "DeepSeek",
    model: "deepseek-reasoner",
    color: "#a78bfa",
    activeTopBg: "#130d2e",
    activeBotBg: "#0b091e",
  },
  {
    id: "human_in_the_loop",
    shortName: "Approval",
    label: "Human-in-the-Loop",
    typeLabel: "CHECKPOINT",
    provider: null,
    model: "interrupt()",
    color: "#fbbf24",
    activeTopBg: "#1c1500",
    activeBotBg: "#120f00",
  },
  {
    id: "finalize_run",
    shortName: "Finalize",
    label: "Finalize Run",
    typeLabel: "SYSTEM",
    provider: null,
    model: "artifact writer",
    color: "#4ade80",
    activeTopBg: "#0a1e13",
    activeBotBg: "#07160e",
  },
];

// ─── State helpers ────────────────────────────────────────────────────────────

type NodeState = "pending" | "active" | "complete";

function getNodeState(id: WorkflowNode, active: WorkflowNode | null, visited: Set<string>): NodeState {
  if (active === id) return "active";
  if (visited.has(id)) return "complete";
  return "pending";
}

function getEdgeState(
  from: WorkflowNode, to: WorkflowNode,
  active: WorkflowNode | null, visited: Set<string>,
): "pending" | "traversed" | "active" {
  if (visited.has(from) && (visited.has(to) || active === to)) return "traversed";
  if (active === from) return "active";
  return "pending";
}

function fmtMetric(v: number | string): string {
  if (typeof v === "string") return v;
  if (Math.abs(v) >= 1_000) return v.toFixed(0);
  if (Math.abs(v) >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

// ─── Layout ───────────────────────────────────────────────────────────────────
//
//  Top row (left → right):   Supervisor · Hypothesis · Coding · Execution
//                                                                    ↓
//  Bottom row (right → left):                   Critic · Approval · Finalize
//
//  Revision arc: Critic top → raised amber arc above top row → Hypothesis top

const NW = 200;   // node width  (~1.67× the original 120)
const NH = 110;   // node height (~1.67× the original 66)
const HW = NW / 2;  // 100
const HH = NH / 2;  // 55
const NR = 12;    // corner radius

const R1Y = 114;  // row 1 center y
const R2Y = 274;  // row 2 center y

// Column x-centers: 4 equally-spaced columns (80 px gap between nodes)
const C1 = 120;
const C2 = 400;
const C3 = 680;
const C4 = 960;

const NODE_POS: Record<WorkflowNode, [number, number]> = {
  supervisor:        [C1, R1Y],
  hypothesis_agent:  [C2, R1Y],
  coding_agent:      [C3, R1Y],
  execution_tool:    [C4, R1Y],
  factor_critic:     [C4, R2Y],
  human_in_the_loop: [C3, R2Y],
  finalize_run:      [C2, R2Y],
};

// Edges: [from, to, label, direction]
const EDGES: Array<{ from: WorkflowNode; to: WorkflowNode; label: string; dir: "r" | "d" | "l" }> = [
  { from: "supervisor",        to: "hypothesis_agent",  label: "brief",       dir: "r" },
  { from: "hypothesis_agent",  to: "coding_agent",      label: "FactorSpec",  dir: "r" },
  { from: "coding_agent",      to: "execution_tool",    label: "script.py",   dir: "r" },
  { from: "execution_tool",    to: "factor_critic",     label: "metrics",     dir: "d" },
  { from: "factor_critic",     to: "human_in_the_loop", label: "verdict",     dir: "l" },
  { from: "human_in_the_loop", to: "finalize_run",      label: "approved",    dir: "l" },
];

const SVG_W = 1080;
const SVG_H = 352;
const ARC_Y  = 40;  // revision arc peak y (above row 1 tops at R1Y-HH=59)

// ─── Provider Logo Icons (actual images) ─────────────────────────────────────

const LOGO_MAP: Partial<Record<string, string>> = {
  hypothesis_agent: geminiLogo,
  coding_agent:     claudeLogo,
  factor_critic:    deepseekLogo,
};

function renderProviderLogo(nodeId: string, lx: number, ly: number) {
  const src = LOGO_MAP[nodeId];
  if (!src) return null;
  const S = 22;
  // clip ID unique per node so multiple renders don't collide
  const clipId = `logo-clip-${nodeId}`;
  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect x={lx} y={ly} width={S} height={S} rx={5.5} ry={5.5}/>
        </clipPath>
      </defs>
      <image
        href={src}
        x={lx} y={ly}
        width={S} height={S}
        clipPath={`url(#${clipId})`}
        preserveAspectRatio="xMidYMid slice"
      />
    </g>
  );
}

// ─── SVG Diagram ─────────────────────────────────────────────────────────────

function DiagramSVG({
  snapshot,
  hoveredNode,
  setHoveredNode,
  selectedId,
  setSelectedId,
}: {
  snapshot: RunSnapshot | null;
  hoveredNode: WorkflowNode | null;
  setHoveredNode: (n: WorkflowNode | null) => void;
  selectedId: WorkflowNode | null;
  setSelectedId: (n: WorkflowNode | null) => void;
}) {
  const visited = new Set(snapshot?.workflow_trace ?? []);
  const active  = snapshot?.current_node ?? null;
  if (snapshot && snapshot.approval_status !== "not_requested") {
    visited.add("human_in_the_loop");
  }
  const revisionActive = (snapshot?.attempt ?? 0) > 1;

  // Which edges connect to the hovered node?
  function edgeIsHighlighted(from: WorkflowNode, to: WorkflowNode) {
    return hoveredNode !== null && (hoveredNode === from || hoveredNode === to);
  }

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      style={{
        display: "block",
        width: "100%",
        maxWidth: SVG_W,
        height: "auto",
        userSelect: "none",
        margin: "0 auto",
      }}
    >
      <defs>
        {/* ── Solid-color active gradients (opaque, no glass) ── */}
        {NODES.map((n) => (
          <linearGradient key={n.id} id={`bg-${n.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={n.activeTopBg} />
            <stop offset="100%" stopColor={n.activeBotBg} />
          </linearGradient>
        ))}

        {/* ── Glow filter (used by active nodes) ── */}
        <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>

        {/* ── Arrow markers ── */}
        {[
          { id: "arr-dim",  fill: "#1e3550" },
          { id: "arr-lit",  fill: "#9CD5FF" },
          { id: "arr-done", fill: "#4ade80" },
          { id: "arr-rev",  fill: "#fbbf24" },
        ].map(({ id, fill }) => (
          <marker key={id} id={id} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M 0,0 L 8,4 L 0,8 Z" fill={fill} />
          </marker>
        ))}

        {/* ── Revision-arc left-pointing marker ── */}
        <marker id="arr-rev-left" markerWidth="8" markerHeight="8" refX="1" refY="4" orient="auto">
          <path d="M 8,0 L 0,4 L 8,8 Z" fill="#fbbf24" />
        </marker>

        {/* ── CSS animations injected into SVG ── */}
        <style>{`
          .edge-flow { stroke-dasharray: 12 8; animation: flow 1s linear infinite; }
          @keyframes flow { to { stroke-dashoffset: -20; } }
          .pulse-ring { animation: pulse 2s ease-out infinite; }
          @keyframes pulse { 0%,100%{opacity:0.5;r:10} 50%{opacity:0;r:20} }
          .rev-dash { stroke-dasharray: 10 7; animation: rev-flow 1.2s linear infinite; }
          @keyframes rev-flow { to { stroke-dashoffset: -17; } }
        `}</style>
      </defs>

      <g>
        {/* ══ FORWARD EDGES ═════════════════════════════════════════════════════ */}
        {EDGES.map(({ from, to, label, dir }) => {
        const [fx, fy] = NODE_POS[from];
        const [tx, ty] = NODE_POS[to];
        const es = getEdgeState(from, to, active, visited);
        const highlighted = edgeIsHighlighted(from, to);

        // Compute start/end based on direction
        let x1: number, y1: number, x2: number, y2: number;
        if (dir === "r") { x1 = fx + HW; y1 = fy; x2 = tx - HW; y2 = ty; }
        else if (dir === "l") { x1 = fx - HW; y1 = fy; x2 = tx + HW; y2 = ty; }
        else { x1 = fx; y1 = fy + HH; x2 = tx; y2 = ty - HH; }

        const midX = (x1 + x2) / 2;
        const midY = dir === "d" ? (y1 + y2) / 2 : fy - 9;
        const labelAnchor = dir === "d" ? "start" : "middle";
        const labelDx = dir === "d" ? 10 : 0;

        const color =
          es === "traversed" ? "#4ade80" :
          es === "active"    ? "#9CD5FF" :
          highlighted        ? "#4a6a9a" :
          "#2a3f60";

        const markerId =
          es === "traversed" ? "url(#arr-done)" :
          es === "active"    ? "url(#arr-lit)"  : "url(#arr-dim)";

        const sw = (es !== "pending" || highlighted) ? 2.5 : 1.8;

          return (
            <g key={`${from}-${to}`}>
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={color}
                strokeWidth={sw}
                markerEnd={markerId}
                className={es === "active" ? "edge-flow" : undefined}
              />
              {label && (
                <text
                  x={midX + labelDx} y={midY}
                  fontSize="9"
                  textAnchor={labelAnchor}
                  fontFamily="'JetBrains Mono', monospace"
                  fill={
                    es === "traversed" ? "#4ade8088" :
                    es === "active"    ? "#9CD5FFaa" :
                    "#4a6288"
                  }
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}

        {/* ══ REVISION ARC — the graph's signature back-edge ════════════════════ */}
        {/* Always render (shows topology), brightens when used */}
        <g>
          <path
            d={`M ${C4},${R2Y - HH} C ${C4 + 60},${ARC_Y} ${C2 - 50},${ARC_Y} ${C2},${R1Y - HH}`}
            fill="none"
            stroke={revisionActive ? "#fde047" : "#b45309"}
            strokeWidth={revisionActive ? 4 : 2.2}
            strokeDasharray={revisionActive ? undefined : "7 6"}
            markerEnd={revisionActive ? "url(#arr-rev-left)" : undefined}
            className={revisionActive ? "rev-dash" : undefined}
          />
          {/* Label pill — positioned at bezier midpoint (t≈0.5 → x≈680, y≈65) */}
          <rect
            x={(C4 + C2) / 2 - 57}
            y={50}
            width={114}
            height={15}
            rx={4}
            fill="rgba(11,21,32,0.88)"
          />
          <text
            x={(C4 + C2) / 2}
            y={61}
            fontSize="11"
            fontWeight="600"
            textAnchor="middle"
            fontFamily="Inter, system-ui, sans-serif"
            fill={revisionActive ? "#fde047" : "#d97706"}
          >
            revision guidance
          </text>
        </g>

        {/* ══ NODES ═════════════════════════════════════════════════════════════ */}
        {NODES.map((node) => {
        const [cx, cy] = NODE_POS[node.id];
        const nx = cx - HW;
        const ny = cy - HH;
        const state      = getNodeState(node.id, active, visited);
        const isSelected = selectedId === node.id;
        const isHovered  = hoveredNode === node.id;

        // ── Colors based on state ──
        const bgFill =
          state === "active"   ? `url(#bg-${node.id})` :
          state === "complete" ? "#0a1e15" :
          isHovered            ? "#142336" :
          "#0f1e2e";

        const borderColor =
          state === "active"   ? node.color :
          state === "complete" ? "#1a5c2a" :
          isHovered            ? "#355872" :
          "#1e3550";

        const borderWidth = state === "active" ? 1.5 : 1;

        const accentOpacity =
          state === "active"   ? 1    :
          state === "complete" ? 0.8  :
          isHovered            ? 0.5  : 0.3;

        const titleColor =
          state === "active"   ? "#F7F8F0" :
          state === "complete" ? "#a0e8c4" :
          isHovered            ? "#F7F8F0" :
          "#d8e8f4";

        const metaColor =
          state === "active"   ? node.color :
          state === "complete" ? "#4ade80"  :
          "#7AAACE";

        const typeLabelColor =
          state === "active"   ? node.color :
          state === "complete" ? "#4ade80"  :
          "#7AAACE";

          return (
            <g
              key={node.id}
              style={{ cursor: "pointer" }}
              filter={state === "active" ? "url(#glow)" : undefined}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              onClick={() => setSelectedId(isSelected ? null : node.id)}
            >
            {/* ── Active pulse ring ── */}
            {state === "active" && (
              <rect
                x={nx - 6} y={ny - 6}
                width={NW + 12} height={NH + 12}
                rx={NR + 4}
                fill="none"
                stroke={node.color}
                strokeWidth={1}
                className="pulse-ring"
              />
            )}

            {/* ── Selection outline ── */}
            {isSelected && (
              <rect
                x={nx - 4} y={ny - 4}
                width={NW + 8} height={NH + 8}
                rx={NR + 2}
                fill="none"
                stroke="#2dd4bf"
                strokeWidth={1.5}
                opacity={0.6}
              />
            )}

            {/* ── Node body ── */}
            <rect
              x={nx} y={ny}
              width={NW} height={NH}
              rx={NR}
              fill={bgFill}
              stroke={borderColor}
              strokeWidth={borderWidth}
            />

            {/* ── Left accent bar ── */}
            <rect
              x={nx} y={ny}
              width={4} height={NH}
              rx={2}
              fill={node.color}
              opacity={accentOpacity}
            />

            {/* ── Type label ── */}
            <text
              x={nx + 20} y={ny + 25}
              fontSize="11"
              fontWeight="700"
              letterSpacing="0.1em"
              fontFamily="Inter, system-ui, sans-serif"
              fill={typeLabelColor}
            >
              {node.typeLabel}
            </text>

            {/* ── Provider logo (AI agents only) ── */}
            {node.provider && renderProviderLogo(node.id, nx + NW - 30, ny + 10)}

            {/* ── Node name ── */}
            <text
              x={nx + 20} y={ny + 53}
              fontSize="22"
              fontWeight="600"
              letterSpacing="-0.01em"
              fontFamily="Inter, system-ui, sans-serif"
              fill={titleColor}
            >
              {node.shortName}
            </text>

            {/* ── Model line ── */}
            <text
              x={nx + 20} y={ny + 80}
              fontSize="12"
              fontFamily="'JetBrains Mono', 'Fira Mono', monospace"
              fill={metaColor}
            >
              {node.model}
            </text>

            {/* ── Status indicator ── */}
            {state === "active" && (
              <>
                <circle cx={nx + NW - 20} cy={ny + NH - 20} r={6} fill={node.color} />
                <circle cx={nx + NW - 20} cy={ny + NH - 20} r={6}
                  fill="none" stroke={node.color} strokeWidth={1}
                  className="pulse-ring"
                />
              </>
            )}
            {state === "complete" && (
              <text
                x={nx + NW - 20} y={ny + NH - 13}
                fontSize="18"
                textAnchor="middle"
                fontFamily="Inter, system-ui, sans-serif"
                fill="#4ade80"
              >
                ✓
              </text>
            )}
            </g>
          );
        })}
      </g>

      {/* ── Row labels ── */}
      <text x="12" y={R1Y} fontSize="12" fontWeight="700" letterSpacing="0.1em"
        fontFamily="Inter, system-ui, sans-serif" fill="#F7F8F0" textAnchor="middle"
        transform={`rotate(-90,12,${R1Y})`}>
        RESEARCH
      </text>
      <text x="12" y={R2Y} fontSize="12" fontWeight="700" letterSpacing="0.1em"
        fontFamily="Inter, system-ui, sans-serif" fill="#F7F8F0" textAnchor="middle"
        transform={`rotate(-90,12,${R2Y})`}>
        REVIEW
      </text>
    </svg>
  );
}

// ─── Node detail panel ────────────────────────────────────────────────────────

function NodeDetailPanel({ nodeId, snapshot }: { nodeId: WorkflowNode; snapshot: RunSnapshot | null }) {
  const node    = NODES.find((n) => n.id === nodeId)!;
  const visited = new Set(snapshot?.workflow_trace ?? []);
  const active  = snapshot?.current_node ?? null;
  if (snapshot && snapshot.approval_status !== "not_requested") visited.add("human_in_the_loop");
  const state = getNodeState(nodeId, active, visited);
  const last  = snapshot?.attempts[snapshot.attempts.length - 1] ?? null;

  const content: Partial<Record<WorkflowNode, ReactNode>> = {
    hypothesis_agent: last ? (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ margin: 0, fontSize: "0.88rem", fontWeight: 600 }}>{last.factor_spec.name}</p>
        <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.5 }}>{last.factor_spec.thesis}</p>
        <div className="expr-block">{last.factor_spec.expression}</div>
      </div>
    ) : null,
    coding_agent: last ? (
      <div className="code-block" style={{ maxHeight: 200 }}>{last.generated_code.script}</div>
    ) : null,
    execution_tool: last ? (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
        {Object.entries(last.execution_result.metrics).slice(0, 6).map(([k, v]) => (
          <div key={k} className="metric-chip">
            <p className="section-label" style={{ marginBottom: 3 }}>{k.replaceAll("_", " ")}</p>
            <p style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600, fontFamily: "monospace" }}>{fmtMetric(v)}</p>
          </div>
        ))}
      </div>
    ) : null,
    factor_critic: last ? (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text)", lineHeight: 1.5 }}>{last.critique.summary}</p>
        <div className="panel-elevated" style={{ padding: "10px 12px" }}>
          <p className="section-label" style={{ marginBottom: 4 }}>Root Cause</p>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted)" }}>{last.critique.root_cause}</p>
        </div>
      </div>
    ) : null,
  };

  return (
    <div className="panel animate-fade-up" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 10, height: 10, borderRadius: 2, background: node.color, flexShrink: 0 }} />
        <h3 style={{ margin: 0, fontSize: "0.88rem", fontWeight: 600 }}>{node.label}</h3>
        <span className={state === "active" ? "badge-accent" : state === "complete" ? "badge-success" : "badge-neutral"}>
          {state}
        </span>
        {node.provider && (
          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{node.provider} · {node.model}</span>
        )}
      </div>
      {content[nodeId] ?? (
        <p style={{ fontSize: "0.82rem", color: "var(--subtle)", margin: 0 }}>
          {state === "pending" ? "Not yet reached in this run." : "No output captured for this node."}
        </p>
      )}
    </div>
  );
}

// ─── WorkflowGraphView ────────────────────────────────────────────────────────

export function WorkflowGraphView({ snapshot }: { snapshot: RunSnapshot | null }) {
  const [selectedId, setSelectedId]   = useState<WorkflowNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<WorkflowNode | null>(null);
  const revisionActive = (snapshot?.attempt ?? 0) > 1;
  const attempt = snapshot?.attempt ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="panel" style={{ padding: "18px 20px 16px" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div>
              <p className="eyebrow" style={{ margin: 0 }}>Live Orchestration</p>
              <h2 style={{ margin: "2px 0 0", fontSize: "1rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
                Agentic Research Pipeline
              </h2>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {attempt > 0 && (
              <span style={{
                fontSize: "0.72rem", fontFamily: "monospace",
                color: "var(--muted)", background: "var(--raised)",
                padding: "2px 8px", borderRadius: 4,
              }}>
                attempt {attempt}
              </span>
            )}
            {revisionActive && <span className="badge-warning">Revision Active</span>}
            {snapshot?.current_node && <span className="badge-accent">Running</span>}
          </div>
        </div>

        {/* ── SVG Graph ── */}
        <DiagramSVG
          snapshot={snapshot}
          hoveredNode={hoveredNode}
          setHoveredNode={setHoveredNode}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
        />

        {/* ── Legend ── */}
        <div style={{
          display: "flex", alignItems: "center", flexWrap: "wrap",
          gap: "6px 20px", marginTop: 14, paddingTop: 12,
          borderTop: "1px solid var(--border)",
        }}>
          {[
            { bg: "#2a4462", border: "#355872", label: "Pending" },
            { bg: "#9CD5FF", border: "#9CD5FF", label: "Active" },
            { bg: "#4ade80", border: "#4ade80", label: "Complete" },
          ].map(({ bg, border, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: bg, border: `1px solid ${border}`, flexShrink: 0 }} />
              <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{label}</span>
            </div>
          ))}
          {[
            { color: "#4285f4", label: "Gemini (Google)" },
            { color: "#fb923c", label: "Claude (Anthropic)" },
            { color: "#a78bfa", label: "DeepSeek" },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 3, height: 13, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{label}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 18, height: 0, borderTop: "1.5px dashed #fbbf24", opacity: 0.7, flexShrink: 0 }} />
            <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Revision arc</span>
          </div>
        </div>
      </div>

      {selectedId && <NodeDetailPanel nodeId={selectedId} snapshot={snapshot} />}
    </div>
  );
}
