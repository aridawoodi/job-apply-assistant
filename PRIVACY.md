# Privacy policy

_Last updated: October 19, 2026 · applies to Job Apply Assistant v0.4.0 and later_

Job Apply Assistant is a browser extension that fills job applications and tailors resumes using an AI
model that runs **on your own computer** (Ollama). It is built so that your information stays with you.

## What the extension stores
On your computer, in your browser's extension storage (`chrome.storage.local`) only:
- your profile (name, contact details, links, work history, education, skills and the answers you give
  in setup, such as work authorization, start date and salary expectation);
- optional voluntary self-identification (EEO) answers, only if you choose to give them;
- your resume file and the tailored resumes you create;
- your answer bank (answers you saved or that were learned from your own typing), writing-style samples,
  settings, assistant chat history per job, the application tracker and automatic backup snapshots.

It never stores passwords, file uploads other than your resumes, consent/terms answers, signatures,
SSN or date of birth, or personal questions unrelated to the job (for example pets, hobbies, family or
religion).

## What leaves your computer
**Nothing is sent to the developer or to any third party.** There is no server, no account, no analytics,
no tracking, no ads and no remote code.

The extension talks to:
1. **Ollama on your own computer** (by default `http://127.0.0.1:11434`). Text needed for a task (for
   example a form question, the job description and relevant parts of your profile or resume) is sent there
   so the local AI can answer. **EEO answers, salary, SSN/date of birth and personal details are never sent
   to the AI.** If you change the Ollama address in Settings to another computer, that computer receives
   these requests; the default is your own computer only.
2. **The job application page you are on**, where it types your answers into the form, exactly as you
   would. It never presses Submit, Next or Apply; you do.

When you click the Ollama download button on the setup page, your browser opens ollama.com (Ollama's own
site, with its own privacy policy). Downloading an AI model is done by the Ollama app.

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
