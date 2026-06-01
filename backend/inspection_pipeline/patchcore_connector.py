from __future__ import annotations

import os
from pathlib import Path
from typing import Any


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
CHECKPOINT_PATH = (
    SIGNALFLOW_AI_ROOT
    / "experiments"
    / "juice_bottle_res256_20260320_214217"
    / "Patchcore"
    / "MVTecLOCO"
    / "juice_bottle"
    / "v0"
    / "weights"
    / "lightning"
    / "model.ckpt"
) if SIGNALFLOW_AI_ROOT else None
THRESHOLD_USED = 0.9952539205551147
BACKEND_ROOT = Path(__file__).resolve().parents[1]
INFERENCE_OUTPUT_DIR = BACKEND_ROOT / "inspection_outputs" / "patchcore_live"
HEATMAP_DIR = INFERENCE_OUTPUT_DIR / "heatmaps"


def _base_result(image_path: str | Path, status: str, message: str) -> dict[str, Any]:
    return {
        "status": status,
        "model": "PatchCore",
        "image_path": str(image_path),
        "checkpoint_path": str(CHECKPOINT_PATH) if CHECKPOINT_PATH else None,
        "pred_score": None,
        "threshold_used": None,
        "pred_label": None,
        "pred_label_calibrated": None,
        "prediction": "not_available",
        "is_anomalous": None,
        "heatmap_path": None,
        "overlay_path": None,
        "message": message,
    }


def _as_scalar(value: Any) -> float | int | bool | None:
    if value is None:
        return None
    try:
        if hasattr(value, "detach"):
            value = value.detach().cpu()
        if hasattr(value, "flatten"):
            flattened = value.flatten()
            if len(flattened) == 0:
                return None
            value = flattened[0]
        if hasattr(value, "item"):
            value = value.item()
    except (TypeError, RuntimeError, ValueError):
        return None

    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return value
    return None


def _save_heatmap(image_path: Path, anomaly_map: Any) -> str | None:
    if anomaly_map is None:
        return None

    try:
        import numpy as np
        from PIL import Image

        heat = anomaly_map
        if hasattr(heat, "detach"):
            heat = heat.detach().cpu()
        if hasattr(heat, "numpy"):
            heat = heat.numpy()
        heat = np.asarray(heat)
        heat = np.squeeze(heat)
        if heat.size == 0:
            return None

        heat_min = float(np.min(heat))
        heat_max = float(np.max(heat))
        if heat_max > heat_min:
            heat = (heat - heat_min) / (heat_max - heat_min)
        else:
            heat = np.zeros_like(heat, dtype=np.float32)

        heat_img = (heat * 255).astype(np.uint8)
        HEATMAP_DIR.mkdir(parents=True, exist_ok=True)
        output_path = HEATMAP_DIR / f"{image_path.stem}_heat.png"
        Image.fromarray(heat_img, mode="L").save(output_path)
        return str(output_path)
    except Exception:
        return None


def _first_prediction(predictions: list[Any] | None) -> Any | None:
    if not predictions:
        return None
    first = predictions[0]
    if isinstance(first, list):
        return first[0] if first else None
    return first


def run_patchcore_on_image(image_path: str) -> dict[str, Any]:
    """Run trained PatchCore inference for one uploaded image.

    PatchCore is already trained. This connector is inference-only:
    - it does not call SignalFlow-ai patchcore_pipeline.py main()
    - it does not call Engine.fit()
    - it uses Engine.predict with the existing checkpoint

    The Patchcore constructor uses pre_trained=False so upload inference does
    not try to download backbone weights before loading the local checkpoint.
    """
    path = Path(image_path)
    if not path.exists():
        return _base_result(path, "error", f"Uploaded image does not exist: {path}")

    if CHECKPOINT_PATH is None:
        return _base_result(
            path,
            "not_connected",
            "SIGNALFLOW_AI_ROOT is not configured.",
        )

    if not CHECKPOINT_PATH.exists():
        return _base_result(
            path,
            "not_connected",
            f"PatchCore checkpoint was not found: {CHECKPOINT_PATH}",
        )

    try:
        from anomalib.engine import Engine
        from anomalib.models import Patchcore
    except ImportError as exc:
        return _base_result(
            path,
            "not_connected",
            (
                "PatchCore inference dependencies are not installed in this backend "
                f"environment: {exc}"
            ),
        )

    try:
        model = Patchcore(
            backbone="resnet18",
            layers=("layer2", "layer3"),
            pre_trained=False,
        )
        engine = Engine(
            default_root_dir=str(INFERENCE_OUTPUT_DIR),
            logger=False,
            accelerator="cpu",
            devices=1,
        )
        predictions = engine.predict(
            model=model,
            data_path=path,
            ckpt_path=CHECKPOINT_PATH,
            return_predictions=True,
        )
    except Exception as exc:
        return _base_result(
            path,
            "error",
            f"PatchCore Engine.predict failed without running Engine.fit: {exc}",
        )

    prediction_batch = _first_prediction(predictions)
    if prediction_batch is None:
        return _base_result(path, "error", "PatchCore Engine.predict returned no predictions.")

    pred_score_raw = _as_scalar(getattr(prediction_batch, "pred_score", None))
    pred_label_raw = _as_scalar(getattr(prediction_batch, "pred_label", None))
    pred_score = float(pred_score_raw) if pred_score_raw is not None else None
    pred_label = int(bool(pred_label_raw)) if pred_label_raw is not None else None
    pred_label_calibrated = (
        int(pred_score >= THRESHOLD_USED) if pred_score is not None else pred_label
    )
    is_anomalous = bool(pred_label_calibrated) if pred_label_calibrated is not None else None
    prediction = (
        "anomaly"
        if is_anomalous is True
        else "normal"
        if is_anomalous is False
        else "not_available"
    )
    heatmap_path = _save_heatmap(path, getattr(prediction_batch, "anomaly_map", None))

    return {
        "status": "completed",
        "model": "PatchCore",
        "image_path": str(path),
        "checkpoint_path": str(CHECKPOINT_PATH),
        "pred_score": pred_score,
        "threshold_used": THRESHOLD_USED,
        "pred_label": pred_label,
        "pred_label_calibrated": pred_label_calibrated,
        "prediction": prediction,
        "is_anomalous": is_anomalous,
        "heatmap_path": heatmap_path,
        "overlay_path": None,
        "message": "PatchCore live inference completed using Engine.predict and the existing checkpoint.",
    }
