from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from langgraph.types import interrupt

from alphagraph.graph.state import RunState, validate_run_state
from alphagraph.llm.provider import AgentSuite
from alphagraph.runtime.dataset_csv import validate_dataset_file
from alphagraph.runtime.sandbox import SandboxRunner
from alphagraph.schemas import (
    ApprovalState,
    AttemptRecord,
    AttemptType,
    CandidateSpec,
    CandidateStatus,
    CodegenOutput,
    DatasetValidationStatus,
    EvaluationResult,
    ExecutionStatus,
    FactorQuality,
    HypothesisOutput,
    NeutralizationMode,
    PackageType,
    ResearchPlan,
    RunPhase,
    RunSnapshot,
    SignalIntent,
    StrategyConfig,
    SupervisorDecision,
    TerminalState,
    WorkflowNode,
)
from alphagraph.storage.artifacts import ArtifactStore


def ingest_brief(state: RunState) -> RunState:
    snapshot = validate_run_state(state)
    return {
        "parsed_brief": {"raw_brief": snapshot.brief.strip()},
        "status": "running",
        "phase": RunPhase.BRIEF_INGESTED,
        "supervisor_decision": SupervisorDecision.INGEST_DATASET,
        "current_node": WorkflowNode.INGEST_BRIEF,
        "workflow_trace": _append_trace(snapshot.workflow_trace, WorkflowNode.INGEST_BRIEF),
    }


def ingest_dataset(state: RunState) -> RunState:
    snapshot = validate_run_state(state)
    if snapshot.dataset_path is None:
        raise ValueError("Dataset path is required before dataset ingest.")
    dataset_path = Path(snapshot.dataset_path)
    label = snapshot.dataset_label or dataset_path.name
    return {
        "dataset_label": label,
        "status": "running",
        "phase": RunPhase.DATASET_INGESTED,
        "supervisor_decision": SupervisorDecision.VALIDATE_DATASET,
        "current_node": WorkflowNode.INGEST_DATASET,
        "workflow_trace": _append_trace(snapshot.workflow_trace, WorkflowNode.INGEST_DATASET),
    }


def make_validate_dataset_node(artifact_store: ArtifactStore):
    def validate_dataset(state: RunState) -> RunState:
        snapshot = validate_run_state(state)
        if snapshot.dataset_path is None:
            raise ValueError("Dataset path is required before validation.")

        parsed = _parse_brief(snapshot.brief)
        validation = validate_dataset_file(
            Path(snapshot.dataset_path),
            sector_neutral_required=parsed["sector_neutral_required"],
        )
        next_dataset_path = snapshot.dataset_path
        if validation.status == DatasetValidationStatus.VALID and validation.normalized_frame is not None:
            normalized_path = artifact_store.write_normalized_dataset(
                snapshot.run_id,
                validation.normalized_frame,
            )
            validation.normalized_dataset_path = str(normalized_path)
            next_dataset_path = str(normalized_path)

        payload = validation.model_dump(exclude={"normalized_frame"})
        update: RunState = {
            "parsed_brief": parsed,
            "dataset_validation": payload,
            "dataset_summary": validation.summary.model_dump() if validation.summary else None,
            "dataset_path": next_dataset_path,
            "status": "running",
            "phase": RunPhase.DATASET_VALIDATED,
            "supervisor_decision": SupervisorDecision.PARSE_RESEARCH_PLAN,
            "current_node": WorkflowNode.VALIDATE_DATASET,
            "workflow_trace": _append_trace(snapshot.workflow_trace, WorkflowNode.VALIDATE_DATASET),
        }
        if validation.status == DatasetValidationStatus.INVALID:
            update["terminal_state"] = TerminalState.FAILED_DATA_VALIDATION
            update["package_type"] = PackageType.FAILED_RUN_PACKAGE
            update["final_recommendation"] = "Dataset validation failed. Fix the uploaded CSV before running research."
            update["review_warning"] = None
        return update

    return validate_dataset


def route_after_dataset_validation(state: RunState) -> str:
    snapshot = validate_run_state(state)
    if snapshot.dataset_validation and snapshot.dataset_validation.status == DatasetValidationStatus.INVALID:
        return "finalize"
    return "parse_research_plan"


