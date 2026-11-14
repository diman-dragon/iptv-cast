#!/usr/bin/env bash
# Копирует AAB под именем DL-IPTV-<версия>.aab и отдаёт версию и имя файла следующим шагам.
set -euo pipefail

VERSION=$(node -p "require('./package.json').version")
FILE="DL-IPTV-$VERSION.aab"

cp android/app/build/outputs/bundle/release/app-release.aab "$FILE"
{
  echo "version=$VERSION"
  echo "file=$FILE"
} >> "$GITHUB_OUTPUT"
