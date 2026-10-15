# IPTV Cast (Capacitor 8, Android)

M3U-плеер: список каналов (WebView) + нативный ExoPlayer (Media3, HLS/TS) + Google Cast на ТВ в локальной сети.
Приложение **не содержит** каналов/плейлистов — пользователь вводит свой URL.

## Сборка
Нужно: Node 22+, JDK 21, Android Studio Otter (2025.2.1)+, Android SDK 36.
```
npm run setup          # npm i + cap add android + копирование нативного кода и патчи
# положите assets/icon-only.png (1024x1024) и assets/splash.png (2732x2732)
npm run assets && npm run sync
npm run open           # Android Studio → Run на устройстве
```
**Сначала замените `app.iptvcast.player`** на свой applicationId (capacitor.config.json, scripts/setup-android.sh,
native/*.java). `com.example.*` Play не принимает. После публикации менять нельзя.

## Релиз
1. Keystore: `keytool -genkey -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`
2. `android/keystore.properties`: storeFile, storePassword, keyAlias, keyPassword.
3. В `android/app/build.gradle` увеличивайте versionCode при каждой загрузке.
4. `npm run bundle` → `android/app/build/outputs/bundle/release/app-release.aab`
5. Play Console → включите Play App Signing, загрузите .aab.

## Чек-лист Google Play (проверено 15.10.2026)
- [x] targetSdk 36 (Capacitor 8 по умолчанию), minSdk 24. Обязательно для новых приложений и обновлений с 31.08.2026
- [x] Формат AAB, подпись через Play App Signing
- [ ] Android 16: edge-to-edge не отключить, predictive back — проверить на устройстве/эмуляторе API 36
- [ ] 16 KB page size: нативных .so своих нет; проверить итоговый AAB (Android Studio → APK Analyzer / Play Console pre-launch)
- [ ] Аккаунт разработчика ($25). Личный аккаунт, созданный после 13.11.2023: closed-тест ≥12 тестеров × 14 дней подряд до production (на организацию не распространяется)
- [ ] Политика конфиденциальности (URL) — шаблон ниже
- [ ] Data safety: приложение само данные не собирает и не отправляет; плейлист хранится локально (localStorage). Заполняйте по факту
- [ ] Content rating (анкета), Target audience (18+/не детям), Ads: нет, App access: без логина
- [ ] Скриншоты (мин. 2 телефона), иконка 512×512, feature graphic 1024×500, описание
- [ ] **Intellectual property / IPTV**: в описании и скриншотах никаких названий каналов, брендов, ссылок на пиратские плейлисты; в приложении нет встроенных плейлистов; фраза «Приложение не предоставляет контент, пользователь добавляет собственные источники». Плееры без контента проходят ревью, приложения с каналами — блокируются
- [ ] Permissions: только INTERNET + сетевые для Cast. Лишних («на всякий случай») не добавлять

## Ограничения Cast
- Используется Default Media Receiver. Он надёжно играет HLS (.m3u8); «сырой» MPEG-TS по HTTP на многих Chromecast не заработает.
- ТВ сам забирает поток по URL: источник должен быть доступен из той же сети, что и ТВ (потоки с привязкой к IP телефона/токену не пойдут).
- Телефон и ТВ — в одной Wi-Fi сети; на Android 16+/17 при запросе доступа к локальной сети разрешите его.
- Нужны Google Play Services (на устройствах Huawei без GMS Cast недоступен — приложение продолжит работать, кнопка 📺 покажет ошибку).

## Шаблон политики конфиденциальности
«IPTV Cast не собирает, не передаёт и не продаёт персональные данные. URL плейлиста хранится только на устройстве.
Приложение подключается к серверам, указанным пользователем, и к устройствам Google Cast в локальной сети. Контакт: <email>.»