def parse_research_plan(state: RunState) -> RunState:
    snapshot = validate_run_state(state)
    parsed = snapshot.parsed_brief or _parse_brief(snapshot.brief)
    allowed_columns = snapshot.dataset_validation.available_columns if snapshot.dataset_validation else []
    plan = ResearchPlan(
        signal_intent=SignalIntent(parsed["signal_intent"]),
        allowed_columns=allowed_columns,
        constraints=_build_constraints(parsed),
        success_criteria={
            "passed_oos_sharpe": 0.35,
            "promising_oos_sharpe": 0.15,
            "max_drawdown": -0.25,
            "min_breadth": 2,
            "min_trade_count": 20,
            "max_turnover": 1.5,
        },
        max_candidate_attempts=5,
        max_revisions=2,
        max_code_fixes_per_candidate=1,
        sector_neutral_required=bool(parsed["sector_neutral_required"]),
    )
    return {
        "parsed_brief": parsed,
        "research_plan": plan.model_dump(),
        "max_attempts": plan.max_candidate_attempts,
        "status": "running",
        "phase": RunPhase.PLAN_READY,
        "supervisor_decision": SupervisorDecision.GENERATE_CANDIDATES,
        "current_node": WorkflowNode.PARSE_RESEARCH_PLAN,
        "workflow_trace": _append_trace(snapshot.workflow_trace, WorkflowNode.PARSE_RESEARCH_PLAN),
    }


def generate_candidates(state: RunState) -> RunState:
    snapshot = validate_run_state(state)
    candidates = snapshot.candidate_pool
    if not candidates:
        if snapshot.research_plan is None:
            raise ValueError("Research plan is required before candidate generation.")
        candidates = _initial_candidates(snapshot.research_plan, snapshot.dataset_validation)
    return {
        "candidate_pool": [candidate.model_dump() for candidate in candidates],
        "status": "running",
        "phase": RunPhase.CANDIDATES_READY,
        "supervisor_decision": SupervisorDecision.GENERATE_CODE,
        "current_node": WorkflowNode.GENERATE_CANDIDATES,
        "workflow_trace": _append_trace(snapshot.workflow_trace, WorkflowNode.GENERATE_CANDIDATES),
    }


def route_next_candidate(state: RunState) -> RunState:
    snapshot = validate_run_state(state)
    candidates = list(snapshot.candidate_pool)
    pending = next((candidate for candidate in candidates if candidate.status == CandidateStatus.PENDING), None)
    best_candidate_id = snapshot.best_candidate_id or _select_best_candidate(snapshot)
    review_warning = _collect_review_warning(snapshot)

    if pending is None:
        update: RunState = {
            "active_candidate_id": None,
            "pending_attempt_type": None,
            "pending_revision_reason": None,
            "best_candidate_id": best_candidate_id,
            "review_warning": review_warning,
            "workflow_trace": snapshot.workflow_trace,
        }
        if snapshot.reviewable_candidate_ids:
            update.update(
                {
                    "status": "awaiting_approval",
                    "phase": RunPhase.AWAITING_APPROVAL,
                    "approval_status": ApprovalState.PENDING,
                    "package_type": PackageType.RESEARCH_PACKAGE,
                    "final_recommendation": _build_recommendation(snapshot, best_candidate_id),
                    "supervisor_decision": SupervisorDecision.RUN_HUMAN_REVIEW,
                    "current_node": WorkflowNode.HUMAN_IN_THE_LOOP,
                }
            )
        else:
            update.update(
                {
                    "status": "running",
                    "package_type": PackageType.FAILED_RUN_PACKAGE,
                    "terminal_state": TerminalState.FAILED_NO_REVIEWABLE_CANDIDATES,
                    "final_recommendation": "No reviewable candidates survived the bounded search space.",
                    "supervisor_decision": SupervisorDecision.FINALIZE,
                    "current_node": WorkflowNode.FINALIZE_RUN,
                }
            )
        return update

    pending.status = CandidateStatus.RUNNING
    updated_candidates = _replace_candidate(candidates, pending)
    return {
        "candidate_pool": [candidate.model_dump() for candidate in updated_candidates],
        "active_candidate_id": pending.candidate_id,
        "pending_attempt_type": AttemptType.CANDIDATE_RUN,
        "pending_revision_reason": None,
        "status": "running",
        "phase": RunPhase.CANDIDATES_READY,
        "supervisor_decision": SupervisorDecision.GENERATE_CODE,
        "current_node": WorkflowNode.GENERATE_CANDIDATES,
        "workflow_trace": snapshot.workflow_trace,
    }


