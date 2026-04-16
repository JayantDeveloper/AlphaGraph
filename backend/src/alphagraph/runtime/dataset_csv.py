from __future__ import annotations

import json
from io import BytesIO
from pathlib import Path

import pandas as pd

from alphagraph.schemas import DatasetSummary, DatasetValidationResult, DatasetValidationStatus

MIN_ROWS_PER_TICKER = 25

# Fuzzy-match aliases for detecting key column roles
_DATE_ALIASES = {"date", "datetime", "timestamp", "time", "dt", "trade_date", "trading_date", "day"}
_SYMBOL_ALIASES = {
    "ticker", "symbol", "stock", "code", "security", "asset",
    "name", "brand_name", "stock_ticker", "company", "firm",
}
_CLOSE_ALIASES = {
    "close", "adj_close", "adjusted_close", "price", "last_price",
    "close_price", "last", "adj close", "settle", "settlement", "closing_price",
}
_OPTIONAL_NUMERIC = ["open", "high", "low", "volume"]


def _detect(columns: list[str], aliases: set[str]) -> str | None:
    """Return the first column whose normalised name matches any alias."""
    normed = {col.strip().lower().replace(" ", "_"): col for col in columns}
    for alias in aliases:
        if alias in normed:
            return normed[alias]
    return None


def _safe_sample(frame: pd.DataFrame, n: int = 5) -> list[dict]:
    """Return up to n rows as JSON-serialisable dicts."""
    try:
        return json.loads(frame.head(n).to_json(orient="records", date_format="iso"))
    except Exception:
        return []


def validate_and_normalize_dataset_csv(
    filename: str,
    raw_bytes: bytes,
    *,
    sector_neutral_required: bool,
) -> DatasetValidationResult:
    result = DatasetValidationResult(
        status=DatasetValidationStatus.PENDING,
        errors=[],
        available_columns=[],
    )

    # ── 1. Parse ──────────────────────────────────────────────────────────────
    try:
        frame = pd.read_csv(BytesIO(raw_bytes))
    except Exception:
        result.status = DatasetValidationStatus.INVALID
        result.errors.append("Dataset upload must be a valid CSV file.")
        return result

    if frame.empty:
        result.status = DatasetValidationStatus.INVALID
        result.errors.append("Dataset upload is empty.")
        return result

    # Normalise column names (strip whitespace, lowercase)
    frame.columns = [col.strip().lower() for col in frame.columns]
    result.available_columns = sorted(frame.columns.tolist())
    result.column_dtypes = {col: str(frame[col].dtype) for col in frame.columns}
    result.sample_rows = _safe_sample(frame)

    # ── 2. Detect key column roles ────────────────────────────────────────────
    date_col = _detect(frame.columns.tolist(), _DATE_ALIASES)
    symbol_col = _detect(frame.columns.tolist(), _SYMBOL_ALIASES)
    close_col = _detect(frame.columns.tolist(), _CLOSE_ALIASES)

    detected: dict[str, str] = {}
    if date_col:
        detected["date"] = date_col
    if symbol_col:
        detected["symbol"] = symbol_col
    if close_col:
        detected["close"] = close_col
    result.detected_columns = detected

    # ── 3. Normalise if we can map all three key columns ─────────────────────
    if date_col and symbol_col and close_col:
        optional_cols = [
            c for c in [*_OPTIONAL_NUMERIC, "sector"]
            if c in frame.columns and c not in {date_col, symbol_col, close_col}
        ]
        selected = [date_col, symbol_col, close_col, *optional_cols]
        frame = frame[selected].copy()
        frame = frame.rename(columns={
            date_col: "date",
            symbol_col: "symbol",
            close_col: "close",
        })

        frame["date"] = (
            pd.to_datetime(frame["date"], errors="coerce", utc=True)
            .dt.tz_convert(None)
            .dt.normalize()
        )
        frame["symbol"] = frame["symbol"].astype(str).str.strip().str.upper()
        frame["close"] = pd.to_numeric(frame["close"], errors="coerce")

        for col in _OPTIONAL_NUMERIC:
            if col in frame.columns:
                frame[col] = pd.to_numeric(frame[col], errors="coerce")
        if "sector" in frame.columns:
            frame["sector"] = frame["sector"].astype(str).str.strip()

        # Drop rows where core fields are unusable
        frame = frame.dropna(subset=["date", "close"])
        frame = frame[frame["symbol"].ne("") & frame["symbol"].ne("NAN")]

        # Aggregate intraday duplicates (keep last close per day/symbol)
        if frame.duplicated(subset=["date", "symbol"]).any():
            agg: dict = {"close": "last"}
            for col in _OPTIONAL_NUMERIC:
                if col in frame.columns:
                    agg[col] = "last"
            if "sector" in frame.columns:
                agg["sector"] = "first"
            frame = frame.groupby(["date", "symbol"], as_index=False).agg(agg)

        # Drop tickers with too few rows (soft filter – never fail the run)
        if len(frame) > 0:
            sizes = frame.groupby("symbol").size()
            keep = sizes[sizes >= MIN_ROWS_PER_TICKER].index
            frame = frame[frame["symbol"].isin(keep)].copy()

        if frame.empty:
            result.status = DatasetValidationStatus.INVALID
            result.errors.append("No data rows remain after cleaning the dataset.")
            return result

        if sector_neutral_required and "sector" not in frame.columns:
            result.errors.append(
                "Sector-neutral research requires a sector column in the dataset."
            )
            result.status = DatasetValidationStatus.INVALID
            return result

        frame = frame.sort_values(["symbol", "date"]).reset_index(drop=True)
        frame["date"] = frame["date"].dt.strftime("%Y-%m-%d")

        ticker_count = int(frame["symbol"].nunique())
        summary = DatasetSummary(
            label=filename,
            row_count=int(frame.shape[0]),
            ticker_count=ticker_count,
            start_date=str(frame["date"].min()),
            end_date=str(frame["date"].max()),
        )
        result.row_count = summary.row_count
        result.ticker_count = ticker_count
        result.start_date = summary.start_date
        result.end_date = summary.end_date
        result.summary = summary
        result.normalized_frame = frame

    else:
        # Columns couldn't be fully mapped – pass the raw data through.
        # The coding agent will read the profile and write appropriate code.
        result.row_count = int(frame.shape[0])
        result.normalized_frame = frame

    result.status = DatasetValidationStatus.VALID
    return result


def validate_dataset_file(path: Path, *, sector_neutral_required: bool) -> DatasetValidationResult:
    return validate_and_normalize_dataset_csv(
        path.name,
        path.read_bytes(),
        sector_neutral_required=sector_neutral_required,
    )
