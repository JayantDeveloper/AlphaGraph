from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from langgraph.types import Command

from alphagraph.graph.workflow import WorkflowRuntime, create_workflow
from alphagraph.llm.provider import DemoLLMProvider, build_agent_suite
from alphagraph.schemas import (
    ApprovalState,
    AttemptType,
    PackageType,
    RunPhase,
    RunSnapshot,
    SupervisorDecision,
    WorkflowNode,
)
from alphagraph.storage.db import RunRepository


DEFAULT_BRIEF = (
    "Test a simple cross-sectional equity factor on this dataset."
)


@dataclass(frozen=True)
class UploadedDatasetInput:
    filename: str
    content: bytes


class AlphaGraphService:
    def __init__(
        self,
        *,
        base_dir: Path,
        dataset_path: Path,
        workflow: WorkflowRuntime | None = None,
        run_mode: str = "inline",
    ) -> None:
        self.base_dir = base_dir
        self.dataset_path = dataset_path
        self.workflow = workflow or create_workflow(build_agent_suite(DemoLLMProvider()), base_dir)
        self.run_mode = run_mode
        self.repository = RunRepository(base_dir / ".data" / "runs.sqlite")

    def create_run(
        self,
        brief: str | None = None,
        *,
        uploaded_dataset: UploadedDatasetInput | None = None,
    ) -> RunSnapshot:
        run_id = str(uuid4())
        resolved_dataset_path = self.dataset_path
        dataset_label = "Bundled Demo Dataset"
        artifact_paths: dict[str, str] = {}

        if uploaded_dataset is not None:
            uploaded_path = self.workflow.artifact_store.write_raw_uploaded_dataset(
                run_id,
                uploaded_dataset.filename,
                uploaded_dataset.content,
            )
            resolved_dataset_path = uploaded_path
            dataset_label = uploaded_dataset.filename
            artifact_paths["uploaded_dataset"] = str(uploaded_path)

        initial_state = {
            "run_id": run_id,
            "brief": brief or DEFAULT_BRIEF,
            "dataset_path": str(resolved_dataset_path),
            "dataset_label": dataset_label,
            "attempt": 0,
            "max_attempts": 5,
            "revision_count": 0,
            "pending_attempt_type": AttemptType.CANDIDATE_RUN,
            "pending_revision_reason": None,
            "approval_status": ApprovalState.NOT_REQUESTED,
            "phase": RunPhase.INITIAL,
            "supervisor_decision": SupervisorDecision.INGEST_DATASET,
            "current_node": WorkflowNode.INGEST_BRIEF,
            "workflow_trace": [],
            "status": "queued",
            "attempts": [],
            "candidate_pool": [],
            "reviewable_candidate_ids": [],
            "package_type": None,
            "artifact_paths": artifact_paths,
        }
        snapshot = self._invoke(run_id, initial_state)
        self.repository.save_snapshot(snapshot)
        return snapshot

    def approve_run(self, run_id: str, *, approved: bool) -> RunSnapshot:
        snapshot = self._invoke(run_id, Command(resume=approved))
        self.repository.save_snapshot(snapshot)
        return snapshot

    def get_run(self, run_id: str) -> RunSnapshot:
        snapshot = self.repository.get_snapshot(run_id)
        if snapshot is None:
            raise KeyError(run_id)
        return snapshot

    def _invoke(self, run_id: str, payload) -> RunSnapshot:
        config = {"configurable": {"thread_id": run_id}}
        self.workflow.graph.invoke(payload, config)
        state_snapshot = self.workflow.graph.get_state(config)
        return RunSnapshot.model_validate(state_snapshot.values)
