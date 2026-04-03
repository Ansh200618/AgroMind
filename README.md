# Agro Mind — Smart Irrigation & Crop Intelligence

A full-stack platform for Indian farmers combining IoT sensor monitoring, AI-powered crop recommendations, and leaf disease detection.

```
┌─────────────────────────────────────────────────────┐
│               index.html  (Frontend)                │
│  Dashboard · Disease · Crops · Chat · Sensors       │
└────────────────────┬────────────────────────────────┘
                     │ REST
┌────────────────────▼────────────────────────────────┐
│         backend/  (Node.js · Express · TypeScript)  │
│  GET  /api/dashboard          GET  /api/sensors/live│
│  POST /api/disease/analyse    GET  /api/sensors/export
│  POST /api/chat/message       POST /api/sensors/reading
│  POST /api/crops/recommend    GET  /api/irrigation/schedule
│  POST /api/settings           POST /api/irrigation/accept
└────────┬───────────────────────────────┬────────────┘
         │ Prisma ORM                    │ HTTP
         │                               │
┌────────▼──────────┐      ┌─────────────▼──────────────┐
│  PostgreSQL DB    │      │  ai-service/ (Python/FastAPI)│
│  Users · Farms    │      │  POST /disease/detect        │
│  Fields · Sensors │      │  POST /crops/recommend       │
│  DiseaseLogs      │      │  (CNN + Scikit-learn)        │
│  IrrigationLogs   │      └──────────────────────────────┘
└───────────────────┘
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11+
- PostgreSQL 14+

---

### 1 — Database

```bash
# Create a database
psql -U postgres -c "CREATE DATABASE agro_mind;"
```

---

### 2 — Backend (Node.js / Express / TypeScript)

```bash
cd backend
cp .env.example .env          # then fill in DATABASE_URL, GEMINI_API_KEY, etc.

npm install
npx prisma generate
npx prisma migrate dev --name init   # creates all tables

npm run dev                   # starts on http://localhost:3001
```

#### Key environment variables (`backend/.env`)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | Server port (default `3001`) |
| `GEMINI_API_KEY` | Google Gemini API key (preferred for chat) |
| `OPENAI_API_KEY` | OpenAI API key (fallback) |
| `AI_SERVICE_URL` | Python AI service base URL (default `http://localhost:8000`) |
| `UPLOAD_DIR` | Directory for uploaded disease images |

---

### 3 — AI Microservice (Python / FastAPI)

```bash
cd ai-service
cp .env.example .env

python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

uvicorn main:app --reload --port 8000
```

Interactive API docs → **http://localhost:8000/docs**

#### Adding real ML models

| File | Description |
|---|---|
| `ai-service/models/disease_model.h5` | TensorFlow/Keras CNN (e.g. MobileNetV2 trained on PlantVillage) |
| `ai-service/models/disease_model.pt` | PyTorch TorchScript alternative |
| `ai-service/models/crop_model.pkl` | Scikit-learn classifier (joblib) |

Until model weights are provided, the service uses a built-in heuristic (colour analysis / rule-based) that still returns valid responses.

---

### 4 — Frontend

Open `index.html` directly in a browser **or** let the backend serve it:

```
http://localhost:3001
```

The HTML file already contains hooks for every API endpoint — no changes needed.

---


## Free Online Deployment (No localhost)

This project can run fully online for free using:
- **Frontend:** GitHub Pages
- **Backend:** Render Free Web Service
- **AI Service:** Render Free Web Service
- **Database:** Neon Free PostgreSQL

### 1) Deploy AI Service on Render
1. Create a new Web Service from this repository.
2. Set **Root Directory** to `ai-service`.
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Env vars:
   - `MODEL_DIR=./models`
   - `LOG_LEVEL=info`
6. Deploy and note your URL (example: `https://agromind-ai.onrender.com`).

### 2) Create Free Neon PostgreSQL
1. Create a Neon project and database.
2. Copy the connection string and use it as backend `DATABASE_URL`.

### 3) Deploy Backend on Render
1. Create another Web Service from the same repository.
2. Set **Root Directory** to `backend`.
3. Build command: `npm install && npx prisma generate && npm run build`
4. Start command: `npx prisma migrate deploy && node dist/index.js`
5. Env vars:
   - `DATABASE_URL=<neon_connection_string>`
   - `NODE_ENV=production`
   - `AI_SERVICE_URL=https://<your-ai-service>.onrender.com`
   - `UPLOAD_DIR=./uploads`
   - `MAX_FILE_SIZE_MB=10`
   - Optional: `GEMINI_API_KEY` or `OPENAI_API_KEY`
   - Recommended: `CORS_ORIGIN=https://<username>.github.io` (restrict CORS to your frontend domain)

### 4) Run Database Setup Once
After first backend deploy, run in Render Shell for the backend service (or locally with the same production `DATABASE_URL`).  
(`ts-node` is already available via backend devDependencies in this repository.)
```bash
npx prisma migrate deploy
npx ts-node prisma/seed.ts
```

### 5) Deploy Frontend on GitHub Pages
1. Keep `index.html` in repository root (already done).
2. In GitHub repo: **Settings → Pages**.
3. Source: **Deploy from branch** (`main` / root).
4. Open your Pages URL.

### 6) Configure Frontend API Base
- The frontend uses `https://agromind-api.onrender.com` by default.
- In **Settings → API Base URL**, set your actual backend URL and click **Save All**.
- This value is stored in browser local storage and used for all API calls.

### 7) Health Checks
- Backend: `https://<your-backend>.onrender.com/api/health`
- AI service: `https://<your-ai-service>.onrender.com/health`

### 8) Free Tier Notes
- Render free services sleep when idle; first request can be slower.
- `./uploads` is ephemeral on free instances (images may reset after restart).
- For persistent media, move uploads to a free object storage service later.

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/dashboard` | Aggregated sensor data, alerts, schedule |
| `POST` | `/api/disease/analyse` | Multipart image upload → disease result |
| `POST` | `/api/chat/message` | Gemini/OpenAI chat with Indian-agri system prompt |
| `POST` | `/api/crops/recommend` | Crop recommendation from soil/climate params |
| `GET` | `/api/sensors/live` | Latest reading per sensor |
| `GET` | `/api/sensors/history/:deviceId` | Historical readings |
| `GET` | `/api/sensors/export` | CSV export (last 7 days) |
| `POST` | `/api/sensors/reading` | Ingest IoT reading |
| `GET` | `/api/irrigation/schedule` | Today's irrigation plan |
| `POST` | `/api/irrigation/run` | Start an irrigation event |
| `POST` | `/api/irrigation/accept` | Accept AI-generated plan |
| `POST` | `/api/irrigation/calculate` | Calculate water need |
| `GET` | `/api/settings` | Get farm settings |
| `POST` | `/api/settings` | Save farm settings |

---

## Database Schema

Managed by **Prisma** (`backend/prisma/schema.prisma`):

- **User** — farmer profile
- **Farm** — linked to a user, holds location (district, state)
- **Field** — linked to a farm; stores crop type, soil type, pH
- **Sensor** — IoT device metadata (deviceId, type, status)
- **SensorReading** — time-series table (moisture, temperature, pH, humidity, wind)
- **DiseaseLog** — image URL, detection result, confidence score
- **IrrigationLog** — scheduled/completed irrigation events
- **UserSettings** — notification preferences, language, API URL

---

## License

MIT
