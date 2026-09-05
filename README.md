# AI Voice Assistant

A read-only voice interface for the Urban Furniture accounting system. You speak
a phrase; it opens the screen you asked for, with the filters you asked for.

Merged into `main`. This branch is where the feature was built.

---

## What it is

Say "open the balance sheet for last financial year" and the balance sheet
opens, dated 31 March. Say "what did we invoice Gateway Hotels" and the invoice
list opens filtered to that customer. Say "how do I make a new sales invoice"
and the blank invoice form opens.

It navigates. It does not read figures aloud, answer questions, or write
anything.

That constraint is the design, not a limitation that was run out of time. An
assistant that reports numbers is an assistant that can report a number that is
subtly wrong, and a wrong figure spoken confidently in an accounting system is
worse than no assistant. Every number a user sees is rendered by the application
from the database. The model never produces one.

---

## Why it cannot hallucinate

The model is given one job: pick an `id` from a fixed catalog and describe a
period in words. It is structurally incapable of doing anything else, because
nothing it returns is used directly.

**The catalog is an allowlist.** `backend/src/services/voiceIntents.js` declares
48 intents. Each names a route, a human label, and the parameter kinds it will
accept. The model can only choose from what is written there. It never authors a
route, a filter value, or a number.

**Everything is validated after the model, not trusted from it.**
`validateIntent()` rejects an unknown id, a parameter the chosen intent does not
accept, an enum value outside the allowed set, or a date that does not parse.
A rejection becomes a clarifying question rather than a guess.

**Dates are resolved server-side.** The model returns a phrase — "last quarter",
"this financial year" — and `resolveRange()` turns it into concrete ISO dates
using the Indian financial year. The model is never asked to do arithmetic on
dates, because it is not reliable at it and a silently wrong period produces a
report that looks entirely plausible.

**Low confidence asks rather than assumes.** Below the floor, the assistant says
what it thinks it heard and waits.

**Nothing it can open changes data.** Some intents are blank "new document"
forms. Opening one creates nothing — the user still fills it in and presses save.
So the worst outcome of a misheard command is the wrong screen.

---

## What leaves the machine

One spoken phrase. "Open the balance sheet for last year."

No ledger figures, no customer names, no document contents, no totals. The
model's entire job is to name a screen and describe a period in words.

The endpoint is anything OpenAI-compatible, set by `AI_BASE_URL`. Groq by
default; point it at `http://localhost:11434/v1` to run fully offline against
Ollama. There is no vendor SDK, so switching hosts is an environment change
rather than a code change. With `AI_ENABLED=false` the assistant reports that it
is not configured rather than failing obscurely.

---

## The intent catalog

48 intents across four groups.

**Reports** — balance sheet, profit and loss, trial balance, budget report,
inventory valuation, general ledger, transactions.

**Document and master lists** — invoices, bills, purchase orders, sales orders,
payments received and made, journal entries, budgets, contacts, products,
product categories, chart of accounts, journals, taxes, currencies, analytic
accounts, stock moves, stock adjustments.

**Blank forms** — new sales invoice, vendor bill, purchase order, sales order,
contact, product, journal entry, budget, analytic account, account, stock
adjustment, and the five voucher screens.

**System** — dashboard, users, new user, audit log, Odoo sync, health, help.

Parameters an intent may accept:

| Kind           | Becomes                    | Resolved by                       |
| -------------- | -------------------------- | --------------------------------- |
| `asOf`         | `?asOf=YYYY-MM-DD`         | `resolveAsOf()`, server-side      |
| `range`        | `?from=…&to=…`             | `resolveRange()`, server-side     |
| `partner`      | `?partnerId=…`             | matched against real contacts     |
| `settleState`  | `not_paid`/`partial`/`paid`| enum check                        |
| `state`        | `draft`/`posted`/…         | enum check                        |

Anything else the model returns is dropped.

---

## Role awareness

The prompt is built per role. An accountant is not offered user management; a
portal user is offered neither that nor company-wide reports. `intentIdsForRole()`
filters the catalog before the prompt is assembled, so the model is never told
about screens the caller could not open anyway — and the route guards would
refuse regardless.

---

## How a phrase becomes a screen

```
microphone
  → Web Speech API transcript, in the browser
  → POST /voice/route  { transcript }
  → prompt assembled from the role-filtered catalog
  → model returns { intent, params, confidence }
  → validateIntent(): allowlist, parameter kinds, enums, confidence floor
  → resolveRange() / resolveAsOf() turn phrases into ISO dates
  → partner phrase matched against real contacts
  → { route, label, params } or { clarify }
  → client navigates, and shows the label as confirmation of what was understood
```

The label is spoken and shown back deliberately. The user should see what was
understood, not just where they ended up.

---

## Resilience

The AI endpoint is a third party that can go slow rather than down, which is the
worse failure. Calls go through an `opossum` circuit breaker, so once it is
clearly unhealthy requests fail instantly instead of each sitting through the
full timeout, and a single probe checks for recovery.

Failures are reported for what they are. A 429 is rate limiting, not "check your
API key" — the original version reported every failure as a credentials problem,
which sent debugging in the wrong direction for a while.

---

## Configuration

```
AI_ENABLED=true
AI_BASE_URL=https://api.groq.com/openai/v1    # or http://localhost:11434/v1
AI_API_KEY=
AI_MODEL=openai/gpt-oss-20b
```

`GET /health` reports `checks.ai` as configured or disabled, with the model name
and whether the endpoint is local.

---

## Files

```
backend/src/services/voiceIntents.js   the allowlist, date resolution, validation
backend/src/services/voiceRouter.js    prompt assembly and the model call
backend/src/routes/voice.js            POST /voice/route
frontend/components/voice/VoiceAssistant.js   microphone, transcript, navigation
frontend/lib/speech.js                 Web Speech API wrapper
```

Speech recognition is the browser's own. Nothing is recorded or uploaded; the
transcript is produced locally and only the text is sent.
