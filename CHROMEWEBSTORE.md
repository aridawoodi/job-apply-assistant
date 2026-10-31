# Chrome Web Store Listing — AI Job Application Assistant

> Last Updated: 2026-10-31

## Store Listing

**Extension Name** [REQUIRED]
AI Job Application Assistant

**Short Description** [REQUIRED]
Autofill job applications from your resume with free, private AI that runs on your computer. Cover letters too. You click Submit.

**Detailed Description** [REQUIRED]
Fill out job applications in minutes, without handing your data to anyone.

Import your resume once. AI Job Application Assistant autofills application forms from your profile, drafts answers to the open questions, tailors your resume to each job and writes cover letters. The AI runs on your own computer, so it's free and private: no account, no subscription, no cloud.

WHAT IT DOES
• Autofills the form: name, contact details, links, work history, education, work authorization and your resume file, in seconds.
• Answers in your voice: drafts "Why do you want to work here?" and other open questions from your resume. Refine any answer with one click: shorter, more technical, or your own instruction.
• Tailors your resume to the job: suggests rewording and reordering using only what's already in your resume. Invented employers, titles, dates or numbers are blocked, and you approve every change. Download Word or PDF.
• Writes cover letters from your resume and the job description, fact-checked the same way.
• Shows your resume match: the keywords from the job you cover and the ones you're missing.
• Tracks your applications when you submit, with stages, notes and follow-up reminders.
• Keeps you in control: it never presses Submit, Next or Apply. Every field is colour-coded, so you know what came from your profile, what the AI drafted and what still needs you.

GET STARTED IN ABOUT A MINUTE
1. Install. A welcome page opens.
2. Import your resume (PDF or Word) and check what it found.
3. Try it on the built-in sample application. Nothing is submitted.
4. Optional: turn on the AI helper for open questions, cover letters and tailoring. The setup page walks you through it, with no terminal.

PRIVATE BY DESIGN
• Your profile, resume, answers and tracker are stored only in your browser.
• The AI runs on your computer. No analytics, no tracking, no remote code.
• Equal-opportunity answers, salary and personal details are never sent to the AI, and those questions are always optional.

FREE AND OPEN SOURCE
No paid plan and no sign-up. MIT license: https://github.com/aridawoodi/job-apply-assistant

WHERE IT WORKS
Most job application forms on the web: company career pages, application platforms and embedded forms. On any site, open the extension from the toolbar and click Fill this application. If you apply on a site often, click "Allow on this site" and the Fill button appears there by itself. Chrome asks you first, and you can remove a site any time in Settings. The extension only shows the button on pages that look like a job application, and it never presses Submit, Next or Apply.

REQUIREMENTS
Chrome 110 or newer on Mac, Windows or Linux. Filling from your profile works without any AI. For the AI helper, use the browser's built-in AI where it's available, or a free AI app on your computer (8 GB of memory is enough).

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
AI Job Application Assistant helps the user complete job applications: it fills application forms from the user's own profile and tailors the user's resume to the job, using an AI model that runs locally on the user's computer.

**Primary Language** [REQUIRED]
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | icons/icon128.png |
| Screenshot 1 [REQUIRED] | 1280×800 | ✅ Ready | store-assets/screenshot-1-fill.png |
| Screenshot 2 [RECOMMENDED] | 1280×800 | ✅ Ready | store-assets/screenshot-2-checklists.png |
| Screenshot 3 [RECOMMENDED] | 1280×800 | ✅ Ready | store-assets/screenshot-3-match.png |
| Screenshot 4 | 1280×800 | ✅ Ready | store-assets/screenshot-4-cover.png |
| Screenshot 5 | 1280×800 | ✅ Ready | store-assets/screenshot-5-tour.png |
| Small Promo Tile [RECOMMENDED] | 440×280 | ✅ Ready | store-assets/promo-tile-440x280.png |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | |

### Screenshot Notes
1. Fill panel showing field progress, checklist and chat (fake data: Sam Sample profile)
2. Required/Optional checklists with field status (fake data)
3. Resume match card with keyword scores (fake job description)
4. Cover letter draft with fact-check warnings (fake data)
5. Practice tour coach marks on application form (built-in demo person)