def route_after_candidate_selection(state: RunState) -> str:
    snapshot = validate_run_state(state)
    if snapshot.active_candidate_id is not None and snapshot.phase != RunPhase.AWAITING_APPROVAL:
        return "generate_code"
    if snapshot.reviewable_candidate_ids:
        return "human_review"
    return "finalize"


def make_generate_code_node(agent_suite: AgentSuite):
    def generate_code(state: RunState) -> RunState:
        snapshot = validate_run_state(state)
        candidate = _active_candidate(snapshot)
        hypothesis = HypothesisOutput(factor_spec=candidate.to_factor_spec())
        codegen_output = agent_suite.coding_agent.translate(
            hypothesis=hypothesis,
            attempt_number=snapshot.attempt + 1,
        )
        strategy_config = StrategyConfig(
            expression=candidate.expression,
            neutralization=candidate.neutralization,
            transaction_cost_bps=10,
            long_quantile=0.75,
            short_quantile=0.25,
            is_ratio=0.70,
        )
        codegen_output = CodegenOutput(
            strategy_config=strategy_config,
            generated_code=codegen_output.generated_code.model_copy(
                update={
                    "script": _render_strategy_script(strategy_config),
                }
            ),
        )
        return {
            "codegen_output": codegen_output.model_dump(),
            "status": "running",
            "phase": RunPhase.CODE_READY,
            "supervisor_decision": SupervisorDecision.EXECUTE_BACKTEST,
            "current_node": WorkflowNode.GENERATE_CODE,
            "workflow_trace": _append_trace(snapshot.workflow_trace, WorkflowNode.GENERATE_CODE),
        }

    return generate_code


def make_execute_backtest_node(runner: SandboxRunner):
    def execute_backtest(state: RunState) -> RunState:
        snapshot = validate_run_state(state)
        if snapshot.codegen_output is None:
            raise ValueError("Code output is required before execution.")
        if snapshot.dataset_path is None:
            raise ValueError("Dataset path is required before execution.")

        execution_result, artifact_paths = runner.execute(
            run_id=snapshot.run_id,
            attempt_number=snapshot.attempt + 1,
            generated_code=snapshot.codegen_output.generated_code,
            dataset_path=Path(snapshot.dataset_path),
        )
        merged_artifacts = dict(snapshot.artifact_paths)
        merged_artifacts.update(artifact_paths)
        return {
            "execution_result": execution_result.model_dump(),
            "artifact_paths": merged_artifacts,
            "status": "running",
            "phase": RunPhase.EXECUTION_COMPLETE,
            "supervisor_decision": SupervisorDecision.EVALUATE_RESULTS,
            "current_node": WorkflowNode.EXECUTE_BACKTEST,
            "workflow_trace": _append_trace(snapshot.workflow_trace, WorkflowNode.EXECUTE_BACKTEST),
        }

    return execute_backtest


