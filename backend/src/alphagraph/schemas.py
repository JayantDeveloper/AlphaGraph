from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class RunPhase(str, Enum):
    INITIAL = "initial"
    BRIEF_INGESTED = "brief_ingested"
    DATASET_INGESTED = "dataset_ingested"
    DATASET_VALIDATED = "dataset_validated"
    PLAN_READY = "plan_ready"
    CANDIDATES_READY = "candidates_ready"
    CODE_READY = "code_ready"
    EXECUTION_COMPLETE = "execution_complete"
    EVALUATION_COMPLETE = "evaluation_complete"
    AWAITING_APPROVAL = "awaiting_approval"
    FINALIZED = "finalized"


class SupervisorDecision(str, Enum):
    INGEST_DATASET = "ingest_dataset"
    VALIDATE_DATASET = "validate_dataset"
    PARSE_RESEARCH_PLAN = "parse_research_plan"
    GENERATE_CANDIDATES = "generate_candidates"
    GENERATE_CODE = "generate_code"
    EXECUTE_BACKTEST = "execute_backtest"
    EVALUATE_RESULTS = "evaluate_results"
    CODE_FIX = "code_fix"
    REVISE_FACTOR = "revise_factor"
    RUN_HUMAN_REVIEW = "run_human_review"
    FINALIZE = "finalize"
    STOP = "stop"


class ApprovalState(str, Enum):
    NOT_REQUESTED = "not_requested"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class WorkflowNode(str, Enum):
    INGEST_BRIEF = "ingest_brief"
    INGEST_DATASET = "ingest_dataset"
    VALIDATE_DATASET = "validate_dataset"
    PARSE_RESEARCH_PLAN = "parse_research_plan"
    GENERATE_CANDIDATES = "generate_candidates"
    GENERATE_CODE = "generate_code"
    EXECUTE_BACKTEST = "execute_backtest"
    EVALUATE_RESULTS = "evaluate_results"
    CODE_FIX = "code_fix"
    REVISE_FACTOR = "revise_factor"
    HUMAN_IN_THE_LOOP = "human_in_the_loop"
    FINALIZE_RUN = "finalize_run"


class SignalIntent(str, Enum):
    MEAN_REVERSION = "mean_reversion"
    MOMENTUM = "momentum"
    VOLATILITY_ADJUSTED_REVERSAL = "volatility_adjusted_reversal"


class NeutralizationMode(str, Enum):
    NONE = "none"
    SECTOR = "sector"


class CandidateStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    EXECUTED = "executed"
    REVISED = "revised"
    REVIEWABLE = "reviewable"
    REJECTED = "rejected"


class AttemptType(str, Enum):
    CANDIDATE_RUN = "candidate_run"
    CODE_FIX = "code_fix"
    FACTOR_REVISION = "factor_revision"


class ExecutionStatus(str, Enum):
    PENDING = "pending"
    SUCCEEDED = "succeeded"
    EXECUTION_FAILED = "execution_failed"


class FactorQuality(str, Enum):
    NOT_EVALUATED = "not_evaluated"
    WEAK = "weak"
    PROMISING = "promising"
    SUSPICIOUS = "suspicious"
    PASSED = "passed"


class TerminalState(str, Enum):
    COMPLETED_APPROVED = "completed_approved"
    COMPLETED_REJECTED = "completed_rejected"
    FAILED_DATA_VALIDATION = "failed_data_validation"
    FAILED_NO_REVIEWABLE_CANDIDATES = "failed_no_reviewable_candidates"


class PackageType(str, Enum):
    RESEARCH_PACKAGE = "research_package"
    FAILED_RUN_PACKAGE = "failed_run_package"


class DatasetValidationStatus(str, Enum):
    PENDING = "pending"
    VALID = "valid"
    INVALID = "invalid"


class FactorSpec(BaseModel):
    name: str
    thesis: str
    expression: str
    universe: str = "uploaded-long-format-csv"
    rebalance: str = "daily"
    direction: str = "long_short"


class ParsedExpression(BaseModel):
    root: str
    metric: str
    field: str
    return_window: int
    volatility_window: int | None = None
    negated: bool = False

    @property
    def window(self) -> int:
        return self.return_window


