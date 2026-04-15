from pathlib import Path

from alphagraph.runtime.backtest_engine import (
    evaluate_execution,
    run_backtest_from_expression,
)
from alphagraph.schemas import ExecutionResult, ExecutionStatus, FactorQuality


DATASET_PATH = Path(__file__).resolve().parents[1] / "data" / "prices.csv"


def test_backtest_metrics_split_in_sample_and_out_of_sample() -> None:
    execution = run_backtest_from_expression(
        dataset_path=DATASET_PATH,
        expression="rank(ts_return(close, 5))",
    )

    assert execution.success is True
    assert execution.metrics["trade_count"] >= 40
    assert "is_sharpe" in execution.metrics
    assert "oos_sharpe" in execution.metrics
    assert execution.metrics["max_drawdown"] > -0.25
    assert "turnover" in execution.metrics
    assert "breadth" in execution.metrics


def test_evaluator_marks_execution_failures_as_not_evaluated() -> None:
    execution = ExecutionResult(
        success=False,
        stderr="boom",
    )

    evaluation = evaluate_execution(
        expression="rank(ts_return(close, 5))",
        execution=execution,
    )

    assert evaluation.execution_status == ExecutionStatus.EXECUTION_FAILED
    assert evaluation.factor_quality == FactorQuality.NOT_EVALUATED
    assert evaluation.is_reviewable is False
    assert "execution_failed" in evaluation.reasons


def test_evaluator_marks_weak_but_successful_factors_as_weak() -> None:
    execution = ExecutionResult(
        success=True,
        metrics={
            "is_sharpe": 0.12,
            "oos_sharpe": 0.04,
            "max_drawdown": -0.04,
            "trade_count": 80,
            "breadth": 5,
            "turnover": 0.8,
        },
    )

    evaluation = evaluate_execution(
        expression="-rank(ts_return(close, 5))",
        execution=execution,
    )

    assert evaluation.execution_status == ExecutionStatus.SUCCEEDED
    assert evaluation.factor_quality == FactorQuality.WEAK
    assert evaluation.is_reviewable is False


def test_evaluator_marks_out_of_sample_decay_as_suspicious_and_reviewable() -> None:
    execution = ExecutionResult(
        success=True,
        metrics={
            "is_sharpe": 1.25,
            "oos_sharpe": -0.05,
            "max_drawdown": -0.06,
            "trade_count": 120,
            "breadth": 5,
            "turnover": 0.7,
        },
    )

    evaluation = evaluate_execution(
        expression="rank(ts_return(close, 10))",
        execution=execution,
    )

    assert evaluation.execution_status == ExecutionStatus.SUCCEEDED
    assert evaluation.factor_quality == FactorQuality.SUSPICIOUS
    assert evaluation.is_reviewable is True
    assert evaluation.warning is not None
