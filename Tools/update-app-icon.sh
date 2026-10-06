#!/bin/zsh
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: just update-icon /path/to/icon.png" >&2
  exit 2
fi

source_image="${1:A}"

tools_directory="$(cd "$(dirname "$0")" && pwd)"
project_directory="$(cd "$tools_directory/.." && pwd)"

iconset_directory="$project_directory/Sources/Finances/Resources/Assets.xcassets/AppIcon.appiconset"
contents_file="$iconset_directory/Contents.json"

if [[ ! -f "$source_image" ]]; then
  echo "Icon image not found: $source_image" >&2
  exit 2
fi

width="$(sips -g pixelWidth "$source_image" | awk '/pixelWidth/ {print $2}')"
height="$(sips -g pixelHeight "$source_image" | awk '/pixelHeight/ {print $2}')"

if [[ "$width" != "1024" || "$height" != "1024" ]]; then
  echo "Icon image must be 1024×1024 pixels." >&2
  exit 2
fi

mkdir -p "$iconset_directory"

for size in 16 32 128 256 512; do
  sips \
    -s format png \
    -z "$size" "$size" \
    "$source_image" \
    --out "$iconset_directory/icon_${size}x${size}.png" \
    >/dev/null

  doubled=$((size * 2))

  sips \
    -s format png \
    -z "$doubled" "$doubled" \
    "$source_image" \
    --out "$iconset_directory/icon_${size}x${size}@2x.png" \
    >/dev/null
done

cat >"$contents_file" <<'EOF'
{
  "images": [
    {
      "filename": "icon_16x16.png",
      "idiom": "mac",
      "scale": "1x",
      "size": "16x16"
    },
    {
      "filename": "icon_16x16@2x.png",
      "idiom": "mac",
      "scale": "2x",
      "size": "16x16"
    },
    {
      "filename": "icon_32x32.png",
      "idiom": "mac",
      "scale": "1x",
      "size": "32x32"
    },
    {
      "filename": "icon_32x32@2x.png",
      "idiom": "mac",
      "scale": "2x",
      "size": "32x32"
    },
    {
      "filename": "icon_128x128.png",
      "idiom": "mac",
      "scale": "1x",
      "size": "128x128"
    },
    {
      "filename": "icon_128x128@2x.png",
      "idiom": "mac",
      "scale": "2x",
      "size": "128x128"
    },
    {
      "filename": "icon_256x256.png",
      "idiom": "mac",
      "scale": "1x",
      "size": "256x256"
    },
    {
      "filename": "icon_256x256@2x.png",
      "idiom": "mac",
      "scale": "2x",
      "size": "256x256"
    },
    {
      "filename": "icon_512x512.png",
      "idiom": "mac",
      "scale": "1x",
      "size": "512x512"
    },
    {
      "filename": "icon_512x512@2x.png",
      "idiom": "mac",
      "scale": "2x",
      "size": "512x512"
    }
  ],
  "info": {
    "author": "xcode",
    "version": 1
  }
}
EOF

echo "Updated Finances AppIcon from $source_image"
echo "Generated $contents_file"
