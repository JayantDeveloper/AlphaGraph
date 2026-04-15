from __future__ import annotations

import re

from alphagraph.schemas import ParsedExpression


EXPRESSION_PATTERN = re.compile(
    r"^(?P<outer_neg>-)?rank\("
    r"(?P<inner_neg>-)?ts_return\(close,\s*(?P<return_window>\d+)\)"
    r"(?:\s*/\s*ts_std\(close,\s*(?P<volatility_window>\d+)\))?"
    r"\)$"
)


def parse_expression(expression: str) -> ParsedExpression:
    match = EXPRESSION_PATTERN.fullmatch(expression.strip())
    if not match:
        raise ValueError(f"Unsupported factor expression: {expression}")

    return_window = int(match.group("return_window"))
    volatility_window = match.group("volatility_window")
    parsed_volatility_window = int(volatility_window) if volatility_window is not None else None

    if return_window <= 0:
        raise ValueError(f"Unsupported factor window: {expression}")
    if parsed_volatility_window is not None and parsed_volatility_window <= 0:
        raise ValueError(f"Unsupported volatility window: {expression}")

    return ParsedExpression(
        root="rank",
        metric="ts_return",
        field="close",
        return_window=return_window,
        volatility_window=parsed_volatility_window,
        negated=match.group("outer_neg") == "-" or match.group("inner_neg") == "-",
    )
