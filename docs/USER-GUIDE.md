# User guide

Details for people who want to know exactly what AI Job Application Assistant does. New here? Start with the
[README](../README.md).

## Submission tracking
The extension only **watches**. It never clicks Submit and never sends anything for you.

| Status | When it's set |
|---|---|
| **Filled** | You used ⚡ Fill on this job. |
| **Submitted** | You pressed Submit yourself (or Enter in the form). Waiting for the site's confirmation. |
| **Applied** | The site confirmed it: a confirmation URL (Greenhouse `/confirmation`, Lever `/thanks`, `…/thank-you`, `…/success`) or text like "Thank you for applying", "Application submitted!", "Your application was successfully submitted". |
| **Error - not sent** | After Submit, the form showed a validation error, the browser blocked it (required fields empty), or the site's server rejected it (HTTP 4xx/5xx). Fix it and press Submit again; the row goes back to Submitted, then Applied. |
| Interview / Offer / Rejected / Withdrawn | Set by you in Options. These are **never** overwritten automatically. |

How it works:
- **Your submit is detected three ways.** A form `submit` event, your click on the real
  Submit/Apply button, or the site's own POST to its apply endpoint. The POST is spotted by a
  read-only fetch/XHR observer (`content/netwatch.js`) that runs on the job site's page; it never
  changes, blocks or sends requests. Only real (trusted) clicks count, and nothing counts while ⚡ Fill
  is running.
- **Applications you submit without using Fill are tracked too.** A row is created from the page's
  company, title and URL.
- **Confirmation or error.** After a submit the page is watched for up to 90 seconds (DOM changes and
  URL changes). A *pending submission* is saved in `chrome.storage.local`, so a confirmation on the
  next page (e.g. Lever's `/thanks` after a full page load) is matched to the same job. Pending
  entries expire after 30 minutes.
- **One row per job.** The job page, `/apply`, `/application`, `/confirmation`, `/thanks` and a
  Greenhouse form embedded on a company site all map to one tracker row.
- **Feedback.** A toast appears at the top right of the page whenever the status changes. The toolbar
  icon shows a per-tab badge: **…** submitted, **✓** applied, **!** error. Both tracking and the badge can
  be switched off in Options → Local AI.
- **Tracker columns.** Options → Tracker shows *Submitted* and *Confirmed* times. The CSV export
  includes `submittedAt`, `confirmedAt`, `errorAt` and `lastError`. "Submitted" is the time of your
  most recent Submit press.
- The autofill submit guard (which cancels accidental form submits *during* a fill) is switched off the
  moment the fill finishes, so it can't block your own Submit.

Rows from v0.1.0 are upgraded in place on first load: a job key and empty timestamp fields are
added, and nothing is deleted. Duplicate v0.1 rows for the same job are merged.

## Answer learning (your answers → answer bank)
With **Remember my answers** on (the panel checkbox, on by default), the extension saves your own
answers for next time:
- What it learns: a yellow field you answered yourself, a blue AI draft you edited, or a green
  saved answer you corrected. Saving happens when you leave the field, when you press **Save answers
  now** in the panel, and when you press the site's Submit (so nothing is lost).
- No duplicates. A question that's the same or nearly the same as one already saved (e.g. "Preferred
  programming language" vs "What's your preferred programming language?") updates that entry instead.
- Next application: saved answers fill first, shown green and counted as "from your saved answers".
  The relevant ones are also given to the model as context.
- **Never learned:** file uploads, passwords, captcha / "not a bot", consent / terms / privacy /
  arbitration / certify boxes, signatures and signature dates, SSN / date of birth, salary, EEO
  questions, and personal questions unrelated to the job (pets, hobbies, family, religion, favourite
  things…). Unedited AI drafts aren't learned either, so the model never trains itself on its own guesses.
- **Company-specific answers** (a question or answer that names the company, like "Why Mockco?") are
  saved as a template with `{company}` in place of the name and tagged *company-specific*. By default
  templates are only shown to the model as an example to adapt, never pasted in directly. To have them
  auto-filled with the new company's name, turn on Options → "Reuse company-specific answers".
- Options → Answer bank shows where each entry came from ("learned · Greenhouse · Mockco · date" or
  "added by you"). You can edit or delete any entry. Turn learning off with the panel checkbox or in
  Options.

## Local AI speed (8 GB computers)
- **Warm-up.** When the floating button appears (and again when you press Fill), the extension tells
  Ollama to load the model and keep it in memory for 30 minutes. The panel shows "Loading local model…"
  until it's ready. Toggle this in Options → Local AI.
- **No thinking.** Every request sends `think: false`, `format: "json"`, a context of 4096 tokens and a
  cap on output length. Any `<think>…</think>` text a model still prints is stripped. If a model or older
  Ollama rejects the `think` option, the request is resent without it automatically.
- **Small batches, filled as they arrive.** Questions go to the model 5 at a time (essays 2 at a time),
  one batch after another. Each batch's answers appear on the page right away. Short factual questions
  (dropdowns, yes/no, years of experience) go first. Long "why us / tell us about" questions go last and
  get a concise 2–4 sentence **draft** built from your profile and the "Resume text" field (always blue:
  edit it).
- **Timeouts per batch.** The first batch waits up to 180 s (the model may still be loading) and later
  batches up to 90 s. Both, plus the batch size, are in Options → Local AI. A batch that times out is
  skipped and the other batches are kept. After 2 timeouts in a row it stops and suggests `qwen2.5:3b`.
- **↻ Retry AI for remaining** in the panel re-asks only the questions that are still empty.
  Anything you've already filled or edited is left alone.

## How filling works
1. **Collect.** `content/core.js` finds every input, textarea, select, radio group, checkbox
   group, combobox (react-select and ARIA comboboxes), file input, and Ashby's Yes/No
   buttons, and works out each question's label (`<label for>`, `aria-labelledby`, wrapping
   labels, fieldset legends, or nearby text).
