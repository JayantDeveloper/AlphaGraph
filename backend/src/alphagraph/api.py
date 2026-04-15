from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

from alphagraph.schemas import ApproveRunRequest, CreateRunRequest
from alphagraph.service import UploadedDatasetInput


router = APIRouter()


@router.get("/datasets/suggest")
async def suggest_datasets(query: str = Query(..., min_length=1)):
    token = os.getenv("KAGGLE_API_TOKEN", "")
    if not token:
        return {"datasets": []}

    params = urllib.parse.urlencode({
        "search": query,
        "sortBy": "relevance",
        "fileType": "csv",
        "maxSize": 209715200,
        "page": 1,
    })
    url = f"https://www.kaggle.com/api/v1/datasets/list?{params}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
    except (urllib.error.URLError, urllib.error.HTTPError, Exception):
        return {"datasets": []}

    datasets = []
    for ds in (data or [])[:5]:
        ref = ds.get("ref", "")
        datasets.append({
            "ref": ref,
            "title": ds.get("title", ref),
            "subtitle": ds.get("subtitle", ""),
            "url": f"https://www.kaggle.com/datasets/{ref}",
            "size_bytes": ds.get("totalBytes", 0),
            "last_updated": ds.get("lastUpdated", ""),
            "vote_count": ds.get("voteCount", 0),
            "download_count": ds.get("downloadCount", 0),
        })
    return {"datasets": datasets}


@router.post("/runs", status_code=201)
async def create_run(request: Request):
    service = request.app.state.service
    content_type = request.headers.get("content-type", "")

    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        brief = form.get("brief")
        uploaded_dataset = None
        maybe_dataset = form.get("dataset")
        if getattr(maybe_dataset, "filename", ""):
            uploaded_dataset = UploadedDatasetInput(
                filename=maybe_dataset.filename,
                content=await maybe_dataset.read(),
            )
        snapshot = service.create_run(
            brief=brief if isinstance(brief, str) and brief.strip() else None,
            uploaded_dataset=uploaded_dataset,
        )
    else:
        raw_payload = await request.json() if request.headers.get("content-length") not in {None, "0"} else {}
        payload = CreateRunRequest.model_validate(raw_payload or {})
        snapshot = service.create_run(payload.brief)
    return snapshot.model_dump()


@router.get("/runs/{run_id}")
def get_run(run_id: str, request: Request):
    service = request.app.state.service
    try:
        snapshot = service.get_run(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc
    return snapshot.model_dump()


@router.post("/runs/{run_id}/approve")
def approve_run(run_id: str, payload: ApproveRunRequest, request: Request):
    service = request.app.state.service
    try:
        snapshot = service.approve_run(run_id, approved=payload.approved)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc
    return snapshot.model_dump()


@router.get("/runs/{run_id}/artifacts/{name}")
def fetch_artifact(run_id: str, name: str, request: Request):
    service = request.app.state.service
    try:
        snapshot = service.get_run(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc

    candidate_paths = [snapshot.final_report_path, *snapshot.artifact_paths.values()]
    for attempt in snapshot.attempts:
        candidate_paths.extend(attempt.artifact_paths.values())
    for raw_path in candidate_paths:
        if raw_path is None:
            continue
        path = Path(raw_path)
        if path.name == name and path.exists():
            return PlainTextResponse(path.read_text())
    raise HTTPException(status_code=404, detail="Artifact not found")