All screenshots use fictional test data (Sam Taylor / Jordan Rivera profiles from dev-tests).

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| storage | permissions | Saves the user's profile, resume, answer bank, settings, tailored resumes and application tracker in the browser (chrome.storage.local). Nothing is sent to a server. |
| unlimitedStorage | permissions | Resume files (PDF/Word) and tailored resumes are stored locally as files; together they can exceed the default 10 MB storage quota. |
| activeTab | permissions | Lets the user run "Fill this application" from the toolbar popup on the current tab when it is a site the extension doesn't match automatically. Access is temporary, to that tab only, and only after the user clicks the toolbar button. |
| scripting | permissions | (1) With activeTab: injects the form-filling script into the current tab when the user clicks "Fill this application" in the popup. (2) For sites the user has explicitly allowed (see optional host permissions below): registers the same bundled content script for that one origin with chrome.scripting.registerContentScripts, so the Fill button appears there automatically. All code is packaged in the extension; no remote code. |
| declarativeNetRequestWithHostAccess | permissions | Ollama (the local AI app) rejects requests whose Origin header is a browser extension unless the user changes a system setting in a terminal. The extension adds one rule that removes the Origin header only on its own requests (initiatorDomains = this extension's ID) to the local Ollama address (127.0.0.1:11434 / localhost:11434). It does not affect any website's requests, does not block or redirect anything, and does not read request contents. This is what makes setup possible without a terminal. |
| system.memory | permissions | Reads the total amount of memory once during setup to recommend an AI model that will run well (a small model for 8 GB, a larger one for 16 GB or more). The value isn't stored or sent anywhere. |
| http://127.0.0.1/* | host_permissions | To talk to Ollama, which runs on the user's own computer (default http://127.0.0.1:11434): check that it's running, download the AI model, and send it the text it needs to answer form questions and tailor the resume. Also required for the Origin rule above. |
| http://localhost/* | host_permissions | Alternative address for Ollama on the user's own computer. Same purpose as 127.0.0.1. |
| https://*.greenhouse.io/* | host_permissions | The content scripts run on these application platforms to detect application forms, show the "Fill application" button and chat panel, fill fields from the user's profile, attach the user's resume, and notice when the user presses Submit (to update the tracker). It never presses Submit, Next or Apply. |
| https://jobs.lever.co/* | host_permissions | Same as above: detect forms, fill fields, track submissions. Never clicks Submit. |
| https://jobs.ashbyhq.com/* | host_permissions | Same as above: detect forms, fill fields, track submissions. Never clicks Submit. |
| https://*.myworkdayjobs.com/* | host_permissions | Same as above: detect forms, fill fields, track submissions. Never clicks Submit. |
| https://*.myworkday.com/* | host_permissions | Same as above: detect forms, fill fields, track submissions. Never clicks Submit. |
| https://*.myworkdaysite.com/* | host_permissions | Same as above: detect forms, fill fields, track submissions. Never clicks Submit. |
| https://*/* , http://*/* | optional_host_permissions | **Optional, never granted at install.** Lets the user turn on automatic mode for one site they apply on often. The popup shows "Use on <site> automatically?"; when the user clicks "Allow on this site", the extension calls chrome.permissions.request for that single origin (e.g. https://careers.example.com/*) and Chrome shows its own permission prompt. Nothing is requested in the background, and never for all sites at once. The user can see and remove allowed sites in Settings → Sites (which calls chrome.permissions.remove). On allowed sites the extension does the same as on the built-in hosts: detect a job application form, show the Fill button, fill from the user's profile. It never presses Submit, Next or Apply. |
| https://www.linkedin.com/* | host_permissions | On LinkedIn it only acts inside the Easy Apply window. It detects the application form, shows the Fill button, fills fields from the user's profile, and tracks when the user submits. Never presses Submit or Apply. |

### Content Script in Main World
content/netwatch.js runs in the page's main world (MAIN) on ATS hosts only. This is a read-only observer of the page's own fetch/XHR calls, used only to notice that the user's application was submitted (or rejected by the server) so the tracker can be updated. It never changes, blocks or sends requests.

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** Yes

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | Yes | No | Name, email, phone, address and work history the user enters or imports from their resume. Stored locally in the browser to fill job application forms. | No |
| Health info | Yes | No | Only the optional, self-identified disability status a user may give for equal-opportunity questions; it's never sent to the AI. Stored locally and filled only when the user chooses to answer EEO questions. | No |
| Financial info | No | No | | No |
| Authentication info | No | No | | No |
| Personal communications | No | No | | No |
| Location | No | No | | No |
| Web history | No | No | | No |
| User activity | No | No | | No |
| Website content | Yes | No | The text of the job application page, its form questions and the job description, read to fill the form and tailor the resume. Processed locally on the user's device. | No |

**Site access is granted only by the user, per site.** Outside the built-in hosts, the extension reads a page only when the user clicks the toolbar button on that tab (activeTab), or on a site the user explicitly allowed with "Allow on this site" (an optional host permission for that one origin, granted through Chrome's own prompt and removable in Settings → Sites). The extension never asks for access to all sites, and the list of allowed sites stays in the browser.

**Note on "transmitted off-device"**: All data is processed on the user's device. The extension sends data only to the Ollama server on the user's own computer (127.0.0.1), never to the developer or any third party. EEO answers, salary, SSN/date of birth and personal details are never sent to the AI.

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
https://github.com/aridawoodi/job-apply-assistant/blob/main/PRIVACY.md

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name** [REQUIRED]
Arida Woodi

**Contact Email** [REQUIRED]
<!-- Use the email registered with the Chrome Web Store Developer account -->

**Support URL** [RECOMMENDED]
https://github.com/aridawoodi/job-apply-assistant/issues

**Homepage URL** [RECOMMENDED]
https://aridawoodi.github.io/job-apply-assistant/

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 0.6.7 | 2026-10-30 | First-run activation: welcome leads with "Import your resume" then a practice fill on a fuller built-in sample form; "Getting started" checklist (popup, Options, welcome) stored locally; welcome opens once on install only; rating links use the canonical listing URL with utm_source=extension. Works on any job application form: toolbar Fill on any http(s) page (activeTab), job-application detection before the Fill button shows, opt-in "Allow on this site" (per-origin optional host permission + dynamic content script), Settings → Sites to review/remove. Required permissions unchanged; adds optional_host_permissions https://*/*, http://*/* (no install or update prompt; requested per site only on the user's click). New store summary and description (no third-party brand names; see store-listing/0.6.7-draft.md). No telemetry. | Submitted |
| 0.6.6 | 2026-10-29 | Work history editor (job cards, "I currently work here", reorder, Check-this hints); fix: a resume import no longer collapses to one "current" job, and "current" comes from end dates only; Yes/No choice mapping (no invented values); Lever location autocomplete picks a suggestion. No permission changes. | Published (live) |
| 0.6.5 | 2026-10-29 | Fix: cover-letter upload card no longer says "Add your resume". Refreshed screenshots and promo tile (new look). No permission changes. | Published (superseded by 0.6.6) |
| 0.6.4 | 2026-10-29 | Optional rating card in the popup after 3 tracked applications (Rate it / Maybe later / No thanks, plus Send feedback); permanent "Rate this extension" link in Settings. No permission changes. | Submitted, review cancelled for 0.6.5 |
| 0.6.3 | 2026-10-28 | New icon (resume + AI chip + check), Quiet Chrome UI polish. No permission changes. | Submitted, review cancelled for 0.6.4 |
| 0.6.0 | 2026-10-21 | Resume import overhaul: education list, projects section, faster parsing, review screen. Multi-school/job forms. Better skills/certifications parsing. | In development (on GitHub, not submitted to store) |
| 0.5.1 | 2026-10-21 | EEO / self-ID answers default to empty for everyone; never pre-set, never filled from answer bank or AI. EEO questions filtered from AI requests. Pronouns no longer sent to AI. | Submitted (pending review) |
| 0.5.0 | 2026-10-21 | Guided experience: practice tour, live progress, checklists, Refine with AI, resume match, cover letters, profile tab, tracker stages, Settings tree, performance optimizations. | Published |
| 0.4.0 | 2026-10-19 | Public release: setup wizard, no terminal needed (declarativeNetRequest Origin rule), model download in browser, resume import, tailored resumes, practice application. | Published |

## Review Notes

### Known Issues / Limitations
- LinkedIn support is limited to Easy Apply only; does not work on LinkedIn's standard application flow.
- Workday support covers basic fields; complex custom Workday forms may need manual completion.
- The extension requires the free Ollama app to be installed and running. Setup wizard guides users through installation.
- First AI answer after starting Ollama can take up to a minute on 8 GB machines while the model loads into memory.

### Rejection History

| Date | Version | Reason | Fix Applied | Resubmitted |
|------|---------|--------|-------------|-------------|
| 2026-10-20 | 0.5.0 | Keyword spam: excessive mention of brand names (Greenhouse, Lever, Ashby, Workday, LinkedIn) in store listing description | Added disclaimer that brand names are mentioned for compatibility only and do not imply affiliation. Reduced repetition: each brand name appears at most once in public descriptions. Revised text to focus on user benefits rather than technical implementation details. | 2026-10-21 (v0.5.1) |

### Chrome Web Store Brand Name Disclaimer
This extension mentions Greenhouse, Lever, Ashby, Workday and LinkedIn only to describe compatibility with those platforms' application forms. AI Job Application Assistant is an independent open-source project and is not affiliated with, endorsed by, or connected to any of these companies or services. All mentioned names are the property of their respective owners.

### Additional Notes for Reviewers
- The extension is open source (MIT license): https://github.com/aridawoodi/job-apply-assistant
- All AI processing happens on the user's device via Ollama (localhost). No data is sent to external servers.
- EEO (equal employment opportunity) fields are handled with special care: always optional, never pre-filled, never sent to AI, explicit user consent required.
- The extension never automatically submits forms. It fills fields and the user must click Submit themselves.
- Test data in screenshots and developer tests uses only fictional people (Sam Taylor, Jordan Rivera, Sam Sample).
- **Rating prompt (0.6.4):** optional and dismissible. A small card in the toolbar popup only (never on web pages or during a fill), shown after 3 tracked applications and at least 3 days after install. Every user sees the same "Rate it" button (no satisfaction gate or happy/unhappy routing), a "Send feedback" link is shown next to it, and no incentives are offered. "No thanks" or rating stops it for good; "Maybe later" waits for 10 more applications. Logic: lib/rating.js.
- Source code includes extensive comments explaining privacy-sensitive operations (see background.js, content/main.js).
