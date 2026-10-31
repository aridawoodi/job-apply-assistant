# Chrome Web Store listing: AI Job Application Assistant

## Name
AI Job Application Assistant

## Summary (short description, max 132 characters; same as manifest "description")
Autofill job applications from your resume with free, private AI that runs on your computer. Cover letters too. You click Submit.

## Category
Productivity (alternative: Tools)

## Language
English

## Detailed description
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

## Single purpose (Privacy practices tab)
AI Job Application Assistant helps the user complete job applications: it fills application forms from the user's own profile and tailors the user's resume to the job, using an AI model that runs locally on the user's computer.

## Remote code (Privacy practices tab)
No, I am not using remote code. All JavaScript is packaged in the extension (including the bundled pdf.js, JSZip and jsPDF libraries). No code is downloaded or evaluated at runtime.

## Data usage (Privacy practices tab): what to tick
Recommended (honest, conservative) answers. All of this data stays on the user's computer:
- **Personally identifiable information: yes** (name, email, phone, address and work history the user enters or imports from their resume).
- **Website content: yes** (the text of the job application page, its form questions and the job description, read to fill the form and tailor the resume).
- **Health information: yes, to be safe** (only the optional, self-identified disability status a user may give for equal-opportunity questions; it's never sent to the AI).
- Financial and payment information, Authentication information, Personal communications, Location (GPS), Web history, User activity: **no**.

Certify all three:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

Note for the "data is transmitted" questions: data is processed on the user's device and sent only to the Ollama server on the user's own computer (127.0.0.1); it is never sent to the developer.

## Privacy policy URL
https://github.com/aridawoodi/job-apply-assistant/blob/main/PRIVACY.md

## Homepage URL
https://aridawoodi.github.io/job-apply-assistant/

## Support URL
https://github.com/aridawoodi/job-apply-assistant/issues

## Images (store-assets/)
- Small promo tile 440x280: `store-assets/promo-tile-440x280.png`
- Screenshots 1280x800: `store-assets/screenshot-1-fill.png` … `screenshot-5-*.png` (v0.5: fill + checklists, resume match, cover letter, tour, tracker; fake data only, made by `scripts/make-store-assets.js` from `dev-tests/screenshots/v5/`)
- Store icon 128x128: `icons/icon128.png`
