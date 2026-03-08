# SME Copilot Malaysia

Firebase-backed SME workspace for Malaysian businesses with:

- business onboarding and city-aware context
- file and link ingestion into Firebase Storage / Firestore
- Gemini embedding-based indexing for uploaded knowledge
- Cloud Run chat API using Gemini 2.5 Pro plus Google Weather context

## Structure

- `apps/web`: React + Vite dashboard
- `services/chat`: Express service for Cloud Run
- `firebase`: Firestore and Storage rules

## Local setup

1. Install dependencies:

   ```bash
   cd /Users/kaori/Documents/hackproh && npm install
   cd /Users/kaori/Documents/hackproh/apps/web && npm install
   cd /Users/kaori/Documents/hackproh/services/chat && npm install
   ```

2. Copy env files:

   ```bash
   cp /Users/kaori/Documents/hackproh/apps/web/.env.example /Users/kaori/Documents/hackproh/apps/web/.env.local
   cp /Users/kaori/Documents/hackproh/services/chat/.env.example /Users/kaori/Documents/hackproh/services/chat/.env
   ```

3. Start the full app from the repo root:

   ```bash
   cd /Users/kaori/Documents/hackproh && npm run dev
   ```

   This starts:

   - frontend on `http://localhost:5173`
   - chat API on `http://localhost:8080`

4. Or run services separately:

   ```bash
   cd /Users/kaori/Documents/hackproh/apps/web && npm run dev
   cd /Users/kaori/Documents/hackproh/services/chat && npm run dev
   ```

## Data model

Firestore:

- `businesses/{businessId}`
- `businesses/{businessId}/knowledgeChunks/{chunkId}`

Storage:

- `businesses/{ownerId}/{businessId}/materials/*`

## Deployment

Frontend:

- Build the Vite app and deploy with Firebase Hosting or another static host.

Chat API:

- Deploy `services/chat` to Cloud Run.
- Set `GEMINI_API_KEY`, `GOOGLE_WEATHER_API_KEY`, and `FIREBASE_STORAGE_BUCKET`.
- Run with a service account that can access Firestore and Cloud Storage.

Scripted redeploy:

```bash
cd /Users/kaori/Documents/hackproh
GEMINI_API_KEY=your_gemini_key GOOGLE_WEATHER_API_KEY=your_weather_key ./deploy.sh
```

## Notes

- The Gemini API key provided by the user should be stored in `services/chat/.env` or Cloud Run env vars, not committed to source.
- The Firebase web config is exposed through frontend env vars because client Firebase config is not a secret.
- Weather calls are wired for the Google Maps Platform Weather API (`weather.googleapis.com`).
