# ChapterLens — Implementation Plan

> **Chapter Readability Checker**: paste a book chapter → readability score + five hardest sentences highlighted → optional AI-powered rewrite suggestions.

---

## 0  Working Rules

> **"External inputs come from me, never from you."**

An **external input** is anything from outside the codebase or that only I can know or obtain: API keys and secrets (`GROQ_API_KEY`, `TURNSTILE_SECRET`, `CLOUDFLARE_API_TOKEN`), account/resource IDs (KV namespace ID, Cloudflare account ID), public keys and tokens (Turnstile site key, analytics token), domain names, repo owner/name, the Groq model name, quota numbers from dashboards (global daily cap, per-IP limit), and which source texts to use for evals.

1. **NEVER** invent, guess, auto-fill, hardcode, or use dummy/placeholder values for an external input in real config, code, or tests. No defaults for secrets. Model names, IDs, and quota numbers from your memory are not allowed either. **Ask me.**
2. At the **START** of each phase, before writing code, list every external input that phase needs in **ONE batched message**: what it is, where I get it, which file/variable it goes into, and whether it's a secret. Then **wait for my reply**.
3. For **secrets**, never ask me to paste them into chat. Give me the exact terminal command or file line — I enter it myself and reply "done". For **non-secrets** (IDs, site key, model name, caps) I may paste in chat and you place them correctly.
4. Only `.example` files (`.dev.vars.example`, `.env.example`) may contain empty or obviously fake values like `<paste-here>`. You may create those. You **never** create or fill the real `.dev.vars` or `.env.local`.
5. Code must **fail fast** with a clear error if a required variable is missing (a `requireEnv` helper). Never fall back silently.
6. Tests use **mocks only** and never need real keys or network access to Groq/Turnstile.
7. If unsure whether something is an external input, **ask me**.

---

## 1  Final Folder Structure

```text
chapterlens/
├── pnpm-workspace.yaml
├── package.json                  # root: scripts, packageManager field
├── .gitignore
├── .dev.vars.example             # GROQ_API_KEY, TURNSTILE_SECRET, IP_HASH_SALT (Worker secrets)
├── .env.example                  # VITE_TURNSTILE_SITE_KEY (build-time)
├── packages/
│   └── analyzer/                 # pure JS, no DOM deps
│       ├── package.json          # name: @chapterlens/analyzer
│       ├── vitest.config.js
│       └── src/
│           ├── index.js          # public barrel
│           ├── normalize.js      # smart-quote / nbsp cleanup
│           ├── segment.js        # sentence + paragraph splitting
│           ├── syllables.js      # thin wrapper around "syllable" pkg
│           ├── metrics.js        # Flesch RE, FK Grade, plain label
│           ├── difficulty.js     # per-sentence scoring + ranking
│           └── schemas.js        # Zod schemas for analyzer output
├── apps/
│   └── app/
│       ├── package.json          # deps: react, vite, tailwind, etc.
│       ├── vite.config.js
│       ├── wrangler.jsonc        # single Worker, KV binding, secrets
│       ├── src/                  # React UI (client)
│       │   ├── main.jsx
│       │   ├── App.jsx
│       │   ├── components/
│       │   │   ├── TextInput.jsx
│       │   │   ├── ScoreCard.jsx
│       │   │   ├── HighlightedText.jsx
│       │   │   ├── SentenceList.jsx
│       │   │   ├── AiReviewPanel.jsx
│       │   │   └── TurnstileWidget.jsx
│       │   ├── hooks/
│       │   │   ├── useAnalyzer.js      # Web Worker bridge
│       │   │   └── useAiReview.js      # TanStack Query wrapper
│       │   ├── worker/
│       │   │   └── analyzer.worker.js  # Web Worker (browser)
│       │   └── lib/
│       │       └── api.js              # fetch helpers
│       └── worker/               # Hono API (Cloudflare Worker)
│           ├── index.js          # Hono app, mounts /api/*
│           ├── routes/
│           │   └── review.js     # POST /api/review
│           ├── middleware/
│           │   ├── turnstile.js
│           │   └── rateLimit.js
│           └── lib/
│               ├── groq.js       # Groq call + Zod parse
│               ├── cache.js      # KV read/write helpers
│               └── schemas.js    # Zod: request, response, LLM output
├── evals/
│   ├── passages/                 # 10 public-domain .txt files
│   ├── ATTRIBUTION.md            # source + licence per passage
│   ├── expected/                 # golden JSON per passage (our analyzer + independent refs)
│   ├── eval.test.js              # Vitest: regression checks
│   └── eval-ai.test.js           # opt-in: real Groq output checks (NOT in CI)
└── docs/
    └── PLAN.md                   # ← you are here
```

