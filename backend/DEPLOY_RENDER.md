# Deploying AAROGYA ALERT API on Render

1. Create a separate GitHub repository for this backend and upload the contents of this folder to its root.
2. In Render, choose New + -> Blueprint (or create a Web Service from that repository).
3. The included `render.yaml` sets the build command, start command, health check, and frontend CORS origin.
4. After deployment, test `https://YOUR-RENDER-SERVICE.onrender.com/api/health` and `/docs`.
5. Put the real backend URL into the frontend Vercel project as `VITE_API_BASE_URL` only after the frontend API client has been configured to read that variable, then redeploy the frontend.

Important: the database and observations in this project are synthetic demonstration data. The free instance may sleep, and its local SQLite file is not durable across all restarts/redeployments. Do not use real patient or identifiable health data.
