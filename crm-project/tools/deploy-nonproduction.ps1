param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("dev", "qa")]
  [string]$Environment,

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

$projects = @{
  dev = "talent-aquisition-dev"
  qa = "talent-aquisition-qa"
}
$projectId = $projects[$Environment]
$storageBucket = "$projectId.firebasestorage.app"

# The secret must already exist in this project and contain a stable 32-byte
# Base64 encryption key. This script deliberately performs no data migration.
$environmentVariables = "^|^NODE_ENV=production|TRUST_PROXY=1|APP_NAME=Talent Acquisition|FIREBASE_ENVIRONMENT=$Environment|FIREBASE_$($Environment.ToUpper())_PROJECT_ID=$projectId|FIREBASE_$($Environment.ToUpper())_STORAGE_BUCKET=$storageBucket|FIREBASE_FIRESTORE_DATABASE_ID=(default)|CORS_ALLOWED_ORIGINS=$CorsAllowedOrigins"

& $gcloud run deploy $ServiceName `
  --source backend `
  --project $projectId `
  --region $Region `
  --allow-unauthenticated `
  --set-env-vars $environmentVariables `
  --set-secrets "DATA_ENCRYPTION_KEY_BASE64=$DataEncryptionSecretId`:latest"

# Firestore indexes and Hosting configuration do not contain application data.
firebase deploy --only firestore:indexes --project $projectId
firebase deploy --only hosting --project $projectId
