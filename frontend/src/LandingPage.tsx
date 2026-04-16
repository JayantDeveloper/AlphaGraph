import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BrandLogo } from "./BrandLogo";
import { MarketingFooter, MarketingNav } from "./MarketingShell";

// ─── Fade-in hook ─────────────────────────────────────────────────────────────

function useFadeIn(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, visible };
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconBrain() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3L9.5 2" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3L14.5 2" />
    </svg>
  );
}

function IconZap() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function IconLoop() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

const HERO_STEPS = ["Supervisor", "Hypothesis", "Coding", "Execution", "Critic", "Approval", "Finalize"];

function HeroSection() {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActiveStep((s) => (s + 1) % HERO_STEPS.length), 1400);
    return () => clearInterval(id);
  }, []);

  return (
    <section
      className="bg-grid"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "100px 24px 80px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Radial glow backdrop */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 700,
          height: 500,
          background: "radial-gradient(ellipse at center, rgba(156,213,255,0.07) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ maxWidth: 780, width: "100%", textAlign: "center", position: "relative" }}>
        {/* Headline */}
        <h1
          style={{
            margin: "0 0 20px",
            fontSize: "clamp(2.4rem, 5vw, 3.6rem)",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            color: "var(--text)",
          }}
        >
          From idea to{" "}
          <span
            style={{
              color: "var(--accent)",
              textShadow: "0 0 40px rgba(156,213,255,0.35)",
            }}
          >
            alpha factor
          </span>
          <br />in one prompt.
        </h1>

        {/* Sub */}
        <p
          style={{
            margin: "0 auto 36px",
            fontSize: "1.05rem",
            color: "var(--muted)",
            lineHeight: 1.65,
            maxWidth: 560,
          }}
        >
          AlphaGraph orchestrates a pipeline of AI agents to generate, test, critique, and refine
          quantitative equity factors — automatically. You stay in control at every step.
        </p>

        {/* CTAs */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => navigate("/app")}
            style={{
              padding: "12px 28px",
              background: "var(--accent)",
              color: "#0d1117",
              border: "none",
              borderRadius: 10,
              fontSize: "0.95rem",
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "filter 150ms ease, transform 150ms ease, box-shadow 150ms ease",
              boxShadow: "0 4px 24px rgba(156,213,255,0.2)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget.style.filter = "brightness(1.1)");
              (e.currentTarget.style.transform = "translateY(-2px)");
              (e.currentTarget.style.boxShadow = "0 8px 32px rgba(156,213,255,0.3)");
            }}
            onMouseLeave={(e) => {
              (e.currentTarget.style.filter = "brightness(1)");
              (e.currentTarget.style.transform = "translateY(0)");
              (e.currentTarget.style.boxShadow = "0 4px 24px rgba(156,213,255,0.2)");
            }}
          >
            Try Now <IconArrowRight />
          </button>
          <a
            href="/docs"
            style={{
              padding: "12px 28px",
              background: "transparent",
              color: "var(--text)",
              border: "1px solid var(--border-strong)",
              borderRadius: 10,
              fontSize: "0.95rem",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "border-color 150ms ease, background 150ms ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget.style.borderColor = "var(--accent)");
              (e.currentTarget.style.background = "rgba(156,213,255,0.04)");
            }}
            onMouseLeave={(e) => {
              (e.currentTarget.style.borderColor = "var(--border-strong)");
              (e.currentTarget.style.background = "transparent");
            }}
          >
            Read Docs <IconChevronRight />
          </a>
        </div>

        {/* Animated workflow bar */}
        <div
          style={{
            marginTop: 56,
            padding: "14px 20px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            gap: 0,
            boxShadow: "0 8px 40px rgba(0,0,0,0.3)",
          }}
        >
          {HERO_STEPS.map((label, i) => {
            const isActive = i === activeStep;
            const isComplete = i < activeStep;
            const isLast = i === HERO_STEPS.length - 1;
            return (
              <div key={label} style={{ display: "flex", alignItems: "center", flex: isLast ? "none" : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      border: `1.5px solid ${isActive ? "var(--accent)" : isComplete ? "var(--success)" : "var(--border-strong)"}`,
                      background: isActive ? "rgba(156,213,255,0.1)" : isComplete ? "rgba(74,222,128,0.1)" : "var(--surface)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: isActive ? "var(--accent)" : "var(--success)",
                      boxShadow: isActive ? "0 0 0 3px rgba(156,213,255,0.15)" : "none",
                      transition: "all 400ms ease",
                    }}
                  >
                    {isComplete && <IconCheck />}
                    {isActive && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)" }} />}
                  </div>
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? "var(--accent)" : isComplete ? "var(--text)" : "var(--subtle)",
                      whiteSpace: "nowrap",
                      transition: "color 400ms ease",
                    }}
                  >
                    {label}
                  </span>
                </div>
                {!isLast && (
                  <div
                    style={{
                      flex: 1,
                      height: 1,
                      background: isComplete ? "rgba(74,222,128,0.3)" : "var(--border)",
                      margin: "0 6px",
                      transition: "background 400ms ease",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <p style={{ marginTop: 10, fontSize: "0.72rem", color: "var(--subtle)" }}>
          Live pipeline — 7-stage agentic workflow running end-to-end
        </p>
      </div>
    </section>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: <IconBrain />,
    color: "rgba(156,213,255,0.12)",
    border: "rgba(156,213,255,0.2)",
    tint: "var(--accent)",
    title: "AI Hypothesis Generation",
    desc: "A dedicated hypothesis agent proposes factor specifications — name, expression, thesis, universe, and rebalance frequency — grounded in quantitative finance theory.",
  },
  {
    icon: <IconZap />,
    color: "rgba(251,191,36,0.1)",
    border: "rgba(251,191,36,0.2)",
    tint: "var(--warning)",
    title: "Automated Backtesting",
    desc: "A coding agent writes a production-quality backtest script. An execution agent runs it against real equity data and captures Sharpe, drawdown, IC, and more.",
  },
  {
    icon: <IconLoop />,
    color: "rgba(74,222,128,0.08)",
    border: "rgba(74,222,128,0.18)",
    tint: "var(--success)",
    title: "Critic-Driven Revision Loop",
    desc: "A critic agent evaluates each result and decides whether to approve or request a revision. The loop continues until quality thresholds are met or max attempts are reached.",
  },
  {
    icon: <IconShield />,
    color: "rgba(248,113,113,0.08)",
    border: "rgba(248,113,113,0.18)",
    tint: "var(--danger)",
    title: "Human Approval Gate",
    desc: "Before anything is saved, your approval is required. Review the final factor, metrics, and critique summary — then approve or reject with a single click.",
  },
];

function FeaturesSection() {
  const { ref, visible } = useFadeIn();

  return (
    <section id="features" style={{ padding: "100px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <p className="eyebrow" style={{ marginBottom: 12 }}>What it does</p>
          <h2
            style={{
              margin: "0 auto 16px",
              fontSize: "clamp(1.8rem, 3vw, 2.4rem)",
              fontWeight: 800,
              letterSpacing: "-0.025em",
              color: "var(--text)",
            }}
          >
            A full research pipeline, automated
          </h2>
          <p style={{ fontSize: "1rem", color: "var(--muted)", maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>
            Every stage from ideation to finalization is handled by purpose-built AI agents working in concert.
          </p>
        </div>

        <div
          ref={ref}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(24px)",
            transition: "opacity 0.5s ease, transform 0.5s ease",
          }}
        >
          {FEATURES.map((f) => (
            <div
              key={f.title}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                transition: "border-color 200ms ease, transform 200ms ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget.style.borderColor = f.border);
                (e.currentTarget.style.transform = "translateY(-2px)");
              }}
              onMouseLeave={(e) => {
                (e.currentTarget.style.borderColor = "var(--border)");
                (e.currentTarget.style.transform = "translateY(0)");
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: f.color,
                  border: `1px solid ${f.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: f.tint,
                }}
              >
                {f.icon}
              </div>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.01em" }}>
                {f.title}
              </h3>
              <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--muted)", lineHeight: 1.6 }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Demo Preview ─────────────────────────────────────────────────────────────

const DEMO_LABELS = ["Supervisor","Hypothesis","Coding","Execution","Critic","Approval","Finalize"];
const DEMO_NODES  = ["supervisor","hypothesis_agent","coding_agent","execution_tool","factor_critic","human_in_the_loop","finalize_run"];
const DEMO_MSGS   = [
  "Orchestrating research pipeline…",
  "Generating factor hypothesis…",
  "Writing backtest script…",
  "Running backtest on equity data…",
  "Critiquing factor performance…",
  "Awaiting human approval…",
  "Saving artifact bundle…",
];

function DemoSection() {
  const { ref: fadeRef, visible } = useFadeIn(0.08);

  // animStep: -1 = idle/between runs, 0–6 = step active, 7 = complete
  const [animStep, setAnimStep] = useState(-1);
  const [sharpe,   setSharpe]   = useState(0);
  const [annRet,   setAnnRet]   = useState(0);
  const [maxDD,    setMaxDD]    = useState(0);

  // Drive the looping pipeline animation
  useEffect(() => {
    if (!visible) return;
    let t: ReturnType<typeof setTimeout>;

    function run(step: number) {
      if (step === 0) { setSharpe(0); setAnnRet(0); setMaxDD(0); }
      setAnimStep(step);
      if (step < 7) {
        t = setTimeout(() => run(step + 1), 680);
      } else {
        // Hold "complete" state, then idle briefly before looping
        t = setTimeout(() => {
          setAnimStep(-1);
          t = setTimeout(() => run(0), 900);
        }, 3500);
      }
    }

    t = setTimeout(() => run(0), 700);
    return () => clearTimeout(t);
  }, [visible]);

  // Count-up metrics when run completes
  useEffect(() => {
    if (animStep !== 7) return;
    let s = 0;
    const N = 50;
    const timer = setInterval(() => {
      s++;
      const e = 1 - Math.pow(1 - s / N, 3);
      setSharpe(+(1.42 * e).toFixed(2));
      setAnnRet(+(18.3 * e).toFixed(1));
      setMaxDD(+(12.1 * e).toFixed(1));
      if (s >= N) clearInterval(timer);
    }, 28);
    return () => clearInterval(timer);
  }, [animStep]);

  const isComplete = animStep === 7;
  const isRunning  = animStep >= 0 && animStep < 7;
  const status     = isComplete ? "completed" : isRunning ? "running" : "idle";

  const stepSt = (i: number): "complete" | "active" | "pending" =>
    isComplete || i < animStep ? "complete" : i === animStep ? "active" : "pending";

  const metaPhase    = isComplete ? "finalized"    : isRunning ? "running"                  : "idle";
  const metaNode     = isComplete ? "finalize_run" : isRunning ? DEMO_NODES[animStep] : "—";
  const metaDecision = isComplete ? "approved"     : "—";

  return (
    <section style={{ padding: "100px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <p className="eyebrow" style={{ marginBottom: 12 }}>Live example</p>
          <h2 style={{ margin: "0 auto 16px", fontSize: "clamp(1.8rem, 3vw, 2.4rem)", fontWeight: 800, letterSpacing: "-0.025em", color: "var(--text)" }}>
            See a completed research run
          </h2>
          <p style={{ fontSize: "1rem", color: "var(--muted)", maxWidth: 460, margin: "0 auto", lineHeight: 1.6 }}>
            This is what a finalized factor looks like inside AlphaGraph — metrics, code, and critique all in one place.
          </p>
        </div>

        {/* Mock app UI */}
        <div
          ref={fadeRef}
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0) scale(1)" : "translateY(32px) scale(0.98)",
            transition: "opacity 0.6s ease, transform 0.6s ease",
          }}
        >
          {/* Browser chrome */}
          <div style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: "12px 12px 0 0", padding: "10px 14px", display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "rgba(248,113,113,0.6)" }} />
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "rgba(251,191,36,0.5)" }} />
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "rgba(74,222,128,0.5)" }} />
            <div style={{ marginLeft: 8, flex: 1, maxWidth: 320, background: "var(--raised)", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 10px", fontSize: "0.72rem", color: "var(--subtle)" }}>
              alphagraph.local
            </div>
          </div>

          <div style={{ background: "var(--surface)", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
            {/* Top bar */}
            <div style={{ height: 48, display: "flex", alignItems: "center", gap: 16, padding: "0 20px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <BrandLogo size={22} radius={6} />
                <span style={{ fontWeight: 700, fontSize: "0.82rem" }}>AlphaGraph</span>
              </div>
              <div style={{ display: "flex", gap: 2, background: "var(--raised)", border: "1px solid var(--border)", borderRadius: 7, padding: 2 }}>
                <div style={{ padding: "4px 12px", borderRadius: 5, background: "var(--elevated)", fontSize: "0.75rem", fontWeight: 500, color: "var(--text)" }}>Research Run</div>
                <div style={{ padding: "4px 12px", fontSize: "0.75rem", fontWeight: 500, color: "var(--muted)" }}>Workflow Graph</div>
              </div>
              <div style={{ flex: 1 }} />
              {/* Animated status pill */}
              <div style={{
                display: "flex", alignItems: "center", gap: 6, padding: "3px 9px", borderRadius: 99,
                background: isComplete ? "var(--success-dim)" : isRunning ? "rgba(156,213,255,0.08)" : "var(--raised)",
                border: `1px solid ${isComplete ? "rgba(74,222,128,0.2)" : isRunning ? "rgba(156,213,255,0.2)" : "var(--border)"}`,
                transition: "background 400ms ease, border-color 400ms ease",
              }}>
                <div style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: isComplete ? "var(--success)" : isRunning ? "var(--accent)" : "var(--subtle)",
                  boxShadow: isRunning ? "0 0 6px var(--accent)" : "none",
                  animation: isRunning ? "pulse-dot 1.4s ease-in-out infinite" : "none",
                  transition: "background 300ms ease",
                }} />
                <span style={{ fontSize: "0.68rem", fontWeight: 500, color: isComplete ? "var(--success)" : isRunning ? "var(--accent)" : "var(--subtle)", transition: "color 300ms ease" }}>
                  {status}
                </span>
              </div>
            </div>

            {/* Animated workflow bar */}
            <div style={{ height: 38, display: "flex", alignItems: "center", padding: "0 20px", background: "var(--bg)", borderBottom: "1px solid var(--border)", gap: 0 }}>
              {DEMO_LABELS.map((label, i) => {
                const st = stepSt(i);
                const isLast = i === DEMO_LABELS.length - 1;
                return (
                  <div key={label} style={{ display: "flex", alignItems: "center", flex: isLast ? "none" : 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <div style={{
                        width: 13, height: 13, borderRadius: "50%",
                        background: st === "complete" ? "rgba(74,222,128,0.1)" : st === "active" ? "rgba(156,213,255,0.1)" : "var(--surface)",
                        border: `1.5px solid ${st === "complete" ? "var(--success)" : st === "active" ? "var(--accent)" : "var(--border-strong)"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: st === "complete" ? "var(--success)" : "var(--accent)",
                        boxShadow: st === "active" ? "0 0 0 3px rgba(156,213,255,0.15)" : "none",
                        transition: "all 300ms ease",
                      }}>
                        {st === "complete" && <IconCheck />}
                        {st === "active" && <div style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--accent)", animation: "pulse-dot 1.4s ease-in-out infinite" }} />}
                      </div>
                      <span style={{ fontSize: "0.64rem", fontWeight: st === "active" ? 600 : 500, color: st === "complete" ? "var(--text)" : st === "active" ? "var(--accent)" : "var(--subtle)", whiteSpace: "nowrap", transition: "color 300ms ease" }}>
                        {label}
                      </span>
                    </div>
                    {!isLast && (
                      <div style={{ flex: 1, height: 1, background: st === "complete" ? "rgba(74,222,128,0.3)" : "var(--border)", margin: "0 5px", transition: "background 400ms ease" }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Main content */}
            <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", minHeight: 340 }}>
              {/* Left panel */}
              <div style={{ borderRight: "1px solid var(--border)", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ background: "var(--raised)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                  <p style={{ fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent)", margin: "0 0 6px" }}>Research Brief</p>
                  <p style={{ fontSize: "0.75rem", color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>Test a momentum-quality blend factor on cross-sectional equities data.</p>
                </div>
                <div style={{ background: "var(--raised)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                  <p style={{ fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", margin: "0 0 6px" }}>Controls</p>
                  <div style={{
                    background: isRunning ? "var(--raised)" : "var(--accent)",
                    color: isRunning ? "var(--muted)" : "#0d1117",
                    borderRadius: 6, padding: "6px 10px", textAlign: "center", fontSize: "0.75rem", fontWeight: 700,
                    transition: "background 400ms ease, color 400ms ease",
                  }}>
                    {isRunning ? "Running…" : "Run Research"}
                  </div>
                </div>
                {/* Animated metadata */}
                <div style={{ background: "var(--raised)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
                  {[{ l: "Phase", v: metaPhase }, { l: "Node", v: metaNode }, { l: "Decision", v: metaDecision }].map(({ l, v }) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderTop: l !== "Phase" ? "1px solid var(--border)" : "none" }}>
                      <span style={{ fontSize: "0.68rem", color: "var(--muted)" }}>{l}</span>
                      <span style={{
                        fontSize: "0.68rem", fontFamily: "monospace",
                        color: v === "finalized" || v === "approved" ? "var(--success)" : v === "running" ? "var(--accent)" : "var(--text)",
                        transition: "color 300ms ease",
                      }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right panel */}
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <p style={{ fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent)", margin: 0 }}>Artifact</p>
                  <div style={{ display: "flex", gap: 2, background: "var(--raised)", border: "1px solid var(--border)", borderRadius: 6, padding: 2 }}>
                    {["Factor","Code","Metrics","Critique","Final"].map((tab, i) => (
                      <div key={tab} style={{ padding: "3px 9px", borderRadius: 4, background: i === 4 ? "var(--elevated)" : "transparent", fontSize: "0.68rem", fontWeight: i === 4 ? 600 : 400, color: i === 4 ? "var(--text)" : "var(--muted)" }}>{tab}</div>
                    ))}
                  </div>
                </div>

                {isRunning ? (
                  /* Running state — spinner + current step message */
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
                    <div style={{ width: 36, height: 36, animation: "spin 1s linear infinite" }}>
                      <svg width="36" height="36" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="14" fill="none" stroke="var(--border)" strokeWidth="2.5"/>
                        <circle cx="18" cy="18" r="14" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeDasharray="22 66" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <p style={{ margin: "0 0 4px", fontSize: "0.82rem", fontWeight: 600, color: "var(--accent)" }}>
                        {DEMO_MSGS[animStep]}
                      </p>
                      <p style={{ margin: 0, fontSize: "0.7rem", color: "var(--subtle)" }}>
                        {DEMO_LABELS[animStep]} · step {animStep + 1} of 7
                      </p>
                    </div>
                  </div>
                ) : (
                  /* Complete / idle state — final artifact */
                  <>
                    <div style={{ background: "var(--success-dim)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 9, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(74,222,128,0.15)", border: "1.5px solid var(--success)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--success)", flexShrink: 0 }}>
                        <IconCheck />
                      </div>
                      <div>
                        <p style={{ margin: "0 0 2px", fontSize: "0.82rem", fontWeight: 700, color: "var(--success)" }}>Run Finalized</p>
                        <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--muted)" }}>Factor approved and artifact bundle saved</p>
                      </div>
                    </div>

                    <div>
                      <p style={{ fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted)", margin: "0 0 5px" }}>Approved Factor</p>
                      <p style={{ margin: "0 0 6px", fontSize: "0.88rem", fontWeight: 700, color: "var(--text)" }}>Momentum-Quality Blend</p>
                      <div style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 5, padding: "7px 10px", fontFamily: "monospace", fontSize: "0.74rem", color: "var(--accent)" }}>
                        rank(close / close.shift(20)) * rank(net_income / total_assets)
                      </div>
                    </div>

                    {/* Counting metrics */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                      {[
                        { label: "Sharpe Ratio",  value: isComplete ? sharpe.toFixed(2) : "1.42" },
                        { label: "Annual Return", value: isComplete ? `+${annRet.toFixed(1)}%` : "+18.3%" },
                        { label: "Max Drawdown",  value: isComplete ? `−${maxDD.toFixed(1)}%` : "−12.1%" },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ background: "var(--raised)", border: "1px solid var(--border)", borderRadius: 7, padding: "9px 11px" }}>
                          <p style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", margin: "0 0 4px" }}>{label}</p>
                          <p style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, fontFamily: "monospace", color: "var(--text)" }}>{value}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Bottom rounding */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 12px 12px", height: 8 }} />
        </div>
      </div>
    </section>
  );
}

// ─── CTA ─────────────────────────────────────────────────────────────────────

function CTASection() {
  const navigate = useNavigate();
  const { ref, visible } = useFadeIn(0.15);

  return (
    <section style={{ padding: "80px 24px 100px" }}>
      <div
        ref={ref}
        style={{
          maxWidth: 680,
          margin: "0 auto",
          textAlign: "center",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(24px)",
          transition: "opacity 0.5s ease, transform 0.5s ease",
        }}
      >
        <div
          style={{
            padding: "52px 40px",
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 20,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Glow accent */}
          <div
            style={{
              position: "absolute",
              top: "-60%",
              left: "50%",
              transform: "translateX(-50%)",
              width: 400,
              height: 300,
              background: "radial-gradient(ellipse at center, rgba(156,213,255,0.08) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />

          <p className="eyebrow" style={{ marginBottom: 16 }}>Get started</p>
          <h2
            style={{
              margin: "0 0 16px",
              fontSize: "clamp(1.6rem, 3vw, 2.2rem)",
              fontWeight: 800,
              letterSpacing: "-0.025em",
              color: "var(--text)",
              lineHeight: 1.15,
            }}
          >
            Ready to research your first alpha factor?
          </h2>
          <p style={{ fontSize: "0.95rem", color: "var(--muted)", lineHeight: 1.6, margin: "0 auto 32px", maxWidth: 420 }}>
            Write a one-sentence brief, hit run, and let AlphaGraph do the rest. No setup required.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
            <button
              onClick={() => navigate("/app")}
              style={{
                padding: "13px 36px",
                background: "var(--accent)",
                color: "#0d1117",
                border: "none",
                borderRadius: 10,
                fontSize: "1rem",
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                alignItems: "center",
                gap: 8,
                transition: "filter 150ms ease, transform 150ms ease, box-shadow 150ms ease",
                boxShadow: "0 4px 24px rgba(156,213,255,0.22)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget.style.filter = "brightness(1.1)");
                (e.currentTarget.style.transform = "translateY(-2px)");
                (e.currentTarget.style.boxShadow = "0 8px 32px rgba(156,213,255,0.3)");
              }}
              onMouseLeave={(e) => {
                (e.currentTarget.style.filter = "brightness(1)");
                (e.currentTarget.style.transform = "translateY(0)");
                (e.currentTarget.style.boxShadow = "0 4px 24px rgba(156,213,255,0.22)");
              }}
            >
              Launch AlphaGraph <IconArrowRight />
            </button>
            <p style={{ fontSize: "0.76rem", color: "var(--subtle)", margin: 0 }}>
              No account required · Demo dataset included
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div
      className="bg-grid"
      style={{ minHeight: "100vh", background: "var(--bg)", overflowX: "hidden" }}
    >
      <MarketingNav />
      <HeroSection />
      <FeaturesSection />
      <DemoSection />
      <CTASection />
      <MarketingFooter />
    </div>
  );
}
