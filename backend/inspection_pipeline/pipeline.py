from __future__ import annotations

from typing import Any

from .live_registry_adapter import build_live_registry_row, save_live_registry_row
from .llm_explainer_connector import run_live_llm_explainer
from .patchcore_connector import run_patchcore_on_image


def run_full_inspection(image_path: str) -> dict[str, Any]:
    """Run the full SignalFlow inspection flow for one uploaded image."""
    try:
        patchcore_result = run_patchcore_on_image(image_path)
    except Exception as exc:
        patchcore_result = {
            "status": "error",
            "model": "PatchCore",
            "image_path": image_path,
            "checkpoint_path": None,
            "pred_score": None,
            "threshold_used": None,
            "pred_label": None,
            "pred_label_calibrated": None,
            "prediction": "not_available",
            "is_anomalous": None,
            "heatmap_path": None,
            "overlay_path": None,
            "message": f"PatchCore connector failed: {exc}",
        }

    try:
        registry_row = build_live_registry_row(image_path, patchcore_result)
        registry_json_path = save_live_registry_row(registry_row)
    except Exception as exc:
        registry_row = {
            "image_id": None,
            "image_path": image_path,
            "heatmap_path": None,
            "overlay_path": None,
            "pred_score": None,
            "threshold_used": None,
            "pred_label": None,
            "pred_label_calibrated": None,
            "gt_label": None,
            "rank": None,
            "source": "live_upload",
            "error": f"Live registry adapter failed: {exc}",
        }
        registry_json_path = None

    try:
        llm_result = run_live_llm_explainer(registry_row)
    except Exception as exc:
        llm_result = {
            "status": "error",
            "decision": "not_run",
            "explanation": f"LLM explainer connector failed: {exc}",
            "recommended_action": "Review the LLM connector configuration.",
        }

    pipeline_status = "error" if patchcore_result.get("status") == "error" else "completed"
    return {
        "status": pipeline_status,
        "image_path": image_path,
        "patchcore_result": patchcore_result,
        "registry_row": registry_row,
        "registry_json_path": registry_json_path,
        "llm_result": llm_result,
    }
