from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from alphagraph.schemas import ApproveRunRequest, CreateRunRequest


class InjectGuidanceRequest(BaseModel):
    guidance: str
from alphagraph.service import UploadedDatasetInput


router = APIRouter()


_STOPWORDS = {
    # articles / prepositions / conjunctions
    "a", "an", "the", "on", "in", "of", "for", "and", "or", "with",
    "that", "from", "to", "by", "is", "are", "be", "as", "at", "it",
    # task verbs / instructions
    "test", "run", "build", "create", "find", "generate", "evaluate",
    "analyze", "analyse", "research", "study", "explore", "compute",
    # generic filler
    "simple", "given", "this", "using", "based", "use", "my",
    # data references — user always means a CSV dataset, don't pass to Kaggle
    "dataset", "data", "csv", "file",
    # statistical methodology words that confuse Kaggle search
    "cross", "sectional", "rolling", "window", "lag", "day", "days",
    "week", "weekly", "month", "monthly", "annual", "annually",
}

def _extract_search_terms(text: str, max_words: int = 3) -> str:
    """Reduce a verbose research brief to a short Kaggle-friendly search query (fallback)."""
    import re
    words = re.findall(r"[a-zA-Z]+", text)
    keywords = [w for w in words if w.lower() not in _STOPWORDS and len(w) > 2]
    return " ".join(keywords[:max_words]) or text[:50]


def _claude_kaggle_query(brief: str, api_key: str) -> str:
    """Ask Claude to produce a concise Kaggle search query from a research brief.

    Returns a 2-3 word query suitable for Kaggle's dataset search API.
    Raises on any network or API error so callers can fall back gracefully.
    """
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps({
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 20,
            "system": (
                "You are a Kaggle dataset search assistant for quantitative finance. "
                "Given a research brief, output a 2-3 word Kaggle search query that will find "
                "the most relevant CSV dataset for this backtest strategy. "
                "Focus on the underlying data type needed (e.g. 'stock prices daily', "
                "'crypto OHLCV', 'SP500 returns', 'equity fundamentals'). "
                "Output ONLY the search query — no quotes, no explanation."
            ),
            "messages": [{"role": "user", "content": brief}],
        }).encode("utf-8"),
        headers={
            "content-type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    text_parts = [
        block.get("text", "")
        for block in payload.get("content", [])
        if isinstance(block, dict) and block.get("type") == "text"
    ]
    raw = " ".join(text_parts).strip()
    # Strip any quotes or punctuation Claude might sneak in
    import re
    raw = re.sub(r'["\'\.,;:!?]', "", raw).strip()
    return raw[:60] if raw else _extract_search_terms(brief)


@router.get("/datasets/suggest")
async def suggest_datasets(query: str = Query(..., min_length=1)):
    token = os.getenv("KAGGLE_API_TOKEN", "")
    if not token:
        return {"datasets": []}

    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
    if anthropic_key:
        try:
            search_query = _claude_kaggle_query(query, anthropic_key)
        except Exception:
            search_query = _extract_search_terms(query)
    else:
        search_query = _extract_search_terms(query)

    params = urllib.parse.urlencode({
        "search": search_query,
        "sortBy": "relevance",
        "fileType": "csv",
        "maxSize": 209715200,
        "page": 1,
    })
    url = f"https://www.kaggle.com/api/v1/datasets/list?{params}"
    req = urllib.request.Request(url, headers={"Authorization": _kaggle_auth_header(token)})

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


def _kaggle_credentials() -> tuple[str, str] | None:
    """Return (username, api_key) from the best available source, or None.

    Priority:
      1. KAGGLE_USERNAME + KAGGLE_API_TOKEN env vars
      2. KAGGLE_API_TOKEN in "username:apikey" format
      3. ~/.kaggle/kaggle.json (standard Kaggle CLI credentials file)
    """
    token = os.getenv("KAGGLE_API_TOKEN", "")
    username = os.getenv("KAGGLE_USERNAME", "")
    if username and token:
        return username, token
    if ":" in token:
        parts = token.split(":", 1)
        return parts[0], parts[1]
    # Fall back to the Kaggle CLI credentials file
    try:
        kaggle_json = Path.home() / ".kaggle" / "kaggle.json"
        if kaggle_json.exists():
            creds = json.loads(kaggle_json.read_text())
            u, k = creds.get("username", ""), creds.get("key", "")
            if u and k:
                return u, k
    except Exception:
        pass
    return None


