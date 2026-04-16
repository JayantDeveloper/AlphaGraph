# AlphaGraph — Autonomous Quantitative Factor Research

> *An agentic AI system that proposes, codes, tests, and critiques trading strategies — with a human in the loop before anything is finalized.*

---

## What is AlphaGraph?

AlphaGraph automates the most time-consuming part of quantitative finance research: the iterative cycle of forming a hypothesis, writing code to test it, running the test, and deciding whether the idea is any good.

A quant researcher typically spends days — or weeks — on this loop. AlphaGraph collapses it to minutes by deploying three specialized AI agents that each own a distinct step of the process, supervised by a deterministic orchestrator that routes work and enforces quality gates. The human researcher stays in the loop for the only decision that matters: final approval.

The system's name comes from its 3D interactive graph visualization that makes the multi-agent workflow tangible and debuggable in real time.

`[SCREENSHOT: AlphaGraph 3D workflow visualization — nodes lit up as the pipeline executes]`

---

## The Problem It Solves

Quantitative factor research is expensive, repetitive, and error-prone when done by hand:

- Writing a hypothesis, translating it to code, debugging that code, and running a backtest can take a full day per idea.
- Researchers often make methodological mistakes (e.g., using raw price levels as a factor) that are only caught late.
- Iterating based on critique requires re-doing the whole cycle from scratch.

AlphaGraph turns this into an automated feedback loop where bad ideas are caught and revised by AI before they ever reach a human reviewer.

---

## How It Works: The Agentic Pipeline