def make_evaluate_results_node(agent_suite: AgentSuite, artifact_store: ArtifactStore):
    def evaluate_results(state: RunState) -> RunState:
        snapshot = validate_run_state(state)
        candidate = _active_candidate(snapshot)
        if snapshot.execution_result is None or snapshot.codegen_output is None:
            raise ValueError("Execution result and code output are required before evaluation.")

        hypothesis = HypothesisOutput(factor_spec=candidate.to_factor_spec())
        critic_output = agent_suite.factor_critic.review(
            hypothesis=hypothesis,
            execution_result=snapshot.execution_result,
            attempt_number=snapshot.attempt + 1,
        )

        evaluation = critic_output.evaluation
        updated_candidate = candidate.model_copy(
            update={
                "status": CandidateStatus.REVIEWABLE if evaluation.is_reviewable else CandidateStatus.REJECTED,
                "warning": evaluation.warning,
            }
        )
        updated_candidates = _replace_candidate(snapshot.candidate_pool, updated_candidate)
        reviewable_ids = list(snapshot.reviewable_candidate_ids)
        if evaluation.is_reviewable and candidate.candidate_id not in reviewable_ids:
            reviewable_ids.append(candidate.candidate_id)

        attempt_record = AttemptRecord(
            attempt_number=snapshot.attempt + 1,
            candidate_id=candidate.candidate_id,
            attempt_type=snapshot.pending_attempt_type or AttemptType.CANDIDATE_RUN,
            execution_status=evaluation.execution_status,
            factor_quality=evaluation.factor_quality,
            revision_reason=snapshot.pending_revision_reason,
            factor_spec=candidate.to_factor_spec(),
            generated_code=snapshot.codegen_output.generated_code,
            execution_result=snapshot.execution_result,
            evaluation=evaluation,
            critique=critic_output.critique,
            artifact_paths=snapshot.artifact_paths,
        )
        attempt_snapshot_path = artifact_store.write_attempt_snapshot(
            snapshot.run_id,
            snapshot.attempt + 1,
            attempt_record,
        )
        merged_artifacts = dict(snapshot.artifact_paths)
        merged_artifacts["attempt_snapshot"] = str(attempt_snapshot_path)
        attempts = [attempt.model_dump() for attempt in snapshot.attempts]
        attempts.append(attempt_record.model_dump())

        return {
            "attempt": snapshot.attempt + 1,
            "candidate_pool": [candidate_state.model_dump() for candidate_state in updated_candidates],
            "reviewable_candidate_ids": reviewable_ids,
            "critic_output": critic_output.model_dump(),
            "current_evaluation": evaluation.model_dump(),
            "attempts": attempts,
            "artifact_paths": merged_artifacts,
            "status": "running",
            "phase": RunPhase.EVALUATION_COMPLETE,
            "supervisor_decision": SupervisorDecision.STOP,
            "current_node": WorkflowNode.EVALUATE_RESULTS,
            "workflow_trace": _append_trace(snapshot.workflow_trace, WorkflowNode.EVALUATE_RESULTS),
            "review_warning": _collect_review_warning_from_evaluation(snapshot.review_warning, evaluation),
        }

    return evaluate_results


def route_post_evaluation(state: RunState) -> str:
    current_evaluation = state.get("current_evaluation")
    evaluation = (
        current_evaluation
        if isinstance(current_evaluation, EvaluationResult)
        else EvaluationResult.model_validate(current_evaluation)
        if current_evaluation is not None
        else None
    )
    if evaluation is None:
        return "route_next_candidate"

    active_candidate_id = state.get("active_candidate_id")
    if active_candidate_id is None:
        if state.get("reviewable_candidate_ids"):
            return "human_review"
        return "finalize"

    research_plan = state.get("research_plan")
    if research_plan is not None and not isinstance(research_plan, ResearchPlan):
        research_plan = ResearchPlan.model_validate(research_plan)
    max_code_fixes = research_plan.max_code_fixes_per_candidate if research_plan else 1
    if evaluation.execution_status == ExecutionStatus.EXECUTION_FAILED:
        if _code_fix_attempts_raw(state.get("attempts", []), active_candidate_id) < max_code_fixes:
            return "code_fix"
        return "route_next_candidate"

    max_revisions = research_plan.max_revisions if research_plan else 2
    max_candidates = research_plan.max_candidate_attempts if research_plan else int(state.get("max_attempts", 5))
    if evaluation.factor_quality in {FactorQuality.WEAK, FactorQuality.SUSPICIOUS}:
        if int(state.get("revision_count", 0)) < max_revisions and len(state.get("candidate_pool", [])) < max_candidates:
            return "revise_factor"
        return "route_next_candidate"

    if any(
        (candidate.status if isinstance(candidate, CandidateSpec) else candidate.get("status")) == CandidateStatus.PENDING
        or (candidate.status if isinstance(candidate, CandidateSpec) else candidate.get("status")) == CandidateStatus.PENDING.value
        for candidate in state.get("candidate_pool", [])
    ):
        return "route_next_candidate"
    if state.get("reviewable_candidate_ids"):
        return "human_review"
    return "finalize"