### Layout Justification vs. Proposal

Adopted as-is with two additions: (a) `src/worker/analyzer.worker.js` — a browser-side Web Worker that imports `@chapterlens/analyzer` so the main thread never blocks on syllable counting; (b) `apps/app/worker/` (Cloudflare Worker entry) kept separate from `src/` to make Vite's environment split explicit (the `@cloudflare/vite-plugin` expects the Worker entry in a distinct directory).

---

## 2  Data Shapes

### Analyzer Result (`AnalysisResult`)

```js
/** @typedef {Object} SentenceResult
 *  @property {string} id           – positional: "s0", "s1", … (order in document)
 *  @property {number} start        – char offset in original text
 *  @property {number} end          – char offset, exclusive
 *  @property {string} text         – raw sentence
 *  @property {{ words: number, avgSyllables: number, longWords: number, commas: number }} metrics
 *  @property {number} score        – composite difficulty 0-100
 *  @property {boolean} tooLongForAi – true if text.length > 2000
 */

/** @typedef {Object} SentenceScore – returned by scoreSentence(text)
 *  @property {{ words: number, avgSyllables: number, longWords: number, commas: number }} metrics
 *  @property {number} score
 *  @property {number} fkGrade      – per-sentence FK grade
 */

/** @typedef {Object} AnalysisResult
 *  @property {{ fleschRE: number, fkGrade: number, label: string }} readability
 *  @property {SentenceResult[]} hardest – top 5, sorted by score desc
 *  @property {{ sentences: number, words: number, paragraphs: number }} stats
 */
```

`scoreSentence(text)` — lightweight export (syllables + metrics only, no paragraph/document segmentation). Used by the Cloudflare Worker to independently verify rewrite quality. The Worker computes `gradeBefore` itself and **never trusts client-supplied grades**.

### API Request — `POST /api/review`

```json
{
  "sentences": [
    { "id": "s12", "text": "…", "context": "…" }
  ],
  "turnstileToken": "…"
}
```

- Max 5 entries; IDs are positional (`s0`–`sN`). `context` is ≤ 1 neighbouring sentence on each side (≤ 3 sentences total per entry).
- Validated by Zod on the Worker; rejects > 5, strings > 2 000 chars, or sentences with `tooLongForAi`.
- Cache key: SHA-256 of sorted input sentences AND their context strings (via `crypto.subtle.digest`, async).

### API Response — `POST /api/review`

```json
{
  "summary": "3 of 5 sentences improved by at least one grade level.",
  "sentences": [
    {
      "id": "s12",
      "original": "…",
      "whyHard": "High clause density and 4 polysyllabic words.",
      "rewrite": "…",
      "gradeBefore": 14.2,
      "gradeAfter": 9.8,
      "improved": true
    }
  ]
}
```

`gradeBefore` / `gradeAfter` are **always computed by `scoreSentence()` on the Worker**, never taken from the LLM or from the client request. A candidate counts as improved only if `gradeBefore - gradeAfter >= MIN_GRADE_IMPROVEMENT` (named constant `1.0` in code). If a sentence has no candidate meeting this threshold after the one retry, return the original text with `improved: false`, and the UI displays "no safe rewrite found" instead of showing a worse rewrite.

---

## 3  API Endpoints

| Method | Path            | Auth              | Description |
|--------|-----------------|-------------------|-------------|
| POST   | `/api/review`   | Turnstile + IP rate limit | AI rewrite for ≤ 5 hard sentences |
| GET    | `/api/health`   | None              | `{ ok: true, ts }` — smoke test |
| GET    | `/api/*`        | —                 | JSON `{ error: "Not found" }` 404 (catch-all for unknown API paths) |
| GET    | `/*`            | None              | Static assets (`run_worker_first: ["/api/*"]` in wrangler.jsonc) |

No other endpoints. All readability scoring happens client-side. No CORS needed (same origin).

**Request processing order** (POST `/api/review`): Zod validate → Turnstile verify → cache lookup (hit = return, no quota consumed) → rate-limit check → Groq call → cache write.

