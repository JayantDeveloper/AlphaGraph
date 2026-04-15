from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

from alphagraph.schemas import ExecutionResult, GeneratedCode
from alphagraph.storage.artifacts import ArtifactStore


class SandboxRunner:
    def __init__(self, project_src: Path, artifact_store: ArtifactStore) -> None:
        self.project_src = project_src
        self.artifact_store = artifact_store

    def execute(
        self,
        *,
        run_id: str,
        attempt_number: int,
        generated_code: GeneratedCode,
        dataset_path: Path,
    ) -> tuple[ExecutionResult, dict[str, str]]:
        started = time.perf_counter()
        code_path = self.artifact_store.write_generated_code(
            run_id,
            attempt_number,
            generated_code.filename,
            generated_code.script,
        )
        output_path = self.artifact_store.attempt_dir(run_id, attempt_number) / "sandbox_output.json"
        env = os.environ.copy()
        env["ALPHAGRAPH_DATASET_PATH"] = str(dataset_path)
        env["ALPHAGRAPH_OUTPUT_PATH"] = str(output_path)
        env["PYTHONPATH"] = str(self.project_src) + os.pathsep + env.get("PYTHONPATH", "")
        process = subprocess.run(
            [sys.executable, str(code_path)],
            cwd=code_path.parent,
            capture_output=True,
            text=True,
            timeout=20,
            env=env,
        )

        if process.returncode != 0:
            execution = ExecutionResult(
                success=False,
                stdout=process.stdout,
                stderr=process.stderr,
                traceback=process.stderr,
                runtime_seconds=round(time.perf_counter() - started, 6),
                artifact_path=str(code_path),
            )
        elif not output_path.exists():
            execution = ExecutionResult(
                success=False,
                stdout=process.stdout,
                stderr="Sandbox did not write an output payload.",
                runtime_seconds=round(time.perf_counter() - started, 6),
                artifact_path=str(code_path),
            )
        else:
            execution = ExecutionResult.model_validate_json(output_path.read_text())
            execution.stdout = process.stdout
            execution.stderr = process.stderr
            if execution.runtime_seconds is None:
                execution.runtime_seconds = round(time.perf_counter() - started, 6)
            execution.artifact_path = str(code_path)

        execution_path = self.artifact_store.write_execution_result(
            run_id,
            attempt_number,
            execution.model_dump(),
        )
        return execution, {"code": str(code_path), "execution": str(execution_path)}