def code_fix(state: RunState) -> RunState:
    snapshot = validate_run_state(state)
    candidate = _active_candidate(snapshot)
    candidate = candidate.model_copy(update={"status": CandidateStatus.RUNNING})
    updated_candidates = _replace_candidate(snapshot.candidate_pool, candidate)
    return {
        "candidate_pool": [candidate_state.model_dump() for candidate_state in updated_candidates],
        "pending_attempt_type": AttemptType.CODE_FIX,
        "pending_revision_reason": snapshot.current_evaluation.summary if snapshot.current_evaluation else "Code fix retry",
        "status": "running",
        "supervisor_decision": SupervisorDecision.GENERATE_CODE,
        "current_node": WorkflowNode.CODE_FIX,
        "workflow_trace": _append_trace(snapshot.workflow_trace, WorkflowNode.CODE_FIX),
    }


def revise_factor(state: RunState) -> RunState:
    snapshot = validate_run_state(state)
    candidate = _active_candidate(snapshot)
    if snapshot.research_plan is None or snapshot.current_evaluation is None:
        raise ValueError("Research plan and evaluation are required before factor revision.")

    revised = _revised_candidate(
        snapshot,
        candidate,
        snapshot.current_evaluation.factor_quality,
    )
    updated_candidates = list(snapshot.candidate_pool)
    updated_candidates.append(revised)
    current_candidate = candidate.model_copy(update={"status": CandidateStatus.REJECTED})
    updated_candidates = _replace_candidate(updated_candidates, current_candidate)
    return {
        "candidate_pool": [candidate_state.model_dump() for candidate_state in updated_candidates],
        "active_candidate_id": revised.candidate_id,
        "pending_attempt_type": AttemptType.FACTOR_REVISION,
        "pending_revision_reason": snapshot.current_evaluation.summary,
        "revision_count": snapshot.revision_count + 1,
        "status": "running",
        "supervisor_decision": SupervisorDecision.GENERATE_CODE,
        "current_node": WorkflowNode.REVISE_FACTOR,
        "workflow_trace": _append_trace(snapshot.workflow_trace, WorkflowNode.REVISE_FACTOR),
    }


def human_in_the_loop(state: RunState) -> RunState:
    snapshot = validate_run_state(state)
    approved = interrupt(
        {
            "run_id": snapshot.run_id,
            "best_candidate_id": snapshot.best_candidate_id,
            "review_warning": snapshot.review_warning,
            "final_recommendation": snapshot.final_recommendation,
        }
    )
    return {
        "approval_status": ApprovalState.APPROVED if approved else ApprovalState.REJECTED,
        "status": "running",
        "supervisor_decision": SupervisorDecision.FINALIZE,
        "current_node": WorkflowNode.HUMAN_IN_THE_LOOP,
    }


def make_finalize_node(artifact_store: ArtifactStore):
    def finalize_run(state: RunState) -> RunState:
        snapshot = validate_run_state(state)
        terminal_state = snapshot.terminal_state
        package_type = snapshot.package_type

        if terminal_state is None:
            if snapshot.approval_status == ApprovalState.APPROVED:
                terminal_state = TerminalState.COMPLETED_APPROVED
            elif snapshot.approval_status == ApprovalState.REJECTED:
                terminal_state = TerminalState.COMPLETED_REJECTED

        if package_type is None:
            package_type = (
                PackageType.RESEARCH_PACKAGE
                if terminal_state in {TerminalState.COMPLETED_APPROVED, TerminalState.COMPLETED_REJECTED}
                else PackageType.FAILED_RUN_PACKAGE
            )

        materialized = RunSnapshot.model_validate(
            {
                **snapshot.model_dump(),
                "phase": RunPhase.FINALIZED,
                "status": "completed" if package_type == PackageType.RESEARCH_PACKAGE else "failed",
                "terminal_state": terminal_state,
                "package_type": package_type,
                "best_candidate_id": snapshot.best_candidate_id or _select_best_candidate(snapshot),
                "final_recommendation": snapshot.final_recommendation or _build_final_recommendation(snapshot, terminal_state),
                "current_node": WorkflowNode.FINALIZE_RUN,
                "workflow_trace": _append_trace(snapshot.workflow_trace, WorkflowNode.FINALIZE_RUN),
            }
        )
        package_path = artifact_store.write_package(materialized)
        merged_artifacts = dict(materialized.artifact_paths)
        merged_artifacts["final_package"] = str(package_path)
        return {
            "status": materialized.status,
            "phase": RunPhase.FINALIZED,
            "terminal_state": terminal_state,
            "package_type": package_type,
            "supervisor_decision": SupervisorDecision.FINALIZE,
            "current_node": WorkflowNode.FINALIZE_RUN,
            "workflow_trace": materialized.workflow_trace,
            "final_report_path": str(package_path),
            "artifact_paths": merged_artifacts,
        }

    return finalize_run


