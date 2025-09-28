# Examples

This directory contains example configurations and usage patterns for the home tour maker.

## Files

- `listing.json` - Sample listing data with headline, features, and address
- `images.json` - Example image list with room assignments
- `basic-usage.js` - Simple Node.js usage example
- `README.md` - This file

## Running Examples

1. **Build the package first**:
   ```bash
   npm run build
   ```

2. **Set up environment**:
   ```bash
   export GOOGLE_CLOUD_PROJECT="your-project-id"
   export GCS_BUCKET="your-bucket-name"
   ```

3. **Run the basic example**:
   ```bash
   node examples/basic-usage.js
   ```

## CLI Examples

### Basic Generation
```bash
npx home-tour-maker generate \
  --images ./examples/photos \
  --out ./output/example-tour.mp4 \
  --seconds 60 \
  --veo-project your-project-id
```

### With Listing Data
```bash
npx home-tour-maker generate \
  --images ./examples/images.json \
  --listing ./examples/listing.json \
  --out ./output/listing-tour.mp4 \
  --seconds 90 \
  --veo-project your-project-id
```

### Full Featured
```bash
npx home-tour-maker generate \
  --images ./examples/images.json \
  --listing ./examples/listing.json \
  --vo "voice=en-US-Neural2-F,speed=0.95" \
  --music ./path/to/background.mp3 \
  --brand "logo=./logo.png,color=#FF6B35" \
  --out ./output/branded-tour.mp4 \
  --seconds 120 \
  --aspect 16:9 \
  --res 1080p \
  --veo-project your-project-id
```

### Dry Run (Plan Only)
```bash
npx home-tour-maker generate \
  --images ./examples/images.json \
  --listing ./examples/listing.json \
  --seconds 90 \
  --veo-project your-project-id \
  --dry-run
```

## Sample Image Structure

For best results, organize your photos like this:

```
photos/
├── 001_exterior_front.jpg
├── 002_exterior_side.jpg  
├── 003_entryway.jpg
├── 004_living_main.jpg
├── 005_living_fireplace.jpg
├── 006_kitchen_island.jpg
├── 007_kitchen_appliances.jpg
├── 008_master_bedroom.jpg
├── 009_master_bath.jpg
├── 010_bedroom_2.jpg
├── 011_main_bathroom.jpg
├── 012_backyard_deck.jpg
└── 013_backyard_garden.jpg
```

The system will automatically detect room types from filenames, but you can also specify them explicitly in an `images.json` file.

## Troubleshooting

- **Missing photos**: Make sure image paths in `images.json` are correct
- **Auth errors**: Run `gcloud auth application-default login`
- **Quota errors**: Reduce image count or target duration
- **Cost concerns**: Use `--dry-run` first to see estimates
