#!/usr/bin/env bash
# Копирует AAB под именем IPTV-Cast-<версия>.aab и отдаёт версию и имя файла следующим шагам.
set -euo pipefail

VERSION=$(node -p "require('./package.json').version")
FILE="IPTV-Cast-$VERSION.aab"

cp android/app/build/outputs/bundle/release/app-release.aab "$FILE"
{
  echo "version=$VERSION"
  echo "file=$FILE"
} >> "$GITHUB_OUTPUT"
