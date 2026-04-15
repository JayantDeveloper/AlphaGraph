from pathlib import Path

from alphagraph.graph.nodes import route_post_evaluation
from alphagraph.graph.workflow import create_workflow
from alphagraph.llm.provider import DemoLLMProvider
from alphagraph.schemas import (
    ApprovalState,
    AttemptType,
    ExecutionStatus,
    FactorQuality,
    PackageType,
    RunPhase,
    TerminalState,
    WorkflowNode,
)
from alphagraph.service import AlphaGraphService, UploadedDatasetInput


def test_graph_finalizes_failed_run_package_on_dataset_validation_failure(tmp_path: Path) -> None:
    service = AlphaGraphService(
        base_dir=tmp_path,
        dataset_path=Path(__file__).resolve().parents[1] / "data" / "prices.csv",
        workflow=create_workflow(DemoLLMProvider(), tmp_path),
        run_mode="inline",
    )

    snapshot = service.create_run(
        brief="sector neutral momentum",
        uploaded_dataset=UploadedDatasetInput(
            filename="sectorless.csv",
            content=_trend_csv(include_sector=False).encode("utf-8"),
        ),
    )

    assert snapshot.phase == RunPhase.FINALIZED
    assert snapshot.terminal_state == TerminalState.FAILED_DATA_VALIDATION
    assert snapshot.package_type == PackageType.FAILED_RUN_PACKAGE
    assert snapshot.approval_status == ApprovalState.NOT_REQUESTED
    assert snapshot.current_node == WorkflowNode.FINALIZE_RUN
    assert snapshot.final_report_path is not None


def test_graph_finalizes_without_human_review_when_no_reviewable_candidates_exist(tmp_path: Path) -> None:
    service = AlphaGraphService(
        base_dir=tmp_path,
        dataset_path=Path(__file__).resolve().parents[1] / "data" / "prices.csv",
        workflow=create_workflow(DemoLLMProvider(), tmp_path),
        run_mode="inline",
    )

    snapshot = service.create_run(
        brief="test short-term momentum",
        uploaded_dataset=UploadedDatasetInput(
            filename="flat.csv",
            content=_flat_csv().encode("utf-8"),
        ),
    )

    assert snapshot.phase == RunPhase.FINALIZED
    assert snapshot.terminal_state == TerminalState.FAILED_NO_REVIEWABLE_CANDIDATES
    assert snapshot.package_type == PackageType.FAILED_RUN_PACKAGE
    assert snapshot.approval_status == ApprovalState.NOT_REQUESTED
    assert snapshot.current_node == WorkflowNode.FINALIZE_RUN
    assert snapshot.final_report_path is not None
    assert snapshot.best_candidate_id is None


def test_graph_resume_with_approval_finalizes_research_package(tmp_path: Path) -> None:
    service = AlphaGraphService(
        base_dir=tmp_path,
        dataset_path=Path(__file__).resolve().parents[1] / "data" / "prices.csv",
        workflow=create_workflow(DemoLLMProvider(), tmp_path),
        run_mode="inline",
    )

    initial = service.create_run(brief="test short-term momentum")

    assert initial.phase == RunPhase.AWAITING_APPROVAL
    assert initial.approval_status == ApprovalState.PENDING
    assert initial.package_type == PackageType.RESEARCH_PACKAGE
    assert initial.best_candidate_id is not None

    final = service.approve_run(initial.run_id, approved=True)

    assert final.phase == RunPhase.FINALIZED
    assert final.terminal_state == TerminalState.COMPLETED_APPROVED
    assert final.package_type == PackageType.RESEARCH_PACKAGE
    assert final.approval_status == ApprovalState.APPROVED
    assert final.current_node == WorkflowNode.FINALIZE_RUN
    assert final.final_report_path is not None
    assert Path(final.final_report_path).exists()


def test_graph_rejection_still_writes_research_package(tmp_path: Path) -> None:
    service = AlphaGraphService(
        base_dir=tmp_path,
        dataset_path=Path(__file__).resolve().parents[1] / "data" / "prices.csv",
        workflow=create_workflow(DemoLLMProvider(), tmp_path),
        run_mode="inline",
    )

    initial = service.create_run(brief="test short-term momentum")
    final = service.approve_run(initial.run_id, approved=False)

    assert final.phase == RunPhase.FINALIZED
    assert final.terminal_state == TerminalState.COMPLETED_REJECTED
    assert final.package_type == PackageType.RESEARCH_PACKAGE
    assert final.approval_status == ApprovalState.REJECTED
    assert final.final_report_path is not None
    assert Path(final.final_report_path).exists()


