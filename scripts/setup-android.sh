#!/usr/bin/env bash
# Запускать после `npx cap add android`. Идемпотентен.
set -e
APP=android/app; PKG=app/iptvcast/player
mkdir -p $APP/src/main/java/$PKG
cp native/*.java $APP/src/main/java/$PKG/
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
g=pathlib.Path('android/app/build.gradle'); t=g.read_text()
if 'media3-exoplayer' not in t:
    t=t.replace('dependencies {','''dependencies {
    implementation "androidx.media3:media3-exoplayer:1.8.0"
    implementation "androidx.media3:media3-exoplayer-hls:1.8.0"
    implementation "androidx.media3:media3-ui:1.8.0"
    implementation "androidx.mediarouter:mediarouter:1.7.0"
    implementation "com.google.android.gms:play-services-cast-framework:22.1.0"''',1)
    t+='''
// --- release signing (android/keystore.properties, в git не коммитить) ---
def ksFile = rootProject.file("keystore.properties")
if (ksFile.exists()) {
    def ks = new Properties(); ks.load(new FileInputStream(ksFile))
    android {
        signingConfigs { release {
            storeFile = file(ks["storeFile"]); storePassword = ks["storePassword"]
            keyAlias = ks["keyAlias"]; keyPassword = ks["keyPassword"] } }
        buildTypes { release { signingConfig = signingConfigs.release } }
    }
}
'''
    g.write_text(t)
PY
echo "Готово. Далее: npm run assets && npm run sync && npm run open"
