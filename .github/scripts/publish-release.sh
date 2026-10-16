#!/usr/bin/env bash
# Публикует релиз «IPTV Cast <версия>» (тег v<версия>) и прикладывает APK.
# Если релиз с такой версией уже есть — заменяет в нём APK.
# Ожидает переменные: VERSION, FILE, GH_TOKEN, GH_REPO.
set -euo pipefail

if gh release view "v$VERSION" >/dev/null 2>&1; then
  gh release upload "v$VERSION" "$FILE" --clobber
else
  gh release create "v$VERSION" "$FILE" --target "$GITHUB_SHA" \
    --title "IPTV Cast $VERSION" --generate-notes
fi
