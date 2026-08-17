param(
  [Parameter(Mandatory = $true)]
  [string]$CorsAllowedOrigins,

  [string]$DataEncryptionSecretId = "crm-data-encryption-key",

  # SMTP values are kept as independent Secret Manager secrets so credentials
  # never appear in a Cloud Run revision's plain-text environment variables.
  [string]$SmtpHostSecretId = "crm-smtp-host",
  [string]$SmtpUserSecretId = "crm-smtp-user",
  [string]$SmtpPassSecretId = "crm-smtp-pass",
  [string]$SmtpFromSecretId = "crm-smtp-from",

  # The production mailbox uses SMTP submission with STARTTLS. Keep these
  # connection settings explicit so a later API deployment cannot remove the
  # known-working values while secrets remain limited to credentials.
  [string]$SmtpPort = "587",
  [string]$SmtpSecure = "false",

  [string]$AppLoginUrl = "https://talentacquisitioneu.com/login",

  [string]$ServiceName = "haris-crm-api",

  [string]$Region = "asia-south1"
)

$ErrorActionPreference = "Stop"

$projectId = "talent-acquisition-2f826"
$storageBucket = "talent-acquisition-2f826.firebasestorage.app"

gcloud config set project $projectId

# This deploys the current backend source only. It does not export, import, or
# copy any Firebase Auth, Firestore, or Storage data from QA.
# Production data was created in the named `default` database. This is distinct
# from Firestore's system `(default)` database, which is intentionally empty.
$environmentVariables = "^|^NODE_ENV=production|TRUST_PROXY=1|APP_NAME=Talent Acquisition|APP_LOGIN_URL=$AppLoginUrl|FIREBASE_ENVIRONMENT=production|FIREBASE_PROD_PROJECT_ID=$projectId|FIREBASE_PROD_STORAGE_BUCKET=$storageBucket|FIREBASE_FIRESTORE_DATABASE_ID=default|CORS_ALLOWED_ORIGINS=$CorsAllowedOrigins|SMTP_PORT=$SmtpPort|SMTP_SECURE=$SmtpSecure"
$secretVariables = "DATA_ENCRYPTION_KEY_BASE64=$DataEncryptionSecretId`:latest,SMTP_HOST=$SmtpHostSecretId`:latest,SMTP_USER=$SmtpUserSecretId`:latest,SMTP_PASS=$SmtpPassSecretId`:latest,SMTP_FROM=$SmtpFromSecretId`:latest"

gcloud run deploy $ServiceName `
  --source backend `
  --project $projectId `
  --region $Region `
  --allow-unauthenticated `
  --set-env-vars $environmentVariables `
  --update-secrets $secretVariables

# Deploys only the repository's Firestore composite indexes and TTL policies.
# It does not create or copy application documents.
firebase deploy --only firestore:indexes --project $projectId
