import pytest

from alphagraph.runtime.dataset_csv import validate_and_normalize_dataset_csv
from alphagraph.schemas import DatasetValidationStatus


def test_validate_and_normalize_dataset_csv_accepts_long_format_and_normalizes_ticker() -> None:
    result = validate_and_normalize_dataset_csv(
        "sample.csv",
        _sample_csv(include_sector=True).encode("utf-8"),
        sector_neutral_required=False,
    )

    assert result.status == DatasetValidationStatus.VALID
    assert result.summary is not None
    assert result.summary.label == "sample.csv"
    assert result.summary.row_count == 50
    assert result.summary.ticker_count == 2
    assert result.available_columns == ["close", "date", "sector", "ticker", "volume"]
    assert result.normalized_frame is not None
    assert list(result.normalized_frame.columns) == ["date", "symbol", "close", "volume", "sector"]
    assert result.normalized_frame.iloc[0]["symbol"] == "AAPL"


def test_validate_and_normalize_dataset_csv_rejects_missing_required_columns() -> None:
    raw_csv = (
        "date,close\n"
        "2024-01-02,172.00\n"
        "2024-01-03,173.00\n"
    ).encode("utf-8")

    result = validate_and_normalize_dataset_csv(
        "bad.csv",
        raw_csv,
        sector_neutral_required=False,
    )

    assert result.status == DatasetValidationStatus.INVALID
    assert any("required columns" in error.lower() for error in result.errors)


def test_validate_and_normalize_dataset_csv_rejects_invalid_dates() -> None:
    raw_csv = _sample_csv().replace("2024-01-05", "not-a-date", 1).encode("utf-8")

    result = validate_and_normalize_dataset_csv(
        "bad-dates.csv",
        raw_csv,
        sector_neutral_required=False,
    )

    assert result.status == DatasetValidationStatus.INVALID
    assert any("invalid dates" in error.lower() for error in result.errors)


def test_validate_and_normalize_dataset_csv_rejects_duplicate_date_ticker_rows() -> None:
    rows = _sample_rows()
    rows.insert(2, rows[1])
    raw_csv = "date,ticker,close,volume\n" + "\n".join(rows)

    result = validate_and_normalize_dataset_csv(
        "dupe.csv",
        raw_csv.encode("utf-8"),
        sector_neutral_required=False,
    )

    assert result.status == DatasetValidationStatus.INVALID
    assert any("duplicate" in error.lower() for error in result.errors)


def test_validate_and_normalize_dataset_csv_requires_enough_history() -> None:
    result = validate_and_normalize_dataset_csv(
        "short.csv",
        _sample_csv(days=12).encode("utf-8"),
        sector_neutral_required=False,
    )

    assert result.status == DatasetValidationStatus.INVALID
    assert any("at least 25 rows" in error.lower() for error in result.errors)


def test_validate_and_normalize_dataset_csv_requires_sector_when_sector_neutral_requested() -> None:
    result = validate_and_normalize_dataset_csv(
        "sectorless.csv",
        _sample_csv(include_sector=False).encode("utf-8"),
        sector_neutral_required=True,
    )

    assert result.status == DatasetValidationStatus.INVALID
    assert any("sector" in error.lower() for error in result.errors)


def _sample_csv(*, include_sector: bool = False, days: int = 25) -> str:
    columns = ["date", "ticker", "close", "volume"]
    if include_sector:
        columns.append("sector")
    rows = _sample_rows(days=days, include_sector=include_sector)
    return ",".join(columns) + "\n" + "\n".join(rows)


def _sample_rows(*, days: int = 25, include_sector: bool = False) -> list[str]:
    rows: list[str] = []
    for offset in range(days):
        day = offset + 2
        aapl = [f"2024-01-{day:02d}", "AAPL", f"{172 + offset:.2f}", "100"]
        msft = [f"2024-01-{day:02d}", "MSFT", f"{372 + offset:.2f}", "100"]
        if include_sector:
            aapl.append("Technology")
            msft.append("Technology")
        rows.append(",".join(aapl))
        rows.append(",".join(msft))
    return rows
