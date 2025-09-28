# Quick Setup Without gcloud CLI

If you don't want to install gcloud CLI, you can set up manually through the web console.

## Step 1: Install gcloud CLI (Recommended)

### macOS:
```bash
# Using Homebrew (easiest)
brew install google-cloud-sdk

# Or download installer
curl https://sdk.cloud.google.com | bash
exec -l $SHELL  # Restart shell
```

### Other platforms:
- **Windows**: Download from https://cloud.google.com/sdk/docs/install
- **Linux**: `curl https://sdk.cloud.google.com | bash`

## Step 2: Alternative - Manual Web Setup

If you prefer not to install gcloud CLI:

### 1. Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project or select existing one
3. Note your **Project ID** (not name)

### 2. Enable APIs
Visit these links and click "Enable":
- [Vertex AI API](https://console.cloud.google.com/apis/library/aiplatform.googleapis.com)
- [Text-to-Speech API](https://console.cloud.google.com/apis/library/texttospeech.googleapis.com)
- [Cloud Storage API](https://console.cloud.google.com/apis/library/storage.googleapis.com)

### 3. Create Storage Bucket
1. Go to [Cloud Storage](https://console.cloud.google.com/storage)
2. Click "Create Bucket"
3. Choose unique name (e.g., `your-name-home-tours`)
4. Select region (e.g., `us-central1`)
5. Keep default settings

### 4. Set Up Authentication

**Option A: Service Account (Production)**
1. Go to [Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Click "Create Service Account"
3. Name: `home-tour-service`
4. Grant roles:
   - Vertex AI User
   - Cloud Storage Admin  
   - Cloud Text-to-Speech User
5. Create and download JSON key
6. Save as `credentials.json` in your project

**Option B: Your Own Account (Development)**
1. Install gcloud CLI (see above)
2. Run: `gcloud auth application-default login`

### 5. Create Environment File

Create `.env` file in `packages/home-tour-maker/`:

```bash
# Replace with your actual values
GOOGLE_CLOUD_PROJECT=your-project-id
GCS_BUCKET=your-bucket-name
GOOGLE_CLOUD_LOCATION=us-central1

# If using service account:
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json

# Optional settings
VEO_MODEL=veo-3.0-generate-001
DEFAULT_VOICE=en-US-Neural2-D
```

### 6. Test Setup

```bash
cd packages/home-tour-maker
npm install
npm run build

# Test with dry run
npx home-tour-maker generate \
  --images ./examples \
  --veo-project your-project-id \
  --seconds 60 \
  --dry-run
```

## What Each Part Does

- **Project ID**: Your Google Cloud project identifier
- **Vertex AI API**: Powers the Veo video generation
- **Text-to-Speech API**: Generates voiceovers
- **Cloud Storage**: Temporary file storage for Veo
- **Service Account**: Authentication for production apps

## Cost Information

- **Veo**: ~$0.50 per 8-second segment
- **TTS**: ~$0.01 per voiceover
- **Storage**: ~$0.02/GB/month
- **90-second tour**: ~$6-10 total

Use `--dry-run` to see estimates before generating!