AlphaGraph runs a **state-machine-driven multi-agent workflow** managed by [LangGraph](https://github.com/langchain-ai/langgraph), a framework for building reliable, checkpointed AI pipelines. Three specialized agents — each powered by a different frontier LLM — collaborate in sequence, with a deterministic supervisor routing work between them.

`[DIAGRAM: Pipeline flow — Supervisor → Hypothesis Agent → Coding Agent → Execution Sandbox → Critic Agent → (loop or) Human Approval → Finalize]`

### The Four Stages

#### 1. Hypothesis Agent — *"What should we test?"*
- **Powered by:** Google Gemini 2.5 Flash
- **Job:** Propose a quantitative trading factor — a mathematical formula that ranks stocks by predicted future return.
- **First attempt is deliberately naive** (e.g., rank stocks by raw closing price) so the Critic can catch it and trigger improvement.
- **Output:** A structured `FactorSpec` — name, thesis, expression, trading universe, rebalance frequency, and expected direction.

#### 2. Coding Agent — *"How do we test it?"*
- **Powered by:** Anthropic Claude Sonnet 4
- **Job:** Translate the factor specification into a runnable Python backtest script.
- **The script is isolated** — it reads from environment variables and writes results to a defined output path, ensuring no side effects.
- **Output:** A complete Python file that imports the backtest engine and executes the strategy.

#### 3. Execution Sandbox — *"Does it actually work?"*
- **Powered by:** Local Python subprocess (no LLM)
- **Job:** Run the generated code in an isolated subprocess against historical market data (daily OHLCV prices for 8+ large-cap stocks).
- **Calculates:** Sharpe ratio, maximum drawdown, number of trades, and other standard performance metrics.
- **Output:** A structured JSON result with full performance statistics.

#### 4. Factor Critic Agent — *"Is it any good?"*
- **Powered by:** DeepSeek Reasoner (a dedicated reasoning model)
- **Job:** Evaluate the backtest results against five hard quality gates:

| Gate | Criterion |
|---|---|
| Execution | Script must run without errors |
| Methodology | Factor must not use raw price levels |
| Activity | At least 20 trades must be generated |
| Risk-adjusted return | Sharpe ratio ≥ 0.35 |
| Drawdown | Maximum drawdown must not exceed −25% |

- If any gate fails, the Critic writes specific revision instructions and the Supervisor loops back to the Hypothesis Agent for another attempt.
- If all gates pass, the workflow pauses for **human approval**.

#### 5. Human-in-the-Loop — *"Do we ship it?"*
- The pipeline **interrupts** and surfaces the full research artifact (factor spec, generated code, backtest metrics, critique scorecard) to the researcher.
- The researcher clicks **Approve** or **Reject**.
- If approved, the system writes a final research report to disk and marks the run complete.

---

## Key Technical Features

### Multi-Provider LLM Routing
Each agent role is assigned to the frontier model best suited for its task — a reasoning model for critique, a fast generative model for hypothesis, a code-capable model for implementation. Providers are swappable via environment variables with no code changes.

### Resilient Fallback System
Every LLM provider is wrapped in a `ResilientLLMProvider`. If an API key is missing or a call fails, the system falls back to a deterministic demo provider. **The entire pipeline runs offline without any API keys**, making it reliable for live demos.

### LangGraph Checkpointing
Workflow state is checkpointed to SQLite after every node. If the process crashes or the human takes a long time to approve, the run resumes exactly where it left off. This is what separates a robust agentic system from a fragile script.

### Artifact Persistence
Every run produces a structured artifact directory:
```
artifacts/<run-id>/
  attempt-1/generated_strategy.py
  attempt-1/execution_result.json
  attempt-1/attempt_snapshot.json
  attempt-2/...
  final_report.json
```

### 3D Workflow Visualization
The frontend renders the agent pipeline as an interactive 3D graph using Three.js. Each node — color-coded by role (cyan for supervisor, blue for hypothesis, orange for coding, purple for critic, yellow for human review, green for finalize) — lights up as the workflow progresses in real time.

`[SCREENSHOT: Close-up of the 3D graph with an active node highlighted and edge animation]`

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Three.js + Tailwind CSS |
| Backend | FastAPI + LangGraph + SQLite |
| Orchestration | LangGraph `StateGraph` with interrupt/resume |
| Hypothesis Agent | Google Gemini 2.5 Flash |
| Coding Agent | Anthropic Claude Sonnet 4 |
| Critic Agent | DeepSeek Reasoner |
| Execution | Python subprocess sandbox |
| Data | Local OHLCV CSV (8 large-cap stocks, ~1 year) |
| Packaging | Docker + Docker Compose |

---

## Running the App — Quickstart (5 minutes)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- *(Optional)* API keys for Google, Anthropic, and DeepSeek for live LLM calls

### Steps

**1. Clone the repository**
```bash
git clone <REPO_URL>
cd alphagraph
```

**2. Configure environment variables**
```bash
cp .env.example .env
```

Open `.env` in any text editor. Fill in any API keys you have (all are optional — the system runs in demo mode without them):
```
GOOGLE_API_KEY=your_google_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here
DEEPSEEK_API_KEY=your_deepseek_key_here
```

**3. Build and start the app**
```bash
docker compose up --build
```
This builds both the backend and frontend containers. First build takes ~2–3 minutes. Subsequent starts are fast.

**4. Open the app**

Navigate to `http://localhost:5173` in your browser.

`[SCREENSHOT: Landing page / initial UI state]`

**5. Run a demo**

Click **"Run Demo"**. The 3D graph will animate as agents execute. Watch the pipeline progress through hypothesis → coding → execution → critique → (potentially revise) → human approval.

When the workflow pauses for approval, a panel will appear with the full research artifact. Click **Approve** to finalize the run.

`[SCREENSHOT: Approval panel showing factor spec, metrics, and Approve/Reject buttons]`

---

## Reproducing the Prototype (Manual Setup)

If you prefer to run without Docker:

### Backend
```bash
# Install uv (fast Python package manager)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install backend dependencies
uv sync --project backend --group dev

# Start the API server
uv run --project backend uvicorn alphagraph.app:create_app \
  --factory --host 127.0.0.1 --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

### Running Tests
```bash
# Backend unit + integration tests
uv run --project backend pytest backend/tests -q

# End-to-end test (requires Playwright browsers)
cd frontend
PLAYWRIGHT_BROWSERS_PATH=/tmp/ms-playwright npx playwright test tests/demo.spec.ts
```

---

## Project Structure

```
alphagraph/
├── backend/
│   ├── src/alphagraph/
│   │   ├── api.py          # REST endpoints
│   │   ├── graph/          # LangGraph workflow definition
│   │   ├── llm/            # Multi-provider LLM routing
│   │   ├── runtime/        # Backtest execution engine & DSL
│   │   ├── storage/        # SQLite persistence & artifact writer
│   │   └── prompts/        # System prompts for each agent role
│   ├── data/prices.csv     # Historical market data
│   └── tests/              # Unit, integration, and API tests
├── frontend/
│   └── src/
│       ├── components/
│       │   └── GraphScene.tsx   # Three.js 3D visualization (679 lines)
│       └── ...
├── artifacts/              # Run outputs (auto-generated)
├── docker-compose.yml
└── .env.example
```

---

## What Makes This Non-Trivial

1. **Three frontier LLMs orchestrated in a single pipeline** — each chosen for the task it is best at, communicating through strongly-typed Pydantic schemas.

2. **Deterministic quality gates** — the Critic uses a rule-based scoring engine (not just vibes) to catch methodological errors like look-ahead bias or insufficient statistical power.

3. **Human-in-the-loop interrupt/resume** — LangGraph's `interrupt()` primitive pauses a live async workflow mid-execution, persists state, and resumes cleanly after a human decision. This is architecturally non-trivial.

4. **Subprocess isolation** — generated code runs in a child process with scoped environment variables, preventing the AI-generated code from accessing anything outside its sandbox.

5. **Offline resilience** — the entire pipeline degrades gracefully to deterministic demo outputs when no API keys are present, making it demo-safe under any conditions.

`[LINK: GitHub repository]`
`[LINK: Demo video walkthrough]`