def _parse_brief(brief: str) -> dict[str, str | bool]:
    lowered = brief.lower()
    signal_intent = SignalIntent.MEAN_REVERSION.value
    if any(keyword in lowered for keyword in ("volatility-adjusted", "risk-adjusted reversal")):
        signal_intent = SignalIntent.VOLATILITY_ADJUSTED_REVERSAL.value
    elif any(keyword in lowered for keyword in ("momentum", "trend", "winner")):
        signal_intent = SignalIntent.MOMENTUM.value

    return {
        "signal_intent": signal_intent,
        "sector_neutral_required": any(keyword in lowered for keyword in ("sector neutral", "industry neutral")),
    }


def _build_constraints(parsed_brief: dict[str, str | bool]) -> list[str]:
    constraints = [
        "long_short_quartile_portfolio",
        "transaction_cost_bps=10",
        "is_ratio=0.70",
        "oos_ratio=0.30",
    ]
    if parsed_brief.get("sector_neutral_required"):
        constraints.append("sector_neutral_required")
    return constraints


def _initial_candidates(
    plan: ResearchPlan,
    dataset_validation,
) -> list[CandidateSpec]:
    if plan.signal_intent == SignalIntent.MOMENTUM:
        candidates = [
            CandidateSpec(candidate_id="cand-1", name="Momentum 5D", thesis="Recent winners may keep outperforming over the next day.", expression="rank(ts_return(close, 5))", complexity_score=1),
            CandidateSpec(candidate_id="cand-2", name="Momentum 10D", thesis="A slightly longer momentum window may stabilize signal quality.", expression="rank(ts_return(close, 10))", complexity_score=2),
            CandidateSpec(candidate_id="cand-3", name="Momentum 20D", thesis="Longer lookback momentum may reduce noise.", expression="rank(ts_return(close, 20))", complexity_score=3),
            CandidateSpec(candidate_id="cand-4", name="Vol-Adjusted Momentum 10D", thesis="Normalize momentum by trailing volatility to reduce noisy spikes.", expression="rank(ts_return(close, 10) / ts_std(close, 20))", complexity_score=4),
        ]
    elif plan.signal_intent == SignalIntent.VOLATILITY_ADJUSTED_REVERSAL:
        candidates = [
            CandidateSpec(candidate_id="cand-1", name="Vol-Adjusted Reversal 3D", thesis="Short-term losers may mean-revert when scaled by trailing volatility.", expression="-rank(ts_return(close, 3) / ts_std(close, 20))", complexity_score=2),
            CandidateSpec(candidate_id="cand-2", name="Vol-Adjusted Reversal 5D", thesis="Five-day reversal may capture oversold moves more cleanly.", expression="-rank(ts_return(close, 5) / ts_std(close, 20))", complexity_score=3),
            CandidateSpec(candidate_id="cand-3", name="Fast Vol-Adjusted Reversal 5D", thesis="Shorter volatility estimation can react faster to regime shifts.", expression="-rank(ts_return(close, 5) / ts_std(close, 10))", complexity_score=4),
            CandidateSpec(candidate_id="cand-4", name="Vol-Adjusted Reversal 10D", thesis="Longer reversal window can avoid pure noise.", expression="-rank(ts_return(close, 10) / ts_std(close, 20))", complexity_score=5),
        ]
    else:
        candidates = [
            CandidateSpec(candidate_id="cand-1", name="Reversal 3D", thesis="Very recent losers may rebound over the next day.", expression="-rank(ts_return(close, 3))", complexity_score=1),
            CandidateSpec(candidate_id="cand-2", name="Reversal 5D", thesis="A slightly longer mean-reversion window can reduce one-day noise.", expression="-rank(ts_return(close, 5))", complexity_score=2),
            CandidateSpec(candidate_id="cand-3", name="Reversal 10D", thesis="Longer reversals may persist when short-term moves overshoot.", expression="-rank(ts_return(close, 10))", complexity_score=3),
            CandidateSpec(candidate_id="cand-4", name="Vol-Adjusted Reversal 5D", thesis="Scale reversal by volatility to avoid overreacting to high-vol names.", expression="-rank(ts_return(close, 5) / ts_std(close, 20))", complexity_score=4),
        ]

    if plan.sector_neutral_required and dataset_validation and "sector" in dataset_validation.available_columns:
        highest = max(candidates, key=lambda candidate: candidate.complexity_score)
        replacement = highest.model_copy(
            update={
                "neutralization": NeutralizationMode.SECTOR,
                "name": f"{highest.name} Sector Neutral",
                "thesis": f"{highest.thesis} Neutralize by sector to remove broad industry effects.",
            }
        )
        candidates = _replace_candidate(candidates, replacement)
    return candidates


