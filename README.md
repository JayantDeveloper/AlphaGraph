# AlphaGraph

AlphaGraph is a local MVP for autonomous quantitative factor research.

It runs a LangGraph workflow that:
- proposes a factor,
- generates Python backtest code,
- executes it against a bundled equities CSV,
- critiques the result,
- revises once,
- pauses for human approval,
- and writes a final artifact bundle.

## Stack

- Backend: FastAPI, LangGraph, SQLite checkpointing, pandas, numpy
- Frontend: React, Vite, TypeScript
- Execution: local Python subprocess sandbox
- Persistence: SQLite plus local `artifacts/`

## Docker (recommended)

```bash
cp .env.example .env
docker compose up --build
```

Open `http://localhost:5173`. Run artifacts persist in `./artifacts/` on your host. SQLite state lives in a named Docker volume (`alphagraph_data`).

## Manual Setup

1. Install backend dependencies:

```bash
export UV_CACHE_DIR=/tmp/uv-cache
uv sync --project backend --group dev
```

2. Install frontend dependencies:

```bash
cd frontend
npm install
cd ..
```

3. Optional: configure a real LLM provider:

```bash
cp .env.example .env
```

Default role routing is:
- `Hypothesis` -> Google Gemini (`gemini-2.5-flash`)
- `Coding` -> Anthropic Claude Sonnet 4 (`claude-sonnet-4-20250514`)
- `Critic` -> DeepSeek (`deepseek-reasoner`)

Set `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`, and `DEEPSEEK_API_KEY` to use the
hackathon stack. If any role is missing its configured API key, that role falls
back to the deterministic demo provider so the end-to-end loop still works
locally.

You can override providers per role with:
- `HYPOTHESIS_PROVIDER` / `HYPOTHESIS_MODEL`
- `CODING_PROVIDER` / `CODING_MODEL`
- `CRITIC_PROVIDER` / `CRITIC_MODEL`

## Run The MVP

Start the backend:

```bash
export UV_CACHE_DIR=/tmp/uv-cache
uv run --project backend uvicorn alphagraph.app:create_app --factory --host 127.0.0.1 --port 8000
```

Start the frontend in another terminal:

```bash
cd frontend
npm run dev
```

Open `http://127.0.0.1:5173`, upload a CSV if you want, and click `Run Research`.

## Input Flow

AlphaGraph now supports one CSV upload per run.

- Upload a long-format CSV with required columns: `date`, `ticker`, `close`
- Optional columns: `open`, `high`, `low`, `volume`
- Enter a research brief such as `test 5-day reversal`
- Start the run and inspect the factor, generated code, metrics, critique, and final artifacts

If no CSV is uploaded, AlphaGraph falls back to the bundled demo dataset.

## Demo Flow

1. Attempt 1 proposes a deliberately naive factor: `rank(close)`.
2. AlphaGraph generates a runnable Python backtest script and executes it locally.
3. The critic flags the raw price-level methodology as invalid.
4. Attempt 2 revises the factor to `rank(ts_return(close, 5))`.
5. The workflow pauses for approval.
6. Approving the result writes `artifacts/<run_id>/final_report.json`.

## Tests

Backend tests:

```bash
export UV_CACHE_DIR=/tmp/uv-cache
uv run --project backend pytest backend/tests -q
```

Frontend build:

```bash
cd frontend
npm run build
```

Playwright smoke test:

```bash
cd frontend
PLAYWRIGHT_BROWSERS_PATH=/tmp/ms-playwright npx playwright test tests/demo.spec.ts
```

The Playwright smoke test is included in the repo, but browser launch may be
blocked in restricted sandboxes even when the app code is correct.
