import { MarketingFooter, MarketingNav } from "./MarketingShell";

const DOC_SECTIONS = [
  {
    eyebrow: "Overview",
    title: "What AlphaGraph is",
    body:
      "AlphaGraph is a bounded agentic quant-research workflow. A researcher provides a brief and a stock-history CSV, and the system produces a reviewable research package instead of a trained model or a live strategy.",
  },
  {
    eyebrow: "Inputs",
    title: "What you provide",
    body:
      "Input one is a research brief describing the signal intent, such as momentum or mean reversion. Input two is a long-format CSV with required columns date, ticker, and close, plus optional open, high, low, volume, and sector columns.",
  },
  {
    eyebrow: "Workflow",
    title: "How Loop runs",
    body:
      "The backend validates the dataset, parses the brief into a constrained research plan, generates a small set of interpretable candidate formulas, materializes backtest code from a fixed template, executes locally, evaluates the results, and loops through bounded code-fix or factor-revision paths before human review.",
  },
  {
    eyebrow: "Output",
    title: "What the package contains",
    body:
      "Each run writes a research package that includes a dataset summary, parsed brief and constraints, all candidate formulas tried, generated code for each attempt, execution results, metrics, critique and revision reasons, the best surviving candidate, and final approval status.",
  },
];

const AGENTS = [
  ["Supervisor", "Deterministic routing logic for state transitions, retries, stop conditions, and the approval interrupt."],
  ["Hypothesis", "Generates a constrained factor candidate set from the research brief and dataset context."],
  ["Coding", "Fills a fixed strategy template instead of inventing a whole backtest pipeline from scratch."],
  ["Execution", "Runs the generated strategy locally against the uploaded dataset and captures structured results."],
  ["Critic", "Separates execution failures from weak factors and recommends code fixes or factor revisions."],
  ["Human Review", "Approves or rejects only after automatic attempts are complete and at least one reviewable candidate survives."],
];

const SCHEMA_ROWS = [
  ["date", "required", "Trading date in long format"],
  ["ticker", "required", "Ticker or symbol identifier"],
  ["close", "required", "Closing price used in factor computation"],
  ["open / high / low", "optional", "Additional price context for future factors"],
  ["volume", "optional", "Liquidity and turnover-aware variants"],
  ["sector", "optional", "Required only if sector-neutral research is requested"],
];

