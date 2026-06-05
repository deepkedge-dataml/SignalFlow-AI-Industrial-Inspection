
# SignalFlow AI – Industrial Inspection System

SignalFlow AI is a full-stack prototype for industrial visual inspection. It allows users to upload product images via web interface, process them through a FastAPI backend, run anomaly detection using PatchCore, optionally enrich the result with Azure Vision, and generate readable inspection explanations using an LLM.

The project demonstrates how computer vision, backend APIs, mobile interfaces, and LLM-based reasoning can be combined into one inspection workflow.

The backend currently supports:

- Image upload through `POST /upload-image`
- Optional Azure Vision bottle classification
- PatchCore inference using an existing trained checkpoint
- Live registry JSON generation for uploaded images
- Optional LLM explanation for completed inspections

## Project Structure

```text
SignalFlow-Mobile-Upload/
  backend/
    connectors/
      azure_vision_connector.py
    inspection_pipeline/
      patchcore_connector.py
      pipeline.py
      live_registry_adapter.py
      llm_explainer_connector.py
    main.py
    requirements.txt
  mobile_app/
    src/config.js
    App.js
    package.json
```

Generated uploads, model outputs, local IDE files, dependency folders, and secret files are intentionally excluded from Git.

## Privacy And Git Safety

Do not commit:

- `.env` files or real API keys
- `.idea/` or editor workspace files
- uploaded inspection images
- generated PatchCore heatmaps, registries, or probe outputs
- model checkpoints and datasets
- local absolute paths containing personal usernames

The root `.gitignore` is configured for these rules.

## Backend Setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Health check:

```text
http://127.0.0.1:8000/health
```

For a phone on the same Wi-Fi network, use your laptop LAN IP:

```text
http://<YOUR_LAPTOP_IP>:8000
```

## Backend Configuration

Create `backend/.env` locally if Azure Vision or LLM explanation is needed. Never commit this file.

```env
AZURE_VISION_ENDPOINT=https://your-resource-name.cognitiveservices.azure.com
AZURE_VISION_KEY=your_azure_vision_key_here
SIGNALFLOW_AI_ROOT=C:\path\to\SignalFlow-ai
SIGNALFLOW_GROK_API_KEY=your_grok_key_here
SIGNALFLOW_GROK_BASE_URL=https://api.x.ai/v1
```

PatchCore uses an existing trained checkpoint under `SIGNALFLOW_AI_ROOT`:

```text
experiments/juice_bottle_res256_20260320_214217/Patchcore/MVTecLOCO/juice_bottle/v0/weights/lightning/model.ckpt
```

## Mobile App Setup

```powershell
cd mobile_app
npm install
npm start
```

Set the backend URL with an Expo public environment variable when needed:

```powershell
$env:EXPO_PUBLIC_API_BASE_URL="http://<YOUR_LAPTOP_IP>:8000"
npm start
```

If no environment variable is set, the app falls back to `http://127.0.0.1:8000`.

## Inspection Flow

```text
Mobile app image
-> FastAPI /upload-image
-> backend/uploaded_images
-> Azure Vision classification
-> PatchCore live inference
-> live registry JSON
-> optional LLM explanation
-> mobile result screen
```

## AI-Assisted Development Note

This stage-two SignalFlow prototype was developed from my own project idea and architecture plan. The main concept, inspection workflow, system design, and project direction were defined by me. AI-assisted coding tools, including OpenAI Codex, were used as development support to help convert the planned architecture into a working prototype.

Codex was used as a development assistant for parts of the web inspection workflow, backend integration review, documentation, `.gitignore` preparation, GitHub readiness checks, and privacy cleanup.

Codex did not create the project independently. Final project direction, architecture decisions, implementation choices, testing, configuration, validation, and release decisions were reviewed manually.

During GitHub preparation, Codex helped inspect the project structure and identify privacy risks that should not be committed to a public repository, including local IDE workspace files, `.env` files, generated uploads and inspection outputs, local machine paths, API keys, and model artifacts. Codex also helped refactor configuration so private values are loaded through environment variables or placeholders instead of being hard-coded into files intended for GitHub.


## GitHub Preparation

Recommended first branch for stage two:

```powershell
git init
git checkout -b stage-2-mobile-patchcore
git add .
git status --short --ignored
```

Before pushing, confirm that `.env`, `.idea/`, `node_modules/`, uploaded images, inspection outputs, checkpoints, and datasets are ignored.
