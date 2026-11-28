# SaansSafe for Android

A small Capacitor app that opens your SaansSafe server full screen, with the SaansSafe icon, a night-sky splash
and an offline page that still lets you call 108 or 112. The app itself is the same web app, so every feature
and every update on the server shows up in the phone app at once.

You can also skip the APK: open SaansSafe in Chrome on Android and tap **Install** (or the ⋮ menu → *Add to Home
screen*). On iPhone use Safari → Share → *Add to Home Screen*. Both need the server on **https**.

## Get an APK without installing Android Studio

1. On GitHub open **Actions → Android app → Run workflow**.
2. Enter the address of your SaansSafe server (for example `https://saanssafe.example.com`, or your laptop on the
   same Wi-Fi such as `http://192.168.1.20:8080`).
3. When the run finishes, download **saanssafe-debug-apk** from the run page, copy `app-debug.apk` to the phone
   and open it (allow "Install unknown apps" once).

## Build it yourself

Needs Node 22, JDK 21 and the Android SDK (Android Studio installs both).

```bash
cd mobile
npm ci
npm run server -- http://192.168.1.20:8080   # your server
npm run android                              # creates android/ (not committed)
pip install pillow && python scripts/brand_android.py
npm run apk                                  # android/app/build/outputs/apk/debug/app-debug.apk
```

## Using your laptop as the server

* Find the laptop's Wi-Fi address (`ipconfig` on Windows, the IPv4 address) and use `http://<that address>:8080`.
* Plain `http` is fine for trying it, but log-in cookies are https-only by default. Start the container with
  `-e COOKIE_SECURE=false` so you can log in over plain http on your own network. Phones also block location
  and notifications on plain http pages; an https address fixes both.
* Allow port 8080 through Windows Firewall for private networks if the phone cannot connect.

iOS and Play Store builds are not set up; the same Capacitor project can produce them later (`npx cap add ios`
needs a Mac with Xcode).
