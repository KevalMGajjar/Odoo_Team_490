# Offline Mobile App

A Flutter companion to the Urban Furniture accounting system. Read-only, and
built to work with no network at all.

Merged into `main`. This branch is where the app was built.

---

## What it is

An accountant on a shop floor or in a client's office needs to look something up
and frequently has no usable connection. This app syncs the company's data to
the device once, then works entirely from that local copy. Losing signal changes
nothing about what you can see.

Five screens behind a bottom tab bar:

**Dashboard** — receivables, payables, total invoiced and catalogue size as KPI
cards, quick-access counts, and the most recent invoices.

**Invoices** — customer invoices and vendor bills on separate tabs, searchable
by number or partner, filterable by state, each showing its posting state and
payment state.

**Contacts** — customers and vendors with contact details.

**Products** — the catalogue with category, cost and sale price.

**Ledger** — journal entries with their journal, date, line count and total.

A portal user gets a different app entirely: their own documents, and nothing
else.

---

## Offline-first, in practice

**Hive** holds fifteen boxes on the device: contacts, products, accounts,
journals, taxes, currencies, currency rates, purchase orders, sales orders,
vendor bills, customer invoices, payments, journal entries, analytic accounts
and budgets.

The app renders from Hive, always. A sync updates the cache; it is never on the
critical path of showing a screen. Launching offline shows the last synced state
immediately rather than a spinner that will never resolve.

Sync is role-aware. A portal user syncing down the staff path receives 403s from
every company-wide endpoint and ends up with an empty app, so `fetchBulkSync`
takes the role and pulls the portal document set instead.

The cache is device-wide, not per-user. Keeping it across a change of user would
show one person's company data to whoever signs in next on the same device, so
it is cleared whenever the signed-in user id changes.

---

## Signing in

Login is by Login ID, not email. The typed password never leaves the device: the
client derives `PBKDF2-SHA256(password, salt = loginId)` over 100,000 iterations
and sends the digest, exactly as the web client does. `test/password_parity_test.dart`
asserts the Dart implementation produces the same digest as the server's, because
a divergence there would be an authentication failure with no useful error.

Most accounts then need a six-digit code emailed to them; the app shows the code
step and redeems it for a session. The three seeded demo accounts skip it, which
is what makes the one-tap demo buttons work.

---

## Pointing it at a backend

The base URL resolves in this order:

1. A URL saved in settings on the device
2. `--dart-define=API_URL=…` baked in at build time
3. The platform default — `10.0.2.2:4000` on Android, `127.0.0.1:4000` otherwise

A saved URL survives restarts and overrides the built-in default, which is worth
knowing because it is the usual cause of a build that will not connect. The
login screen shows the URL it is using, and the settings dialog has a "Use
default" button that clears a saved one. Connection errors name the address they
failed on rather than saying "check your connection", which distinguishes a
wrong address from an unreachable one.

```
flutter run                                                    # emulator
flutter build apk --release --dart-define=API_URL=http://192.168.1.20:4000
```

For a physical device the backend must be reachable over the LAN, which means
its own IP rather than `localhost`, the phone on the same network, and the
firewall permitting inbound connections on port 4000. A phone hotspot with the
laptop joined to it is the most reliable arrangement, since it is the one
network you control.

---

## Design

The palette mirrors `frontend/app/globals.css` exactly — the same plum, the same
semantic colours for document states. Two clients of one product should not look
like two products, and a colour that is nearly but not quite right reads as a
rendering fault.

Mobile-appropriate spacing rather than the dense desktop rows: larger touch
targets, 12px corner radius, cards rather than a table. Indian number formatting
throughout, so figures read as ₹1,57,060.00 rather than ₹157,060.00.

Lists are sorted where the data is loaded rather than in each screen: documents
newest first, masters alphabetically. Hive returns records in write order, which
is arbitrary, and a list with no order is the fastest way to make a working
application look broken.

---

## Bugs worth recording

These were found and fixed here, and each was invisible until a specific
sequence of actions.

**A white screen on relaunch.** Hive returns nested maps as
`Map<dynamic, dynamic>`, and only the top level was being retyped. Reproduced
only after a genuine close-and-reopen cycle, never during a hot restart.

**A cross-user cache leak.** Signing in as a second user showed the first user's
cached data, because the cache was device-wide and nothing cleared it on a user
change.

**A portal role privilege bug.** A check tested `role == 'contact'`, a role name
that no longer exists, so it was always false and portal users were routed down
the staff sync path into a wall of 403s.

**A sync race on login.** Login and the app shell both started a sync; the shell
saw one already running and skipped its own, while login's reload was guarded on
a widget that had already unmounted. Synced data sat in Hive with the UI showing
zeros. Fixed with an explicit completion callback.

---

## Running the tests

```
flutter analyze
flutter test
```

Eleven tests. The integration tests run against a live backend and skip
themselves cleanly when one is not reachable, rather than failing for the wrong
reason. They cover the authentication contract, the role model, that a portal
user syncs their own documents rather than an empty app, that every synced
collection parses into its model, and password derivation parity with the
server.

---

## Layout

```
lib/
  config/       theme, API configuration, number and date formatting
  models/       data models, JSON parsing
  providers/    auth, data, connectivity — ChangeNotifier
  screens/      login, app shell, five tabs, portal
  services/     API client, auth, Hive storage, sync manager, password derivation
  widgets/      KPI card, status badge, sync status bar
test/           API contract, offline cache, password parity
```