class StrategyConfig(BaseModel):
    expression: str
    neutralization: NeutralizationMode = NeutralizationMode.NONE
    transaction_cost_bps: int = 10
    long_quantile: float = 0.75
    short_quantile: float = 0.25
    is_ratio: float = 0.70


class GeneratedCode(BaseModel):
    filename: str = "generated_strategy.py"
    commentary: str
    script: str


class DatasetSummary(BaseModel):
    label: str
    row_count: int
    ticker_count: int
    start_date: str
    end_date: str


class DatasetValidationResult(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    status: DatasetValidationStatus = DatasetValidationStatus.PENDING
    errors: list[str] = Field(default_factory=list)
    available_columns: list[str] = Field(default_factory=list)
    column_dtypes: dict[str, str] = Field(default_factory=dict)
    sample_rows: list[dict] = Field(default_factory=list)
    detected_columns: dict[str, str] = Field(default_factory=dict)
    row_count: int = 0
    ticker_count: int = 0
    start_date: str | None = None
    end_date: str | None = None
    normalized_dataset_path: str | None = None
    summary: DatasetSummary | None = None
    normalized_frame: Any | None = Field(default=None, exclude=True)


class ResearchPlan(BaseModel):
    signal_intent: SignalIntent
    allowed_columns: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    success_criteria: dict[str, float | int | str] = Field(default_factory=dict)
    max_candidate_attempts: int = 5
    max_revisions: int = 2
    max_code_fixes_per_candidate: int = 1
    sector_neutral_required: bool = False


class CandidateSpec(BaseModel):
    candidate_id: str
    name: str
    thesis: str
    expression: str
    neutralization: NeutralizationMode = NeutralizationMode.NONE
    complexity_score: int
    status: CandidateStatus = CandidateStatus.PENDING
    warning: str | None = None

    def to_factor_spec(self) -> FactorSpec:
        return FactorSpec(
            name=self.name,
            thesis=self.thesis,
            expression=self.expression,
        )


class HypothesisOutput(BaseModel):
    factor_spec: FactorSpec


class CodegenOutput(BaseModel):
    strategy_config: StrategyConfig
    generated_code: GeneratedCode


class ExecutionResult(BaseModel):
    success: bool
    stdout: str = ""
    stderr: str = ""
    traceback: str | None = None
    metrics: dict[str, float | int | str] = Field(default_factory=dict)
    runtime_seconds: float | None = None
    artifact_path: str | None = None


class EvaluationResult(BaseModel):
    execution_status: ExecutionStatus = ExecutionStatus.PENDING
    factor_quality: FactorQuality = FactorQuality.NOT_EVALUATED
    is_reviewable: bool = False
    warning: str | None = None
    needs_revision: bool = False
    reasons: list[str] = Field(default_factory=list)
    scorecard: dict[str, Any] = Field(default_factory=dict)
    summary: str


class Critique(BaseModel):
    summary: str
    root_cause: str
    revision_instructions: str


class CriticOutput(BaseModel):
    evaluation: EvaluationResult
    critique: Critique
    needs_revision: bool


class AttemptRecord(BaseModel):
    attempt_number: int
    candidate_id: str
    attempt_type: AttemptType
    execution_status: ExecutionStatus
    factor_quality: FactorQuality
    revision_reason: str | None = None
    factor_spec: FactorSpec
    generated_code: GeneratedCode | None = None
    execution_result: ExecutionResult
    evaluation: EvaluationResult
    critique: Critique | None = None
    artifact_paths: dict[str, str] = Field(default_factory=dict)


class RunSnapshot(BaseModel):
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
    pending_attempt_type: AttemptType | None = AttemptType.CANDIDATE_RUN
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
    attempts: list[AttemptRecord] = Field(default_factory=list)
    terminal_state: TerminalState | None = None
    package_type: PackageType | None = None
    final_recommendation: str | None = None
    review_warning: str | None = None
    final_report_path: str | None = None
    artifact_paths: dict[str, str] = Field(default_factory=dict)
    interim_hil_next: str | None = None


class CreateRunRequest(BaseModel):
    brief: str | None = None


class ApproveRunRequest(BaseModel):
    approved: bool
