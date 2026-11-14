#!/usr/bin/env bash
# Копирует debug-APK под именем DL-IPTV-<версия>.apk (версия из package.json)
# и отдаёт версию и имя файла следующим шагам workflow.
set -euo pipefail

VERSION=$(node -p "require('./package.json').version")
FILE="DL-IPTV-$VERSION.apk"

cp android/app/build/outputs/apk/debug/app-debug.apk "$FILE"
{
  echo "version=$VERSION"
  echo "file=$FILE"
} >> "$GITHUB_OUTPUT"
