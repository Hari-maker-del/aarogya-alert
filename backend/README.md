# AAROGYA ALERT backend

A lightweight FastAPI and SQLite backend for a hackathon demonstration of aggregate regional early-warning analytics.

The service detects unusual changes in **synthetic, aggregate-only** signals and assigns an operational review priority. It does not use patient data, confirm disease, diagnose anyone, or provide a validated epidemiological prediction.

## What is included

- 2,624 reproducible synthetic observations across 10 fictional regions and 90 days.
- SQLite persistence with parameterized queries and idempotent data loading.
- A robust current-observation-excluded median/MAD baseline, with a variance floor for stable zero-variance handling.
- Transparent pharmacy/clinic corroboration and simple neighboring-region grouping.
- Explainable alerts, small-count suppression in record responses, and an auditable demo investigation workflow.
- A React-friendly JSON API with configurable CORS and FastAPI documentation at `/docs`.

## Quick start

Use Python 3.11 or later. A standard local setup on Windows is:

```powershell
cd aarogya-alert-backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m app.seed_data
python run.py
```

Open <http://localhost:8000/docs> for interactive OpenAPI documentation. The server also seeds the synthetic dataset automatically when its SQLite database is empty.

For a React Vite app, the default CORS origin is `http://localhost:5173`. Copy `.env.example` into your preferred environment configuration and set `AAROGYA_CORS_ORIGINS` as a comma-separated list when needed.

## Verify it

In a second terminal with the environment activated:

```powershell
python -m pytest -q
curl http://localhost:8000/api/health
curl -X POST http://localhost:8000/api/detection/run
curl http://localhost:8000/api/alerts
```

The test suite checks health/data loading, pagination, suppression, invalid filters, injected anomaly detection, pharmacy-only handling, corroborated priority, duplicate detection runs, zero-history handling, and investigation updates.

## Detection approach

For each region and indicator, the service looks only at observations before the one being assessed. It prefers up to eight observations from the same weekday; if that is too sparse, it uses the most recent 28 observations. The expected value is their median. The score is:

```text
(observed - median historical value) / max(1.4826 × MAD, sqrt(expected), 1)
```

The default positive-deviation threshold is `3.5`; it is a configurable demo setting, not a clinical threshold. At least seven baseline observations are required.

The deterministic final-day examples are intentionally designed for the demo:

- `REG-03` has a respiratory pharmacy-demand-only elevation. It should be a `watch`, not confirmation of an outbreak.
- `REG-07` and neighboring `REG-08` have respiratory pharmacy demand and fever clinic elevations. Their combined evidence can be a `priority_review`.

No alert is a diagnosis or an asserted outbreak. Geographic adjacency only adds context after independent signals are elevated; it is never sufficient evidence by itself.

## Privacy and operational limitations

- All data is fictional, aggregate, and intended only for the demonstration.
- The API never stores names, contact details, addresses, prescriptions, facility locations, or other individual records.
- Counts below the configurable threshold (default `5`) are withheld from record-level API responses.
- Map points are fictional broad regional centroids, not sensitive facilities.
- Demo reviewer IDs are pseudonymous labels only. There is no production authentication/authorization in this MVP.
- Retention, access control, approval workflows, source governance, and real-world validation must be designed with the relevant public-health authority before any production use. De-identification alone is not a guarantee of anonymity.

## Project layout

```text
app/                       FastAPI application, route modules, services, schemas
data/                      deterministic CSV sample; local SQLite database at runtime
tests/                     deterministic API and detector tests
FRONTEND_API_CONTRACT.md   integration contract and response examples
run.py                     local server entry point
```

## Deployment notes

For a simple Render, Railway, or similar Python web service:

1. Set the build command to `pip install -r requirements.txt`.
2. Set the start command to `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
3. Set `AAROGYA_CORS_ORIGINS` to the deployed frontend URL.
4. For a demo, seed automatically on startup. For any durable use, mount persistent storage for SQLite or migrate to a managed database and add authentication, audit controls, and monitoring.

SQLite on ephemeral hosting is appropriate only for a short-lived demonstration: the database may reset whenever the service restarts.
