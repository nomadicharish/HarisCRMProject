# Firebase environments

The backend selects its Firebase project from `FIREBASE_ENVIRONMENT`, which must
be `dev`, `qa`, or `production` and defaults to `dev`.

Each environment uses an isolated Firebase project. No Firebase Auth users,
Firestore documents, or Storage objects are shared or copied between them.

```env
FIREBASE_ENVIRONMENT=dev
FIREBASE_DEV_PROJECT_ID=talent-aquisition-dev
FIREBASE_DEV_STORAGE_BUCKET=talent-aquisition-dev.firebasestorage.app
FIREBASE_QA_PROJECT_ID=talent-aquisition-qa
FIREBASE_QA_STORAGE_BUCKET=talent-aquisition-qa.firebasestorage.app
FIREBASE_PROD_PROJECT_ID=talent-acquisition-2f826
FIREBASE_PROD_STORAGE_BUCKET=talent-acquisition-2f826.firebasestorage.app
```

The Firebase CLI aliases are:

```text
dev        talent-aquisition-dev
qa         talent-aquisition-qa
production talent-acquisition-2f826
```

The frontend selects the correct public Firebase Web configuration by its
Hosting domain, and uses Dev on localhost. `VITE_FIREBASE_*` variables can
still override those values for an explicit local test target.

Run `tools/deploy-nonproduction.ps1` to deploy the backend and Hosting to Dev
or QA. It deploys application code and Firestore indexes only; it never
exports, imports, or copies application data.
