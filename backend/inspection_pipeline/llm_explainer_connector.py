from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


BACKEND_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"


def _load_backend_env_file() -> None:
    if not BACKEND_ENV_PATH.exists():
        return

    for line in BACKEND_ENV_PATH.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue

        name, value = stripped.split("=", 1)
        name = name.strip()
        value = value.strip().strip('"').strip("'")
        if name and name not in os.environ:
            os.environ[name] = value


_load_backend_env_file()

SIGNALFLOW_AI_ROOT_VALUE = os.getenv("SIGNALFLOW_AI_ROOT")
SIGNALFLOW_AI_ROOT = (
    Path(SIGNALFLOW_AI_ROOT_VALUE).expanduser() if SIGNALFLOW_AI_ROOT_VALUE else None
)
GROK_HELPER_CANDIDATES = (
    [
        SIGNALFLOW_AI_ROOT / "src" / "langchain_structured_explainer_grok.py",
        SIGNALFLOW_AI_ROOT / "experiments" / "langchain_structured_explainer_grok.py",
    ]
    if SIGNALFLOW_AI_ROOT
    else []
)


class LiveInspectionExplanation(BaseModel):
    image_id: str
    pred_score: float | None = None
    threshold_used: float | None = None
    pred_label_calibrated: int | None = Field(default=None, description="0 normal, 1 anomaly, or null.")
    predicted_status: str
    short_explanation: str
    recommended_action: str


def _load_grok_helpers() -> tuple[Any, Any]:
    helper_path = next((path for path in GROK_HELPER_CANDIDATES if path.exists()), None)
    if helper_path is None:
        raise FileNotFoundError(
            "Grok helper file was not found in SignalFlow-ai src or experiments folders."
        )

    spec = importlib.util.spec_from_file_location("signalflow_live_grok_helpers", helper_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Could not load Grok helper module from {helper_path}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.get_llm, module.extract_json_object


def _not_configured() -> dict[str, Any]:
    return {
        "status": "not_configured",
        "decision": "not_run",
        "explanation": "Grok/LangChain environment variables are not configured.",
        "recommended_action": "Configure LLM credentials before running live explanation.",
    }


def _placeholder_for_incomplete_patchcore(registry_row: dict[str, Any]) -> dict[str, Any]:
    label = registry_row.get("pred_label_calibrated")
    prediction = "anomaly" if label == 1 else "normal" if label == 0 else "not_available"
    decision = "needs_review" if prediction == "anomaly" else "normal" if prediction == "normal" else "not_run"
    return {
        "status": "placeholder",
        "decision": decision,
        "explanation": (
            "Live LLM explanation is waiting for a completed PatchCore prediction."
            if prediction == "not_available"
            else f"PatchCore predicted {prediction}; Grok live explanation was not run."
        ),
        "recommended_action": (
            "Complete PatchCore inference before running the LLM."
            if prediction == "not_available"
            else "Review the image if the prediction is anomalous."
        ),
    }


def run_live_llm_explainer(registry_row: dict[str, Any]) -> dict[str, Any]:
    """Run the Grok LangChain explainer for one live-upload registry row.

    This imports reusable helper functions from SignalFlow-ai when available,
    but never calls that script's main() because main() is for offline registry
    batches with gt_label and rank.
    """
    if not os.getenv("SIGNALFLOW_GROK_API_KEY") or not os.getenv("SIGNALFLOW_GROK_BASE_URL"):
        return _not_configured()

    if registry_row.get("pred_label_calibrated") is None:
        return _placeholder_for_incomplete_patchcore(registry_row)

    try:
        from langchain_core.output_parsers import PydanticOutputParser
        from langchain_core.prompts import PromptTemplate
    except ImportError as exc:
        return {
            "status": "not_configured",
            "decision": "not_run",
            "explanation": f"LangChain dependencies are not available: {exc}",
            "recommended_action": "Install LangChain dependencies before running live explanation.",
        }

    try:
        get_llm, extract_json_object = _load_grok_helpers()
        parser = PydanticOutputParser(pydantic_object=LiveInspectionExplanation)
        prompt = PromptTemplate(
            template="""
You are the SignalFlow live quality-inspection explainer.
Use only the provided live registry row.

Rules:
- gt_label is unknown for live uploads.
- Do not calculate correct, false_positive, false_negative, or ground_truth_status.
- pred_label_calibrated = 1 means predicted_status = "anomaly".
- pred_label_calibrated = 0 means predicted_status = "normal".
- Explain whether pred_score is above or below threshold_used.
- Explain why the image should be reviewed or accepted.
- Return only raw JSON matching the schema.

{format_instructions}

Live registry row:
{data}
""".strip(),
            input_variables=["data"],
            partial_variables={"format_instructions": parser.get_format_instructions()},
        )
        chain = prompt | get_llm()
        response = chain.invoke({"data": json.dumps(registry_row, indent=2)})
        text = response.content if hasattr(response, "content") else str(response)
        try:
            parsed = parser.parse(text)
        except Exception:
            parsed = parser.parse(extract_json_object(text))

        decision = "needs_review" if parsed.predicted_status == "anomaly" else "normal"
        return {
            "status": "completed",
            "decision": decision,
            "explanation": parsed.short_explanation,
            "recommended_action": parsed.recommended_action,
            "structured_result": parsed.model_dump(),
        }
    except Exception as exc:
        return {
            "status": "error",
            "decision": "not_run",
            "explanation": f"Grok live explainer failed: {exc}",
            "recommended_action": "Review Grok/LangChain configuration and live prompt parsing.",
        }


def run_llm_explainer(image_path: str, patchcore_result: dict[str, Any]) -> dict[str, Any]:
    registry_row = {
        "image_id": Path(image_path).stem,
        "image_path": image_path,
        "pred_score": patchcore_result.get("pred_score"),
        "threshold_used": patchcore_result.get("threshold_used"),
        "pred_label_calibrated": patchcore_result.get("pred_label_calibrated"),
    }
    return run_live_llm_explainer(registry_row)
