# Urban Furniture — Offline-First Mobile App

Flutter companion app for the Urban Furniture accounting system. It syncs the
backend's data into a local Hive cache and stays fully usable with no network.

It is **read-only**: it displays synced records and never posts changes back.

## Running it

The backend must be running first (`cd ../backend && npm run dev`).

```bash
flutter pub get
flutter run                 # attached device or emulator
flutter run -d chrome       # quickest way to look at it
```

Sign in with a **Login ID**, not an email — `admin01`, `accountant1` or
`nimesh01`, all with password `demo123`. The demo chips on the login screen
sign in with one tap.

### Pointing it at the backend

The default host is chosen per platform: `10.0.2.2:4000` on an Android
emulator, `127.0.0.1:4000` everywhere else. For a physical phone the backend is
on your machine's LAN address, so set it via the gear icon on the login screen
(e.g. `http://192.168.1.20:4000`). That choice is saved, so it survives a
restart.

The backend allows any `localhost`/`127.0.0.1`/`10.0.2.2` origin in development.

## Tests

```bash
flutter test
```

`test/api_integration_test.dart` runs against a **live backend** on
`127.0.0.1:4000` and skips itself when one isn't running. It exists because the
app's login and role handling had silently drifted away from the server's — a
mocked client would have passed straight through both bugs.

`test/offline_cache_test.dart` writes to Hive, closes it, reopens it and reads
back. The round-trip matters: nested records only fail to parse *after* a
restart, so a test that skipped the reopen would have missed the crash that
made the app white-screen on every relaunch.

## How the offline cache works

- Sync overwrites every box in one pass — no deltas, no merge, no conflicts.
- `SyncManager.onSyncCompleted` pushes fresh records into `DataProvider`. It is
  wired in `main.dart` rather than a widget, because a screen that has been
  replaced mid-sync cannot reload anything.
- The cache deliberately survives logout so the same user reopens instantly
  while offline. Signing in as a *different* user clears it first — the boxes
  are device-wide, not per-user.
- Portal users sync through `/portal/documents`, which is scoped to their own
  invoices; the company-wide endpoints correctly refuse them.
