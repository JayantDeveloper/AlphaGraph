from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph

from alphagraph.graph.nodes import (
    code_fix,
    generate_candidates,
    human_in_the_loop,
    ingest_brief,
    ingest_dataset,
    make_evaluate_results_node,
    make_execute_backtest_node,
    make_finalize_node,
    make_generate_code_node,
    make_validate_dataset_node,
    parse_research_plan,
    request_interim_review,
    revise_factor,
    route_after_candidate_selection,
    route_after_dataset_validation,
    route_after_hil,
    route_next_candidate,
    route_post_evaluation,
)
from alphagraph.graph.state import RunState
from alphagraph.llm.provider import AgentSuite, LLMProvider, build_agent_suite
from alphagraph.runtime.sandbox import SandboxRunner
from alphagraph.storage.artifacts import ArtifactStore


@dataclass
class WorkflowRuntime:
    graph: object
    checkpointer: SqliteSaver
    checkpoint_conn: sqlite3.Connection
    artifact_store: ArtifactStore


def create_workflow(provider: LLMProvider | AgentSuite, base_dir: Path) -> WorkflowRuntime:
    data_dir = base_dir / ".data"
    data_dir.mkdir(parents=True, exist_ok=True)
    artifact_store = ArtifactStore(base_dir / "artifacts")
    checkpoint_conn = sqlite3.connect(
        data_dir / "checkpoints.sqlite",
        check_same_thread=False,
    )
    checkpointer = SqliteSaver(checkpoint_conn)
    checkpointer.setup()
    runner = SandboxRunner(project_src=Path(__file__).resolve().parents[2], artifact_store=artifact_store)
    agent_suite = provider if isinstance(provider, AgentSuite) else build_agent_suite(provider)

    builder = StateGraph(RunState)
    builder.add_node("ingest_brief", ingest_brief)
    builder.add_node("ingest_dataset", ingest_dataset)
    builder.add_node("validate_dataset", make_validate_dataset_node(artifact_store))
    builder.add_node("parse_research_plan", parse_research_plan)
    builder.add_node("generate_candidates", generate_candidates)
    builder.add_node("route_next_candidate", route_next_candidate)
    builder.add_node("generate_code", make_generate_code_node(agent_suite))
    builder.add_node("execute_backtest", make_execute_backtest_node(runner))
    builder.add_node("evaluate_results", make_evaluate_results_node(agent_suite, artifact_store))
    builder.add_node("code_fix", code_fix)
    builder.add_node("revise_factor", revise_factor)
    builder.add_node("request_interim_review", request_interim_review)
    builder.add_node("human_review", human_in_the_loop)
    builder.add_node("finalize_run", make_finalize_node(artifact_store))

    builder.add_edge(START, "ingest_brief")
    builder.add_edge("ingest_brief", "ingest_dataset")
    builder.add_edge("ingest_dataset", "validate_dataset")
    builder.add_conditional_edges(
        "validate_dataset",
        route_after_dataset_validation,
        {
            "parse_research_plan": "parse_research_plan",
            "finalize": "finalize_run",
        },
    )
    builder.add_edge("parse_research_plan", "generate_candidates")
    builder.add_edge("generate_candidates", "route_next_candidate")
    builder.add_conditional_edges(
        "route_next_candidate",
        route_after_candidate_selection,
        {
            "generate_code": "generate_code",
            "human_review": "human_review",
            "finalize": "finalize_run",
        },
    )
    builder.add_edge("generate_code", "execute_backtest")
    builder.add_edge("execute_backtest", "evaluate_results")
    builder.add_conditional_edges(
        "evaluate_results",
        route_post_evaluation,
        {
            "code_fix": "code_fix",
            "request_interim_review": "request_interim_review",
            "route_next_candidate": "route_next_candidate",
            "human_review": "human_review",
            "finalize": "finalize_run",
        },
    )
    builder.add_edge("code_fix", "generate_code")
    builder.add_edge("revise_factor", "generate_code")
    # Interim review feeds straight into the same HIL node.
    builder.add_edge("request_interim_review", "human_review")
    # After HIL, route based on whether this was interim or the final review.
    builder.add_conditional_edges(
        "human_review",
        route_after_hil,
        {
            "revise_factor": "revise_factor",
            "route_next_candidate": "route_next_candidate",
            "finalize": "finalize_run",
        },
    )
    builder.add_edge("finalize_run", END)

    return WorkflowRuntime(
        graph=builder.compile(checkpointer=checkpointer),
        checkpointer=checkpointer,
        checkpoint_conn=checkpoint_conn,
        artifact_store=artifact_store,
    )
