# AlphaGraph — Autonomous Quantitative Factor Research

> *An agentic AI system that proposes, codes, tests, and critiques trading strategies — with a human in the loop before anything is finalized.*

---

## What is AlphaGraph?

AlphaGraph automates the most time-consuming part of quantitative finance research: the iterative cycle of forming a hypothesis, writing code to test it, running the backtest, and deciding whether the idea holds up. A quant researcher typically spends days — or weeks — on this loop. AlphaGraph collapses it to minutes by deploying three specialized AI agents supervised by a deterministic orchestrator that routes work and enforces quality gates.

Its name comes from the interactive live graph visualization that makes the multi-agent workflow tangible and debuggable in real time — every node lights up as it executes, and the back-edge revision arc animates whenever the pipeline loops.

---

## Using AlphaGraph

The app is a resizable split-panel workspace. The left panel controls the research run; the right panel displays the artifacts.

**Essential Steps**

1. **Enter a Research Brief.** Type a natural-language description of the factor (e.g., "Test a 20-day momentum factor normalized by sector-relative volatility"). This brief shapes the research plan, candidate pool, and quality criteria.

2. **Upload a Dataset.** Provide a CSV file with at minimum `date`, `ticker`, and `close` columns. The system validates schema and data quality before proceeding. Alternatively, use the **Suggest from Kaggle** button — AlphaGraph queries Claude to extract a search term from your brief and returns matching Kaggle datasets ready to use with one click.

3. **Run the Pipeline.** Click **Run Research**. The backend starts immediately and returns a run ID; the frontend polls for live updates every 2 seconds. The workflow progress bar and the **Workflow Graph** tab both update in real time as each node completes.

4. **Inject Researcher Guidance (Optional).** While the pipeline is running, a **Researcher Guidance** panel appears. Type natural-language instructions — "try longer windows", "switch to momentum", "add volatility normalization" — and click **Send**. The next revision or candidate generation step picks them up and adapts accordingly.

5. **Review Revision Checkpoints.** Before each factor revision, the pipeline **pauses** and surfaces the current attempt's full artifact — factor spec, generated code, backtest metrics, and critique. Click **Continue to Revision** to approve the revision, or **Skip to Next Candidate** to move on without revising this one.

6. **Final Approval.** When the best surviving candidate clears all quality gates, the pipeline pauses for a final review. Inspect the complete artifact in the right panel — the persistent attempt navigator in the sidebar lets you compare all prior attempts side by side, across every tab (Factor, Code, Metrics, Critique). Click **Approve Result** to write the research package to disk, or **Reject** to discard.

---

## Reproducibility and Technical Architecture

AlphaGraph runs a resilient, state-machine-driven multi-agent workflow managed by LangGraph.

### The Agentic Pipeline Stages

The graph handles dataset validation, multi-candidate generation, granular repair loops, and two tiers of human checkpoints.

**Ingest Brief / Dataset & Parse Plan**
Structured intent is extracted from the brief (signal direction, sector neutrality, lookback hints) using Google Gemini 2.5 Flash to create a `ResearchPlan` that governs quality criteria and iteration budgets. The uploaded CSV is validated for sufficient breadth — ticker count, date range, required columns — before execution proceeds.

**Generate Candidates**
Produces a pool of four prioritized factor candidates (name, thesis, expression) tuned to the inferred signal intent (momentum, mean-reversion, or volatility-adjusted reversal). If researcher guidance was injected before this step, the intent can be overridden — e.g., guidance containing "momentum" or "trend" flips a reversal plan to a momentum plan.

**Code Generation**
Translates the active candidate into a runnable Python backtest script using Anthropic Claude Sonnet 4. The coding agent receives the real column profile of the uploaded dataset and adapts the script accordingly, rather than assuming a fixed schema.

**Execution Sandbox**
Runs the generated script in an isolated subprocess with scoped environment variables, calculating Sharpe ratio, annual return, IC mean, maximum drawdown, turnover, and trade count against the user-provided data.

**Evaluate Results**
Scores the backtest output against deterministic quality gates (execution success, methodology correctness, risk-adjusted return thresholds, breadth minimums) using DeepSeek Reasoner. If the factor passes, it is marked reviewable and the pipeline moves toward the final human checkpoint. If it fails, the Supervisor applies a repair loop.

**Repair Loops**

- *Code Fix* — if the script threw a runtime error, the pipeline retries code generation for the same candidate (up to the per-candidate fix budget).
- *Interim Human Review* — if the factor ran but underperformed, the pipeline **pauses** before committing to a revision, surfacing the full attempt artifact for researcher inspection. The researcher can inject guidance at this point, then approve the revision or skip to the next candidate.
- *Factor Revision* — if the researcher approves the revision, a new candidate is generated by adapting the expression (flipping direction, adding volatility normalization, extending the lookback window), incorporating any injected guidance.