def _kaggle_auth_header(token: str) -> str:
    """Return the Authorization header value for Kaggle API calls.

    Uses Basic auth (required for downloads) when a full username+key pair is
    available, otherwise falls back to Bearer with the bare token.
    """
    import base64
    creds = _kaggle_credentials()
    if creds:
        username, key = creds
        encoded = base64.b64encode(f"{username}:{key}".encode()).decode()
        return f"Basic {encoded}"
    return f"Bearer {token}"


def _download_kaggle_csv(ref: str, token: str) -> tuple[bytes, str]:
    """Download a Kaggle dataset and return (csv_bytes, filename).

    Uses kagglehub which handles auth, redirects, and caching correctly.
    Raises RuntimeError if download fails or no CSV is found.
    """
    import kagglehub

    # kagglehub reads KAGGLE_USERNAME + KAGGLE_KEY (not KAGGLE_API_TOKEN)
    creds = _kaggle_credentials()
    if creds:
        username, key = creds
        os.environ.setdefault("KAGGLE_USERNAME", username)
        os.environ["KAGGLE_KEY"] = key  # always sync in case it differs from env

    print(f"[kaggle] downloading {ref!r} via kagglehub (username={os.getenv('KAGGLE_USERNAME')})", flush=True)
    try:
        dataset_dir = Path(kagglehub.dataset_download(ref))
    except Exception as exc:
        msg = f"Kaggle download failed: {exc}"
        print(f"[kaggle] ERROR {msg}", flush=True)
        raise RuntimeError(msg) from exc

    print(f"[kaggle] downloaded to {dataset_dir}", flush=True)

    # Find the largest CSV in the downloaded directory
    csv_files = sorted(dataset_dir.rglob("*.csv"), key=lambda f: f.stat().st_size, reverse=True)
    if not csv_files:
        raise RuntimeError(f"No CSV files found in Kaggle dataset {ref!r}")

    chosen = csv_files[0]
    print(f"[kaggle] using {chosen.name} ({chosen.stat().st_size:,} bytes)", flush=True)
    return chosen.read_bytes(), chosen.name


@router.post("/runs", status_code=201)
async def create_run(request: Request):
    service = request.app.state.service
    content_type = request.headers.get("content-type", "")

    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        brief = form.get("brief")
        uploaded_dataset = None

        kaggle_ref = form.get("kaggle_ref")
        kaggle_title = form.get("kaggle_title")

        maybe_dataset = form.get("dataset")
        if getattr(maybe_dataset, "filename", ""):
            uploaded_dataset = UploadedDatasetInput(
                filename=maybe_dataset.filename,
                content=await maybe_dataset.read(),
            )
        elif isinstance(kaggle_ref, str) and kaggle_ref.strip():
            token = os.getenv("KAGGLE_API_TOKEN", "")
            if not token:
                raise HTTPException(status_code=400, detail="KAGGLE_API_TOKEN not configured")
            try:
                csv_bytes, csv_filename = _download_kaggle_csv(kaggle_ref.strip(), token)
            except RuntimeError as exc:
                raise HTTPException(status_code=502, detail=str(exc)) from exc
            uploaded_dataset = UploadedDatasetInput(
                filename=csv_filename,
                content=csv_bytes,
                label=kaggle_title if isinstance(kaggle_title, str) and kaggle_title.strip() else None,
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


@router.post("/runs/{run_id}/guidance", status_code=204)
def inject_guidance(run_id: str, payload: InjectGuidanceRequest, request: Request):
    """Inject a researcher guidance note into a running pipeline.

    The guidance is stored in an in-memory store keyed by run_id.  Active
    pipeline nodes (revise_factor, generate_candidates) read from this store
    so the next revision or candidate generation step picks it up.
    """
    service = request.app.state.service
    if not payload.guidance.strip():
        raise HTTPException(status_code=422, detail="guidance must be non-empty")
    service.inject_guidance(run_id, payload.guidance.strip())
    return None


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
