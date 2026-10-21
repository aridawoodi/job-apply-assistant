Playwright scripts used to test this build on a Linux box (not needed to use the extension).
Setup: `npm i playwright && npx playwright install chromium`, then run from the folder that contains these files:
- `node test-mocks.js`: content scripts against mock Greenhouse/Lever/Ashby pages (`mocks/`), mocked AI, plus an Ollama-offline run.
- `node test-live.js`: the same against live Greenhouse/Lever/Ashby postings (fills only, never submits).
- `node mock-ollama.js` (env `ALLOW_EXT=0|1`), then `node e2e.js [url]`: loads the real unpacked extension in Chromium, imports the profile through Options, fills a live page, checks the tracker + CSV.
- `e2e-embed.js` (embedded Greenhouse iframe) and `e2e-msg.js` (popup messaging + generic injection) expect `python3 -m http.server 8765` in `mocks/`.
Paths inside assume `/workspace/job-apply-extension`; edit `EXT` if needed.
- `node e2e-submit.js`: submission tracking with the loaded extension. All Greenhouse/Lever/Ashby traffic is intercepted by Playwright routes and served from `submit-mocks/` (submit -> confirmation, submit -> server 422 -> fix -> resubmit, native POST -> /thanks and /confirmation, browser-blocked required fields, v0.1 tracker migration, badge, toast, CSV). Nothing reaches the real sites.

## v0.2.0 AI + learning tests
- `mock-ollama2.js`: a slow, "thinking" mock Ollama on :11434. It prints `<think>` blocks and has a
  configurable warm-up/chat delay, per-batch delays and think-rejection. Control it via
  `/tmp/mock-ollama-ctl.json`; requests are logged to `/tmp/mock-ollama-log.jsonl`.
- `e2e-ai.js` (run with `mock-ollama2.js` running) covers warm-up, `think:false`, progressive batches,
  short-first/essays-last ordering, per-batch timeouts, Retry, the qwen2.5:3b advice, the think fallback,
  answer learning (fuzzy de-dupe, company templates, pet question never stored, capture at Submit), bank
  reuse and the Options source/edit/delete UI. It uses `submit-mocks/gh-many.html`.
- `e2e.js [url]`: fill-only run on a live posting (never submits). Superseded by `e2e-live-v5.js` (v0.5), which also aborts every non-GET request.

## v0.3.0 tests
Start `node mock-ollama2.js` fresh before each script (it clears its request log on start). It now streams
NDJSON (`stream:true`) and answers batch, draft and chat requests.
- `e2e-v3.js`: the loaded extension on routed mock pages (`v3-mocks/`, via `v3-lib.js`). Covers the
  bigger button, pulse and badge; chat Q&A with chips and free-text answers, saving per the learning
  rules (EEO, pet and consent not saved); combobox peeking; drafts with Accept / Edit / streamed
  Regenerate (job description, tone and samples in the prompt); the Review step with sources, jump
  links and checklist; free-form chat with validated ACTIONs plus Undo, and rejected pet / invalid-option
  actions; EEO and personal values withheld from the model; the non-blocking submit warning (the user's own
  submit goes through); resize, minimize and size memory; gear → Options profile; chat history across
  reload; popup; rolling 5 backups, backup file and restore; reduced motion. It writes `screenshots/1-9`.
