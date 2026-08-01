# Production Firebase setup

Production uses the Firebase project `talent-acquisition-2f826` and the bucket
`talent-acquisition-2f826.firebasestorage.app`. It is entirely separate from
QA (`haris-business-crm`). This setup does not copy Firestore documents,
Firebase Auth users, or Storage objects from QA.

## One-time Firebase Console setup

1. In Firebase Console, open `talent-acquisition-2f826` and create a **Cloud
   Firestore** database in Native mode. Select `asia-south1` if it is available
   and matches the production deployment plan. Do not import QA data.
2. In Authentication, enable the same sign-in providers used by QA. Do not
   import QA users.
3. Add the production website domain(s) to Authentication > Settings >
   Authorized domains.
4. Ensure the Cloud Run runtime service account has **Storage Object Admin** on
   `talent-acquisition-2f826.firebasestorage.app`. It also needs permission to
   access Firestore in this project (the project Editor role or the equivalent
   least-privilege Firestore role is sufficient).

## Required access

The Google account running deployment needs access to the production project.
For a straightforward deployment, grant it Project Editor (or the equivalent
roles for Cloud Run, Cloud Build, Artifact Registry, Firestore indexes, and
Firebase Hosting). The currently active local account has no access to this
project.

## Deploy the API and empty Firestore structure

From the repository root, create a stable 32-byte Base64 encryption key in the
production Secret Manager secret `crm-data-encryption-key`. Keep it in Secret
Manager; never commit or pass it as a command-line environment variable.

```powershell
./tools/deploy-production.ps1 `
  -CorsAllowedOrigins "https://your-production-domain.example"
```

The script deploys the same API code as QA to Cloud Run in `asia-south1`, with:

```env
FIREBASE_ENVIRONMENT=production
APP_NAME=Talent Acquisition
FIREBASE_PROD_STORAGE_BUCKET=talent-acquisition-2f826.firebasestorage.app
FIREBASE_FIRESTORE_DATABASE_ID=default
```

It reads the encryption key from Secret Manager as a Cloud Run secret rather
than placing it in the revision's plain-text environment settings.

It also deploys only the composite indexes and TTL policies in
`backend/firestore.indexes.json`. Firestore is document-based: it has no SQL
tables to pre-create. Collections remain empty until the production API creates
documents.

## Deploy the production frontend

`frontend/.env.production` contains the production Firebase web-app values and
is intentionally ignored by Git. Build and deploy it to the production Firebase
project:

```powershell
firebase deploy --only hosting --project production
```

The frontend uses Vite environment variables when they are present and keeps
the existing QA configuration as the development fallback.