Blocked or failed requests **do not** increment rate-limit counters.

**Observability rule:** `wrangler.jsonc` must not enable request-body logging. No middleware may log chapter text or request bodies.

---

## 4  Per-Phase Checklists

### P1 — Analyzer Package + Tests

**External inputs needed:** none. This phase is pure logic with no secrets, IDs, or external config.

| # | Task | Done when |
|---|------|-----------|
| [x] 1 | Scaffold `packages/analyzer` with `package.json`, Vitest config | `pnpm --filter @chapterlens/analyzer test` runs (0 tests) |
| [x] 2 | `normalize.js` — smart quotes, nbsp, normalise line endings | Unit tests: 5 edge cases pass |
| [x] 3 | `segment.js` — `Intl.Segmenter` + abbreviation / ellipsis / dialogue patches; sentences get positional IDs (`s0`, `s1`, …) | Tests: "Mr. Smith said…" stays 1 sentence; IDs sequential; 10+ cases |
| [x] 4 | `syllables.js` — wrap `syllable` pkg, export `countSyllables(word)` | Spot-check 20 words against known counts |
| [x] 5 | `metrics.js` — Flesch RE, FK Grade, `readabilityLabel()` | Compare 3 known passages against published scores (±3 tolerance) |
| [x] 6 | `difficulty.js` — weighted composite, ignore < 8 words, return top 5 with offsets; flag `tooLongForAi` on sentences > 2 000 chars | Full pipeline test on a ~300-word passage |
| [x] 7 | `scoreSentence(text)` — lightweight single-sentence scorer (syllables + metrics + FK grade, no segmentation). Will be used by the CF Worker. | Unit test: matches per-sentence scores from full `analyze()` |
| [x] 8 | `schemas.js` — Zod schemas for `AnalysisResult`, `SentenceResult`, `SentenceScore` | Schema validates output of pipeline test |
| [x] 9 | Barrel `index.js` exporting `analyze(text)` and `scoreSentence(text)` | Import from outside the package resolves |

**Test count target:** ~28 unit tests.

---

### P2 — React UI (Local Scoring, No AI)

**External inputs needed:** none (Turnstile site key is P4; no Worker secrets needed for local-only scoring).

| # | Task | Done when |
|---|------|-----------|
| [x] 1 | Scaffold `apps/app`: Vite + React + Tailwind v4 + `@cloudflare/vite-plugin` | `pnpm dev` serves a blank page |
| [x] 2 | `TextInput` — textarea + Analyze button, char count, empty guard, **max input guard (200 000 chars)** with friendly "text too long" message | Renders, button disabled when empty or over limit |
| [x] 3 | `analyzer.worker.js` — Web Worker importing `@chapterlens/analyzer` | `useAnalyzer` hook returns result asynchronously |
| [x] 4 | `ScoreCard` — Flesch RE dial/gauge, FK Grade, plain label, word/sentence counts | Displays after analysis |
| [x] 5 | `HighlightedText` — re-renders pasted text with `<mark>` spans for top 5 (numbered badge + underline); built from text nodes, **no `dangerouslySetInnerHTML`**. Sentences with `tooLongForAi` are highlighted but show a "too long for AI review" badge instead of being sent to the API. | 5 marks visible, each scrollable via ID; long sentences display badge |
| [x] 6 | `SentenceList` — ranked cards; click scrolls to corresponding `<mark>` | Click → smooth scroll works |
| [x] 7 | Dark mode toggle — Tailwind v4 requires `@custom-variant dark (&.dark)` in CSS; verify against Tailwind v4 docs. Respect `prefers-color-scheme` as default. | Toggle switches theme; respects OS preference on first load |
| [x] 8 | Responsive layout (mobile ≥ 375 px) | No horizontal scroll on 375 px viewport |
| [x] 9 | Loading / empty / error states | Each state visually distinct |
| [x] 10 | Component tests with React Testing Library + Vitest | ≥ 8 component tests pass |

**Browser check:** open `localhost:5173`, paste a chapter, verify highlights + score card.

---

### P3 — Hono `/api/review` (Groq, Verify Loop)

**External inputs I will ask for at phase start:**
- `GROQ_MODEL` (non-secret wrangler `"vars"` — you choose from console.groq.com/docs/models, must support JSON mode)

