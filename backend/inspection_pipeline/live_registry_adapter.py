from __future__ import annotations

import json
from pathlib import Path
from typing import Any


BACKEND_ROOT = Path(__file__).resolve().parents[1]
LIVE_REGISTRY_DIR = BACKEND_ROOT / "inspection_outputs" / "live_registry"


def build_live_registry_row(image_path: str, patchcore_result: dict[str, Any]) -> dict[str, Any]:
    path = Path(image_path)
    return {
        "image_id": path.stem,
        "image_path": str(path),
        "heatmap_path": patchcore_result.get("heatmap_path"),
        "overlay_path": patchcore_result.get("overlay_path"),
        "pred_score": patchcore_result.get("pred_score"),
        "threshold_used": patchcore_result.get("threshold_used"),
        "pred_label": patchcore_result.get("pred_label"),
        "pred_label_calibrated": patchcore_result.get("pred_label_calibrated"),
        "gt_label": None,
        "rank": None,
        "source": "live_upload",
    }


def save_live_registry_row(registry_row: dict[str, Any]) -> str:
    image_id = str(registry_row["image_id"])
    LIVE_REGISTRY_DIR.mkdir(parents=True, exist_ok=True)
    output_path = LIVE_REGISTRY_DIR / f"{image_id}.json"
    with open(output_path, "w", encoding="utf-8") as file:
        json.dump(registry_row, file, indent=2)
    return str(output_path)
