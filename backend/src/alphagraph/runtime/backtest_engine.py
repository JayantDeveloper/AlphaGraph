from __future__ import annotations

import time
import traceback as tb
from pathlib import Path

import numpy as np
import pandas as pd

from alphagraph.runtime.factor_dsl import parse_expression
from alphagraph.schemas import EvaluationResult, ExecutionResult, ExecutionStatus, FactorQuality, NeutralizationMode


def run_backtest_from_expression(
    dataset_path: Path,
    expression: str,
    *,
    neutralization: NeutralizationMode | str = NeutralizationMode.NONE,
    transaction_cost_bps: int = 10,
    long_quantile: float = 0.75,
    short_quantile: float = 0.25,
    is_ratio: float = 0.70,
) -> ExecutionResult:
    started = time.perf_counter()
    try:
        neutralization = NeutralizationMode(neutralization)
        parsed = parse_expression(expression)
        frame = pd.read_csv(dataset_path, parse_dates=["date"]).sort_values(["symbol", "date"])
        if "symbol" not in frame.columns:
            raise ValueError("Dataset must contain a symbol column after normalization.")

        returns_1d = frame.groupby("symbol")["close"].pct_change()
        factor = frame.groupby("symbol")["close"].pct_change(parsed.return_window)
        if parsed.volatility_window is not None:
            volatility = (
                returns_1d.groupby(frame["symbol"])
                .rolling(parsed.volatility_window)
                .std()
                .reset_index(level=0, drop=True)
            )
            factor = factor / volatility.replace(0, np.nan)
        if parsed.negated:
            factor = -factor

        frame["factor"] = factor
        if neutralization == NeutralizationMode.SECTOR:
            if "sector" not in frame.columns:
                raise ValueError("Sector neutralization requested but sector column is missing.")
            frame["factor"] = frame["factor"] - frame.groupby(["date", "sector"])["factor"].transform("mean")

        frame["forward_return"] = frame.groupby("symbol")["close"].pct_change().shift(-1)
        ranked = frame.dropna(subset=["factor", "forward_return"]).copy()
        if ranked.empty:
            raise ValueError("No valid rows remain after factor calculation.")

        ranked["factor_rank"] = ranked.groupby("date")["factor"].rank(method="first", pct=True)
        ranked["position"] = 0.0
        ranked.loc[ranked["factor_rank"] >= long_quantile, "position"] = 1.0
        ranked.loc[ranked["factor_rank"] <= short_quantile, "position"] = -1.0
        active = ranked[ranked["position"] != 0].copy()
        if active.empty:
            raise ValueError("No active positions generated for factor.")

        active["weighted_return"] = active["position"] * active["forward_return"]
        daily = (
            active.groupby("date")
            .agg(
                gross_return=("weighted_return", "mean"),
                breadth=("symbol", "nunique"),
            )
            .reset_index()
            .sort_values("date")
        )

        position_matrix = (
            active.pivot(index="date", columns="symbol", values="position")
            .fillna(0.0)
            .sort_index()
        )
        turnover_series = position_matrix.diff().abs().sum(axis=1) / 2.0
        turnover_series = turnover_series.fillna(0.0)
        daily = daily.merge(turnover_series.rename("turnover"), left_on="date", right_index=True, how="left")
        daily["turnover"] = daily["turnover"].fillna(0.0)
        daily["transaction_cost"] = daily["turnover"] * (transaction_cost_bps / 10_000.0)
        daily["portfolio_return"] = daily["gross_return"] - daily["transaction_cost"]

        returns = daily["portfolio_return"].astype(float)
        split_index = max(1, min(len(daily) - 1, int(len(daily) * is_ratio))) if len(daily) > 1 else 1
        is_returns = returns.iloc[:split_index]
        oos_returns = returns.iloc[split_index:]
        equity_curve = (1.0 + returns).cumprod()
        running_peak = equity_curve.cummax()
        drawdown = (equity_curve / running_peak) - 1.0

        metrics = {
            "is_return": float((1.0 + is_returns).prod() - 1.0) if len(is_returns) else 0.0,
            "oos_return": float((1.0 + oos_returns).prod() - 1.0) if len(oos_returns) else 0.0,
            "is_sharpe": _annualized_sharpe(is_returns),
            "oos_sharpe": _annualized_sharpe(oos_returns),
            "total_return": float(equity_curve.iloc[-1] - 1.0),
            "volatility": float(returns.std(ddof=0) * np.sqrt(252)) if len(returns) else 0.0,
            "max_drawdown": float(drawdown.min()) if len(drawdown) else 0.0,
            "trade_count": int(active.shape[0]),
            "breadth": int(daily["breadth"].min()) if len(daily) else 0,
            "turnover": float(daily["turnover"].mean()) if len(daily) else 0.0,
            "num_days": int(daily.shape[0]),
        }
        return ExecutionResult(
            success=True,
            metrics=metrics,
            runtime_seconds=round(time.perf_counter() - started, 6),
        )
    except Exception as exc:  # pragma: no cover - exercised via graph/API tests
        return ExecutionResult(
            success=False,
            stderr=str(exc),
            traceback=tb.format_exc(),
            metrics={},
            runtime_seconds=round(time.perf_counter() - started, 6),
        )


