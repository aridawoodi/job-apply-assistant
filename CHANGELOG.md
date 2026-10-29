# Changelog

## 0.6.3 (2026-10-28): Fresh look
- **New icon:** a resume with an AI chip and a check mark, in the indigo-to-violet brand colors.
- **Calmer, more professional UI** across the popup, settings, and on-page panel: white surfaces, a thin brand accent bar, and clearer secondary buttons. No changes to permissions or features.

## 0.6.2 (2026-10-26): Product rename
- **Product name updated** from "Job Apply Assistant" to "AI Job Application Assistant" to better reflect the AI-powered capabilities. All user-facing text, documentation, and store materials updated. Extension ID, permissions, and functionality remain unchanged.

## 0.6.1 (2026-10-26): Chrome built-in AI support
- **Chrome built-in AI (Gemini Nano) as an optional engine.** The extension now supports Chrome's on-device Prompt API (LanguageModel, available in Chrome 138+) as a primary AI engine with automatic fallback to Ollama. Chrome built-in AI requires no installation and works on devices with about 16 GB RAM or a strong GPU. On 8 GB machines, Ollama remains the recommended choice.
- **AI engine preference** (Settings → Local AI): Auto (default: Chrome built-in → Ollama → rules-only), Chrome built-in only, or Ollama only. Auto tries Chrome's built-in AI first when available, then falls back to Ollama if Chrome AI is unavailable or fails. Settings page shows real-time status: which engines are available and which one is currently active.
- **Chrome Rewriter API support** for polishing longer answers. When available, Chrome's Rewriter or Writer API can refine AI-drafted text (making it shorter, more technical, etc.) — this is where small Ollama models are weakest.
- No new manifest permissions required. The LanguageModel API is available in all extension contexts (service worker, popup, side panel) without additional permissions in Chrome 138+.
- **Hardware note in setup and Settings:** Chrome built-in AI often needs ~16 GB RAM or a strong GPU; 8 GB machines (e.g. MacBook Air) should continue using Ollama for best performance.
- EEO fields remain empty-by-default and are never AI-filled (same as before). Extension never clicks Submit.
- **CHROMEWEBSTORE.md** added at repo root: complete Chrome Web Store listing documentation using the Modern Web Guidance template, with version history, permission justifications, rejection history (v0.5.1 keyword spam), and brand-name disclaimer. This file is excluded from the ZIP build.
- Existing tests pass; new tests cover Chrome AI availability checks and fallback behavior (LanguageModel API mocked in tests).
- Privacy update: PRIVACY.md now mentions that Chrome built-in AI (when used) processes data on-device just like Ollama.