def _active_candidate(snapshot) -> CandidateSpec:
    if snapshot.active_candidate_id is None:
        raise ValueError("Active candidate is required.")
    for candidate in snapshot.candidate_pool:
        if candidate.candidate_id == snapshot.active_candidate_id:
            return candidate
    raise ValueError(f"Active candidate not found: {snapshot.active_candidate_id}")


def _replace_candidate(candidates: list[CandidateSpec], replacement: CandidateSpec) -> list[CandidateSpec]:
    updated: list[CandidateSpec] = []
    replaced = False
    for candidate in candidates:
        if candidate.candidate_id == replacement.candidate_id:
            updated.append(replacement)
            replaced = True
        else:
            updated.append(candidate)
    if not replaced:
        updated.append(replacement)
    return updated


def _revised_candidate(snapshot, candidate: CandidateSpec, factor_quality: FactorQuality) -> CandidateSpec:
    expression = candidate.expression
    if factor_quality == FactorQuality.SUSPICIOUS:
        revised_expression = _simplify_expression(expression, snapshot.research_plan.signal_intent)
        thesis = "Simplify the expression to reduce out-of-sample decay and instability."
    else:
        revised_expression = _strengthen_expression(expression)
        thesis = "Tighten the signal design to improve robustness and factor quality."
    return CandidateSpec(
        candidate_id=f"cand-{len(snapshot.candidate_pool) + 1}",
        name=f"{candidate.name} Revision",
        thesis=thesis,
        expression=revised_expression,
        neutralization=candidate.neutralization,
        complexity_score=min(candidate.complexity_score + 1, 5),
        status=CandidateStatus.REVISED,
    )


def _strengthen_expression(expression: str) -> str:
    if "/ ts_std" not in expression:
        return expression.replace("))", ") / ts_std(close, 20))")
    for old, new in ("3)", "5)"), ("5)", "10)"), ("10)", "20)"):
        target = f"close, {old}"
        if target in expression:
            return expression.replace(target, f"close, {new}")
    return expression


def _simplify_expression(expression: str, signal_intent: SignalIntent) -> str:
    if "/ ts_std" in expression:
        prefix = expression.split(" / ts_std", 1)[0] + ")"
        return prefix
    target = "close, 10" if signal_intent == SignalIntent.MOMENTUM else "close, 5"
    if "close, 20" in expression:
        return expression.replace("close, 20", target)
    if "close, 10" in expression and signal_intent != SignalIntent.MOMENTUM:
        return expression.replace("close, 10", "close, 5")
    return expression


