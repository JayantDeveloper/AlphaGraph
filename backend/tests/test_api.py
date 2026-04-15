from pathlib import Path

from fastapi.testclient import TestClient

from alphagraph.app import create_app


def test_api_starts_reviewable_run_returns_expanded_snapshot_and_allows_approval(tmp_path: Path) -> None:
    app = create_app(
        base_dir=tmp_path,
        dataset_path=Path(__file__).resolve().parents[1] / "data" / "prices.csv",
        run_mode="inline",
    )
    client = TestClient(app)

    created = client.post("/runs", json={"brief": "test short-term momentum"})
    assert created.status_code == 201

    payload = created.json()
    assert payload["status"] == "awaiting_approval"
    assert payload["approval_status"] == "pending"
    assert payload["phase"] == "awaiting_approval"
    assert payload["package_type"] == "research_package"
    assert payload["terminal_state"] is None
    assert "dataset_validation" in payload
    assert "research_plan" in payload
    assert "candidate_pool" in payload
    assert payload["best_candidate_id"] is not None

    run_id = payload["run_id"]

    fetched = client.get(f"/runs/{run_id}")
    assert fetched.status_code == 200
    assert fetched.json()["run_id"] == run_id

    approved = client.post(f"/runs/{run_id}/approve", json={"approved": True})
    assert approved.status_code == 200
    assert approved.json()["terminal_state"] == "completed_approved"
    assert approved.json()["package_type"] == "research_package"
    assert approved.json()["final_report_path"] is not None

    report_name = Path(approved.json()["final_report_path"]).name
    artifact = client.get(f"/runs/{run_id}/artifacts/{report_name}")
    assert artifact.status_code == 200
    assert "terminal_state" in artifact.text


def test_api_invalid_dataset_returns_terminal_failed_run_snapshot(tmp_path: Path) -> None:
    app = create_app(
        base_dir=tmp_path,
        dataset_path=Path(__file__).resolve().parents[1] / "data" / "prices.csv",
        run_mode="inline",
    )
    client = TestClient(app)

    dataset_csv = _upload_csv(include_sector=False)

    created = client.post(
        "/runs",
        data={"brief": "sector neutral momentum"},
        files={"dataset": ("uploaded.csv", dataset_csv, "text/csv")},
    )
    assert created.status_code == 201

    payload = created.json()
    assert payload["brief"] == "sector neutral momentum"
    assert payload["dataset_label"] == "uploaded.csv"
    assert payload["phase"] == "finalized"
    assert payload["terminal_state"] == "failed_data_validation"
    assert payload["package_type"] == "failed_run_package"
    assert payload["approval_status"] == "not_requested"
    assert payload["final_report_path"] is not None


def test_api_accepts_uploaded_csv_and_returns_expanded_loop_snapshot(tmp_path: Path) -> None:
    app = create_app(
        base_dir=tmp_path,
        dataset_path=Path(__file__).resolve().parents[1] / "data" / "prices.csv",
        run_mode="inline",
    )
    client = TestClient(app)

    created = client.post(
        "/runs",
        data={"brief": "test 5-day momentum"},
        files={"dataset": ("uploaded.csv", _upload_csv(include_sector=True), "text/csv")},
    )
    assert created.status_code == 201

    payload = created.json()
    assert payload["brief"] == "test 5-day momentum"
    assert payload["dataset_label"] == "uploaded.csv"
    assert "dataset_validation" in payload
    assert "candidate_pool" in payload
    assert "attempts" in payload
    assert payload["package_type"] in {"research_package", "failed_run_package"}


def _upload_csv(*, include_sector: bool) -> str:
    columns = ["date", "ticker", "close", "volume"]
    if include_sector:
        columns.append("sector")
    rows = []
    for day in range(25):
        date = f"2024-01-{day + 2:02d}"
        aapl = [date, "AAPL", f"{172 + day:.2f}", "100"]
        msft = [date, "MSFT", f"{372 + day:.2f}", "100"]
        if include_sector:
            aapl.append("Technology")
            msft.append("Technology")
        rows.append(",".join(aapl))
        rows.append(",".join(msft))
    return ",".join(columns) + "\n" + "\n".join(rows)
