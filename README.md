# Job Apply Assistant

**Fill job applications in seconds, and tailor your resume to each job, with a free AI that runs on
your own computer.** Works on Mac and Windows in Google Chrome. No account, no subscription, and your
data never leaves your computer.

- ⚡ **Fills applications** on Greenhouse, Lever and Ashby (plus basic Workday and LinkedIn Easy Apply) from your profile.
- 💬 **Chats with you** about anything it couldn't fill, one question at a time, and drafts the "Why us?" answers in your voice.
- 📄 **Tailors your resume** for each job: rewords and reorders what's already in your resume (it never invents
  anything) and you approve each change. Exports Word and PDF, named `First Last - Company - Job Title`.
- ✉️ **Writes cover letters** from your resume and the job, fact-checked, as text, PDF or Word.
- 🎯 **Shows your resume match** for each job: which keywords you cover and which are missing.
- ✨ **Refine any long answer** with one click: shorter, more technical, more enthusiastic, or your own words.
- 📇 **Your profile, one click to copy**, on any site, even ones it doesn't fill.
- 📋 **Tracks your applications** when you press Submit, even if you didn't use Fill, with stages, notes and reminders.
- 🛑 **Never presses Submit, Next or Apply.** You stay in control: it fills, you review, you submit.

> Screenshots: [store-assets/](store-assets/)

## Install (3 steps, no terminal)

