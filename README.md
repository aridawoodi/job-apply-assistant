# Job Apply Assistant

**Fill job applications in seconds, and tailor your resume to each job, with a free AI that runs on
your own computer.** Works on Mac and Windows in Google Chrome. No account, no subscription, and your
data never leaves your computer.

- ⚡ **Fills applications** on Greenhouse, Lever and Ashby (plus basic Workday and LinkedIn Easy Apply) from your profile.
- 💬 **Chats with you** about anything it couldn't fill, one question at a time, and drafts the "Why us?" answers in your voice.
- 📄 **Tailors your resume** for each job: rewords and reorders what's already in your resume (it never invents
  anything) and you approve each change. Exports Word and PDF, named `First Last - Company - Job Title`.
- 📋 **Tracks your applications** automatically when you press Submit.
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
Everything (profile, resume, answers, tracker) is stored only in your browser on your computer. The AI
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
lib/tailor.js            tailoring prompt, fact validation, rules, file names
lib/docx.js              in-place DOCX editing + DOCX template builder
lib/pdfout.js            PDF builder (jsPDF)
lib/importer.js          resume import + confirm checklist (setup wizard and Settings)
lib/pageutil.js          helpers for extension pages; lib/pages.css shared styles
lib/vendor/              pdf.js, JSZip, jsPDF (with licenses)
content/                 content scripts: field detection, site adapters, chat panel, multi-step, learning, tracking
onboarding/              first-run setup wizard
tailor/                  tailor-my-resume page (diff / approve / export / attach)
practice/                practice application (fake job, nothing is sent)
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
node e2e-v4.js                               # setup wizard, Origin rule, model pull, resume import, tailoring (mock Ollama)
OLLAMA_URL=http://127.0.0.1:11434 node e2e-real-ollama.js   # against a real Ollama + model
```
Older suites (`e2e-v3.js`, `e2e-steps.js`, `e2e-ai.js`, `e2e-submit.js`, `test-mocks.js`) are described
in `dev-tests/README.md`. All test data is made up.

### Build the store zip
```bash
node scripts/lint.js && python3 scripts/build.py     # -> dist/job-apply-assistant-v<version>.zip
```

Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). License: [MIT](LICENSE).
