#!/usr/bin/env bash
# Запускать после `npx cap add android`. Идемпотентен.
set -e
APP=android/app; PKG=app/iptvcast/player
mkdir -p $APP/src/main/java/$PKG
cp native/*.java $APP/src/main/java/$PKG/
cp native/build.gradle $APP/build.gradle
python3 - <<'PY'
import re,pathlib
m=pathlib.Path('android/app/src/main/AndroidManifest.xml'); s=m.read_text()
if 'CastOptionsProvider' not in s:
    s=s.replace('<application','<application android:usesCleartextTraffic="true"',1)
    s=s.replace('</application>','''
        <activity android:name=".PlayerActivity" android:exported="false"
            android:configChanges="orientation|screenSize|keyboardHidden|smallestScreenSize|screenLayout"
            android:theme="@style/AppTheme.NoActionBar" />
        <meta-data android:name="com.google.android.gms.cast.framework.OPTIONS_PROVIDER_CLASS_NAME"
            android:value="app.iptvcast.player.CastOptionsProvider" />
    </application>''',1)
    s=s.replace('</manifest>','''    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
    <uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE" />
</manifest>''',1)
    m.write_text(s)
PY
echo "Готово. Далее: npm run assets && npm run sync && npm run open"