**Finalize**
Interrupts for the final human review when at least one reviewable candidate survives. The best candidate is selected by quality rank, then OOS Sharpe, then drawdown. After approval, the run writes a structured artifact bundle — generated code, execution results, attempt snapshots, and the final report — to `artifacts/<run-id>/`.

### Key Technical Innovations

**Async Non-Blocking Execution**
`graph.invoke` runs in a daemon thread so the HTTP response returns immediately after run creation. The frontend polls `GET /runs/{run_id}` every 2 seconds, reading live LangGraph checkpoints via `get_state`. An anti-regression guard on the client ensures the workflow trace and attempt list never roll back when a checkpoint races with a stale read.

**Mid-Run Researcher Guidance**
A `POST /runs/{run_id}/guidance` endpoint writes natural-language notes into an in-memory store keyed by run ID. `generate_candidates` and `revise_factor` read from this store and apply keyword-based overrides — momentum/trend, reversal/contrarian, volatility normalization, longer lookback — before generating the next factor. Guidance persists across the full run so every subsequent revision benefits from it.

**Two-Tier Human-in-the-Loop**
LangGraph's `interrupt()` primitive pauses execution mid-graph and resumes cleanly with `Command(resume=value)`. AlphaGraph uses this at two distinct points: an *interim checkpoint* before each factor revision (so the researcher can inspect and guide each attempt) and a *final checkpoint* before the research package is written to disk. When the user approves or rejects, the backend resumes the graph in a background thread (non-blocking HTTP response) and restarts the frontend polling loop.

**Candidate Pool Architecture**
The system maintains a pool of factor candidates tested sequentially, each with its own code-fix and revision budget. Rather than discarding earlier attempts, AlphaGraph tracks all reviewable candidates and selects the best survivor — ranked by quality tier, then risk-adjusted return — for the final review. The persistent attempt navigator in the Artifacts panel lets researchers browse every attempt across all tabs without losing context.

**Multi-Provider LLM Routing**
Three frontier LLMs are orchestrated — Gemini 2.5 Flash for plan parsing and candidate generation, Claude Sonnet 4 for code generation, DeepSeek Reasoner for evaluation — each assigned to the task it is best suited for. Providers are fully swappable through environment variables. A `ResilientLLMProvider` wrapper allows the pipeline to fall back to a deterministic demo provider if any API key is missing, so the full end-to-end loop runs offline.

**LangGraph SQLite Checkpointing**
State is checkpointed after every node. Runs can resume exactly where they stopped after a crash or a long human review. The SQLite connection is opened with `check_same_thread=False`, allowing `get_state` reads from the polling thread while `invoke` runs in the background thread.

**Deterministic Quality Gates**
The evaluator uses rule-based scoring — not just LLM judgment — to catch methodological issues such as look-ahead bias, insufficient breadth, or high turnover, with thresholds driven by the `ResearchPlan`.

**Subprocess Isolation**
Generated code runs in an isolated subprocess with scoped environment variables, preventing AI-generated code from accessing anything outside approved data paths.

**Live SVG Workflow Graph**
The Workflow Graph tab renders the agent pipeline as an interactive SVG DAG. Each node — color-coded by role (blue for the Hypothesis Agent, orange for the Coding Agent, purple for the Factor Critic, yellow for Human-in-the-Loop, green for Finalize) — activates with a glow and animated dash as the workflow progresses. Completed nodes turn green. The back-edge revision arc animates amber when a revision loop is active. Clicking any node opens a live detail panel showing the most recent output from that agent.

**Artifact Persistence**
Every run produces a structured artifact directory:
```
artifacts/<run-id>/
  attempt-1/generated_strategy.py
  attempt-1/execution_result.json
  attempt-1/attempt_snapshot.json
  attempt-2/...
  normalized_dataset.csv
  final_report.json
```

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Tailwind CSS |
| Backend | FastAPI + LangGraph + SQLite |
| Orchestration | LangGraph `StateGraph` with `interrupt` / `resume` |
| Plan & Candidate Agent | Google Gemini 2.5 Flash |
| Coding Agent | Anthropic Claude Sonnet 4 |
| Evaluation Agent | DeepSeek Reasoner |
| Execution | Python subprocess sandbox |
| Data | User-uploaded long-format CSV (`date`, `ticker`, `close`) |
| Dataset Discovery | Kaggle API + Claude-generated search query (optional) |
| Workflow Visualization | Interactive SVG DAG with live state projection |
| Packaging | Docker + Docker Compose |

---

[GitHub](https://github.com/JayantDeveloper/AlphaGraph) · [Demo Video](https://youtu.be/sWx4UXE1rq8)