def evaluate_execution(
    expression: str,
    execution: ExecutionResult,
) -> EvaluationResult:
    if not execution.success:
        return EvaluationResult(
            execution_status=ExecutionStatus.EXECUTION_FAILED,
            factor_quality=FactorQuality.NOT_EVALUATED,
            is_reviewable=False,
            needs_revision=True,
            reasons=["execution_failed"],
            scorecard=execution.metrics,
            summary="The generated backtest failed to execute.",
        )

    trade_count = int(execution.metrics.get("trade_count", 0))
    oos_sharpe = float(execution.metrics.get("oos_sharpe", 0.0))
    is_sharpe = float(execution.metrics.get("is_sharpe", 0.0))
    max_drawdown = float(execution.metrics.get("max_drawdown", 0.0))
    breadth = int(execution.metrics.get("breadth", 0))
    turnover = float(execution.metrics.get("turnover", 0.0))

    hard_gate_reasons: list[str] = []
    if max_drawdown < -0.25:
        hard_gate_reasons.append("drawdown_too_deep")
    if breadth < 2:
        hard_gate_reasons.append("insufficient_breadth")
    if trade_count < 20:
        hard_gate_reasons.append("insufficient_trades")
    if turnover > 1.5:
        hard_gate_reasons.append("turnover_too_high")

    suspicious = (is_sharpe - oos_sharpe > 0.75) or (is_sharpe >= 0.35 and oos_sharpe < 0.10)

    if suspicious:
        return EvaluationResult(
            execution_status=ExecutionStatus.SUCCEEDED,
            factor_quality=FactorQuality.SUSPICIOUS,
            is_reviewable=True,
            warning="Out-of-sample decay or instability detected.",
            needs_revision=True,
            reasons=["out_of_sample_decay"],
            scorecard=execution.metrics,
            summary="The factor executed, but out-of-sample decay makes it suspicious.",
        )

    if not hard_gate_reasons and oos_sharpe >= 0.35:
        return EvaluationResult(
            execution_status=ExecutionStatus.SUCCEEDED,
            factor_quality=FactorQuality.PASSED,
            is_reviewable=True,
            needs_revision=False,
            reasons=[],
            scorecard=execution.metrics,
            summary="The factor cleared the deterministic research thresholds.",
        )

    if not hard_gate_reasons and oos_sharpe >= 0.15:
        return EvaluationResult(
            execution_status=ExecutionStatus.SUCCEEDED,
            factor_quality=FactorQuality.PROMISING,
            is_reviewable=True,
            needs_revision=False,
            reasons=[],
            scorecard=execution.metrics,
            summary="The factor is promising enough to review, but it did not fully clear the pass gate.",
        )

    reasons = [*hard_gate_reasons]
    if oos_sharpe < 0.15:
        reasons.append("weak_oos_sharpe")
    if expression.strip().startswith("-rank(") and oos_sharpe < 0:
        reasons.append("reversal_signal_negative")

    return EvaluationResult(
        execution_status=ExecutionStatus.SUCCEEDED,
        factor_quality=FactorQuality.WEAK,
        is_reviewable=False,
        needs_revision=True,
        reasons=reasons,
        scorecard=execution.metrics,
        summary="The factor executed successfully, but performance was too weak to review.",
    )


def _annualized_sharpe(series: pd.Series) -> float:
    values = series.astype(float)
    if len(values) == 0 or values.std(ddof=0) == 0:
        return 0.0
    return float(np.sqrt(252) * values.mean() / values.std(ddof=0))