| # | Task | Done when |
|---|------|-----------|
| [x] 1 | Scaffold `apps/app/worker/` — Hono app, `GET /api/health`, catch-all `/api/*` → JSON 404 | `pnpm dev` → `curl /api/health` → `{ ok: true }`; `curl /api/bogus` → JSON 404 |
| [x] 2 | `requireEnv(name)` helper — fails fast with descriptive error if missing | Test: throws on missing var |
| [x] 3 | `schemas.js` — Zod schemas for request body, LLM JSON output, API response (including `improved: z.boolean()`). LLM output Zod enforces: returned IDs ⊆ input IDs, exactly 2 candidates per sentence, no empty/identical rewrites, rewrite length 0.4x–1.5x of original | Schemas importable; edge-case validation tests pass |
| [x] 4 | `groq.js` — single Groq call, JSON mode, `max_tokens` cap, system prompt with delimiters + injection guard, returns 2 candidates per sentence. Model name from `GROQ_MODEL` env var. | Unit test with mocked `groq-sdk` |
| [x] 5 | Verify loop in `review.js`: Define improved as `gradeBefore - candidateGrade >= MIN_GRADE_IMPROVEMENT` (named constant `1.0` in code). Worker computes `gradeBefore` via `scoreSentence()`, scores every candidate, and picks the lowest-grade candidate per sentence. If any sentence has no candidate improved by ≥ 1.0 grade → ONE batched retry for only those sentences. If still unimproved after retry, return original sentence with `improved: false` (UI shows "no safe rewrite found"). | Test: mock Groq returns mixed quality → correct subset retried exactly once; returns original with `improved: false` if retry fails threshold |
| [x] 6 | **CPU benchmark**: time `scoreSentence()` for 10 sentences in a test; document result. If > 5 ms total, simplify scorer. | Benchmark logged; passes under 5 ms |
| [x] 7 | **LLM hardening and verify tests** (all mocked): prompt-injection text ("ignore previous instructions") doesn't alter output schema; empty candidates rejected; identical-to-original rejected; out-of-range length rejected; unknown IDs rejected; verify loop selects lowest-grade candidate; unimproved candidates (< 1.0 grade drop) trigger retry and return original with `improved: false` on failure | ≥ 6 hardening and verify tests pass |
| [x] 8 | End-to-end route test (mocked Groq, mocked KV) | POST `/api/review` → 200 with valid response shape |
| [x] 9 | **No-logging check**: verify no middleware or route logs request bodies or chapter text | Code review checklist item documented |

**Test count target:** ~20 tests.

---

### P4 — Turnstile, KV Rate Limits, Cache, Capacity Fallback

**External inputs I will ask for at phase start:**
- `TURNSTILE_SECRET` (secret → `wrangler secret put` / `.dev.vars`)
- `IP_HASH_SALT` (secret → `wrangler secret put` / `.dev.vars`; I will ask you to generate via `openssl rand -hex 32`, never generate myself)
- `VITE_TURNSTILE_SITE_KEY` (non-secret → `.env.local` for dev, CI build-time var for deploy)
- `PER_IP_DAILY_LIMIT` (non-secret wrangler `"vars"`, e.g. `3`)
- `GLOBAL_DAILY_CAP` (non-secret wrangler `"vars"`, e.g. `100`)
- Confirm: use Cloudflare's dummy Turnstile test keys for **local dev only**? (I will ask, not assume)
- KV namespace ID (from `wrangler kv namespace create REVIEW_CACHE` → `wrangler.jsonc` `"kv_namespaces"`)

