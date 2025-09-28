#!/bin/bash

# Manual setup without gcloud CLI
# For when you want to configure through web console

echo "🌐 Manual Setup Guide"
echo "===================="
echo ""
echo "Since gcloud CLI is not installed, please set up manually:"
echo ""
echo "1️⃣  Create Google Cloud Project:"
echo "   → https://console.cloud.google.com/"
echo "   → Create new project or select existing"
echo "   → Note your PROJECT ID (not name!)"
echo ""
echo "2️⃣  Enable required APIs (click these links):"
echo "   → Vertex AI: https://console.cloud.google.com/apis/library/aiplatform.googleapis.com"
echo "   → Text-to-Speech: https://console.cloud.google.com/apis/library/texttospeech.googleapis.com"
echo "   → Cloud Storage: https://console.cloud.google.com/apis/library/storage.googleapis.com"
echo ""
echo "3️⃣  Create Storage Bucket:"
echo "   → https://console.cloud.google.com/storage"
echo "   → Click 'Create Bucket'"
echo "   → Choose unique name (e.g., yourname-home-tours)"
echo "   → Select region: us-central1"
echo ""
echo "4️⃣  Set up authentication:"
echo "   → https://console.cloud.google.com/iam-admin/serviceaccounts"
echo "   → Create Service Account: 'home-tour-service'"
echo "   → Add roles: Vertex AI User, Storage Admin, Text-to-Speech User"
echo "   → Download JSON key, save as 'credentials.json'"
echo ""

read -p "Enter your Google Cloud Project ID: " PROJECT_ID
read -p "Enter your Cloud Storage bucket name: " BUCKET_NAME

if [ -n "$PROJECT_ID" ] && [ -n "$BUCKET_NAME" ]; then
    echo ""
    echo "📝 Creating .env file..."
    
    cat > .env << EOF
# Google Cloud Configuration
GOOGLE_CLOUD_PROJECT=$PROJECT_ID
GCS_BUCKET=$BUCKET_NAME
GOOGLE_CLOUD_LOCATION=us-central1

# If using service account (download from console)
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json

# Optional settings
VEO_MODEL=veo-3.0-generate-001
DEFAULT_VOICE=en-US-Neural2-D
EOF

    echo "✅ Created .env file with your settings"
    echo ""
    echo "5️⃣  Next steps:"
    echo "   → Download service account key as 'credentials.json'"
    echo "   → Run: npm install"
    echo "   → Run: npm run build"
    echo "   → Test: npx home-tour-maker generate --images ./examples --dry-run"
    echo ""
    echo "💡 Or install gcloud CLI for easier setup:"
    echo "   → brew install google-cloud-sdk"
    echo "   → ./setup.sh"
else
    echo ""
    echo "⚠️  Setup incomplete. Please provide Project ID and Bucket name."
fi

