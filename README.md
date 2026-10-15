# AAROGYA ALERT

Early-Warning Community Outbreak Engine — hackathon prototype for PS-021: Early-Warning Community Outbreak Engine.

React + TypeScript + Vite frontend dashboard for monitoring unusual community health patterns, tracking regional indicators, and triaging early-warning outbreak signals.

## Live Demo (GitHub Pages)

The frontend is configured for automated deployment to GitHub Pages via GitHub Actions workflow (`.github/workflows/deploy.yml`):
- **Base path:** `/aarogya-alert/`

## Requirements
- Node.js 18+ (Node.js 20+ recommended)
- npm

## Run locally
```bash
npm install
npm run dev
```
Open the local URL printed by Vite, usually `http://localhost:5173/aarogya-alert/`.

## Production build
```bash
npm run build
npm run preview
```

## Backend integration
Copy `.env.example` to `.env` and set:
```dotenv
VITE_API_BASE_URL=http://localhost:8000
```
Restart Vite after editing `.env`. The reusable API client is located in `src/services/api.ts`.
The UI currently supports synthetic demo observations with pre-built API hooks ready for FastAPI integration.


## Investigation workflow and audit history

The FastAPI backend stores investigation records in SQLite and now exposes:

- `PATCH /api/alerts/{alert_id}/assignment` — assign or reassign a reviewer.
- `PATCH /api/alerts/{alert_id}/status` — change investigation status.
- `POST /api/alerts/{alert_id}/notes` — add a note without creating a duplicate investigation.
- `GET /api/alerts/{alert_id}/history?limit=100` — retrieve timestamped workflow audit events.
- `GET /api/alerts/{alert_id}` — includes the latest assigned reviewer and recent audit events.

Audit events are stored separately from the mutable investigation summary. Database triggers prevent audit rows from being updated or deleted through ordinary SQL statements. Events record the action, timestamp, actor ID, and before/after values where applicable. API callers must still be authenticated before this can be treated as a trusted production audit trail; actor IDs are currently demo/client-supplied values.

### Database persistence on Render

The database location is controlled by `AAROGYA_DATABASE_PATH`. For example, set it to `/var/data/aarogya_alert.db` **only after** mounting persistent storage at `/var/data`.

The current Render Free web service uses an ephemeral filesystem: SQLite records can be lost when the service redeploys, restarts or spins down. A durable production deployment needs a paid Render service with a persistent disk mounted at `/var/data`, or a supported external persistent database. Do not treat the current free-hosted SQLite file as long-term storage.

## Demo and privacy
All regional names, coordinates, percentages, and health observations in this prototype are fictional/synthetic demo signals. Map tiles are fetched from OpenStreetMap. Alerts are early review signals, not medical diagnoses or confirmed outbreaks.