| # | Task | Done when |
|---|------|-----------|
| [x] 1 | `TurnstileWidget.jsx` — renders Cloudflare widget, exposes token; **resets widget after every submit and failure** | Widget renders; resets on submit/error |
| [x] 2 | `.env.example` with `VITE_TURNSTILE_SITE_KEY=<paste-here>` | File committed; `.env.local` in `.gitignore` |
| [x] 3 | `turnstile.js` middleware — verifies token via `siteverify` endpoint | Test (mocked fetch): invalid token → 403 |
| [x] 4 | `rateLimit.js` middleware — per-IP limit (`PER_IP_DAILY_LIMIT` var) + global cap (`GLOBAL_DAILY_CAP` var) via KV counters. Store **HMAC-SHA-256 hashed IPs** (using secret `IP_HASH_SALT` from `CF-Connecting-IP`), never raw IPs or plain SHA-256. All KV entries get an **expiration TTL** (24 h for counters). Blocked/failed requests do **not** increment counters. | Tests: (limit+1)th request from same IP → 429; cap → 429; failed request doesn't increment |
| [x] 5 | `cache.js` — SHA-256 of sorted input sentences AND their context strings (async `crypto.subtle`) → KV lookup; write on miss with TTL (7 days). Budget: ~3 KV writes per review (cache + 2 counters). Cache hit returns without consuming rate-limit quota. | Test: second identical request served from cache without Groq call; context change causes cache miss; no counter increment |
| [x] 6 | Capacity fallback — on 429 / Groq error / cap reached, return `{ limited: true, message }` | UI shows friendly banner, local scoring still works |
| [x] 7 | Wire `useAiReview` hook + `AiReviewPanel` to `/api/review`. Sentences with `improved: false` show a "no safe rewrite found" badge instead of showing a worse rewrite. | Full flow works in dev; unimproved sentences render safe-fallback indicator |
| [x] 8 | Privacy notice before AI Review button | Notice visible, button disabled until acknowledged |

**Test count target:** ~14 tests.

---

### P5 — Evals

**External inputs I will ask for at phase start:**
- Confirm the list of 10 public-domain source texts before downloading.
- Independent reference Flesch/FK values: I will ask you how you want to provide them (e.g. you run Python `textstat` and send me numbers, or you point me to published values).

| # | Task | Done when |
|---|------|-----------|
| [x] 1 | Propose 10 public-domain passages (~200-600 words each); **ask me to confirm** the source list before downloading | Confirmation received |
| [x] 2 | Download passages into `evals/passages/`; create `evals/ATTRIBUTION.md` with source + licence per passage | Files + attribution committed |
| [x] 3 | Generate golden JSON via analyzer **and** include independent reference values (from you) in `evals/expected/*.json` | Golden files committed with both our scores and reference scores |
| [x] 4 | `eval.test.js` — our Flesch RE within ±3 of reference, FK Grade within ±1, top-5 IDs match ≥ 3/5. Catches regressions. | All 10 passages pass |
| [x] 5 | Add `pnpm eval` script to root `package.json` | Script runs in CI |
| [x] 6 | `eval-ai.test.js` — **opt-in** (`pnpm eval:ai`), **NOT in CI**. I run it with my own key. Checks: LLM JSON validity against Zod schema, grade-drop rate ≥ 60 %, rewrite length ratio 0.4x–1.5x. | Script exists, skipped in CI, documented in README |

---

### P6 — Deploy Config, CI, README

**External inputs I will ask for at phase start:**
- `CLOUDFLARE_API_TOKEN` (secret → GitHub Actions secret)
- `CLOUDFLARE_ACCOUNT_ID` (non-secret → GitHub Actions var or wrangler.jsonc)
- `VITE_TURNSTILE_SITE_KEY` (non-secret → GitHub Actions build-time var)
- KV namespace ID (if not already set in P4)
- Custom domain (if any, otherwise `*.workers.dev`)
- Optional: Cloudflare Web Analytics token

| # | Task | Done when |
|---|------|-----------|
| [x] 1 | `wrangler.jsonc` — KV namespace binding (ID from me), `assets.not_found_handling: "single-page-application"`, `run_worker_first: ["/api/*"]`, compatibility date. Verify no request-body logging or observability settings that capture chapter text. | `pnpm --filter app build && wrangler deploy --dry-run` succeeds |
| [x] 2 | `.dev.vars.example` with `GROQ_API_KEY=<paste-here>`, `TURNSTILE_SECRET=<paste-here>`, `IP_HASH_SALT=<paste-here>` | File committed |
| [x] 3 | `.env.example` with `VITE_TURNSTILE_SITE_KEY=<paste-here>` | File committed |
| [x] 4 | GitHub Actions workflow: install pnpm, `pnpm install`, `pnpm test`, `pnpm eval`, build with `VITE_TURNSTILE_SITE_KEY` from GH vars, `wrangler deploy` (on `main` push). Does **not** run `pnpm eval:ai`. | Workflow YAML committed |
| [x] 5 | `README.md` — project summary, local dev instructions, architecture diagram, env var table, note on `pnpm eval:ai` | README exists at root |

**Browser check:** deploy to `*.workers.dev`, paste text, run AI Review, verify end-to-end.

