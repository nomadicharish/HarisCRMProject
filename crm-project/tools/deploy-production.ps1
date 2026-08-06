param(
  [Parameter(Mandatory = $true)]
  [string]$CorsAllowedOrigins,

  [string]$DataEncryptionSecretId = "crm-data-encryption-key",

  [string]$ServiceName = "haris-crm-api",

  [string]$Region = "asia-south1"
)

$ErrorActionPreference = "Stop"

# The Cloud SDK PowerShell shim can hang on some Windows installations; use
# the command shim there while retaining the standard command on other hosts.
$gcloud = if ($IsWindows) { "gcloud.cmd" } else { "gcloud" }

$projectId = "talent-acquisition-2f826"
$storageBucket = "talent-acquisition-2f826.firebasestorage.app"

& $gcloud config set project $projectId

# This deploys the current backend source only. It does not export, import, or
# copy any Firebase Auth, Firestore, or Storage data from QA.
# Production data was created in the named `default` database. This is distinct
# from Firestore's system `(default)` database, which is intentionally empty.
$environmentVariables = "^|^NODE_ENV=production|TRUST_PROXY=1|APP_NAME=Talent Acquisition|FIREBASE_ENVIRONMENT=production|FIREBASE_PROD_PROJECT_ID=$projectId|FIREBASE_PROD_STORAGE_BUCKET=$storageBucket|FIREBASE_FIRESTORE_DATABASE_ID=default|CORS_ALLOWED_ORIGINS=$CorsAllowedOrigins"

& $gcloud run deploy $ServiceName `
  --source backend `
  --project $projectId `
  --region $Region `
  --allow-unauthenticated `
  --set-env-vars $environmentVariables `
  --set-secrets "DATA_ENCRYPTION_KEY_BASE64=$DataEncryptionSecretId`:latest"

# Deploys only the repository's Firestore composite indexes and TTL policies.
# It does not create or copy application documents.
firebase deploy --only firestore:indexes --project $projectId
