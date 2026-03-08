#!/usr/bin/env bash

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-hackproj-a8b50}"
REGION="${REGION:-asia-southeast1}"
CHAT_SERVICE_NAME="${CHAT_SERVICE_NAME:-sme-copilot-chat}"
CHAT_SOURCE_DIR="${CHAT_SOURCE_DIR:-/Users/kaori/Documents/hackproh/services/chat}"
WEB_ORIGIN="${WEB_ORIGIN:-http://localhost:5173,https://hackproj-a8b50.web.app,https://hackproj-a8b50.firebaseapp.com}"
FIREBASE_STORAGE_BUCKET="${FIREBASE_STORAGE_BUCKET:-hackproj-a8b50.firebasestorage.app}"
FIRESTORE_DATABASE="${FIRESTORE_DATABASE:-(default)}"

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "GEMINI_API_KEY is required."
  exit 1
fi

if [[ -z "${GOOGLE_WEATHER_API_KEY:-}" ]]; then
  echo "GOOGLE_WEATHER_API_KEY is required."
  exit 1
fi

echo "Enabling required APIs for project ${PROJECT_ID}..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project="${PROJECT_ID}"

echo "Ensuring Firestore vector index exists for knowledgeChunks.embeddingVector..."
if ! gcloud firestore indexes composite list \
  --project="${PROJECT_ID}" \
  --database="${FIRESTORE_DATABASE}" \
  --format="value(fields.fieldPath)" | grep -q "embeddingVector"; then
  gcloud firestore indexes composite create \
    --project="${PROJECT_ID}" \
    --database="${FIRESTORE_DATABASE}" \
    --collection-group="knowledgeChunks" \
    --query-scope="COLLECTION" \
    --field-config="field-path=embeddingVector,vector-config={\"dimension\":\"768\",\"flat\":\"{}\"}"
fi

echo "Deploying ${CHAT_SERVICE_NAME} to Cloud Run (${REGION})..."
gcloud run deploy "${CHAT_SERVICE_NAME}" \
  --source="${CHAT_SOURCE_DIR}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --allow-unauthenticated \
  --set-env-vars="^@^WEB_ORIGIN=${WEB_ORIGIN}@GEMINI_API_KEY=${GEMINI_API_KEY}@GOOGLE_WEATHER_API_KEY=${GOOGLE_WEATHER_API_KEY}@GOOGLE_CLOUD_PROJECT=${PROJECT_ID}@FIREBASE_STORAGE_BUCKET=${FIREBASE_STORAGE_BUCKET}"

echo
echo "Live service URL:"
gcloud run services describe "${CHAT_SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)'