export default function DocsPage() {
  return (
    <div className="bg-grid" style={{ minHeight: "100vh", background: "var(--bg)", overflowX: "hidden" }}>
      <MarketingNav />

      <main style={{ padding: "120px 24px 80px" }}>
        <section style={{ maxWidth: 1100, margin: "0 auto 72px" }}>
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 24,
              padding: "40px 36px",
              background:
                "linear-gradient(180deg, rgba(17,30,45,0.95) 0%, rgba(12,22,34,0.92) 100%)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
            }}
          >
            <p className="eyebrow" style={{ marginBottom: 14 }}>Docs</p>
            <h1
              style={{
                margin: "0 0 18px",
                fontSize: "clamp(2.2rem, 5vw, 3.4rem)",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 1.05,
                color: "var(--text)",
                maxWidth: 760,
              }}
            >
              The current AlphaGraph setup, documented for demo and review.
            </h1>
            <p
              style={{
                margin: 0,
                maxWidth: 700,
                fontSize: "1rem",
                color: "var(--muted)",
                lineHeight: 1.7,
              }}
            >
              This page explains the current MVP exactly as it exists today: a bounded Loop workflow
              for factor research with dataset validation, controlled candidate search, execution,
              evaluation, revision, and human approval before finalization.
            </p>
          </div>
        </section>

        <section
          style={{
            maxWidth: 1100,
            margin: "0 auto 72px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
          }}
        >
          {DOC_SECTIONS.map((section) => (
            <article
              key={section.title}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 18,
                padding: "24px 22px",
              }}
            >
              <p className="eyebrow" style={{ marginBottom: 10 }}>{section.eyebrow}</p>
              <h2
                style={{
                  margin: "0 0 10px",
                  fontSize: "1.08rem",
                  fontWeight: 700,
                  color: "var(--text)",
                  letterSpacing: "-0.015em",
                }}
              >
                {section.title}
              </h2>
              <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--muted)", lineHeight: 1.7 }}>
                {section.body}
              </p>
            </article>
          ))}
        </section>

        <section
          style={{
            maxWidth: 1100,
            margin: "0 auto 72px",
            display: "grid",
            gridTemplateColumns: "1.2fr 0.8fr",
            gap: 18,
          }}
        >
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 20,
              padding: "28px 26px",
            }}
          >
            <p className="eyebrow" style={{ marginBottom: 10 }}>Workflow</p>
            <h2 style={{ margin: "0 0 18px", fontSize: "1.35rem", fontWeight: 800, color: "var(--text)" }}>
              Loop state machine
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                "ingest_brief",
                "ingest_dataset",
                "validate_dataset",
                "parse_research_plan",
                "generate_candidates",
                "generate_code",
                "execute_backtest",
                "evaluate_results",
                "human_review",
                "finalize",
              ].map((step, index) => (
                <div key={step} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      background: "rgba(156,213,255,0.08)",
                      border: "1px solid rgba(156,213,255,0.25)",
                      color: "var(--accent)",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {index + 1}
                  </div>
                  <div>
                    <p style={{ margin: "2px 0 4px", fontSize: "0.88rem", fontWeight: 700, color: "var(--text)" }}>
                      {step}
                    </p>
                    <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted)", lineHeight: 1.6 }}>
                      {step === "validate_dataset" && "Stops immediately on broken data so factor critique is never used to hide data issues."}
                      {step === "generate_candidates" && "Produces a small related search space rather than a single guess or unconstrained generation."}
                      {step === "evaluate_results" && "Explicitly separates execution failure from factor quality and decides whether revision is warranted."}
                      {step === "human_review" && "Only appears when at least one reviewable candidate survives the automatic search."}
                      {step === "finalize" && "Writes either a research package or a failed-run package."}
                      {!["validate_dataset", "generate_candidates", "evaluate_results", "human_review", "finalize"].includes(step) &&
                        "Runs as part of the bounded research workflow with traceable state and artifacts."}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 20,
              padding: "28px 26px",
            }}
          >
            <p className="eyebrow" style={{ marginBottom: 10 }}>Roles</p>
            <h2 style={{ margin: "0 0 18px", fontSize: "1.35rem", fontWeight: 800, color: "var(--text)" }}>
              Agent responsibilities
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {AGENTS.map(([name, description]) => (
                <div key={name} style={{ paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
                  <p style={{ margin: "0 0 4px", fontSize: "0.86rem", fontWeight: 700, color: "var(--text)" }}>
                    {name}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--muted)", lineHeight: 1.65 }}>
                    {description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "0.95fr 1.05fr",
            gap: 18,
          }}
        >
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 20,
              padding: "28px 26px",
            }}
          >
            <p className="eyebrow" style={{ marginBottom: 10 }}>Dataset</p>
            <h2 style={{ margin: "0 0 18px", fontSize: "1.35rem", fontWeight: 800, color: "var(--text)" }}>
              CSV schema
            </h2>
            <div style={{ display: "grid", gap: 10 }}>
              {SCHEMA_ROWS.map(([field, requirement, description]) => (
                <div
                  key={field}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 12,
                    padding: "10px 12px",
                    background: "var(--raised)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                  }}
                >
                  <div>
                    <p style={{ margin: "0 0 3px", fontSize: "0.82rem", fontWeight: 700, color: "var(--text)" }}>
                      {field}
                    </p>
                    <p style={{ margin: 0, fontSize: "0.74rem", color: "var(--muted)", lineHeight: 1.55 }}>
                      {description}
                    </p>
                  </div>
                  <span
                    style={{
                      alignSelf: "start",
                      padding: "3px 8px",
                      borderRadius: 999,
                      fontSize: "0.64rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      background: requirement === "required" ? "rgba(251,191,36,0.12)" : "rgba(156,213,255,0.08)",
                      border: requirement === "required" ? "1px solid rgba(251,191,36,0.22)" : "1px solid rgba(156,213,255,0.2)",
                      color: requirement === "required" ? "var(--warning)" : "var(--accent)",
                    }}
                  >
                    {requirement}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 20,
              padding: "28px 26px",
            }}
          >
            <p className="eyebrow" style={{ marginBottom: 10 }}>Package</p>
            <h2 style={{ margin: "0 0 18px", fontSize: "1.35rem", fontWeight: 800, color: "var(--text)" }}>
              Final deliverable
            </h2>
            <p style={{ margin: "0 0 14px", fontSize: "0.88rem", color: "var(--muted)", lineHeight: 1.7 }}>
              Loop is built to output a research package, not a trained model. That package is the object
              the researcher reviews and the artifact the judge can understand.
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--muted)", lineHeight: 1.9, fontSize: "0.84rem" }}>
              <li>dataset summary and validation result</li>
              <li>parsed brief, constraints, and success criteria</li>
              <li>every candidate formula attempted</li>
              <li>generated code and execution results for each attempt</li>
              <li>metrics, critique, and revision reasons</li>
              <li>best surviving candidate and any warnings</li>
              <li>final human approval or rejection status</li>
            </ul>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