1. **Add the extension** from the Chrome Web Store: _link coming after the store review_
   (or, for now, see [Install from source](#install-from-source)).
2. **Follow the setup page** that opens. It checks whether **Ollama** (the free app that runs the AI) is
   installed and gives you a one-click download for your computer, then downloads the right AI model for
   your computer's memory, with a progress bar.
3. **Drop in your resume** (PDF or Word). The assistant reads it on your computer, fills in your profile,
   and asks a few things resumes don't say (work authorization, sponsorship, start date, salary, and the
   optional equal-opportunity questions, which you can always decline). Then try it on the built-in
   practice application.

That's it. Open a job application and click the purple **⚡ Fill application** button.
New here? The setup page offers a **2-minute practice tour** with a made-up person. You can run it again
anytime from the popup or Settings → Behaviour.

### What you'll see
- **Toolbar icon:** colored on job pages it supports, gray elsewhere. Hover it to see what it found.
- **The panel** has five tabs. **Assistant** shows live fill progress and Required/Optional checklists.
  **Resume** has the match score, *Improve my match* and the cover letter. **Profile** is click-to-copy.
  **Tracker** has the stage, notes and reminder for this job. **Report** is for problems and site requests.
- **On job postings** a small match card shows how well your resume fits. You can dismiss it or turn it off
  in Settings.
- **Settings → Fields** turns individual fields or whole groups off, for example all EEO questions.
  **Settings → Behaviour** has the application email, auto-open, the match card, the Refine toolbar,
  tracking without Fill and more.

### Cover letters
On an application, open **Resume → ✍️ Write a cover letter with my resume** (or *Write it from my resume* on a cover-letter
question). The local AI drafts the letter. Anything it can't back up from your resume is blocked:
numbers and tools you don't have. Terms that only appear in the job description are flagged. Approve the
letter, then put it in the text box or export a PDF or Word file named
`First Last - Company - Job Title - Cover Letter` and attach it.

### Tailor your resume for a job
On a job application, open the assistant chat and type **"tailor my resume for this job"** (or click
*📄 Tailor my resume* in the review). A page opens with suggested changes, each fact-checked against your
resume. Tick the ones you like, choose PDF, Word or both, and download. One click attaches it to the
application. Add your own rules in **Settings → Tailoring**, e.g. "Keep to 2 pages", "Use US spelling",
"Don't change job titles". Tailored resumes are saved in **Settings → Saved resumes**.

If your master resume is a **Word file**, your own file is edited in place, so the layout stays exactly as
you designed it. If it's a **PDF**, a clean resume with the same structure is rebuilt; it is close to your
original but not identical. Uploading the Word version gives the best result.

### What you need
- Google Chrome 110 or newer (or another Chromium browser such as Edge or Brave) on macOS or Windows.
  Linux works too.
- About 3 GB of free disk space for Ollama and the small AI model (about 6 GB for the larger one). 8 GB of memory is enough; with 16 GB or more
  the setup suggests a larger model that writes better.

### Privacy in one paragraph
Everything (profile, resume, answers, tracker, cover letters, feedback) is stored only in your browser on your computer. No account. The AI
runs in Ollama on your computer. The extension makes no other network requests: no analytics, no
servers, no remote code. Equal-opportunity answers and salary are never sent to the AI.
Details: [PRIVACY.md](PRIVACY.md).

## Help
| Problem | Fix |
|---|---|
| Setup says "Waiting for Ollama…" | Install Ollama with the button on the setup page and open it. On Mac it shows a llama in the menu bar; on Windows, in the taskbar tray. |
| "Ollama is running, but it refused the connection" | Click **Try the automatic fix**. If that doesn't help, follow the one-time manual steps shown right below it. |
| AI answers are slow | The first answer loads the model (up to a minute). Use the recommended model (Settings → Local AI), close heavy tabs. |
| A field stayed yellow | It needs you: fill it on the page or answer it in the chat. |
| I lost my data after reinstalling | Settings → Backups → **Restore from file**. Never click "Remove" on the extension without a backup file. |

More: [User guide](docs/USER-GUIDE.md) · [Windows notes](docs/WINDOWS.md) · [Changelog](CHANGELOG.md)

---

## Developers

Plain JavaScript, Manifest V3, no build step, no frameworks, no remote code. Third-party libraries are
vendored in `lib/vendor/` (pdf.js, JSZip, jsPDF; see `lib/vendor/README.md`).

### Install from source
1. Download or clone this repository.
2. Open `chrome://extensions`, switch on **Developer mode**, click **Load unpacked**, pick the folder that
   contains `manifest.json`.
3. The setup page opens. After changing code, click the reload icon on the extension card and reload
   open job tabs (your data is kept).

### How the "no terminal" Ollama connection works
Ollama rejects requests whose `Origin` header isn't a local address, and Chrome sends
`Origin: chrome-extension://<id>` on the extension's POST requests, so normally users have to set
`OLLAMA_ORIGINS` in a terminal. Instead, the extension installs a **declarativeNetRequest** rule (see
`installOriginRules` in `background.js`) that removes the `Origin` header **only** on requests the
extension itself makes (`initiatorDomains: [<extension id>]`) to the configured local Ollama address.
Web pages are not affected, so Ollama still blocks websites. Tested against Ollama 0.40.6. The setup
page keeps a manual `OLLAMA_ORIGINS` fallback for unusual setups.

### Layout
```
manifest.json            MV3 manifest
background.js            service worker: Ollama calls, Origin rule, model download, resume tasks, sessions, backups, tracker
lib/defaults.js          default settings, profile schema, storage loader (shared)
lib/resume.js            PDF/DOCX parsing (local), regex facts, model-output validation, profile mapping
lib/extract.js           resume sections/entries by rules, per-section AI prompts, validation + merge
lib/tailor.js            tailoring prompt, fact validation, rules, file names
lib/cover.js             cover-letter prompt, fact checks, file name
lib/match.js             resume ↔ job keyword match (local)
lib/docx.js              in-place DOCX editing + DOCX template builder
lib/pdfout.js            PDF builder (jsPDF)
lib/importer.js          resume import + editable review screen (setup wizard and Settings)
lib/pageutil.js          helpers for extension pages; lib/pages.css shared styles
lib/vendor/              pdf.js, JSZip, jsPDF (with licenses)
content/                 content scripts: field detection, site adapters, chat panel + tabs (panel.js), refine toolbar,
                         match card, multi-step, learning, tracking
onboarding/              first-run setup wizard
tailor/                  tailor-my-resume page (diff / approve / export / attach)
cover/                   cover-letter page (draft / fact check / approve / fill or attach)
privacy/                 bundled privacy page
practice/                practice application + guided tour (demo person, nothing is sent or saved)
options/  popup/         settings page and toolbar popup
store/                   Chrome Web Store listing text, permission justifications
store-assets/            store tile and screenshots (fake data)
scripts/                 lint + build-zip scripts
dev-tests/               Playwright end-to-end tests, mocks, fixtures (not shipped)
```

### Tests
```bash
cd dev-tests && npm i playwright && npx playwright install chromium
node unit-v4.js                              # pure helpers, no browser
node unit-v6.js                              # v0.6 resume import (sections, schools, jobs, projects, skills), no browser
node e2e-v4.js                               # setup wizard, Origin rule, model pull, resume import, tailoring (mock Ollama)
node e2e-v5.js                               # v0.5: tour, icon, progress, refine, tabs, match, cover letters, tracking, settings (ONLY=match,cover,...)
node e2e-live-v5.js                          # live Greenhouse/Lever/Ashby, fill only (non-GET requests aborted) + performance numbers
OLLAMA_URL=http://127.0.0.1:11434 node e2e-real-ollama.js   # against a real Ollama + model
```
Older suites (`e2e-v3.js`, `e2e-steps.js`, `e2e-ai.js`, `e2e-submit.js`, `test-mocks.js`) are described
in `dev-tests/README.md`. All test data is made up.

### Performance
Content scripts are plain JS (no framework). Heavy libraries (pdf.js, JSZip, jsPDF) load only when a page
needs them. Observers are debounced, and the match card waits until the browser is idle.
`dev-tests/e2e-live-v5.js` measures the extension's own CPU time on live pages (CDP sampling profiler,
`chrome-extension://` frames) and compares page metrics with and without the extension. Results for
v0.5.0 are in the CHANGELOG release notes and `dev-tests/perf-v5.json`.

### Build the store zip
```bash
node scripts/lint.js && python3 scripts/build.py     # -> dist/job-apply-assistant-v<version>.zip
```

Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). License: [MIT](LICENSE).
