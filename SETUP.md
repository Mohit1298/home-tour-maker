# Google Cloud Setup Guide

## Prerequisites

You need a Google Cloud project with billing enabled and the following APIs activated.

## Step 1: Create/Configure Google Cloud Project

1. **Go to [Google Cloud Console](https://console.cloud.google.com/)**
2. **Create a new project** or select existing one
3. **Enable billing** (required for Veo API)
4. **Enable required APIs:**

```bash
# Using gcloud CLI (recommended)
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable aiplatform.googleapis.com      # Vertex AI (for Veo)
gcloud services enable texttospeech.googleapis.com    # Text-to-Speech
gcloud services enable storage.googleapis.com         # Cloud Storage
```

Or enable manually in the console:
- [Vertex AI API](https://console.cloud.google.com/apis/library/aiplatform.googleapis.com)
- [Text-to-Speech API](https://console.cloud.google.com/apis/library/texttospeech.googleapis.com)  
- [Cloud Storage API](https://console.cloud.google.com/apis/library/storage.googleapis.com)

## Step 2: Create Cloud Storage Bucket

Veo needs a Cloud Storage bucket for temporary files:

```bash
# Create bucket (choose unique name)
gsutil mb gs://your-home-tours-bucket

# Set permissions (if needed)
gsutil iam ch allUsers:objectViewer gs://your-home-tours-bucket
```

Or create in console: [Cloud Storage](https://console.cloud.google.com/storage)

## Step 3: Authentication Setup

Choose **ONE** of these authentication methods:

### Option A: Application Default Credentials (Recommended for Development)

```bash
# Install gcloud CLI: https://cloud.google.com/sdk/docs/install
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

### Option B: Service Account (Recommended for Production)

1. **Create service account:**
```bash
gcloud iam service-accounts create home-tour-service \
    --display-name="Home Tour Service Account"
```

2. **Grant required permissions:**
```bash
# Vertex AI User (for Veo)
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:home-tour-service@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/aiplatform.user"

# Storage Admin (for file uploads)
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:home-tour-service@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/storage.admin"

# Text-to-Speech User
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:home-tour-service@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/cloudtts.user"
```

3. **Download service account key:**
```bash
gcloud iam service-accounts keys create ./credentials.json \
    --iam-account=home-tour-service@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

## Step 4: Environment Variables

Create a `.env` file in your project:

```bash
# Required
GOOGLE_CLOUD_PROJECT=your-project-id
GCS_BUCKET=your-home-tours-bucket

# If using service account (Option B)
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json

# Optional
GOOGLE_CLOUD_LOCATION=us-central1
VEO_MODEL=veo-3.0-generate-001
```

## Step 5: Test Your Setup

Run this test to verify everything works:

```bash
cd packages/home-tour-maker
npm run build

# Test authentication
node -e "
const { GoogleAuth } = require('google-auth-library');
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});
auth.getClient().then(() => 
  console.log('✅ Authentication working!')
).catch(err => 
  console.error('❌ Auth failed:', err.message)
);
"

# Test Veo API access (dry run)
npx home-tour-maker generate \
  --images ./examples \
  --veo-project $GOOGLE_CLOUD_PROJECT \
  --seconds 60 \
  --dry-run
```

## Troubleshooting

### "Permission denied" errors:
- Verify APIs are enabled
- Check service account permissions
- Ensure billing is enabled

### "Bucket not found" errors:
- Verify bucket exists: `gsutil ls gs://your-bucket-name`
- Check bucket permissions

### "Authentication failed" errors:
- For ADC: Run `gcloud auth application-default login`
- For service account: Verify GOOGLE_APPLICATION_CREDENTIALS path
- Check project ID matches: `gcloud config get-value project`

### "Quota exceeded" errors:
- Veo has rate limits (~10 requests/minute)
- Use `--dry-run` to estimate costs first
- Consider using more Ken Burns vs Veo segments

## Cost Estimation

Before generating, understand the costs:

- **Veo API**: ~$0.50 per 8-second segment
- **Text-to-Speech**: ~$0.0001 per character
- **Cloud Storage**: ~$0.02 per GB/month

**90-second tour estimate**: $6-10 depending on Veo segment count

Use `--dry-run` flag to see estimates before generating.

