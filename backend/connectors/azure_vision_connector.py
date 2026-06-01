import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


AZURE_VISION_ENDPOINT_ENV = "AZURE_VISION_ENDPOINT"
AZURE_VISION_KEY_ENV = "AZURE_VISION_KEY"
BACKEND_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"

BOTTLE_LABELS = {
    "bottle",
    "bottles",
    "plastic bottle",
    "glass bottle",
    "water bottle",
    "drink bottle",
    "beverage bottle",
    "Other"
}


@dataclass
class AzureVisionClassification:
    label: str
    confidence: float | None
    status: str
    reason: str
    raw_response: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _load_backend_env_file() -> None:
    """Load Azure settings from backend/.env when shell env vars are absent."""
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


def classify_image_as_bottle(image_path: str | Path) -> dict[str, Any]:
    """Classify an image as bottle / not_bottle / unknown using Azure AI Vision.

    Required environment variables:
    - AZURE_VISION_ENDPOINT, for example https://<resource>.cognitiveservices.azure.com
    - AZURE_VISION_KEY
    """
    _load_backend_env_file()
    endpoint = os.getenv(AZURE_VISION_ENDPOINT_ENV)
    api_key = os.getenv(AZURE_VISION_KEY_ENV)

    if not endpoint or not api_key:
        return AzureVisionClassification(
            label="unknown",
            confidence=None,
            status="not_configured",
            reason="Azure Vision endpoint/key environment variables are not set.",
        ).to_dict()

    path = Path(image_path)
    if not path.exists():
        return AzureVisionClassification(
            label="unknown",
            confidence=None,
            status="error",
            reason=f"Image file not found: {path}",
        ).to_dict()

    try:
        response = _analyze_image(endpoint=endpoint, api_key=api_key, image_bytes=path.read_bytes())
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        return AzureVisionClassification(
            label="unknown",
            confidence=None,
            status="error",
            reason=f"Azure Vision request failed: {exc}",
        ).to_dict()

    label, confidence, reason = _classify_from_response(response)
    return AzureVisionClassification(
        label=label,
        confidence=confidence,
        status="success",
        reason=reason,
        raw_response=response,
    ).to_dict()


def _analyze_image(endpoint: str, api_key: str, image_bytes: bytes) -> dict[str, Any]:
    base_url = endpoint.rstrip("/")
    query = urlencode(
        {
            "features": "tags,objects,caption",
            "api-version": "2023-10-01",
        }
    )
    url = f"{base_url}/computervision/imageanalysis:analyze?{query}"
    request = Request(
        url,
        data=image_bytes,
        headers={
            "Ocp-Apim-Subscription-Key": api_key,
            "Content-Type": "application/octet-stream",
        },
        method="POST",
    )

    with urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def _classify_from_response(response: dict[str, Any]) -> tuple[str, float | None, str]:
    detected = _extract_labels(response)
    bottle_matches = [
        item for item in detected if item["name"].lower() in BOTTLE_LABELS or "bottle" in item["name"].lower()
    ]

    if bottle_matches:
        best_match = max(bottle_matches, key=lambda item: item.get("confidence") or 0)
        return "bottle", best_match.get("confidence"), f"Matched Azure Vision label: {best_match['name']}"

    if detected:
        best_label = max(detected, key=lambda item: item.get("confidence") or 0)
        return "not_bottle", best_label.get("confidence"), "Azure Vision returned labels, but none matched bottle."

    return "unknown", None, "Azure Vision returned no usable labels."


def _extract_labels(response: dict[str, Any]) -> list[dict[str, Any]]:
    labels: list[dict[str, Any]] = []

    for tag in response.get("tagsResult", {}).get("values", []):
        name = tag.get("name")
        if name:
            labels.append({"name": name, "confidence": tag.get("confidence")})

    for item in response.get("objectsResult", {}).get("values", []):
        for tag in item.get("tags", []):
            name = tag.get("name")
            if name:
                labels.append({"name": name, "confidence": tag.get("confidence")})

    caption_text = response.get("captionResult", {}).get("text")
    if caption_text:
        labels.append({"name": caption_text, "confidence": response.get("captionResult", {}).get("confidence")})

    return labels
