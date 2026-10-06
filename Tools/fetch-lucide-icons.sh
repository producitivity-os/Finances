#!/bin/zsh
set -euo pipefail

version="0.468.0"
destination="${0:A:h}/../Sources/Finances/Resources/Lucide"
mkdir -p "$destination"
icons=(archive arrow-down-left arrow-left-right arrow-up-right banknote calendar chart-area circle-dollar-sign copy credit-card file-image file-text filter landmark list-filter plus receipt search settings tags trash-2 upload wallet x)
for icon in $icons; do
  curl -fsSL "https://raw.githubusercontent.com/lucide-icons/lucide/${version}/icons/${icon}.svg" -o "$destination/${icon}.svg"
done

