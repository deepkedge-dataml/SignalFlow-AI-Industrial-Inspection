from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from connectors.azure_vision_connector import classify_image_as_bottle
from inspection_pipeline.pipeline import run_full_inspection

import os

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploaded_images"
UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI(title="SignalFlow Mobile Upload API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"status": "ok", "message": "SignalFlow upload backend is running"}


@app.get("/health")
def read_health():
    return {
        "status": "ok",
        "service": "SignalFlow FastAPI backend",
        "host_note": "Run with --host 0.0.0.0 for LAN access",
    }


@app.post("/upload-image")
async def upload_image(image: UploadFile = File(...)):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    original_suffix = Path(image.filename or "").suffix.lower()
    suffix = original_suffix if original_suffix else ".jpg"
    safe_filename = f"upload_{timestamp}{suffix}"
    saved_path = UPLOAD_DIR / safe_filename

    content = await image.read()
    saved_path.write_bytes(content)
    print("Endpoint:", os.getenv("AZURE_VISION_ENDPOINT"))
    print("Key exists:", bool(os.getenv("AZURE_VISION_KEY")))
    azure_result = classify_image_as_bottle(saved_path)
    inspection_result = run_full_inspection(str(saved_path))

    return {
        "status": "success",
        "filename": safe_filename,
        "saved_path": str(saved_path),
        "azure_vision": azure_result,
        "inspection_result": inspection_result,
    }
