# Odoo Hackathon — Winning Playbook & Idea Bank

> Built from a full teardown of the past-winner repo **[AryanVadhadiya/Odoo_Team_31](https://github.com/AryanVadhadiya/Odoo_Team_31)** (project "ECO_Flow", ~19.5k LOC across 4 services), plus how Odoo hackathon rounds are actually scored.
>
> **Status:** written before the problem statement is known. Sections 1–5 are PS-agnostic prep you should act on *now*. Sections 6–9 are execution once the PS drops.

---

## 0. TL;DR — the one-paragraph strategy

The winner did not win on features. They won on **shape**: a boring, correct, role-gated CRUD core delivered fast, then wrapped in three "wow" layers that most teams never reach — (1) a **real Odoo instance** talking XML-RPC to their backend, (2) a **Slack bot with an AI agent** that could drive the entire app from chat, and (3) an **immutable audit log + configurable workflow engine** that made it look like enterprise software instead of a hackathon toy. Copy that shape. Pre-build the boring 60% tonight, and spend hackathon hours only on the PS-specific domain logic and the three wow layers.

**But first read §0.5.** The organizers published explicit must-haves. Those are pass/fail gates — no amount of "wow" saves you if you fail one.

---

## 0.5 Ground rules from the organizers — these are pass/fail

Verbatim rules, each mapped to what you actually build. **Do these before any Tier-S differentiator.** A team that nails all five must-haves with a modest feature set beats a team with a Slack AI agent and a broken mobile layout.

### MUST #1 — "Use real-time or dynamic data sources; avoid static JSON unless it's for initial prototyping"

This rule is the single biggest validator of the §2 Lever-1 strategy. It means: **no hardcoded arrays in your components, ever.** Judges will open DevTools and look at the network tab.

What satisfies it, cheapest first:

1. **Everything from Postgres via your own API.** Baseline. No `const products = [...]` in any `.js` file outside the seed script.
2. **Live Odoo over XML-RPC** (§5.2). This is the strongest possible answer to this rule — the data is coming from a *different running system*, not your own DB.
3. **Real-time push, not just fetch.** Add Socket.IO or SSE so the Kanban board / notification bell / dashboard counters update **without a refresh**. Two browser windows side by side on the projector, drag a card in one, watch it move in the other — that is a 10-second demo moment that directly answers this rule.
4. **Computed aggregates, not stored ones.** Dashboard numbers should be `prisma.x.groupBy(...)` at request time, not a number you wrote down.
5. If the PS genuinely needs external data (weather, geo, currency, maps), hit a real free API and **cache it in your DB** with a TTL — that also satisfies the offline nice-to-have below.

Anti-patterns judges catch instantly: a chart with the same numbers every reload, a "notifications" list that never changes, `data.json` imported into a page, `Math.random()` in a component.

```js
// ✅ dashboard aggregates computed live
const byStage = await prisma.eco.groupBy({ by: ['stageName'], _count: { _all: true } })
// ❌ never
const stats = { new: 12, review: 5, done: 31 }
```

**Minimum real-time build (≈2h):** Socket.IO on the Express server, one `io.emit('entity:changed', payload)` call inside every mutation route, one `useSocket()` hook on the frontend that refetches or patches local state, and a `<Toast/>` that fires on incoming events.

### MUST #2 — "Responsive and clean UI (consistent color scheme and layout)"

⚠️ **This overrides my earlier Tier-C advice** — responsiveness is not optional here, it's an explicit gate. Budget 1.5h for it, not zero.

**Consistency is graded harder than beauty.** Pick constraints and never deviate:

- **One accent ramp.** Exactly one (winner used teal). Semantic colors only for status: green=success, amber=pending, red=danger, slate=neutral. Nothing else gets a color.
- **One spacing scale.** Tailwind's `4 / 6 / 8` for padding, `gap-4` between cards, `gap-6` between sections. Never eyeball a `px` value.
- **One radius.** `rounded-xl` for cards, `rounded-lg` for inputs/buttons. Pick and enforce.
- **One shadow.** A `shadow-card` token. Don't mix five elevations.
- **One font.** Inter, 3 weights max (400/500/600).
- **One page shell.** Every page: `<PageHeader title actions />` then content. Same top padding everywhere. Inconsistent page headers are the #1 thing that makes a hackathon app look thrown together.

**Responsive checklist (test at 375px / 768px / 1440px — use DevTools device toolbar):**

- [ ] Sidebar collapses to a hamburger drawer under `md:`
- [ ] Every table is wrapped in `overflow-x-auto` — or better, swaps to a stacked card list under `sm:`
- [ ] Grids are `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`, never a fixed column count
- [ ] Modals are `max-h-[90vh] overflow-y-auto` and full-width on mobile
- [ ] The Kanban board scrolls horizontally on mobile rather than crushing columns
- [ ] Nothing causes horizontal page scroll at 375px
- [ ] Tap targets ≥ 44px on mobile
- [ ] Long text truncates (`truncate`, `line-clamp-2`) instead of breaking layout

Cheapest way to hit this: build **mobile-first** — write the base classes for narrow, then add `md:`/`lg:` to expand. Retrofitting is 3× the work.

### MUST #3 — "Validate user input robustly"

Use **Zod on the backend** (the winner's own commit history includes "Implement data validation schemas using Zod") and mirror the messages on the frontend. Validation must be **server-side first** — a judge will hit your API with curl or just disable the HTML `required` attribute.

```js
// backend/src/schemas/product.js
import { z } from 'zod'

export const createProductSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  salePrice: z.coerce.number().nonnegative('Price cannot be negative').max(1_000_000),
  costPrice: z.coerce.number().nonnegative().optional(),
  effectiveDate: z.coerce.date().min(new Date(), 'Effective date must be in the future').optional(),
  components: z.array(z.object({
    name: z.string().trim().min(1),
    quantity: z.number().positive('Quantity must be greater than zero'),
  })).min(1, 'At least one component is required'),
})

// backend/src/middleware/validate.js — one middleware, every route
export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source])
  if (!result.success) {
    return res.status(422).json({
      message: 'Validation failed',
      errors: result.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
    })
  }
  req[source] = result.data   // use the parsed+coerced value from here on
  next()
}

// usage — the route now reads as a spec
router.post('/', verifyJWT, requireRole(['admin','engineer']), validate(createProductSchema), handler)
```

Frontend: render `errors[]` from the 422 response **inline under the offending field**, not in a toast. Add `aria-invalid` and red borders.

**The validation demo move (30 seconds, huge payoff):** deliberately try to submit a negative quantity, a duplicate name, an effective date in the past, and an empty required field — show each one caught with a specific, human message. Then say *"and the same rules run server-side"* and show a curl call getting a 422. Judges remember this.

**Cover all six classes, not just "field is empty":**

| Class | Example |
|---|---|
| Type / format | email, UUID, ISO date, positive number |
| Range / length | qty > 0, price ≤ 1M, name 2–120 chars |
| Business rules | effective date in future; can't archive with open items; qty ≤ available stock |
| Uniqueness | duplicate product name / email — return 409 with a clear message |
| Referential | `productId` actually exists and is `active` |
| State / permission | can't approve your own request; can't edit in a locked stage |

Also: `helmet`, rate-limit the auth routes, cap `multer` upload size + MIME allowlist, and let Prisma parameterize everything (never string-concat SQL).

### MUST #4 — "Intuitive navigation with proper menu placement and spacing"

- **Persistent left sidebar** grouped by function, with `lucide-react` icons + labels. Group headers: `WORKSPACE` / `REPORTS` / `ADMIN`.
- **Active state is unmistakable** — accent background + left accent bar + bold label, driven off `usePathname()`.
- **Role-aware menu:** hide what the role can't do. An `ops` user should not see the admin section at all. This double-scores — it's navigation *and* it's the role matrix.
- **Breadcrumbs** on every detail page: `Products / Model X / v3`. Ten minutes of work.
- **Topbar** holds only: breadcrumb/page title, global search, dark-mode toggle, notification bell, user avatar + role badge + logout. Nothing else.
- **Never a dead end.** Every empty state has a CTA button. Every detail page has a back link. Every error page has "return to dashboard".
- **≤ 3 clicks** from login to any feature. Count them and fix the worst path.
- **⌘K command palette** — the cheapest way to look like a finished product (Tier B, §6).

### MUST #5 — "Use version control (Git) properly; one member managing the repo is not enough"

⚠️ **This is explicitly checked, and it's the easiest must-have to fail by accident.** Judges run `git shortlog -sn` or just look at the GitHub contributors graph. If 90% of commits are from one account, you lose points no matter how good the code is.

**Non-negotiable protocol:**

1. **Every member commits from their own machine under their own name and email.** Set it on day zero:
   ```bash
   git config user.name "Full Name"
   git config user.email "github-account-email@example.com"
   ```
   Verify with `git log --format='%an <%ae>'` that four distinct authors show up.
2. **No pair-programming-on-one-laptop for the whole event.** If you must, use co-author trailers so both names land in history:
   ```
   Co-authored-by: Name <email@example.com>
   ```
3. **Branch per feature**, merged via PR: `feat/eco-kanban`, `fix/auth-cookie`, `chore/seed-data`. Even a self-approved PR shows process.
4. **Conventional commit messages.** The winner's history is exemplary — read it as a template: `Implement data validation schemas using Zod`, `Add realtime notifications service via websockets`, `Optimize database query performance for dashboard`. Never `update`, `fix`, `asdf`, or `final final v2`.
5. **Commit every 20–30 minutes.** A repo with 4 commits at 3am looks like a copy-paste. ~30–60 well-spaced commits across 4 authors looks like a team.
6. **Protect `main`** — or at minimum, never push broken code to it. Someone should be able to clone `main` at any moment and run it.
7. **`.gitignore` before the first commit:** `node_modules/`, `.env`, `.env.*` (keep `.env.example`), `.next/`, `dist/`, `.DS_Store`, `*.pyc`, `__pycache__/`. The team you're studying leaked `slackbot/.env` with live tokens — don't repeat it.
8. **A real README from hour one**, updated as features land (§2 Lever 7).
9. Optional but strong: **GitHub Issues + a project board** with tasks assigned per member. It's visible proof of "team collaboration," which is a named judging criterion.

Run this before submitting and make sure it looks healthy:
```bash
git shortlog -sn --all          # commit count per author — should be reasonably balanced
git log --oneline | wc -l       # total commits
git log --format='%an' | sort -u  # distinct authors
```

### NICE #1 — "Design backend APIs, model data, set up a local database"

Already the core of §3 and §4. To make it *visible* to judges rather than just true:

- A **REST convention table in the README** (`GET /x`, `POST /x`, `POST /x/:id/action`) — the winner's README has exactly this and it reads as competence.
- **Consistent response envelope** and consistent status codes: `200/201/401/403/404/409/422/500`. Use `409` for state conflicts and `422` for validation — that distinction alone signals you know what you're doing.
- **A schema diagram** (Prisma ERD or a Mermaid `erDiagram`) in the README.
- **Prisma migrations committed**, not `db push`. Migration files in the repo prove you modeled deliberately.
- Optionally **Swagger/OpenAPI** at `/docs` — the winner did this. It's ~45 min with `swagger-ui-express` and it's a great thing to click during a demo.
- Local Postgres, seeded, no cloud DB. Which leads to:

### NICE #2 — "Plan for offline/local; don't rely entirely on internet or cloud tools"

⚠️ **This qualifies my earlier Groq recommendation.** Everything except the LLM should already be local (Postgres local, Odoo in local Docker, Slack via Socket Mode needs net but the web app doesn't). Close the last gap:

- **Every external call is behind an interface with a fallback.** If the LLM is unreachable, the document-upload flow falls back to manual entry (the winner does exactly this: *"Without it, manual component entry remains available"*), and the AI chat returns a graceful "AI unavailable — try `/help` for commands."
- **Pre-warm a response cache.** Before demoing, run your 5 scripted AI prompts once and cache the responses keyed by normalized prompt. If wifi dies mid-demo, the cache answers. Say so openly — "we cache agent responses, so it degrades gracefully" is a *feature*, not an excuse.
- **Optional local LLM:** `ollama run llama3.1:8b` exposes an OpenAI-compatible endpoint at `localhost:11434`. Since your agent already speaks that protocol, it's a one-env-var switch: `AI_BASE_URL`. Pull the model in advance. Being able to say *"and it runs fully offline against a local model"* is a genuine differentiator against this exact rule.
- **No cloud-only dependencies:** no Firebase, no Supabase, no Vercel-only features, no hosted Mongo, no CDN-loaded fonts at runtime (self-host Inter or accept the fallback stack).
- **Pull every Docker image and `npm install` before the event.** Venue wifi is the most reliable point of failure at any hackathon.
- **A `/health` page** showing DB / Odoo / AI as green-amber-red dots proves the degradation story visually in 5 seconds.

### NICE #3 — "Use trendy tech only if it adds real value"

This validates the winner's choices and my §6 Tier-C list. Have a one-line justification ready for every dependency — judges ask *"why did you choose X?"*

| Choice | The one-line answer |
|---|---|
| Next.js App Router | file-based routing + layouts = fewer moving parts, faster to ship |
| Prisma | schema-as-source-of-truth, typed queries, migrations for free |
| PostgreSQL | relational data with real constraints; JSON columns where we need flexibility |
| Plain JS, no TypeScript | 30h event; type safety wasn't worth the compile-time tax |
| Socket.IO / SSE | the real-time requirement, with an automatic polling fallback |
| Zod | one schema validates and coerces, shared shape between layers |
| Odoo via XML-RPC | integrate with the real ERP rather than reimplement it |

And be ready to say what you *rejected*: "we skipped GraphQL, microservices, and Kubernetes — nothing in this problem needed them." **Naming what you deliberately didn't use scores better than naming what you did.**

---

## 1. Teardown: what the winner actually shipped

### 1.1 Domain

**ECO_Flow** — Enterprise Product Lifecycle Management (PLM). Products → Bills of Material (BoM) → Engineering Change Orders (ECO) that must be approved before anything changes.

The genius of the domain framing: **nothing can be edited directly.** Every price change, every BoM component swap has to go through an ECO that moves `New → Review → Done` with approvals. That single constraint generates: versioning, diffs, approval history, audit logs, Kanban boards, reports — a dozen demoable features from one rule.

### 1.2 Services (monorepo, 4 services)

```
├── backend/            # Express + Prisma + PostgreSQL, JWT in httpOnly cookie
├── frontend/           # Next.js 14 App Router, Tailwind, lucide-react
├── erp-microservice/   # Odoo 17 + Postgres via docker-compose + Python seed scripts
├── slackbot/           # Slack Bolt (Socket Mode) + custom ReAct AI agent
└── shared/             # cross-service constants
```

### 1.3 Stack (exact, from package.json)

| Layer | Choice | Note |
|---|---|---|
| Frontend | `next@14.2` App Router, `react@18`, `tailwindcss@3.4`, `lucide-react`, `clsx`, `js-cookie`, `react-d3-tree` | plain `.js`, **no TypeScript** — deliberate speed choice |
| Backend | `express@4`, `@prisma/client@5`, `bcryptjs`, `jsonwebtoken`, `cookie-parser`, `cors`, `helmet`, `morgan`, `multer` | ESM (`"type": "module"`) |
| Docs/AI | `groq-sdk` (doc parsing), `pdf-parse`, `mammoth` (DOCX) | |
| ERP | `xmlrpc` → Odoo 17 | the differentiator |
| Slack | `@slack/bolt@4` Socket Mode | no public URL / ngrok needed |
| DB | PostgreSQL 15 | Prisma migrations checked in |

**Takeaway:** they picked the *fastest thing they already knew* and spent zero hackathon time on tooling. No TypeScript, no monorepo tool, no GraphQL, no Docker for their own services. Only Odoo got Docker (because it had to).

### 1.4 Data model (13 Prisma models)

`User, Product, ProductVersion, Bom, BomComponent, BomOperation, EcoFlowTemplate, EcoStage, Eco, EcoChange, EcoApproval, AuditLog`

Four schema patterns worth stealing verbatim (see §4).

### 1.5 Feature surface (what they demoed)

1. Role-aware UX for 4 roles: `admin`, `engineer`, `approver`, `ops`
2. Dashboard with stage-aware pipeline widgets
3. Product workspace: versions, BoMs, ECO history, archive-with-guardrails
4. BoM management: multi-level sub-assemblies, tree view, flattened view, **rolled-up cost**, circular-reference protection, depth limits
5. **Document → BoM AI parsing** (upload PDF/DOCX → Groq extracts components → preview → accept)
6. **BoM version visual diff**
7. ECO stepper authoring with `add/modify/remove` change rows and before/after
8. **Kanban board with drag-drop** + table view toggle for the same data
9. Approver decision panel; rejection *requires* a reason; approval timeline
10. **Inventory sufficiency check against live Odoo** before approval
11. Reports: ECO history, active version matrix, archived records, **CSV export**
12. Filterable **audit log** with JSON old/new payload viewer
13. **Admin workflow builder** — create stage templates, set order / needs-approval / allow-changes / is-final, promote a default
14. **Slack**: slash commands, modal creation flows, inline approve/reject buttons, and `/plm <natural language>` AI agent

---

## 2. Why it won — 7 reusable win levers

Rank-ordered by judge-impact per hour spent.

### Lever 1 — "Real integration, not a mock" ⭐ highest ROI

They ran an actual **Odoo 17 container**, seeded it with 24 realistic components (`Battery 3000mAh`, `OLED Display 5.8in`, `PCB Mainboard`…) with costs and stock quantities, then hit it over XML-RPC from their backend. During a demo you can say *"this stock number is coming from a live Odoo ERP running right there"* — no other team will say that.

It's cheap: `docker compose up` on `odoo:17` + a ~250-line Python seed script. **Pre-build this tonight.** (§5)

### Lever 2 — A second interface into the same backend ⭐

The Slack bot is not a feature, it's a *category difference*. Judges see one app; you show two front-ends over one API. And the adapter pattern (`slackbot/adapters/base.js` + `rest.js`) means the bot is thin — it just calls the same REST endpoints.

Cheap version if Slack is a hassle: a **Telegram bot**, a **CLI**, or a **WhatsApp-style web widget**. The point is *"our API is a real product surface, not just a backend for our React app."*

### Lever 3 — AI as an *agent over your own API*, not a chatbot ⭐

`slackbot/ai/tools.js` defines 18 OpenAI-style function-calling tools over their own endpoints (`list_products`, `create_eco`, `approve_eco`, `get_version_matrix`, `get_audit_log`…). `ai/agent.js` is a hand-rolled ReAct loop: prompt → model returns JSON tool call → execute → feed result back → repeat.

Crucially they gated it:

```js
const MUTATING_TOOLS = new Set(['create_product','archive_product','create_eco','advance_eco','approve_eco','reject_eco']);
```

Mutating tools require confirmation. **Say that line out loud in your demo** — "the agent can write, but writes are guarded" is exactly the kind of maturity that scores.

They also built a **CLI test harness** (`slackbot/test-cli.js`) so they could iterate on the agent without Slack in the loop. Do this — it saves hours.

### Lever 4 — Governance theatre: audit log + approvals + immutability

`AuditLog` with `action, entityType, entityId, oldValue Json, newValue Json, performedBy, performedAt`, written inside the same transaction as the mutation, non-blocking on failure. Plus a UI to filter it by action/entity/performer/date and expand the JSON diff.

This is ~150 lines of work and it makes the app feel like software a company would buy. **Every PS can absorb an audit log.**

### Lever 5 — Make the workflow itself configurable

Instead of hardcoding `New → Review → Done`, they made stages a **table** (`EcoStage` with `orderNo`, `needsApproval`, `allowChanges`, `isFinalStage`) grouped into `EcoFlowTemplate`s, with an admin screen to author them.

Demo line: *"and the workflow isn't hardcoded — admin can add a 'Legal Review' stage right now, live."* Then do it on stage. That's a guaranteed reaction.

### Lever 6 — Two views of the same data

Table **and** Kanban for ECOs, tree **and** flat for BoMs. Costs one afternoon, doubles the perceived surface area, and drag-drop-to-change-stage is inherently demoable.

### Lever 7 — A README that reads like a product

15KB, with a Mermaid architecture diagram, service port table, role/permission matrix, env var blocks, quickstart, API summary, troubleshooting, and a **production hardening checklist**. Judges skim the README before they ever run the code. This is the single highest-leverage 45 minutes at the end of the hackathon.

---

## 3. Code patterns worth stealing verbatim

### 3.1 Auth: JWT in httpOnly cookie + role middleware

```js
// middleware/auth.js
export const verifyJWT = (req, res, next) => {
  const token = req.cookies.app_token || req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ message: 'Unauthorized: No token provided' })
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next() }
  catch { return res.status(401).json({ message: 'Unauthorized: Invalid token' }) }
}

export const requireRole = (allowedRoles = []) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role))
    return res.status(403).json({ message: 'Forbidden: Insufficient role permissions' })
  next()
}
```

Usage reads like documentation — judges can see the permission model in the route file:

```js
router.post('/', verifyJWT, requireRole(['admin','engineer']), handler)
```

### 3.2 Audit log: fire-and-forget inside the transaction

```js
export const writeAuditLog = async (tx, { action, entity_type, entity_id, old_value, new_value, performed_by }) => {
  try {
    await tx.auditLog.create({ data: { action, entityType: entity_type, entityId: entity_id ?? null,
      oldValue: old_value ?? null, newValue: new_value ?? null, performedBy: performed_by ?? null } })
  } catch (err) { console.error('[Audit Error]', err) }  // never break the request
}
```

Plus a frozen `AUDIT_ACTIONS` map so action strings can't drift.

### 3.3 Every mutation is a `$transaction` + "apply on final stage"

The whole approval engine boils down to one function:

```js
if (nextStage.isFinalStage) {
  await fullValidation(eco, tx)   // e.g. ERP inventory sufficiency
  await applyEco(eco, tx)         // create new version, archive old, write audit
}
```

`applyECO()` runs entirely inside the caller's `tx`, so a failed inventory check rolls back everything. **Say "atomic" in your demo.**

### 3.4 Versioning: never update, always supersede

```js
const count = await tx.bom.count({ where: { productId } })
const newVersion = `v${count + 1}`
// create new row status:'active' → then set old row status:'archived'
```

`status: active | archived` on every versioned table + a `@@unique([parentId, version])`. Simple, and it gives you version history, diffs, and an "archived records" report for free.

### 3.5 External service calls: timeout + cached auth + graceful degradation

```js
const ERP_TIMEOUT_MS = Number(process.env.ERP_TIMEOUT_MS || 2500)
let cachedUid = null, cachedAt = 0
const UID_TTL_MS = 5 * 60 * 1000
// every methodCall wrapped in a Promise with a setTimeout reject
```

And on the AI side, retry with backoff on `429/500/502/503/504`. If the ERP is down the app still works — the inventory panel just shows unavailable. **Demo-day insurance.**

### 3.6 Defensive LLM output parsing

Never trust the model to return clean JSON:

```js
function extractFirstJsonObject(text) { /* brace-depth scanner that respects strings + escapes */ }
const cleaned = responseText.replace(/```json\n?|\n?```/gi, '').trim()
// try cleaned, then the extracted object; also normalize aliases:
const TOOL_ALIASES = { get_eco: 'get_eco_detail', list_eco: 'list_ecos', version_matrix: 'get_version_matrix' }
// and normalize enum values the model gets wrong:
if (['in review','in_review','review','pending review','in progress'].includes(v)) return 'In Review'
```

This is the difference between an AI feature that works on stage and one that doesn't.

### 3.7 Recursive tree utils (tree + flatten + rollup + cycle check)

`backend/src/utils/bomUtils.js` is a clean template for *any* hierarchical entity (categories, org charts, folders, task subtrees):

- `getTree(id, prisma, depth)` — recursive, hard `depth >= 3` cutoff returning a `maxDepthReached` marker node
- `flattenTree(tree)` — multiplies child qty by parent qty, then merges duplicates by lowercased name into a `Map`
- `calculateRolledUpCost(tree)` — recursive cost
- `checkCircularReference(...)` — BFS over the existing graph collecting a `visited` set, then tests each proposed edge against it

### 3.8 Document → structured data via LLM

`extractTextFromFile(buffer, mimetype)` fans out to `pdf-parse` / `mammoth` / base64-for-images, then one tight prompt to Groq:

> "Return ONLY a valid JSON array. No explanation. No markdown. No code fences. Raw JSON only."

…followed by a **deterministic `cleanComponents()` pass** that drops rows with non-positive quantities and dedupes by lowercased name keeping the larger qty. Truncates input at 6000 chars.

Pattern: **LLM extracts → deterministic code validates → human previews before commit.** That preview step (`ParsedComponentsPreview.js`) is what makes it trustworthy.

### 3.9 Frontend: a tiny UI kit, built once

`components/ui/`: `Badge, DiffTable, EmptyState, LoadingSpinner, Modal, StageBar, StatCard, Toast` — 8 primitives, then every page composes them. Plus `lib/api.js`, `lib/auth.js`, `lib/exportCsv.js`, `lib/utils.js`.

Design tokens in `globals.css` as CSS vars with a `.dark` override, `darkMode: 'class'` in Tailwind, a single accent ramp (they used teal), glassmorphism card class, Inter font, custom 5px scrollbars, and 3 keyframe animations (`fade-in`, `slide-up`, `slide-in`). **Total design system: ~120 lines.** It looks far more expensive than it cost.

---

## 4. Schema patterns to reuse whatever the PS is

```prisma
// 1. Role enum + role column — never a boolean isAdmin
enum Role { admin engineer approver ops }

// 2. Soft lifecycle instead of deletes
enum Status { active archived }

// 3. Versioned child table, unique on (parent, version)
model ProductVersion {
  productId String
  version   String
  status    Status @default(active)
  @@unique([productId, version])
}

// 4. Generic audit log — one table covers every entity
model AuditLog {
  action String
  entityType String
  entityId String?
  oldValue Json?
  newValue Json?
  performedBy String?
  performedAt DateTime @default(now())
}

// 5. Configurable workflow — stages are data, not code
model Stage {
  name String
  orderNo Int
  flowTemplateId String
  needsApproval Boolean @default(false)
  allowChanges  Boolean @default(true)
  isFinalStage  Boolean @default(false)
  @@unique([flowTemplateId, orderNo])
}

// 6. Change proposal rows — field / oldValue / newValue / changeType
enum ChangeType { modify add remove }
```

Also: `@map("snake_case")` on every field and `@@map("table_name")` on every model — DB stays snake_case, JS stays camelCase.

---

## 5. Pre-hackathon prep kit — build this BEFORE the PS drops

Problem statements are revealed at the start hour. Everything below is PS-agnostic. Get it into a private `starter/` repo tonight and you start the hackathon ~6 hours ahead.

### 5.1 The starter skeleton (highest priority)

- [ ] `backend/` — Express ESM, `helmet`, `cors` with `credentials:true`, `morgan`, `cookie-parser`, centralized `errorHandler`, `GET /` health check
- [ ] Prisma set up + one migration + `User` model + `AuditLog` model + `Status`/`Role` enums
- [ ] `middleware/auth.js` (`verifyJWT`, `requireRole`) — copy from §3.1
- [ ] `middleware/audit.js` (`writeAuditLog`, `AUDIT_ACTIONS`) — copy from §3.2
- [ ] `routes/auth.js`: signup / login / logout / me, bcrypt, JWT into httpOnly cookie
- [ ] **`middleware/validate.js` + Zod** — the generic `validate(schema, source)` middleware from §0.5 MUST #3, plus a `schemas/` folder
- [ ] `seed.js` that wipes + reseeds 4 demo users with the same password (`demo123`) — one per role
- [ ] **`realtime.js`** — Socket.IO server attached to the Express http server + a `broadcast(event, payload)` helper called from every mutation (MUST #1)
- [ ] `frontend/` — Next.js 14 App Router, `(dashboard)` route group with `layout.js` + `Sidebar` + `Topbar`, `/login` page
- [ ] **Sidebar collapses to a drawer under `md:`** and the shell is mobile-first from the start (MUST #2 — retrofitting costs 3×)
- [ ] The 8 `components/ui/` primitives + `globals.css` tokens + Tailwind config (§3.9), plus `<PageHeader/>` and `<FormField/>` (label + input + inline error + `aria-invalid`)
- [ ] `lib/api.js` fetch wrapper with `credentials:'include'`, centralized error toast, and **422 → per-field error mapping**
- [ ] `lib/useSocket.js` — subscribe hook + toast on incoming events
- [ ] `lib/exportCsv.js` — client-side CSV download from an array of objects
- [ ] `.gitignore` that actually covers `.env` ⚠️ (the winner committed `slackbot/.env` — don't)
- [ ] **Every teammate clones it and pushes one real commit tonight** — proves `user.name`/`user.email` are set correctly before it matters (MUST #5)

### 5.2 The Odoo container (do this now, it's slow the first time)

```yaml
services:
  db:
    image: postgres:15
    environment: { POSTGRES_DB: postgres, POSTGRES_USER: odoo, POSTGRES_PASSWORD: odoo }
    volumes: [ odoo-db-data:/var/lib/postgresql/data ]
  odoo:
    image: odoo:17
    depends_on: [ db ]
    ports: [ "8069:8069" ]
    environment: { HOST: db, USER: odoo, PASSWORD: odoo }
    volumes: [ odoo-web-data:/var/lib/odoo ]
volumes: { odoo-db-data: , odoo-web-data: }
```

- [ ] `docker compose up -d`, create DB `hack_erp` / admin / admin through the UI at `localhost:8069`
- [ ] Write `scripts/seed_odoo.py` — an `OdooClient` class wrapping `xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")` → `authenticate()` → `execute_kw`. Seed a company, a warehouse, and ~25 products with `standard_price`, `list_price`, and stock quantities.
- [ ] Write `scripts/verify_api.py` — prints what it can read back. This is your "is Odoo alive" smoke test on demo day.
- [ ] Write `backend/src/services/erpService.js` with `getAllProducts`, `getProductByName`, `checkInventory`, `checkInventoryBulk` (§3.5). **Keep it generic** — products/stock/price map onto almost any PS (inventory, marketplace, rental, catalogue, orders).
- [ ] **Pull the docker images now.** Don't download 1.5GB on hackathon wifi.

### 5.3 The bot + AI agent shell

- [ ] Create the Slack app, enable **Socket Mode**, grab `SLACK_BOT_TOKEN` / `SLACK_SIGNING_SECRET` / `SLACK_APP_TOKEN`, install to a workspace you control
- [ ] `slackbot/` Bolt skeleton with `adapters/base.js` + `adapters/rest.js` (bot logs into your own API with a seeded admin account and holds the cookie)
- [ ] `ai/agent.js` — generic ReAct loop with: alias map, enum normalizer, `extractFirstJsonObject`, retry/backoff, `MUTATING_TOOLS` confirmation gate, max-iteration cap
- [ ] `ai/tools.js` — leave empty; you fill it in 30 min once you know the PS entities
- [ ] `test-cli.js` — `node test-cli.js "list all X"` so you can iterate without Slack
- [ ] Decide your LLM: **Groq** (free tier, very fast, OpenAI-compatible) is the right hackathon default. Have a second key/provider as backup.

### 5.4 Generic building blocks worth pre-writing

- [ ] `utils/treeUtils.js` — generic `getTree/flatten/rollup/checkCycle` over `{id, parentId, qty}` (§3.7)
- [ ] `services/documentParser.js` — pdf/docx/image → text → LLM → validated JSON (§3.8)
- [ ] `components/ui/DiffTable.js` — old vs new column view; works for any entity
- [ ] `components/KanbanBoard.js` — generic columns-from-array + drag-drop + `onStageChange(id, stageId)` callback
- [ ] `components/Stepper.js` — multi-step form shell with validation per step
- [ ] `services/notify.js` — a websocket/SSE broadcaster + `<Toast/>` listener (real-time notifications are a cheap "wow")

### 5.5 Environment / demo-day insurance

- [ ] Everything runs offline except the LLM call — and the app degrades gracefully if the LLM is down (NICE #2)
- [ ] **`ollama pull llama3.1:8b` as the offline LLM fallback** — your agent already speaks the OpenAI-compatible protocol, so it's one `AI_BASE_URL` swap
- [ ] **Pre-warm an AI response cache** for your 5 scripted demo prompts
- [ ] **`/health` page** with DB / Odoo / AI status dots — proves the degradation story in 5 seconds
- [ ] `npm run seed` is **idempotent and fast** — you will run it live, mid-demo, more than once
- [ ] Demo accounts printed in the README *and* as quick-login buttons on the login page (huge time saver on stage)
- [ ] A `start-all` script (or 4 labelled terminal tabs) — never fumble startup in front of judges
- [ ] `npm install` done and every Docker image pulled **before** you're on venue wifi

---

## 6. Idea bank — differentiators, ranked

Pick 3–4. Not 10. Each is annotated with rough cost and where it lands with judges.

> **Gate first.** The five must-haves in §0.5 are not on this list because they aren't optional. Finish them, *then* pick from Tier S.

### Tier S — do these almost regardless of PS

| Idea | Cost | Why it scores |
|---|---|---|
| **Real-time push** (Socket.IO/SSE → live Kanban + notifications) | 2h | Directly answers MUST #1. Two windows side by side is the best 10 seconds of your demo. |
| **Live Odoo integration over XML-RPC** | 2h (if pre-built: 30m) | Literally on-theme for an *Odoo* hackathon. Nobody else will have it. Also the strongest possible answer to MUST #1. |
| **AI agent over your own API** (tool-calling, guarded mutations) | 3h | Reads as "we built a platform", not "we built a form" |
| **Immutable audit log + filterable viewer** | 2h | Enterprise credibility per hour spent is unbeatable |
| **Role matrix, actually enforced** (4 roles, server-side) | 2h | Judges *will* try to click something they shouldn't |
| **Second interface** (Slack / Telegram / CLI) | 3h | Category difference, not a feature |

### Tier A — strong, PS-dependent

| Idea | Cost | Fits when the PS has… |
|---|---|---|
| **Configurable workflow builder** (stages as data) | 3h | any approval/status pipeline |
| **Kanban + drag-drop** alongside a table | 2h | any entity with a status field |
| **Version history + visual diff** | 3h | any editable record that matters |
| **Document upload → LLM extraction → human preview** | 2.5h | any bulk data entry (invoices, resumes, listings, orders) |
| **CSV / PDF export on every report** | 1h | always. Judges love clicking export |
| **Global command palette** (⌘K → jump to anything, run actions) | 1.5h | always — makes the app feel finished |
| **Analytics dashboard** with real aggregates, not fake numbers | 2h | always |
| **Hierarchical/tree entity** with rollup + cycle protection | 3h | categories, org charts, sub-assemblies, threads |

### Tier B — cheap polish that punches above its weight

- **Dark mode** via `darkMode:'class'` + CSS vars — 45 min, and every judge toggles it
- **Empty states** with an illustration + a CTA instead of a blank table — 30 min
- **Optimistic UI** on the drag-drop board — feels instant
- **Quick-login role buttons** on the login page — saves 90 seconds of demo time
- **Seeded, realistic data** — real product names and plausible numbers, never `Test 1 / asdf`
- **Skeleton loaders** instead of spinners
- **Keyboard shortcuts** on the main list view (`j/k`, `/` to search)
- **A `/health` page** showing DB + ERP + AI status as green dots — takes 20 min, looks incredibly professional in a demo
- **Mermaid architecture diagram in the README** — free, and it's what judges screenshot

### Tier C — traps. Avoid.

- ❌ TypeScript-everything, monorepo tooling, Docker for your own services, CI pipelines — the winner skipped all of it
- ❌ Microservices you don't need. Their "ERP microservice" is just a docker-compose file + 2 python scripts
- ❌ Custom Odoo module development in Python — huge time sink, judges can't see it. Integrate *with* Odoo instead
- ❌ Unit tests as a goal. The winner shipped scenario scripts (Puppeteer flows) and openly admitted in the README they had no real coverage. Ship the feature
- ❌ Payments, email, SMS, OAuth providers — all rabbit holes with nothing to show
- ❌ Cloud-only services (Firebase, Supabase, hosted Mongo, Vercel-only features) — they violate MUST #1's spirit and NICE #2 outright
- ❌ ~~Skipping mobile responsiveness~~ — **struck out.** MUST #2 makes responsive UI a pass/fail gate. Budget 1.5h. See §0.5.

---

## 7. Adapting to whatever the PS turns out to be

Odoo hackathon Round-1 PSes are usually **general web platforms with user roles + an admin**, given with an Excalidraw/Figma mockup link — e.g. past ones: *Skill Swap Platform*, *StackIt (Q&A forum)*, *ReWear (clothing exchange)*. Final-round PSes skew ERP-flavoured (the winner's PLM/ECO brief).

**Mandatory-deliverables checklist** the Odoo templates keep asking for — assign an owner for each on hour 1:

- Team name + member details
- Problem statement restated in your words
- Solution overview
- Frameworks / technologies used
- Feasibility and implementation plan
- **UI/UX mockups** (if a mockup link is given in the PS, **follow it closely** — judges compare)
- Business scope and use case
- System design / architecture diagram
- Coding approach
- Working prototype + presentation

### 7.1 The mapping drill (do this in the first 30 minutes)

Whatever the PS, force it into the winner's shape:

| Winner's concept | Your PS equivalent — fill in |
|---|---|
| Product (the thing) | ? |
| BoM (the composition / detail rows) | ? |
| ECO (the *proposal to change* the thing) | ? |
| Stages (New → Review → Done) | ? |
| Roles (admin/engineer/approver/ops) | ? |
| Odoo inventory (external truth) | ? |
| Audit log | same |

**If the PS has no approval flow, invent one.** Almost every domain has a legitimate "someone must approve this" moment — a listing goes live, a swap request is accepted, an answer is marked accepted, a booking is confirmed, a refund is issued. That single move unlocks Levers 4, 5, and 6 at once.

**If the PS has no obvious Odoo hook, use one of these:**

- Anything with items/listings/products → `product.product` (name, price, qty_available)
- Anything with people/vendors/customers → `res.partner`
- Anything with orders/bookings → `sale.order`
- Anything with tasks/projects → `project.task`
- Anything with money → `account.move`

You are reading/writing Odoo over XML-RPC; that's a legitimate ERP integration regardless of domain.

---

## 8. Execution plan (assume a 24–30h final round)

| Window | Focus | Definition of done |
|---|---|---|
| **H0–H1** | Read PS twice. Do the §7.1 mapping drill. Draw the schema on paper. **Split ownership: BE / FE / Integrations+AI / Docs+Demo.** Create the repo, push the pre-built starter | Schema agreed, 4 lanes assigned, `main` has the skeleton running |
| **H1–H3** | Prisma schema + migration + seed with *realistic* data. Auth working end-to-end (login → cookie → `/me`) | You can log in as all 4 roles |
| **H3–H8** | Core CRUD: list, detail, create, edit, archive for the 2–3 main entities. **Zod schema + `validate()` on every route as you write it** — never "add validation later". Role guards likewise | The PS's baseline requirements are demoable and reject bad input with per-field messages |
| **H8–H12** | The workflow engine: stages table, transitions, approvals, `applyChange()` in a transaction, audit writes. **Wire Socket.IO broadcasts into each mutation** | An item can travel the full pipeline, the audit log proves it, and a second browser window updates live |
| **H12–H16** | Differentiators #1 and #2 (usually Odoo integration + Kanban/diff) | Both demoable end to end |
| **H16–H20** | AI agent: fill `ai/tools.js`, iterate with `test-cli.js`, then wire to Slack. Mutation gate on. **Cache the 5 demo prompts** | 5 scripted prompts work reliably, twice in a row — and once with wifi off |
| **H20–H23** | **Freeze features.** Full **375px / 768px / 1440px responsive pass**, empty states, loading states, dark mode, toasts, seed data realism, kill every console error. Run `git shortlog -sn` and confirm balanced authorship | No dead links, no crashes, no horizontal scroll at 375px, no lopsided commit graph |
| **H23–H25** | README (Mermaid diagram + role matrix + quickstart + env + API table), architecture diagram, mockup/deliverable docs | A judge could run it from the README alone |
| **H25–end** | **Rehearse the demo 3 times, timed.** Record a backup screen capture. Reseed and rehearse again | Demo runs in time, twice, with no fumbles |

**Hard rules**

- Feature freeze at ~80% of the clock. Non-negotiable.
- **§0.5 must-haves are done before any Tier-S differentiator starts.** Validation and responsiveness are not "polish" — they're gates. Fold them into the H1–H12 work, don't defer them to H20.
- **Every member commits from their own account, every 20–30 min, on their own branch, merged by PR.** Check `git shortlog -sn` at H12 and again at H20 — if it's lopsided, rebalance the work immediately. This is MUST #5 and it cannot be fixed retroactively.
- Commit messages follow the winner's style: `Add realtime notifications service via websockets`, not `update`.
- Nobody works on something that can't be shown on screen.
- One person owns "the demo works" from H20 onward and writes no new features.
- At H20, one person does a **375px pass** over every single page before anything else ships.

---

## 9. The demo — 5 minutes, scripted

Judges score on **problem understanding, innovation, technical implementation, UI/UX, and team collaboration**. Structure the demo to hit all five explicitly.

```
0:00  "Here's the problem in one sentence, and the one constraint we built everything around."
0:30  Login as ENGINEER → create the thing.
      Deliberately submit a negative quantity + a past date → inline field errors.
      "Same Zod schemas run server-side — here's curl getting a 422."  [validation ✓]
1:10  Fix it, submit for review.                                   [core requirement ✓]
1:30  Switch to APPROVER (quick-login button) → the item is already waiting,
      pushed live over websocket — no refresh. Second window on screen.
      Try one forbidden action → 403 toast.               [real-time ✓ roles ✓]
2:05  Approve → new version created, old one archived.
      "Atomic — one transaction, audit entries roll with it."
2:30  Open the AUDIT LOG → filter → expand the JSON old/new diff.  [governance ✓]
2:55  Open ADMIN → add a new stage to the workflow, live.
      "The pipeline is data, not code."                            [innovation ✓]
3:20  Show the ODOO tab at localhost:8069 → same stock number in our app.
      "Live XML-RPC to a real Odoo 17 instance running locally — and approval
       is blocked when inventory is insufficient. No static JSON anywhere."
                                                                   [integration ✓]
3:55  Shrink the window to phone width — everything reflows.       [responsive ✓]
4:05  Slack: /ai "approve the pending change for X" → agent asks to confirm →
      confirm → the web app moves it, live.
      "Writes are gated behind a confirmation set — and it can run against a
       local model with no internet at all."                 [AI ✓ offline ✓]
4:40  One slide: architecture diagram + the contributors graph + what's next.
                                                        [feasibility ✓ team ✓]
```

**Put the GitHub contributors graph on the final slide.** MUST #5 says team collaboration is graded — show it rather than claim it.

**Demo-day insurance**

- Pre-record the whole flow as a video. Wifi dies. It always dies.
- Reseed right before you go up.
- Have the Odoo tab and the Slack channel **already open** in pinned tabs.
- If the LLM is flaky, have a canned response path — never let a 500 be the last thing a judge sees.
- Assign a "driver" and a "narrator". The driver never talks; the narrator never touches the keyboard.

---

## 10. Mistakes in the winner's repo — do better, cheaply

| Their gap | Your 10-minute fix |
|---|---|
| `slackbot/.env` committed with real tokens | `.gitignore` `.env` everywhere, ship `.env.example` only |
| `.DS_Store` committed | add to `.gitignore` |
| Stray debug files at root: `check_ecos.js`, `fix_stage.js`, `debug_s06_step2.js`, `test_s06*.js` | keep a `scripts/` or `tools/` dir, or delete before final push |
| Duplicate `lib/prisma.js` at both `backend/lib/` and `backend/src/lib/`; duplicated `.js`/`.ts` copies of `erpService` and `stageService` | pick one location, one language, delete the rest |
| Two migrations with the same name (`add_multilevel_bom`) | squash before final push |
| No root-level `npm run dev` for all services | add `concurrently` at the root — judges will try it |
| README admits "no unified CI test command" | either add 3 real tests or don't mention it |
| Hardcoded stage strings (`'In Review'`) scattered through the AI layer despite stages being configurable | put stage constants in `shared/constants.js` |

Each of these is a "sloppiness" tell. Fixing them all costs under an hour and separates you from the team you're copying.

---

## 11. Pre-hackathon checklist (tick these before the PS drops)

**Environment**

- [ ] Node 18+, npm 9+, Docker Desktop, Python 3.10+, PostgreSQL 15 all installed and verified
- [ ] `docker pull odoo:17` and `docker pull postgres:15` — **done in advance**
- [ ] Odoo container boots, DB created, seed script runs, `verify_api.py` prints products
- [ ] Slack app created, Socket Mode on, tokens in a password manager
- [ ] Groq (or chosen LLM) API key working, plus a backup key
- [ ] `ollama pull llama3.1:8b` for the offline fallback (NICE #2)
- [ ] GitHub repo created, everyone has push access, `.gitignore` correct

**Code**

- [ ] Starter skeleton (§5.1) runs: login as 4 roles, one seeded CRUD entity, audit log writing
- [ ] Zod `validate()` middleware wired into at least one route, returning 422 with per-field errors
- [ ] Socket.IO round-trip works: mutation in one tab updates a second tab
- [ ] The whole skeleton passes a 375px pass — sidebar drawer, no horizontal scroll
- [ ] `erpService.js` returns live Odoo data through your own API
- [ ] `test-cli.js` gets an answer from the ReAct loop with 2 dummy tools
- [ ] Generic `treeUtils`, `DiffTable`, `KanbanBoard`, `Stepper`, `exportCsv` all exist
- [ ] Grep the frontend for hardcoded arrays — there should be zero (MUST #1)

**Git (MUST #5 — verify, don't assume)**

- [ ] Every member has run `git config user.name` / `user.email` on their own machine, with the email matching their GitHub account
- [ ] Every member has pushed at least one real commit to the starter repo
- [ ] `git shortlog -sn` shows all members as distinct authors
- [ ] Branch naming + conventional commit message format agreed in writing
- [ ] `.gitignore` covers `.env`, `node_modules/`, `.next/`, `.DS_Store`, `__pycache__/` — committed **first**

**Team**

- [ ] Lanes agreed: **BE core / FE core / Integrations+AI / Docs+Demo** (rotate into polish at H20)
- [ ] Everyone has read this file — especially §0.5 — and knows the §9 demo shape
- [ ] Someone owns the README from hour one and updates it as features land
- [ ] Someone owns the §0.5 must-have gates and signs each one off
- [ ] Agreed feature-freeze time, written on the whiteboard

---

## Sources

- Teardown target: [AryanVadhadiya/Odoo_Team_31](https://github.com/AryanVadhadiya/Odoo_Team_31)
- [Odoo Hackathon 2026](https://hackathon.odoo.com/)
- [Odoo Hackathon problem statement template (PDF)](https://odoocdn.com/web/content/64689799?unique=69f69ffa32840d8e6c0ea4c8db08d3b9348389ce&download=true&access_token=53166137-7e0d-4acb-9622-66a8e0d03f8d)
- [Odoo Hackathon 2025 — Final Round Problem Statements](https://www.scribd.com/document/902942164/Odoo-Hackathon-2025-Final-Round-Problem-Statements)
- [Odoo Hackathon 2026 — Internshala](https://internshala.com/competitions/odoo-hackathon-2026/)
- [Odoo X Indus Hackathon '26](https://indusuni.ac.in/hackathon2k26/)

---

*Next step: send me the problem statement and I'll map it onto §7.1, lock the schema, and pick the 3 differentiators.*
