#!/usr/bin/env bash
# Проверка чистой Java-логики без Android: прокси потока, проверка потока, HLS, DLNA.
# Классы не используют Android API, поэтому запускаются на обычной JDK/JRE 17+.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=android/app/src/main/java/com/iptvcast/app
TMP=$(mktemp -d)
mkdir -p "$TMP/com/iptvcast/app"
cp $SRC/{HlsRewriter,StreamProxy,Prober,Dlna,Net}.java tests/java/T.java "$TMP/com/iptvcast/app/"
if command -v javac >/dev/null; then JAVAC=javac; else JAVAC="java -m jdk.compiler/com.sun.tools.javac.Main"; fi
$JAVAC -Xlint:-options -d "$TMP/out" "$TMP"/com/iptvcast/app/*.java
java -cp "$TMP/out" com.iptvcast.app.T
