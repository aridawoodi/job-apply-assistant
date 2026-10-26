# Contributing

Thanks for helping! AI Job Application Assistant is plain JavaScript (Manifest V3), with no build step and no
framework, so you can load the folder in Chrome and start.

## Ground rules (please keep these)
1. **Never click Submit, Next, Continue or Apply** on a job site, in code or in tests. The user presses them.
2. **No remote code and no network calls** except to the user's local Ollama. No CDNs, analytics or
   telemetry. Third-party libraries go in `lib/vendor/` with their license and version noted in
   `lib/vendor/README.md`.
3. **Privacy:** EEO answers, salary, SSN/date of birth, consent boxes and personal questions unrelated to
   the job (pets, family, religion…) are never sent to the model and never learned.
4. **Tailoring never invents facts.** New checks belong in `lib/tailor.js` `validate()`, with a unit test.
5. **No real personal data** in the repo: use the made-up people in `dev-tests/fixtures/` and
   `sample-profile.json`. Don't commit screenshots of real applications.

## Workflow
1. Fork, create a branch, make your change.
2. `node scripts/lint.js` (syntax check, no-remote-code check, manifest check, personal-data scan).
3. `node dev-tests/unit-v4.js`, plus the relevant Playwright suite (see `dev-tests/README.md`). For UI
   changes, add or update a screenshot in `dev-tests/screenshots/v4/`.
4. Open a pull request describing what changed and how you tested it (OS + Chrome version).

## Adding a job site
Add an adapter in `content/sites.js` (`match`, `formRoot`, `jobInfo`, `jobDescription`, `stepInfo`), the
host to `manifest.json` (`host_permissions` and `content_scripts.matches`), a mock page under
`dev-tests/`, and a short justification in `store/permissions.md`.

## Code style
2-space indent, single quotes, semicolons, small functions, comments that say *why*. Keep pages working
with system fonts on Mac and Windows; no OS-specific paths or shortcuts (use Ctrl or ⌘ as appropriate).

## Reporting bugs
Include the site (Greenhouse/Lever/…), what you expected, what happened, and the chat or console message.
Please remove personal information from screenshots.