def test_route_post_evaluation_skips_code_fix_after_one_retry() -> None:
    state = {
        "run_id": "run-1",
        "brief": "test short-term momentum",
        "dataset_path": "/tmp/input.csv",
        "status": "running",
        "phase": RunPhase.EVALUATION_COMPLETE,
        "approval_status": ApprovalState.NOT_REQUESTED,
        "current_node": WorkflowNode.EVALUATE_RESULTS,
        "candidate_pool": [
            {
                "candidate_id": "c1",
                "name": "Primary",
                "thesis": "Try momentum",
                "expression": "rank(ts_return(close, 5))",
                "neutralization": "none",
                "complexity_score": 1,
                "status": "executed",
                "warning": None,
            },
            {
                "candidate_id": "c2",
                "name": "Fallback",
                "thesis": "Try a longer window",
                "expression": "rank(ts_return(close, 10))",
                "neutralization": "none",
                "complexity_score": 2,
                "status": "pending",
                "warning": None,
            },
        ],
        "active_candidate_id": "c1",
        "attempts": [
            {
                "attempt_number": 1,
                "candidate_id": "c1",
                "attempt_type": AttemptType.CODE_FIX,
                "execution_status": ExecutionStatus.EXECUTION_FAILED,
                "factor_quality": FactorQuality.NOT_EVALUATED,
                "revision_reason": "sandbox failure",
                "generated_code": None,
                "execution_result": {
                    "success": False,
                    "stderr": "boom",
                    "metrics": {},
                },
                "evaluation": {
                    "execution_status": ExecutionStatus.EXECUTION_FAILED,
                    "factor_quality": FactorQuality.NOT_EVALUATED,
                    "is_reviewable": False,
                    "reasons": ["execution_failed"],
                    "scorecard": {},
                    "summary": "execution failed",
                },
                "critique": None,
                "artifact_paths": {},
            }
        ],
        "current_evaluation": {
            "execution_status": ExecutionStatus.EXECUTION_FAILED,
            "factor_quality": FactorQuality.NOT_EVALUATED,
            "is_reviewable": False,
            "reasons": ["execution_failed"],
            "scorecard": {},
            "summary": "execution failed",
        },
        "research_plan": {
            "signal_intent": "momentum",
            "allowed_columns": ["date", "ticker", "close"],
            "constraints": [],
            "success_criteria": {},
            "max_candidate_attempts": 5,
            "max_revisions": 2,
            "max_code_fixes_per_candidate": 1,
            "sector_neutral_required": False,
        },
        "reviewable_candidate_ids": [],
        "revision_count": 0,
    }

    assert route_post_evaluation(state) == "route_next_candidate"


def test_route_post_evaluation_skips_revise_factor_after_budget_is_exhausted() -> None:
    state = {
        "run_id": "run-2",
        "brief": "test mean reversion",
        "dataset_path": "/tmp/input.csv",
        "status": "running",
        "phase": RunPhase.EVALUATION_COMPLETE,
        "approval_status": ApprovalState.NOT_REQUESTED,
        "current_node": WorkflowNode.EVALUATE_RESULTS,
        "candidate_pool": [
            {
                "candidate_id": "c1",
                "name": "Primary",
                "thesis": "Try reversal",
                "expression": "-rank(ts_return(close, 5))",
                "neutralization": "none",
                "complexity_score": 1,
                "status": "executed",
                "warning": None,
            },
            {
                "candidate_id": "c2",
                "name": "Fallback",
                "thesis": "Try a longer window",
                "expression": "-rank(ts_return(close, 10))",
                "neutralization": "none",
                "complexity_score": 2,
                "status": "pending",
                "warning": None,
            },
        ],
        "active_candidate_id": "c1",
        "attempts": [],
        "current_evaluation": {
            "execution_status": ExecutionStatus.SUCCEEDED,
            "factor_quality": FactorQuality.WEAK,
            "is_reviewable": False,
            "reasons": ["weak_oos"],
            "scorecard": {},
            "summary": "weak factor",
        },
        "research_plan": {
            "signal_intent": "mean_reversion",
            "allowed_columns": ["date", "ticker", "close"],
            "constraints": [],
            "success_criteria": {},
            "max_candidate_attempts": 5,
            "max_revisions": 2,
            "max_code_fixes_per_candidate": 1,
            "sector_neutral_required": False,
        },
        "reviewable_candidate_ids": [],
        "revision_count": 2,
    }

    assert route_post_evaluation(state) == "route_next_candidate"


def _trend_csv(*, include_sector: bool) -> str:
    columns = ["date", "ticker", "close", "volume"]
    if include_sector:
        columns.append("sector")
    rows = []
    for day in range(25):
        date = f"2024-01-{day + 2:02d}"
        aapl = [date, "AAPL", f"{170 + day:.2f}", "100"]
        msft = [date, "MSFT", f"{370 + day:.2f}", "100"]
        if include_sector:
            aapl.append("Technology")
            msft.append("Technology")
        rows.append(",".join(aapl))
        rows.append(",".join(msft))
    return ",".join(columns) + "\n" + "\n".join(rows)


def _flat_csv() -> str:
    rows = []
    for day in range(25):
        date = f"2024-01-{day + 2:02d}"
        rows.append(",".join([date, "AAPL", "100.00", "100"]))
        rows.append(",".join([date, "MSFT", "100.00", "100"]))
    return "date,ticker,close,volume\n" + "\n".join(rows)