2. **Deterministic match first.** Label keyword rules map questions to profile fields (name,
   email, work authorization, sponsorship, EEO, education, start date, signature, …), plus fuzzy
   matching against your answer bank. Options are matched with synonyms (for example "No military
   service" picks "I am not a protected veteran").
3. **Local AI only for leftovers.** Everything unmatched goes to Ollama in **small sequential batches**
   (`format: "json"`, temperature 0.1, `think: false`) with your profile and the relevant saved answers, asking for
   `{"answers": {"<field id>": value}}`. Answers must be picked from the listed options.
4. **Fill like a person would.** It uses the native value setter plus `input`/`change`/`blur` events so
   React forms register the value. It opens react-select menus and clicks the matching option,
   attaches your resume with `DataTransfer`, and ticks radios and checkboxes.
5. **Safety rails.** It never clicks anything labelled Submit/Apply/Next/Continue. While filling,
   any form `submit` event that the extension didn't cause is cancelled, except one that follows your own click or
   Enter key within 1.5 s (so a fill or menu peek can never swallow your real Submit). It doesn't overwrite fields you already filled (toggle in
   Options). It never sends EEO questions, salary, SSN/date of birth, consent/terms/arbitration
   boxes, or "prove you're not a bot" questions to the model. It doesn't guess facts the profile
   doesn't have, like your phone number or URLs.
6. **Track.** Each fill logs company, title, URL, date and counts to `chrome.storage.local`.

Ollama offline, model missing, or 403? The deterministic part still fills, the panel shows the exact fix,
and the remaining questions turn yellow.

Privacy: your profile, resume and tracker live only in this Chrome profile's local extension
storage. The only network calls the extension makes go to Ollama on your own computer (`http://127.0.0.1:11434` by default). See [PRIVACY.md](../PRIVACY.md).

## Troubleshooting
| Symptom | Fix |
|---|---|
| "Ollama refused the request (403)" | Open Setup (toolbar popup → Setup) → *Try the automatic fix*. The manual fallback is shown there too. |
| "Can't reach Ollama" | Open the Ollama app; `http://127.0.0.1:11434` in a browser tab should say "Ollama is running". |
| "Model … not found" | Setup → step 2 downloads it (or fix the model name in Settings → Local AI). |
| "AI timed out" / "0 by local AI" | Use `qwen2.5:3b` (Options → Local AI → Model). Close heavy tabs, press **↻ Retry AI for remaining**, or raise the per-batch / first-batch timeouts or lower the batch size in Options.  |
| No floating button | Make sure you're on the application form itself; use the toolbar popup instead. |
| A dropdown stayed yellow | The option text didn't match. Pick it yourself, or add an answer-bank entry with the exact option wording. |
| Changed code | `chrome://extensions` → reload ↻ the extension, then reload the job tab (data is kept). |
| Status stuck on Submitted | The site showed no recognisable confirmation within 90 s. Check your email and set it to Applied by hand. |
| Wrong "Error - not sent" | A message on the page looked like an error. Set the status by hand; it's logged in `lastError`. |
| Chat says a field "didn't stick" | The site reset it after filling (custom widget). Fill that one by hand; the Review step lists it. |
| Next step wasn't filled | Check Options → *Auto-fill next steps*, or press the button / type "fill again" in the chat. |
| Workday shows a sign-in or Create Account page | That's left to you on purpose. Sign in, and the assistant picks up on the first form step. |
| Lost data after a reinstall | Options → *Backups* → **Restore from file** with your last backup file. |
| Chat answers are slow | The first reply loads the model (up to a minute with 8 GB of memory). Later replies stream in. Use `qwen2.5:3b`. |

## Updating without losing data
Your profile, resume, answer bank, settings, chat history, tailored resumes and tracker live in
`chrome.storage.local` in your browser profile. Chrome Web Store updates keep them. A snapshot named
"before update" is taken automatically (Settings → Backups).

> ⚠️ **Removing the extension deletes all of its data**, including the automatic snapshots. Use
> **Settings → Backups → Backup to file** first and keep the file somewhere safe.

If you installed from source: replace the files in the same folder, then click the reload icon on the
extension card in `chrome://extensions`. Loading the new version from a different folder gives it a new,
empty storage.