## 0.6.0 (2026-10-21): resume import that reads every school, job and project
- **Education is a list now.** Settings → Profile shows every school as its own card: school, degree
  (a fixed list: High School, Associate's, Bachelor's, Master's, Doctorate, Certificate, Bootcamp, Other),
  field of study, location, start, end and status (completed / in progress / attended). You can add,
  remove and reorder schools and mark your highest degree. Before, only one school was kept and filled.
  Your saved school from 0.5 becomes the first entry automatically.
- **New Projects section** (name, link, role/type, dates, description, bullets, tech). Projects are
  imported from a Projects section, shown in Settings, used for AI answers, the answer bank, cover letters
  and tailoring. They are never added as jobs.
- **Faster, more accurate import.**
  - The resume is split into sections and entries with rules first (no more merging lines across
    schools, skills or date lines).
  - Contact details, links, skills, certifications and languages never need the AI.
  - Entries the rules read confidently skip the AI. The rest is sent to the local AI one section at a
    time with a strict format: degree from the fixed list, field of study separate, jobs only from
    Experience, projects only from Projects, and certifications kept separate.
  - Everything the AI says is checked against that entry's own text, and anything not in your resume is
    left out (and listed).
  - If the AI fails or is off, rules read everything instead, and the page says so.
  - On a typical 2-page resume this takes seconds instead of a minute or more.
- **Review screen after import.** Every job, school and project is an editable card you can untick. Each
  list says plainly whether it will replace what you saved ("Replace my saved schools (1) with these 4"),
  or that nothing was found and your saved data stays. "↻ Read again with AI" re-reads every entry with
  the AI (slower). The "Let my local AI read the details" box is read when you import, not only on page load.
- **Form fill with several schools/jobs.** On Greenhouse and Workday, the 1st, 2nd, … education and work
  blocks are filled from your list (highest degree first, current job first). The extension still never
  clicks "Add another"; add the blocks yourself and fill again.
- Small fixes:
  - Skills: long names allowed (up to 90 characters), "Category: a, b" lines split properly, brackets
    with lists kept together, duplicates removed.
  - City, state and country are split from your location.
  - Portfolio/website comes only from links in your resume header, not from a project.
  - Bullets are capped at 25 per job and 15 per project (was 12 per job).
  - Certifications are one per line, so "Name, 2023" stays one item.
- EEO / self-ID answers are still never set by import, and the extension still never clicks Submit.
- Tests: `dev-tests/unit-v6.js` (with a new made-up resume, `fixtures/sam-taylor-resume.*`).

## 0.5.1 (2026-10-21): voluntary self-ID is never pre-set
- **EEO / self-ID answers default to empty ("Not set") for everyone.** This covers race/ethnicity,
  Hispanic/Latino, gender, transgender, sexual orientation, disability, veteran status and pronouns.
  An empty answer leaves the form field yellow for you. Nothing is picked for you, not even "decline".
- **Fix:** an EEO question could be filled from the answer bank before your profile was checked, because
  bank matches ran first. A question with EEO-style options but a generic label ("Which of the following
  best describes you?") could also be filled from the bank or sent to the local AI. This is how a race
  answer such as "White" could appear without being set in your profile. Now only the value saved in
  your profile is used, and only for the matching category.
  - EEO questions are recognized by label, description or option set.
  - They are never answered from the answer bank or by the AI.
  - They are filtered out of AI requests.
  - They are never learned into the answer bank.
  - Pronouns are no longer sent to the AI.
- Race/ethnicity matching no longer has a built-in preference for one category. Each category maps only
  to the site's wording for that same category.
- **Settings → Profile:** every EEO field is a "Choose… (not set)" list of explicit options, each with
  "I don't wish to answer". Pronouns is a text box showing "Not set" when empty. Answers you already saved,
  including your own wording, are kept and shown.
- Setup questions use the same explicit choices. Skipping one leaves it "Not set".
- Resume import never sets EEO or pronouns. It never did, and this is now covered by a test.
- Existing saved answers are not changed by the update.
- Tests: `dev-tests/e2e-eeo.js`.

## 0.5.0 (2026-10-21): guided, faster, more helpful
Everything still runs on your computer: no account, no telemetry, no servers.

- **Practice tour.** A 10-step tour with coach marks on the practice application, using a made-up
  person (Sam Sample). It covers pinning the icon, Fill, live progress, saved answers, Refine, resume match,
  tailoring, review and pressing Submit yourself. Nothing from the tour is saved to your profile, answers
  or tracker. You can run it again from Settings and from the popup.
- **Toolbar icon status.** The icon is colored on supported job pages and gray everywhere else, and its
  tooltip says what was found ("Greenhouse · application form found").
- **Live fill progress and checklists.** You see "Scanning page… N fields found" and per-field ticks while
  it fills, then *Required x of y* and *Optional x of y* checklists that jump to each field.
- **Refine with AI** under long text answers: Shorter, More technical, More enthusiastic, or your own
  instruction; Regenerate and Undo. 👍 / 👎 feedback is stored locally and shapes future drafts.
- **Panel tabs:** Assistant, Resume, Profile, Tracker, Report.
  - **Job card** (company, title, location, salary, posted date) with ☆ Save job.
  - **Resume match**: a keyword score worked out locally, with matched and missing keywords. On job
    postings a small card shows it too (dismiss it, or turn it off for the site). AI keyword extraction
    is optional and can only add keywords that appear in the job description.
  - **Profile**: click to copy any detail (contact, links, experience descriptions, education, skills,
    saved answers). It works on any site: on unsupported sites the popup's *My profile* opens it.
  - **Tracker**: the stage stepper, notes and reminder for the current job.
  - **Report a problem**: a diagnostics checklist, then a prefilled GitHub new-issue link. You see a
    preview of exactly what goes into it. It holds no personal data and nothing is sent automatically.
- **Cover letters** from your resume and the job description, written by your local AI and fact-checked:
  numbers and tools that aren't in your resume are blocked, and terms found only in the job description
  are flagged. You approve the letter, then put it in the text box or export a PDF/DOCX named
  `First Last - Company - Job Title - Cover Letter` and attach it to the upload field.
- **Tracking without Fill.** Applications you submit yourself are tracked on all supported sites. After a
  confirmed submit, an *Application tracked ✓* dialog lets you add notes and a follow-up date. You can turn
  this off with *Track applications I submit without using Fill*.
- **Tracker upgrade:** stages (Saved → Applied → Screen → Interview → Offer / Rejected) with dates, notes,
  reminders (shown in the tracker, no notifications), bookmarks, search and stage/saved/due filters, and
  more CSV columns.
- **Settings:**
  - **Fields** is a toggle tree for every field and group, for example turning off all EEO fields.
  - **Behaviour** has: application email (a separate email for applications), open the panel automatically
    or manually, show the match card, AI keywords, the Refine toolbar, auto-fill next steps, track without
    Fill, and show "What's new".
- **Privacy card** in the panel, plus a bundled privacy page (`privacy/privacy.html`).
- **What's new** banner in the popup after an update.
- **Performance:** pdf.js, JSZip and jsPDF load only when needed (Options, setup and the tailor page no
  longer load them up front). Page observers are debounced. The match card is computed when the browser is
  idle, about 1 s after load. Measured on live Greenhouse, Lever and Ashby postings (median of 3 loads,
  `dev-tests/perf-v5.json`). The extension's own CPU time was 25–77 ms over load plus the first 9 s, at
  most 0.5 ms per 5 s while idle, and 46–64 ms for a full Fill. The page's load event was unchanged within
  noise (350 vs 352 ms, 839 vs 639 ms, 575 vs 601 ms without vs with the extension).
- **Data migration to v5:** existing tracker rows get stages, and new settings get defaults. Nothing is
  removed.
- Fixes: LinkedIn pages outside `/jobs/` count as unsupported. Practice pages can't write to the real
  tracker, answers or feedback.

## 0.4.0 (2026-10-19): public release
For everyone, on Mac and Windows, with no terminal.

- **Setup wizard on install.** Detects Mac/Windows/Linux and whether Ollama is running. If not, it shows a
  big download button for your system (official ollama.com links) with illustrated steps and checks every
  2 seconds until Ollama is up.
- **No `OLLAMA_ORIGINS` needed.** A declarativeNetRequest rule removes the `Origin` header only on the
  extension's own requests to the local Ollama address, so Ollama accepts them while websites stay blocked.
  A one-click "Try the automatic fix" and an OS-specific manual fallback are on the setup page.
- **Model download in the browser.** Recommends `qwen2.5:3b` (8 GB of memory) or `qwen2.5:7b` (16 GB+)
  from your memory size and downloads it through Ollama's `/api/pull` with a live progress bar, size,
  speed estimate and Cancel.
- **Resume → profile.** Drop a PDF or Word resume. It's parsed on your computer (bundled pdf.js and JSZip,
  no CDN), contact details are read with exact rules, and the local model reads jobs, education, skills,
  certifications and a summary. Every value is checked against the resume text (anything not in it is
  dropped and listed), then you confirm or edit a checklist before saving.
- **Questions resumes don't answer**, asked once in a short chat: work authorization, sponsorship, 18+,
  start date, relocation, salary, and the optional EEO questions (always with "Decline").
- **Tailored resumes.** "Tailor my resume for this job" in the chat opens a page with suggested changes to
  the summary, skills order and bullets, using only facts already in your resume. Each suggestion is
  checked: no new employers, titles, dates, numbers or tools; bullets keep their own numbers and facts and
  can't borrow from other jobs; a rewrite the AI files under the wrong line is matched to the line it
  actually rewrites, and shortened bullets are flagged with what they leave out. You accept changes one by one. Word masters are edited in place (layout
  and styles kept); PDF masters are rebuilt from a clean template (the UI says the layout is approximate).
  Export Word, PDF or both (setting *Preferred resume format*, default both), named
  `First Last - Company - Job Title` (location removed). One click attaches it to the application, and
  later fills attach it automatically (PDF when the form only takes PDF).
- **Your tailoring rules** (Settings → Tailoring), e.g. "Keep to 2 pages", "Use US spelling", "Don't
  change job titles", "Never remove my … bullets". Checkable rules are verified and reported.
- **Saved resumes library** with downloads, linked to the tracker.
- **Practice application** inside the extension: try everything on a fake job; nothing is sent or tracked.
- Settings: resume import, work history / skills editors, Tailoring and Saved resumes sections, "Run setup
  again". Popup: "Finish setup" for new users and a Setup link.
- Default Ollama address is now `http://127.0.0.1:11434` (existing `localhost` settings are migrated).
- Generic defaults: the sample profile is a made-up person. Existing data is kept and migrated; existing
  users skip the wizard.
- New permissions: `declarativeNetRequestWithHostAccess` (the Origin rule) and `system.memory` (model
  recommendation). Minimum Chrome 110.
- Public-release files: MIT license, privacy policy, contributing guide, store listing, CI workflow.

## 0.3.0 (2026-10-19)
- **New icon and name.** A briefcase with a check and a spark, in the toolbar, popup, Options and on the page.
- **Bigger floating button** in the same corner, with the icon and a count badge of fields that need you.
  It pulses gently when it first appears and when fields need attention, and stops once you use it
  (no animation if *Reduce motion* is on).
- **Chat assistant panel.** Click the button: it greets you, fills the form, reports what it did, then asks
  about each yellow field **one at a time**. Dropdowns and radios become tap-to-answer chips, text
  questions get a box, and every question has **Skip**. Your answer goes into the field (it scrolls there
  and highlights it teal) and is saved to the answer bank under the usual learning rules (never EEO,
  personal or consent answers). Blue AI drafts get **Accept / Edit / Regenerate**.
  You can also just type: "what's left?", "review", or "make the why-us answer more technical". The local
  model sees the job title, company, job description, your profile, resume text and the form's state
  (EEO and personal answers are withheld). If it proposes a change to a field, the change is checked
  (the field must exist, options must match, no consent/EEO/personal/file fields) and shown as a blue
  card with **Undo**. Replies stream in as they're written. Chat history is kept per job (Options can turn
  it off). The panel can be resized from its top-left corner and minimized.
