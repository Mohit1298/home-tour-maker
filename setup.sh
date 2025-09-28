#!/bin/bash

# Home Tour Maker - Google Cloud Setup Script
# Run this to set up your Google Cloud environment

set -e

echo "🚀 Home Tour Maker - Google Cloud Setup"
echo "========================================"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found. Please install it first:"
    echo "   https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Get project ID
read -p "Enter your Google Cloud Project ID: " PROJECT_ID
if [ -z "$PROJECT_ID" ]; then
    echo "❌ Project ID is required"
    exit 1
fi

# Get bucket name
read -p "Enter Cloud Storage bucket name (will be created): " BUCKET_NAME
if [ -z "$BUCKET_NAME" ]; then
    echo "❌ Bucket name is required"
    exit 1
fi

echo ""
echo "🔧 Setting up project: $PROJECT_ID"
echo "📦 Creating bucket: gs://$BUCKET_NAME"
echo ""

# Set project
echo "Setting gcloud project..."
gcloud config set project $PROJECT_ID

# Enable APIs
echo "Enabling required APIs..."
gcloud services enable aiplatform.googleapis.com
gcloud services enable texttospeech.googleapis.com
gcloud services enable storage.googleapis.com

# Create bucket
echo "Creating Cloud Storage bucket..."
gsutil mb gs://$BUCKET_NAME 2>/dev/null || echo "Bucket already exists"

# Set up authentication
echo ""
echo "🔐 Setting up authentication..."
gcloud auth application-default login

# Create .env file
echo "📝 Creating .env file..."
cat > .env << EOF
# Google Cloud Configuration
GOOGLE_CLOUD_PROJECT=$PROJECT_ID
GCS_BUCKET=$BUCKET_NAME
GOOGLE_CLOUD_LOCATION=us-central1

# Veo Configuration  
VEO_MODEL=veo-3.0-generate-001

# Optional: Uncomment if using service account
# GOOGLE_APPLICATION_CREDENTIALS=./credentials.json
EOF

echo ""
echo "✅ Setup complete! Your configuration:"
echo "   Project: $PROJECT_ID"
echo "   Bucket: gs://$BUCKET_NAME"
echo "   Auth: Application Default Credentials"
echo ""
echo "🧪 Testing setup..."

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
" 2>/dev/null || echo "⚠️  Authentication test skipped (install dependencies first)"

echo ""
echo "🎯 Next steps:"
echo "1. Install dependencies: npm install"
echo "2. Build the project: npm run build"
echo "3. Test with dry run: npx home-tour-maker generate --images ./examples --dry-run"
echo ""
echo "💡 Your .env file has been created with your configuration"
echo "💡 See SETUP.md for detailed instructions and troubleshooting"

