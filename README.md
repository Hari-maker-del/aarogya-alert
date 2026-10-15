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

## Demo and privacy
All regional names, coordinates, percentages, and health observations in this prototype are fictional/synthetic demo signals. Map tiles are fetched from OpenStreetMap. Alerts are early review signals, not medical diagnoses or confirmed outbreaks.