- **⚙ in the chat header and the popup** opens Options at your profile.
- **Review step** (the *Review* button): every field with its value, where it came from (profile / saved /
  AI / you), a ↗ jump link, and a final checklist. On multi-step applications it also lists the
  answers recorded on earlier steps.
- **Submit warning.** If you press Submit while fields are still yellow or AI drafts are unreviewed, a toast
  tells you which ones. **It never blocks your submit** and never submits anything itself.
- **Multi-step / multi-page applications.** It notices when a new step appears (the URL changes, the
  fields are replaced, "Step 2 of 5" text or a progress bar moves). One session is kept per job, across
  page loads. When you press Next/Continue yourself, the new step is filled automatically (Options →
  *Auto-fill next steps*, on by default) and the chat says "Step 2 of 5: filled X, need Y". The header
  shows the step progress. **It still never presses Next, Continue or Submit.**
- **Workday (basic)** and **LinkedIn Easy Apply (fill-only)**. Workday steps use its `data-automation-id`
  fields and dropdown buttons; sign-in and *Create Account* pages are left to you. On LinkedIn it only
  works inside the Easy Apply window, one step at a time.
- **More reliable filling.** Better labels (aria-labelledby/describedby, fieldset legends, ATS question
  blocks), better react-select/combobox handling, and every value is checked after filling with one
  retry. Fields the site reset are listed as "didn't stick".
- **Faster.** Batching, streaming, model warm-up on page load, and answers cached per question for the
  browser session.
- **Essays that sound like you.** Options → *Writing style*: paste a few paragraphs you wrote and tone
  notes, and pick a draft length (short / medium / long). Drafts use them plus your resume text and the job
  description. **Regenerate** gives a new version.
- **Backups.** The last 5 snapshots of your profile, answer bank, settings and tracker are kept
  automatically (on updates, on browser start, and at most every 30 minutes while things change).
  Options → *Backups* has **Backup to file** (includes resume and chats) and **Restore from file**, which
  takes a snapshot first. Existing v0.2 data is migrated as-is.

## 0.2.0
- Faster local AI (warm-up, `think: false`, small batches filled as they arrive, per-batch timeouts, Retry).
- Answer learning into the answer bank (fuzzy de-duplication, company templates, never EEO/personal/consent).
- Submission tracking (Submitted → Applied / Error - not sent), toasts, toolbar badge, CSV columns.

## 0.1.0
- First version: fills Greenhouse, Lever and Ashby from a saved profile, local model for the rest,
  colour-coded fields, never submits, application tracker with CSV export.
