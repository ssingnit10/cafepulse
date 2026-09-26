# CaféPulse — Smart Café Companion

CaféPulse is a smart café atmosphere and barista companion web application. Customers share their one-sentence current vibe and receive real-time personalized drink recommendations powered by the Gemini API, while staff monitor live atmospheric mood distributions, a visual room vibe gauge, and Gemini-generated acoustic directives on the staff dashboard.

---

## ☕ Architecture Overview

- **Customer View (`/`)**: Input vibe sentence, receive AI drink pairing, view live patron stream (last 30 minutes).
- **Staff Dashboard (`/dashboard`)**: Real-time mood count breakdown, multi-segment atmospheric gauge, automated 2-sentence Gemini room directives, and recent check-in table.
- **Backend**: Python Flask backend (`app.py`) & unified TypeScript Express server (`server.ts`).
- **Database**: PostgreSQL (Cloud SQL) with `sessions` table schema and resilient local fallback.
- **AI Models**: Gemini API with a resilient model fallback ladder (`gemini-3.6-flash` → `gemini-3.1-flash-lite` → `gemini-flash-latest` → `gemini-3.7-flash`).

---

## 🗄️ Database Schema

```sql
CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  display_name VARCHAR(50),
  vibe_text TEXT,
  mood_tag VARCHAR(20),
  drink_rec TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
);
```

---

## 🔐 Environment Variables

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API Key for vibe analysis and room insights |
| `DATABASE_URL` | PostgreSQL connection URI (e.g., `postgresql://user:password@host:5432/cafepulse`) |
| `PORT` | Service port (default `8080` for Cloud Run, `3000` for local dev) |

---

## 🚀 Google Cloud Run Deployment Guide

### 1. Prerequisites & GCP APIs

Enable the required Google Cloud APIs for Cloud Run, Cloud SQL, and Secret Manager:

```bash
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com \
  compute.googleapis.com
```

### 2. Secret Manager Setup (Zero-Hardcoding Hygiene)

Create and store your Gemini API key in Google Cloud Secret Manager:

```bash
# 1. Create the secret
gcloud secrets create GEMINI_API_KEY --replication-policy="automatic"

# 2. Add secret payload
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-

# 3. Grant the Cloud Run default service account permission to access the secret
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")

gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 3. Cloud SQL (PostgreSQL) Provisioning

```bash
# Create Cloud SQL PostgreSQL instance
gcloud sql instances create cafepulse-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1

# Create the database and user
gcloud sql databases create cafepulse --instance=cafepulse-db
gcloud sql users set-password postgres --instance=cafepulse-db --prompt-for-password
```

Store the `DATABASE_URL` in Secret Manager:

```bash
gcloud secrets create DATABASE_URL --replication-policy="automatic"
echo -n "postgresql://postgres:PASSWORD@/cafepulse?host=/cloudsql/YOUR_PROJECT:us-central1:cafepulse-db" | gcloud secrets versions add DATABASE_URL --data-file=-

gcloud secrets add-iam-policy-binding DATABASE_URL \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 4. Firestore Security Rules (Baseline Compliance)

For hybrid deployments utilizing Firebase Firestore for client telemetry or state isolation:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Default deny: Block all client writes
    match /{document=**} {
      allow read, write: if false;
    }
    // Per-user interactions: client reads allowed, client writes NEVER (Admin SDK only)
    match /users/{userId}/interactions/{interactionId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if false;
    }
  }
}
```

### 5. Deploy to Google Cloud Run

Deploy directly from source using the provided `Dockerfile`:

```bash
gcloud run deploy cafepulse \
  --source . \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest,DATABASE_URL=DATABASE_URL:latest" \
  --add-cloudsql-instances="YOUR_PROJECT:us-central1:cafepulse-db"
```

### 6. Required Challenge Verification Binding

Apply the mandatory resource label to register the service for automated verification:

```bash
gcloud run services update cafepulse \
  --update-labels=dev-tutorial=cloud-run-ai-challenge \
  --region=us-central1
```

---

## 💻 Local Development

### Option A: Node.js Dev Server (Vite + Express)
```bash
npm install
npm run dev
# App runs at http://localhost:3000
```

### Option B: Python Flask Backend
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python3 app.py
# App runs at http://localhost:8080
```
