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

## Supabase authentication and durable workflow records

Reviewer sign-up/sign-in is provided by the dedicated Supabase project `ipqgtcfnlaivnaeehywm`. The public health signal and observation dataset remains synthetic and is still supplied by the FastAPI demo API. Investigation status, reviewer assignment and audit events are mirrored to Supabase PostgreSQL so they survive Render Free instance restarts and deployments.

Only authenticated reviewer sessions may mutate investigation records. FastAPI validates access tokens against Supabase Auth and derives each audit actor UUID from the validated session; client-supplied actor IDs are ignored. Audit events are protected by row-level security and database triggers that reject UPDATE and DELETE operations. Assignments must use a registered Supabase user's UUID.

The frontend uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` when configured. The publishable key is intended for the browser and is not a database secret; security depends on Supabase Auth and RLS. Backend configuration uses `AAROGYA_SUPABASE_URL` and `AAROGYA_SUPABASE_PUBLISHABLE_KEY` in Render. Never place a service-role key in the browser or commit it to the repository. Legacy SQLite event rows are retained as transitional history and may pre-date verified attribution.


## Opt-in Supabase staging integration test

The manual **Staging Supabase integration** GitHub Actions workflow exercises real Supabase password authentication, the database-backed reviewer role check, PostgreSQL investigation writes, and append-only audit-event writes/read-back. It uses only a dedicated staging Supabase project and a staging-only reviewer account. It never uses a service-role key.

**Do not point this test at production.** The script explicitly blocks the project's production ref `ipqgtcfnlaivnaeehywm`, requires the hostname to match the supplied project ref, and requires a deliberate write-confirmation secret. Run it only after you have a separate Supabase staging project with the same required tables, row-level security policies, and audit triggers as the app expects.

To enable it, create a GitHub repository Environment named `staging` and add these Environment secrets:

- `AAROGYA_STAGING_SUPABASE_URL` — for example, `https://YOUR_STAGING_REF.supabase.co`
- `AAROGYA_STAGING_PUBLISHABLE_KEY` — the staging project's publishable key only
- `AAROGYA_STAGING_REVIEWER_EMAIL` — a dedicated test reviewer account in staging
- `AAROGYA_STAGING_REVIEWER_PASSWORD` — that test account's password
- `AAROGYA_STAGING_CONFIRM_WRITES` — exactly `I_HAVE_CONFIRMED_THIS_IS_STAGING`

Ensure the test account has a database-backed `reviewer` or `admin` role in the **staging project only**. Then open **Actions → Staging Supabase integration → Run workflow**, enter that staging project's 20-character project ref, and run it. The probe creates a unique synthetic investigation and an append-only audit event on every successful run; those staging records are intentionally retained for auditability. No production data is needed or changed.
