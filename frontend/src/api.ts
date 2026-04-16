export type RunPhase =
  | "initial"
  | "brief_ingested"
  | "dataset_ingested"
  | "dataset_validated"
  | "plan_ready"
  | "candidates_ready"
  | "code_ready"
  | "execution_complete"
  | "evaluation_complete"
  | "awaiting_approval"
  | "finalized";

export type SupervisorDecision =
  | "ingest_dataset"
  | "validate_dataset"
  | "parse_research_plan"
  | "generate_candidates"
  | "generate_code"
  | "execute_backtest"
  | "evaluate_results"
  | "code_fix"
  | "revise_factor"
  | "run_human_review"
  | "finalize"
  | "stop";

export type WorkflowNode =
  | "ingest_brief"
  | "ingest_dataset"
  | "validate_dataset"
  | "parse_research_plan"
  | "generate_candidates"
  | "generate_code"
  | "execute_backtest"
  | "evaluate_results"
  | "code_fix"
  | "revise_factor"
  | "human_in_the_loop"
  | "finalize_run";

export type AttemptType = "candidate_run" | "code_fix" | "factor_revision";
export type ExecutionStatus = "pending" | "succeeded" | "execution_failed";
export type FactorQuality = "not_evaluated" | "weak" | "promising" | "suspicious" | "passed";
export type CandidateStatus = "pending" | "running" | "executed" | "revised" | "reviewable" | "rejected";
export type PackageType = "research_package" | "failed_run_package";
export type TerminalState =
  | "completed_approved"
  | "completed_rejected"
  | "failed_data_validation"
  | "failed_no_reviewable_candidates";

export type FactorSpec = {
  name: string;
  thesis: string;
  expression: string;
  universe: string;
  rebalance: string;
  direction: string;
};

export type GeneratedCode = {
  filename: string;
  commentary: string;
  script: string;
};

export type ExecutionResult = {
  success: boolean;
  stdout: string;
  stderr: string;
  traceback?: string | null;
  metrics: Record<string, number | string>;
  runtime_seconds?: number | null;
  artifact_path: string | null;
};

export type EvaluationResult = {
  execution_status: ExecutionStatus;
  factor_quality: FactorQuality;
  is_reviewable: boolean;
  warning?: string | null;
  needs_revision: boolean;
  reasons: string[];
  scorecard: Record<string, number | string>;
  summary: string;
};

export type Critique = {
  summary: string;
  root_cause: string;
  revision_instructions: string;
};

export type AttemptRecord = {
  attempt_number: number;
  candidate_id: string;
  attempt_type: AttemptType;
  execution_status: ExecutionStatus;
  factor_quality: FactorQuality;
  revision_reason?: string | null;
  factor_spec: FactorSpec;
  generated_code: GeneratedCode | null;
  execution_result: ExecutionResult;
  evaluation: EvaluationResult;
  critique: Critique | null;
  artifact_paths: Record<string, string>;
};

export type DatasetSummary = {
  label: string;
  row_count: number;
  ticker_count: number;
  start_date: string;
  end_date: string;
};

export type DatasetValidationResult = {
  status: "pending" | "valid" | "invalid";
  errors: string[];
  available_columns: string[];
  row_count: number;
  ticker_count: number;
  start_date?: string | null;
  end_date?: string | null;
  normalized_dataset_path?: string | null;
  summary?: DatasetSummary | null;
};

export type ResearchPlan = {
  signal_intent: "mean_reversion" | "momentum" | "volatility_adjusted_reversal";
  allowed_columns: string[];
  constraints: string[];
  success_criteria: Record<string, number | string>;
  max_candidate_attempts: number;
  max_revisions: number;
  max_code_fixes_per_candidate: number;
  sector_neutral_required: boolean;
};

export type CandidateSpec = {
  candidate_id: string;
  name: string;
  thesis: string;
  expression: string;
  neutralization: "none" | "sector";
  complexity_score: number;
  status: CandidateStatus;
  warning?: string | null;
};

export type RunSnapshot = {
  run_id: string;
  brief: string;
  parsed_brief?: Record<string, unknown> | null;
  dataset_path?: string | null;
  dataset_label: string | null;
  dataset_summary: DatasetSummary | null;
  dataset_validation?: DatasetValidationResult | null;
  research_plan?: ResearchPlan | null;
  candidate_pool: CandidateSpec[];
  active_candidate_id?: string | null;
  reviewable_candidate_ids?: string[];
  best_candidate_id?: string | null;
  current_evaluation?: EvaluationResult | null;
  status: string;
  phase: RunPhase;
  attempt: number;
  max_attempts: number;
  revision_count?: number;
  approval_status: string;
  supervisor_decision: SupervisorDecision;
  current_node: WorkflowNode | null;
  workflow_trace: WorkflowNode[];
  attempts: AttemptRecord[];
  terminal_state?: TerminalState | null;
  package_type?: PackageType | null;
  final_recommendation?: string | null;
  review_warning?: string | null;
  final_report_path: string | null;
  artifact_paths: Record<string, string>;
  /** Set when HIL is paused mid-run before a revision (not the final approval). */
  interim_hil_next?: string | null;
};

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    try {
      const payload = (await response.json()) as { detail?: string };
      throw new Error(payload.detail ?? `Request failed with status ${response.status}`);
    } catch {
      throw new Error(`Request failed with status ${response.status}`);
    }
  }
  return (await response.json()) as T;
}

export async function createRun(options?: {
  brief?: string;
  datasetFile?: File | null;
  kaggleRef?: string;
  kaggleTitle?: string;
}): Promise<RunSnapshot> {
  const brief = options?.brief?.trim();
  const datasetFile = options?.datasetFile ?? null;
  const kaggleRef = options?.kaggleRef ?? null;
  const kaggleTitle = options?.kaggleTitle ?? null;

  const response = datasetFile || brief || kaggleRef
    ? await fetch("/runs", {
        method: "POST",
        body: (() => {
          const payload = new FormData();
          if (brief) payload.append("brief", brief);
          if (datasetFile) payload.append("dataset", datasetFile);
          if (kaggleRef) payload.append("kaggle_ref", kaggleRef);
          if (kaggleTitle) payload.append("kaggle_title", kaggleTitle);
          return payload;
        })(),
      })
    : await fetch("/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
  return parseJson<RunSnapshot>(response);
}

export type KaggleDataset = {
  ref: string;
  title: string;
  subtitle: string;
  url: string;
  size_bytes: number;
  last_updated: string;
  vote_count: number;
  download_count: number;
};

export async function suggestDatasets(query: string): Promise<KaggleDataset[]> {
  try {
    const response = await fetch(`/datasets/suggest?query=${encodeURIComponent(query)}`);
    if (!response.ok) return [];
    const data = (await response.json()) as { datasets: KaggleDataset[] };
    return data.datasets ?? [];
  } catch {
    return [];
  }
}

export async function approveRun(runId: string, approved: boolean): Promise<RunSnapshot> {
  const response = await fetch(`/runs/${runId}/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ approved }),
  });
  return parseJson<RunSnapshot>(response);
}

/**
 * Fetch the latest snapshot for an in-progress or completed run.
 * Used for polling while the run executes in the background.
 */
export async function getRun(runId: string): Promise<RunSnapshot> {
  const response = await fetch(`/runs/${runId}`);
  return parseJson<RunSnapshot>(response);
}

/**
 * Inject researcher guidance mid-run.  The next revision or candidate
 * generation step will pick it up and adapt the pipeline accordingly.
 */
export async function injectGuidance(runId: string, guidance: string): Promise<void> {
  await fetch(`/runs/${runId}/guidance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guidance }),
  });
}
