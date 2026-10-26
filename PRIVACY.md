# Privacy policy

_Last updated: October 26, 2026 · applies to AI Job Application Assistant v0.6.2 and later_

AI Job Application Assistant is a browser extension that fills job applications and tailors resumes using an AI
model that runs **on your own computer**. You can choose between Chrome's built-in AI (Gemini Nano, available in Chrome 138+)
or the free Ollama app. Both options keep your information on your device.

## What the extension stores
On your computer, in your browser's extension storage (`chrome.storage.local`) only:
- your profile (name, contact details, links, work history, education, skills and the answers you give
  in setup, such as work authorization, start date and salary expectation);
- optional voluntary self-identification (EEO) answers, only if you choose to give them;
- your resume file and the tailored resumes you create;
- your answer bank (answers you saved or that were learned from your own typing), writing-style samples,
  👍/👎 feedback on AI drafts, cover letters you create, resume-match results per job page, settings,
  assistant chat history per job, the application tracker (stages, notes, reminder dates) and automatic
  backup snapshots.

It never stores passwords, file uploads other than your resumes, consent/terms answers, signatures,
SSN or date of birth, or personal questions unrelated to the job (for example pets, hobbies, family or
religion).

## What leaves your computer
**Nothing is sent to the developer or to any third party.** There is no server, no account, no analytics,
no tracking, no ads and no remote code.

The extension talks to:
1. **Chrome built-in AI or Ollama on your own computer.** When using Chrome's built-in AI (Gemini Nano), 
   text processing happens entirely within Chrome on your device — no network requests. When using Ollama
   (by default `http://127.0.0.1:11434`), text needed for a task (for example a form question, the job 
   description and relevant parts of your profile or resume) is sent to the Ollama server on your own computer
   so the local AI can answer. **EEO answers, salary, SSN/date of birth and personal details are never sent
   to the AI.** If you change the Ollama address in Settings to another computer, that computer receives
   these requests; the default is your own computer only. Chrome built-in AI is entirely on-device and makes no network requests.
2. **The job application page you are on**, where it types your answers into the form, exactly as you
   would. It never presses Submit, Next or Apply; you do.

3. **GitHub, only when you click "Open a GitHub issue"** in the Report tab. Your browser opens a new-issue
   page prefilled with the text shown to you first: your description and diagnostics (extension/browser/OS
   version, site name, number of fields found, whether Ollama and the model are available, which profile
   sections are empty). No names, contact details, answers or page addresses. You submit it yourself.

The company logo shown in the panel's job card is the image the job page itself provides; no third-party
favicon service is used.

When you click the Ollama download button on the setup page, your browser opens ollama.com (Ollama's own
site, with its own privacy policy). Downloading an AI model is done by the Ollama app. Chrome's built-in AI
(when available and selected) is managed by Chrome itself and downloads the Gemini Nano model as part of Chrome's
built-in features.

## Permissions and why they are needed
See [store/permissions.md](store/permissions.md). In short: storage for your data, access to the job sites
it fills, access to `127.0.0.1`/`localhost` to talk to Ollama, and a header rule so Ollama accepts the
extension's requests without a terminal setting.

## Your control
- Edit or delete anything in **Settings** (profile, answer bank, tracker, saved resumes, chat history).
- **Backups → Backup to file** exports everything as a JSON file you keep.
- Removing the extension deletes all of its stored data.

## Contact
Questions or concerns: open an issue on the project's GitHub repository.
