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
