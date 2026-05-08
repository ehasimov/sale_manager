# SHELF CTRL — Real Device (Expo Go) Test Guide

This document explains how to run the **end-to-end live flow** (camera + GPS) on a real phone using **Expo Go**. Web preview cannot reproduce these flows because browsers don't expose native camera and trustworthy GPS.

---

## 1. Install Expo Go on your phone

- iOS → App Store: search **"Expo Go"** → install.
- Android → Play Store: search **"Expo Go"** → install.

Sign-in is **not** required for Expo Go.

---

## 2. Connect the phone to the running app

When Expo is running in this preview, a tunnel URL like
`https://gps-shelf-upload.preview.emergentagent.com` is exposed.

Two ways to open the project:

**Option A — Scan QR code**
1. Open Emergent's preview panel and look for the QR code provided next to the running Expo job.
2. Open Expo Go on your phone → tap **"Scan QR code"** → point at the QR.

**Option B — Manual URL**
1. In Expo Go, tap **"Enter URL manually"**.
2. Type: `exp+gps-shelf-upload.preview.emergentagent.com` (or use the URL shown in the run panel).

The app will bundle (~30s on first run) and launch.

---

## 3. Grant permissions when prompted

On first launch you will see two iOS/Android permission dialogs:
- **Camera** — tap **Allow**. Used to capture shelf photos.
- **Location (While using the app)** — tap **Allow** / **Allow once**. Required for GPS verification.

If you accidentally deny, go to phone Settings → Expo Go → enable Camera + Location.

---

## 4. Test accounts

Pre-seeded:
- Sales rep: `rep01` / `Rep@2026`
- Admin: `admin` / `Admin@2026`

The login screen has one-tap autofill chips for both.

---

## 5. Live flow checklist

| # | Action | Expected behaviour |
|---|--------|--------------------|
| 1 | Sign in as `rep01` | Land on **Routes** tab. Hero greeting + completion %. |
| 2 | Tap any **locked** customer (C001 / C002 / C004) | Customer detail with hero shelf image and sticky bottom CTA. |
| 3 | Tap **Check distance** | Phone GPS reads, distance gauge animates. If you're not in Baku, you'll see a large red "Out of range" number. |
| 4 | Tap **Capture shelf photo** while out of range | Alert: *"Too far. Please move within 30 m"* — capture screen does **not** open. |
| 5 | Open an **unlocked** customer (C003) | Bottom CTA changes to yellow **"Lock GPS at this spot"**. |
| 6 | Tap **Lock GPS** → confirm | Coordinates recorded. CTA changes to **"Capture shelf photo"**. The lock cannot be undone from the app. |
| 7 | Capture flow (only meaningful when within 30 m of locked customer) | Camera opens with corner brackets, animated scan line, live HUD, and watermark overlay. Tap **Capture** → preview → **Upload**. Photo lands on the customer detail's photo grid. |
| 8 | Switch to **Reports** tab | Weekly completion ring, schedule progress per customer, filter chips. |
| 9 | Sign out, sign in as `admin` | Reports tab shows the **7-day uploads bar chart** + **By rep** ranking. |
| 10 | Tap the yellow **Edit** chip on any customer in Reports | Bottom-sheet opens; tap a number 0..7 to set visits per week. Status updates immediately. |
| 11 | Open **Admin** tab | Photos / Alerts / Stores / Team segments work. Reset location available on locked customers. |

---

## 6. Mock-GPS test (Android)

To verify the anti-spoof layer:

1. Install **"Mock GPS"** or any fake-GPS app on Android.
2. Enable Developer options → "Select mock location app".
3. Move your virtual location somewhere far.
4. In SHELF CTRL, try to confirm a location or capture a photo.
5. The app must show **"Mock location detected"** and refuse the action.
6. Sign in as admin → **Admin → Alerts** — your attempt is logged with the user, customer code, coordinates, and reason.

iOS does not expose a public mock-GPS flag, so this verification is Android-only.

---

## 7. Offline test

1. Put phone in **airplane mode** (or turn off Wi-Fi + mobile data).
2. From a customer where you are within 30 m, capture and upload a photo.
3. The app should show **"Saved offline. Will auto-sync."**
4. Re-enable network → the offline banner shows pending count → app posts queued photo automatically when you next open the Routes tab → green "Synced N pending photos" toast.

---

## 8. Known limitations

- Watermark is burned in via `react-native-view-shot`. Some older Android devices may need a Dev Client build instead of Expo Go for full reliability.
- Mini map on the Customer Detail screen is a stylised radar — full map tiles are out of scope for MVP.
- Photos are stored as base64 in MongoDB (sufficient for MVP; production should swap to Cloudinary or S3).

---

## 9. Reporting issues

If a step fails, please share:
- iOS / Android version.
- Reproduction steps.
- Screenshot of the error toast or Expo Go red-box.
- Backend logs (visible in this project's `tail -n 200 /var/log/supervisor/backend.err.log`).
