# Chrome Web Store Listing — AI Job Application Assistant

> Last Updated: 2026-10-26

## Store Listing

**Extension Name** [REQUIRED]
AI Job Application Assistant

**Short Description** [REQUIRED]
Fills job applications and tailors your resume with a free local AI. Private: your data stays on your computer. Never clicks Submit.

**Detailed Description** [REQUIRED]
Apply to jobs faster without giving your data to anyone.

AI Job Application Assistant fills job applications on Greenhouse, Lever and Ashby (and basic Workday and LinkedIn Easy Apply) from your profile, and uses a free AI that runs on your own computer (Ollama) for everything else. Nothing is uploaded: no account, no subscription, no cloud.

WHAT IT DOES
Fills the application for you: name, contact details, links, work authorization, education, your resume file and more. Every field is colour-coded so you can see what came from your profile, what the AI drafted, and what still needs you.

Chats with you about the rest, one question at a time, with tap-to-answer buttons. It drafts the "Why do you want to work here?" answers in your own voice.

Tailors your resume to each job: type "tailor my resume for this job". It suggests rewording and reordering using only what's already in your resume. Invented employers, titles, dates, numbers or tools are blocked automatically, and you approve every change. Download Word, PDF or both, named "First Last - Company - Job Title", and attach it to the application with one click.

Your rules for tailoring, like "Keep to 2 pages", "Use US spelling" or "Don't change job titles".

Writes cover letters from your resume and the job. They are fact-checked the same way. Put the letter in the text box, or download a PDF or Word file and attach it.

Shows your resume match for each job: the keywords you cover and the ones that are missing.

Refine any long answer with one click: shorter, more technical, more enthusiastic, or your own instruction. Thumbs-up and thumbs-down teach it your taste, stored on your computer.

Your profile, one click to copy, on any website.

Tracks your applications when you press Submit, even if you filled the form yourself. Stages from Saved to Offer, notes, follow-up reminders, saved jobs, search and CSV export.

A 2-minute practice tour with a made-up person shows you everything before you apply for real.

Never presses Submit, Next or Apply. You review and submit yourself.

EASY SETUP, NO TERMINAL
1. Install the extension. A setup page opens.
2. It finds the free local AI app (or gives you a one-click download for Mac or Windows) and downloads the right AI model for your computer, with a progress bar.
3. Drop in your resume (PDF or Word). Your profile fills itself in; you check it and answer a few quick questions. Then try it on the built-in practice application.

PRIVATE BY DESIGN
Your profile, resume, answers and tracker are stored only in your browser.

The AI runs on your computer. The extension makes no other network requests: no analytics, no tracking, no remote code.

Equal-opportunity (EEO) answers, salary and personal details are never sent to the AI. EEO questions are optional and you can always decline.

REQUIREMENTS
Chrome 110 or newer on Mac, Windows or Linux.

The free Ollama app. 8 GB of memory is enough; about 3 GB of disk space for the small model.

Open source (MIT): https://github.com/aridawoodi/job-apply-assistant

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
| activeTab | permissions | Lets the user run "Fill this application" from the toolbar popup on the current tab when it is a job site the extension doesn't match automatically (generic fill). Only on the user's click. |
| scripting | permissions | Used with activeTab to inject the form-filling script into the current tab after the user clicks "Try generic fill on this page" in the popup. |
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
https://github.com/aridawoodi/job-apply-assistant

**Homepage URL** [RECOMMENDED]
https://github.com/aridawoodi/job-apply-assistant

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
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
- Source code includes extensive comments explaining privacy-sensitive operations (see background.js, content/main.js).
