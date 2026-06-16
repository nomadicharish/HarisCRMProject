# Hosting the CRM on thetesthost.com

This project is configured for:

- Frontend: Firebase Hosting
- Backend: Cloud Run service named `haris-crm-api` in `asia-south1`
- Custom domain: `thetesthost.com` purchased in GoDaddy

## 1. Build and deploy the backend to Cloud Run

Create one stable encryption key before the first production deploy:

```powershell
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$DATA_ENCRYPTION_KEY_BASE64 = [Convert]::ToBase64String($bytes)
$DATA_ENCRYPTION_KEY_BASE64
```

Keep this value safe. Existing encrypted emails/contact numbers can only be read with the same key.

Run from the repository root after logging in to Google Cloud:

```powershell
gcloud config set project haris-business-crm
gcloud run deploy haris-crm-api `
  --source backend `
  --region asia-south1 `
  --allow-unauthenticated `
  --set-env-vars "^|^NODE_ENV=production|TRUST_PROXY=1|FIREBASE_STORAGE_BUCKET=haris-business-crm.firebasestorage.app|DATA_ENCRYPTION_KEY_BASE64=$DATA_ENCRYPTION_KEY_BASE64|CORS_ALLOWED_ORIGINS=https://thetesthost.com,https://www.thetesthost.com,https://haris-business-crm.web.app,https://haris-business-crm.firebaseapp.com"
```

Cloud Run uses Google application default credentials, so do not deploy `serviceAccountKey.json` or any Firebase Admin SDK private key.

If Cloud Run is already deployed and only the encryption key is missing, update the service without rebuilding:

```powershell
gcloud run services update haris-crm-api `
  --region asia-south1 `
  --update-env-vars DATA_ENCRYPTION_KEY_BASE64=$DATA_ENCRYPTION_KEY_BASE64
```

## 2. Deploy Firebase Hosting

Run from the repository root:

```powershell
firebase use haris-business-crm
firebase deploy --only hosting
```

`firebase.json` builds the Vite frontend before deployment and proxies `/api/**` to the Cloud Run backend.

## 3. Connect the GoDaddy domain

In Firebase Console:

1. Open Hosting for project `haris-business-crm`.
2. Add custom domain `thetesthost.com`.
3. Add custom domain `www.thetesthost.com`.
4. Copy the exact DNS records Firebase gives you.

In GoDaddy DNS:

1. Remove any parked-domain forwarding records that conflict with Firebase.
2. Add the Firebase verification record if requested.
3. Add the Firebase `A` records for `@`.
4. Add the Firebase `CNAME` record for `www`.

Firebase provisions the SSL certificate after DNS propagation. That can take minutes to a few hours.

## 4. Firebase Authentication

In Firebase Console, open Authentication > Settings > Authorized domains and add:

- `thetesthost.com`
- `www.thetesthost.com`

Without this, sign-in can fail on the custom domain even when Hosting is working.

## 5. Smoke test

After DNS and SSL are active:

```powershell
curl https://thetesthost.com/api/health
curl https://thetesthost.com
```

The API check should return `{"status":"ok"}`, and the site should load the React app.
