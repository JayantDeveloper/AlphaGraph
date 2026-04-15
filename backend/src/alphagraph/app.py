from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from alphagraph.api import router
from alphagraph.graph.workflow import create_workflow
from alphagraph.llm.provider import build_default_agent_suite
from alphagraph.service import AlphaGraphService


def create_app(
    *,
    base_dir: Path | None = None,
    dataset_path: Path | None = None,
    run_mode: str = "inline",
) -> FastAPI:
    resolved_base_dir = base_dir or Path(__file__).resolve().parents[3]
    _load_local_dotenv(resolved_base_dir / ".env")
    resolved_dataset_path = dataset_path or resolved_base_dir / "backend" / "data" / "prices.csv"
    prompt_dir = Path(__file__).resolve().parent / "prompts"
    workflow = create_workflow(build_default_agent_suite(prompt_dir), resolved_base_dir)
    service = AlphaGraphService(
        base_dir=resolved_base_dir,
        dataset_path=resolved_dataset_path,
        workflow=workflow,
        run_mode=run_mode,
    )

    app = FastAPI(title="AlphaGraph")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://127.0.0.1:5173",
            "http://localhost:5173",
            "http://127.0.0.1:4173",
            "http://localhost:4173",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.service = service
    app.include_router(router)
    return app


def _load_local_dotenv(path: Path) -> None:
    try:
        from dotenv import load_dotenv
    except Exception:
        return
    load_dotenv(path, override=False)
