from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pandas as pd

from alphagraph.schemas import DatasetSummary, DatasetValidationResult, DatasetValidationStatus

REQUIRED_COLUMNS = {"date", "close"}
OPTIONAL_COLUMNS = ["open", "high", "low", "volume", "sector"]
MIN_TICKERS = 2
MIN_ROWS_PER_TICKER = 25


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
    try:
        frame = pd.read_csv(BytesIO(raw_bytes))
    except Exception:  # pragma: no cover - pandas exception text varies
        result.status = DatasetValidationStatus.INVALID
        result.errors.append("Dataset upload must be a valid CSV file.")
        return result

    if frame.empty:
        result.status = DatasetValidationStatus.INVALID
        result.errors.append("Dataset upload is empty.")
        return result

    normalized_columns = {column: column.strip().lower() for column in frame.columns}
    frame = frame.rename(columns=normalized_columns)
    result.available_columns = sorted(frame.columns.tolist())

    ticker_column = "ticker" if "ticker" in frame.columns else "symbol" if "symbol" in frame.columns else None
    missing = sorted(REQUIRED_COLUMNS - set(frame.columns))
    if ticker_column is None:
        missing.append("ticker")
    if missing:
        result.status = DatasetValidationStatus.INVALID
        result.errors.append(
            f"Dataset CSV is missing required columns: {', '.join(sorted(missing))}."
        )
        return result

    selected_columns = ["date", ticker_column, "close", *[column for column in OPTIONAL_COLUMNS if column in frame.columns]]
    frame = frame[selected_columns].copy()
    frame = frame.rename(columns={ticker_column: "symbol"})

    frame["date"] = pd.to_datetime(frame["date"], errors="coerce")
    frame["symbol"] = frame["symbol"].astype(str).str.strip().str.upper()
    frame["close"] = pd.to_numeric(frame["close"], errors="coerce")

    for column in OPTIONAL_COLUMNS:
        if column in frame.columns:
            frame[column] = pd.to_numeric(frame[column], errors="coerce") if column != "sector" else frame[column].astype(str).str.strip()

    if frame["date"].isna().any():
        result.errors.append("Dataset CSV has invalid dates in the date column.")
    if frame["symbol"].eq("").any():
        result.errors.append("Dataset CSV has empty ticker values.")
    if frame["close"].isna().any():
        result.errors.append("Dataset CSV has non-numeric close values.")

    duplicates = frame.duplicated(subset=["date", "symbol"])
    if duplicates.any():
        result.errors.append("Duplicate (date, ticker) rows are not allowed.")

    ticker_count = int(frame["symbol"].nunique())
    if ticker_count < MIN_TICKERS:
        result.errors.append(f"Dataset CSV must contain at least {MIN_TICKERS} tickers.")

    ticker_lengths = frame.groupby("symbol").size() if ticker_count else pd.Series(dtype=int)
    if not ticker_lengths.empty and int(ticker_lengths.min()) < MIN_ROWS_PER_TICKER:
        result.errors.append(
            f"Each ticker must contain at least {MIN_ROWS_PER_TICKER} rows for factor testing."
        )

    if sector_neutral_required and "sector" not in frame.columns:
        result.errors.append("Sector-neutral research requires a sector column in the dataset.")

    if result.errors:
        result.status = DatasetValidationStatus.INVALID
        return result

    frame = frame.sort_values(["symbol", "date"]).reset_index(drop=True)
    frame["date"] = frame["date"].dt.strftime("%Y-%m-%d")

    summary = DatasetSummary(
        label=filename,
        row_count=int(frame.shape[0]),
        ticker_count=ticker_count,
        start_date=str(frame["date"].min()),
        end_date=str(frame["date"].max()),
    )
    result.status = DatasetValidationStatus.VALID
    result.row_count = summary.row_count
    result.ticker_count = summary.ticker_count
    result.start_date = summary.start_date
    result.end_date = summary.end_date
    result.summary = summary
    result.normalized_frame = frame
    return result


def validate_dataset_file(path: Path, *, sector_neutral_required: bool) -> DatasetValidationResult:
    return validate_and_normalize_dataset_csv(
        path.name,
        path.read_bytes(),
        sector_neutral_required=sector_neutral_required,
    )
