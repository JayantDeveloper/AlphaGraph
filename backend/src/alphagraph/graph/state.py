from __future__ import annotations

from typing import Any, TypedDict

from pydantic import BaseModel, Field

from alphagraph.schemas import (
    ApprovalState,
    AttemptRecord,
    AttemptType,
    CandidateSpec,
    CodegenOutput,
    CriticOutput,
    DatasetSummary,
    DatasetValidationResult,
    EvaluationResult,
    ExecutionResult,
    PackageType,
    ResearchPlan,
    RunPhase,
    SupervisorDecision,
    TerminalState,
    WorkflowNode,
)


class RunState(TypedDict, total=False):
    run_id: str
    brief: str
    parsed_brief: dict[str, Any] | None
    dataset_path: str | None
    dataset_label: str | None
    dataset_summary: dict[str, Any] | None
    dataset_validation: dict[str, Any] | None
    research_plan: dict[str, Any] | None
    candidate_pool: list[dict[str, Any]]
    active_candidate_id: str | None
    pending_attempt_type: AttemptType | None
    pending_revision_reason: str | None
    reviewable_candidate_ids: list[str]
    best_candidate_id: str | None
    current_evaluation: dict[str, Any] | None
    status: str
    phase: RunPhase
    attempt: int
    max_attempts: int
    revision_count: int
    approval_status: ApprovalState
    supervisor_decision: SupervisorDecision
    current_node: WorkflowNode | None
    workflow_trace: list[WorkflowNode]
    codegen_output: dict[str, Any] | None
    execution_result: dict[str, Any] | None
    critic_output: dict[str, Any] | None
    attempts: list[dict[str, Any]]
    terminal_state: TerminalState | None
    package_type: PackageType | None
    final_recommendation: str | None
    review_warning: str | None
    artifact_paths: dict[str, str]
    final_report_path: str | None


class RunStateModel(BaseModel):
    run_id: str
    brief: str
    parsed_brief: dict[str, Any] | None = None
    dataset_path: str | None = None
    dataset_label: str | None = None
    dataset_summary: DatasetSummary | None = None
    dataset_validation: DatasetValidationResult | None = None
    research_plan: ResearchPlan | None = None
    candidate_pool: list[CandidateSpec] = Field(default_factory=list)
    active_candidate_id: str | None = None
    pending_attempt_type: AttemptType | None = None
    pending_revision_reason: str | None = None
    reviewable_candidate_ids: list[str] = Field(default_factory=list)
    best_candidate_id: str | None = None
    current_evaluation: EvaluationResult | None = None
    status: str
    phase: RunPhase
    attempt: int = 0
    max_attempts: int = 5
    revision_count: int = 0
    approval_status: ApprovalState = ApprovalState.NOT_REQUESTED
    supervisor_decision: SupervisorDecision = SupervisorDecision.STOP
    current_node: WorkflowNode | None = None
    workflow_trace: list[WorkflowNode] = Field(default_factory=list)
    codegen_output: CodegenOutput | None = None
    execution_result: ExecutionResult | None = None
    critic_output: CriticOutput | None = None
    attempts: list[AttemptRecord] = Field(default_factory=list)
    terminal_state: TerminalState | None = None
    package_type: PackageType | None = None
    final_recommendation: str | None = None
    review_warning: str | None = None
    artifact_paths: dict[str, str] = Field(default_factory=dict)
    final_report_path: str | None = None


def validate_run_state(state: RunState) -> RunStateModel:
    return RunStateModel.model_validate(state)
