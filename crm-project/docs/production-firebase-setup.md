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

Welcome emails require the following production Secret Manager secrets. The
values must be those supplied by your email provider (for GoDaddy Professional
Email, commonly `smtpout.secureserver.net`, port `465`, and `true` for secure;
use the settings for the actual mailbox in use):

```text
crm-smtp-host
crm-smtp-user
crm-smtp-pass
crm-smtp-from
```

Create each secret once in Google Cloud Secret Manager, add its value, and
ensure the Cloud Run runtime service account has **Secret Manager Secret
Accessor** on all five secrets (including `crm-data-encryption-key`). Do not
put these values in the repository, in Firebase Hosting, or in a Cloud Run
plain-text environment variable.

Production currently uses SMTP submission on port `587` with `SMTP_SECURE=false`
(STARTTLS). These are non-secret Cloud Run environment settings managed by the
deployment script. If the mailbox provider changes, deploy with the matching
`-SmtpPort` and `-SmtpSecure` values.

```powershell
./tools/deploy-production.ps1 `
  -CorsAllowedOrigins "https://talentacquisitioneu.com,https://www.talentacquisitioneu.com"
```

The script deploys the same API code as QA to Cloud Run in `asia-south1`, with:

```env
FIREBASE_ENVIRONMENT=production
APP_NAME=Talent Acquisition
APP_LOGIN_URL=https://talentacquisitioneu.com/login
FIREBASE_PROD_STORAGE_BUCKET=talent-acquisition-2f826.firebasestorage.app
FIREBASE_FIRESTORE_DATABASE_ID=default
```

It reads the encryption key and all SMTP values from Secret Manager as Cloud
Run secrets rather than placing them in the revision's plain-text environment
settings. After this deployment, creating an agency, employer, accountant, or
other user sends the one-time password email through the configured mailbox.

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