---

## 5  Risks and Open Questions

| # | Risk / Question | Mitigation |
|---|-----------------|------------|
| 1 | **`Intl.Segmenter` in CF Workers** — The Worker **does** run `scoreSentence()` (no segmentation) but never `segment.js`. Full segmentation happens only in the browser. | `scoreSentence()` uses only syllable counting + arithmetic — no `Intl.Segmenter`. Tested in P3. |
| 2 | **Groq free-tier model deprecation** — model names rotate. | Model name is a non-secret wrangler var `GROQ_MODEL` supplied by you. No hardcoded default. |
| 3 | **`syllable` accuracy ~85-90 %** — affects FK Grade. | Acceptable for a free tool. Document the margin in the UI ("scores are approximate"). |
| 4 | **Workers KV eventual consistency** — rate-limit counters could under-count in a burst. | Acceptable: worst case is a few extra Groq calls, still within daily budget. Counters use TTL, not manual cleanup. |
| 5 | **Workers free plan CPU limit (10 ms)** — `scoreSentence()` for ≤ 10 sentences + 2 retry sentences in the Worker. | Benchmark in P3 (task #6). `scoreSentence()` is simple arithmetic on short strings; target < 5 ms total. If exceeded, simplify to word-count-only scorer. |
| 6 | **Tailwind CSS v4** — dark-mode toggle requires `@custom-variant dark (&.dark)` in CSS (not the v3 `darkMode: 'class'` config). | Verify against Tailwind v4 docs in P2. Fall back to v3 + PostCSS if issues. |
| 7 | **KV write budget** — free tier ~1 000 writes/day; each review ≈ 3 writes (cache + 2 counters). | Budget allows ~330 reviews/day, well above Groq's free RPD. Counters + cache entries have TTL. |

---

## 6  Needs From Me

| # | Item | Secret? | Where I get it | Goes into | Needed in phase |
|---|------|---------|----------------|-----------|----------------|
| 1 | `GROQ_API_KEY` | **Yes** | console.groq.com → API Keys | `.dev.vars` (local), `wrangler secret put` (prod) | P3 |
| 2 | `GROQ_MODEL` | No | console.groq.com/docs/models (must support JSON mode) | `wrangler.jsonc` `"vars"` | P3 |
| 3 | `TURNSTILE_SECRET` | **Yes** | CF Dashboard → Turnstile → your widget | `.dev.vars` (local), `wrangler secret put` (prod) | P4 |
| 4 | `IP_HASH_SALT` | **Yes** | Run `openssl rand -hex 32` yourself (per rules, I never generate) | `.dev.vars` (local), `wrangler secret put` (prod) | P4 |
| 5 | `VITE_TURNSTILE_SITE_KEY` | No | CF Dashboard → Turnstile → your widget | `.env.local` (local), GH Actions build-time var (CI) | P4 |
| 6 | `PER_IP_DAILY_LIMIT` | No | Your decision (e.g. `3`) | `wrangler.jsonc` `"vars"` | P4 |
| 7 | `GLOBAL_DAILY_CAP` | No | Your decision (e.g. `100`) | `wrangler.jsonc` `"vars"` | P4 |
| 8 | Confirm: use CF dummy Turnstile test keys for local dev? | — | I will ask, not assume | `.dev.vars` / `.env.local` | P4 |
| 9 | KV namespace ID | No | `wrangler kv namespace create REVIEW_CACHE` output | `wrangler.jsonc` `"kv_namespaces"` | P4 |
| 10 | Eval passage source list confirmation | — | I propose, you confirm | `evals/passages/` | P5 |
| 11 | Independent reference Flesch/FK values | — | You choose method (Python textstat, published values, etc.) | `evals/expected/*.json` | P5 |
| 12 | `CLOUDFLARE_API_TOKEN` | **Yes** | CF Dashboard → API Tokens (Workers deploy perms) | GitHub Actions secret | P6 |
| 13 | `CLOUDFLARE_ACCOUNT_ID` | No | CF Dashboard → Overview sidebar | GH Actions var or `wrangler.jsonc` | P6 |
| 14 | Custom domain (if any) | No | Your choice; default `*.workers.dev` | `wrangler.jsonc` `"routes"` | P6 |
| 15 | Cloudflare Web Analytics token (optional) | No | CF Dashboard → Analytics | `index.html` script tag | P6 |