- `e2e-steps.js`: multi-step support. Covers SPA steps ("Step N of 3" plus a progress bar) with
  auto-fill after the user's own Next, header progress, a session holding all steps and a cross-step review;
  Workday (sign-in page left alone, page-navigation steps with a `progressBar`, listbuttons); the
  LinkedIn Easy Apply modal (progress %); and *Auto-fill next steps* turned off. It also checks that
  Next is only ever pressed by trusted clicks (the user's own). It writes `screenshots/10-12`.
- `render-icons.js`: renders `icons/icon*.svg` into the PNG sizes plus `screenshots/icon.png`.
- `e2e.js [url]` now also saves `screenshots/live-<site>.png` (fill-only, never submits).
In all v3 tests every https request is routed by Playwright, and any request that would reach a real
site is answered 404 and reported (`realHits` must be empty).

## v0.4.0 tests
All test data is fake (`fixtures/test-profile.json` "Alex Morgan", `fixtures/jordan-rivera-resume.docx/.pdf`).
Run from `dev-tests/` with `NODE_PATH` pointing at a folder where Playwright is installed.
- `python3 make-fixtures.py`: builds the fake DOCX resume with python-docx and converts it to PDF with LibreOffice.
- `mock-ollama-v4.js`: a mock Ollama on :11434 that enforces Origin like the real one (403 for
  `chrome-extension://` unless allowed), streams `/api/pull` progress and answers extract/tailor prompts,
  including deliberately invented facts that must be blocked. Used by `e2e-v4.js` (no need to start it).
- `node unit-v4.js`: the tailoring validator (numbers, invented employers/tools, borrowed facts, copied
  bullets, re-attaching rewrites given under the wrong id), file names, rules parsing.
- `node e2e-v4.js`: the setup wizard (OS + RAM detection, download button per OS, polling, the Origin fix
  via declarativeNetRequest with before/after 403 checks, web pages still refused, model pull with progress
  and Cancel), resume import (DOCX + PDF, checklist), questions (EEO optional), the practice application,
  "tailor my resume for this job" in chat, diff/approve, DOCX edited in place + PDF, auto-attach, Options
  tailoring rules + saved-resume library. Renders outputs to PNG. Writes `screenshots/v4/01-18`.
- `node e2e-real-ollama.js`: the same core against a REAL Ollama (`OLLAMA_URL`, `MODEL`, `RESUME_DOCX`,
  `RESUME_PDF`, `JOB_FILE`, `JOB_TITLE`, `JOB_COMPANY`, `OUT_DIR`, `SHOTS_DIR`). Defaults to the fake fixtures.
  If you point it at your own resume, keep `OUT_DIR`/`SHOTS_DIR` outside the repo or in an ignored folder.
- `../scripts/make-store-assets.js`: composes `store-assets/` from the v4 screenshots.

## v0.5.0 tests
- `node e2e-v5.js` (`ONLY=migrate,match,fill,refine,cover,profile,track,options,tour` to run sections):
  the loaded extension against routed mocks in `v5-mocks/` with `mock-ollama-v5.js`. It covers the v4→v5
  migration and What's new, the icon color and tooltip, the match card (lazy, idle), job/privacy cards,
  live progress and checklists, field toggles, the application email, the Refine toolbar and feedback, cover
  letters (invented facts blocked, PDF/DOCX names, fill + attach), the Profile tab (also on a non-job page),
  Report a problem (preview and URL contain no personal data), tracking without Fill plus the modal, the
  Options tracker/fields/behaviour, lazy libraries and the 10-step tour (nothing saved). It writes
  `screenshots/v5/01-27`.
- `node e2e-live-v5.js` (`RUNS=3`): live Greenhouse/Lever/Ashby, fill only. Every non-GET request is
  aborted, except Ashby's read-only form GraphQL, so nothing can be submitted or uploaded. It uses the
  fake `fixtures/live-profile.json`. It also measures the extension's CPU time (CDP profiler) and page
  metrics with and without the extension, and writes `perf-v5.json` and `screenshots/v5/live-*.png`.
- Mocks no longer use 302 redirects: Playwright doesn't route redirect targets, so the follow-up GET
  would have reached the real site.

## v0.5.1 test
- `node e2e-eeo.js`: on a fresh install every EEO/pronoun value is empty. Options shows "Choose… (not set)"
  with "I don't wish to answer", and resume import can't set EEO. Fill leaves all 9 EEO/pronoun fields
  empty and yellow (`eeo-mocks/gh-eeo.html`), even with EEO-looking answer-bank entries and a greedy mock
  model; no EEO text reaches the model. An existing user's saved answers survive the update migration and
  the Options save, and are filled with the exact category. Screenshots `screenshots/v5/28-29`.
