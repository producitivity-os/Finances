#!/bin/zsh
set -euo pipefail

project_directory="$(cd "$(dirname "$0")/.." && pwd)"
"$project_directory/../../tools/update-apple-app-icon.sh" "$project_directory" Finances "${1:?Missing icon image}"
