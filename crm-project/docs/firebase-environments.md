# Firebase environments

The backend selects its Firebase project from `FIREBASE_ENVIRONMENT`, which must be `qa` or `production` and defaults to `qa`.

For now, both environment variables point to the existing Firebase Storage bucket. This preserves the current QA and production behavior.

```env
FIREBASE_ENVIRONMENT=qa
FIREBASE_QA_STORAGE_BUCKET=haris-business-crm.firebasestorage.app
FIREBASE_PROD_STORAGE_BUCKET=haris-business-crm.firebasestorage.app
```

When the production Firebase project is ready, configure the production deployment only:

```env
FIREBASE_ENVIRONMENT=production
FIREBASE_PROD_STORAGE_BUCKET=your-production-project.firebasestorage.app
FIREBASE_PROD_SERVICE_ACCOUNT_BASE64=<base64-encoded-production-service-account-json>
```

The QA deployment should retain `FIREBASE_ENVIRONMENT=qa` and its QA-specific credentials. If the target-specific credential values are not set, the backend continues to support the existing `FIREBASE_SERVICE_ACCOUNT_BASE64` and `FIREBASE_SERVICE_ACCOUNT_JSON` variables.