def _select_best_candidate(snapshot) -> str | None:
    reviewable = [candidate for candidate in snapshot.candidate_pool if candidate.candidate_id in snapshot.reviewable_candidate_ids]
    if not reviewable:
        return None

    evaluation_by_candidate = {
        attempt.candidate_id: attempt.evaluation
        for attempt in snapshot.attempts
        if attempt.evaluation.is_reviewable
    }

    def candidate_sort_key(candidate: CandidateSpec):
        evaluation = evaluation_by_candidate.get(candidate.candidate_id)
        quality_rank = {
            FactorQuality.PASSED: 0,
            FactorQuality.PROMISING: 1,
            FactorQuality.SUSPICIOUS: 2,
        }.get(evaluation.factor_quality if evaluation else FactorQuality.SUSPICIOUS, 3)
        scorecard = evaluation.scorecard if evaluation else {}
        return (
            quality_rank,
            -float(scorecard.get("oos_sharpe", 0.0)),
            float(scorecard.get("max_drawdown", -1.0)) * -1,
            float(scorecard.get("turnover", 99.0)),
            candidate.complexity_score,
        )

    return sorted(reviewable, key=candidate_sort_key)[0].candidate_id


def _build_recommendation(snapshot, best_candidate_id: str | None) -> str:
    if best_candidate_id is None:
        return "No reviewable candidate is available."
    candidate = next((candidate for candidate in snapshot.candidate_pool if candidate.candidate_id == best_candidate_id), None)
    if candidate is None:
        return "Review the surviving candidate before approval."
    return f"Review {candidate.name} as the best surviving candidate from the bounded search."


def _build_final_recommendation(snapshot, terminal_state: TerminalState | None) -> str:
    if terminal_state == TerminalState.FAILED_DATA_VALIDATION:
        return "The run halted because dataset validation failed."
    if terminal_state == TerminalState.FAILED_NO_REVIEWABLE_CANDIDATES:
        return "The run completed without any reviewable candidates."
    return snapshot.final_recommendation or "Research package finalized."


def _collect_review_warning(snapshot) -> str | None:
    warnings = [candidate.warning for candidate in snapshot.candidate_pool if candidate.candidate_id in snapshot.reviewable_candidate_ids and candidate.warning]
    return "; ".join(warnings) if warnings else None


def _collect_review_warning_from_evaluation(existing_warning: str | None, evaluation: EvaluationResult) -> str | None:
    warnings = [warning for warning in [existing_warning, evaluation.warning] if warning]
    return "; ".join(dict.fromkeys(warnings)) if warnings else None


def _code_fix_attempts(snapshot, candidate_id: str) -> int:
    return sum(
        1
        for attempt in snapshot.attempts
        if attempt.candidate_id == candidate_id and attempt.attempt_type == AttemptType.CODE_FIX
    )


def _code_fix_attempts_raw(attempts: list, candidate_id: str) -> int:
    total = 0
    for attempt in attempts:
        attempt_type = attempt.attempt_type if isinstance(attempt, AttemptRecord) else attempt.get("attempt_type")
        attempt_candidate_id = attempt.candidate_id if isinstance(attempt, AttemptRecord) else attempt.get("candidate_id")
        if attempt_candidate_id == candidate_id and attempt_type in {AttemptType.CODE_FIX, AttemptType.CODE_FIX.value}:
            total += 1
    return total


def _render_strategy_script(config: StrategyConfig) -> str:
    return f"""from pathlib import Path
import os

from alphagraph.runtime.backtest_engine import run_backtest_from_expression


dataset_path = Path(os.environ[\"ALPHAGRAPH_DATASET_PATH\"])
output_path = Path(os.environ[\"ALPHAGRAPH_OUTPUT_PATH\"])
result = run_backtest_from_expression(
    dataset_path,
    {config.expression!r},
    neutralization={config.neutralization.value!r},
    transaction_cost_bps={config.transaction_cost_bps},
    long_quantile={config.long_quantile},
    short_quantile={config.short_quantile},
    is_ratio={config.is_ratio},
)
output_path.write_text(result.model_dump_json(indent=2))
print(\"executed factor {config.expression}\")
"""


def _append_trace(trace: list[WorkflowNode], node: WorkflowNode) -> list[WorkflowNode]:
    if trace and trace[-1] == node:
        return trace
    return [*trace, node]
