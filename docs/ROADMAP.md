# Roadmap & known limitations

## Done in v0.4.0
- Public, cross-platform release prep: setup wizard (Ollama download/detect, Origin rule, model pull),
  resume import (PDF/DOCX, local), tailored resumes (validated, DOCX in place, PDF, library, attach),
  practice page, privacy policy, store listing, CI.

## Known limitations (v0.4.0)
- **Origin rule** needs Chrome 110+ (declarativeNetRequest `initiatorDomains` + header removal). If a
  Chromium fork disables declarativeNetRequest, the manual `OLLAMA_ORIGINS` fallback is shown.
- If Ollama is moved to a non-local address in Settings, that host must be granted (only `127.0.0.1` and
  `localhost` are in the manifest).
- **Resume parsing** is layout-heuristic: two-column PDFs, text in images, tables used for layout and
  scanned resumes read poorly (no OCR). Word files read best. The small model sometimes misses a job or
  merges titles; the checklist is there to fix it.
- **In-place DOCX tailoring** rewrites a changed paragraph into its first text run: the paragraph style,
  bullet numbering, tabs and that run's font are kept, but mixed formatting inside a changed line (e.g. one
  bold word) becomes uniform. Unchanged lines are untouched. Text boxes, tables and headers/footers are
  not edited.
- **Page count** for Word output is an estimate (from the file's stored page count and text length).
  The PDF page count is exact. "Keep to N pages" is checked, not enforced by shrinking.
- **PDF masters** are rebuilt from a template (Helvetica, standard sections). Close to the original, not
  identical. Non-Latin characters outside Windows-1252 are replaced in the PDF export.
- **Fact checks** are deterministic heuristics (numbers, capitalised/technical terms, content-word overlap,
  duplicates, job scope). They block the common ways a small model invents things, but a reworded bullet
  can still shift emphasis: every change needs your approval.
- AI-only tailoring rules ("Lead with leadership") are passed to the model but can't be verified.
- The practice page runs the content scripts as an extension page; it doesn't exercise site-specific
  adapters.


## Done in v0.3.0
- Icon and branding, bigger floating button with count badge and pulse.
- Chat assistant panel: one question at a time, chips, drafts with Accept / Edit / Regenerate,
  free-form chat with streamed replies and validated single-field actions, per-job history.
- Review step with sources, jump links and checklist; non-blocking submit warning.
- Verify-after-fill with one retry; better labels (aria-labelledby/describedby, legends, ATS blocks).
- Writing style (samples, tone notes, draft length) for essays.
- Rolling backups (last 5) plus backup/restore files.
- Multi-step / multi-page sessions with auto-fill of next steps; basic Workday; LinkedIn Easy Apply fill-only.

## Next
- Edge Add-ons and Firefox (MV3) packages; optional host permission prompt for other ATS sites.
- Cover letters from the master resume + job description, with the same fact checks.
- OCR fallback for scanned PDF resumes (local, e.g. Tesseract WASM bundled).
- **Workday, beyond basic:** "My Experience" repeat blocks (work history / education "Add"), date
  pickers (`dateSectionMonth/Year`), multi-select prompts (`multiselectInputContainer`, e.g. skills,
  "How did you hear" with nested categories), the resume upload widget (`file-upload-input-ref`) and
  Workday's resume parser overwriting fields. Account creation stays manual.
- **LinkedIn Easy Apply:** more question types (typeahead locations, "Follow company" checkbox),
  submission tracking inside the modal. Keep it fill-only, one step at a time, no auto-navigation.
- Job finding side panel (public Greenhouse / Lever / Ashby board APIs for chosen companies).
- Model actions on more than one field per reply; per-field "explain this answer".

## Known limitations (carried over from v0.3.0)
- **Workday support is basic.** Text fields and dropdown buttons (`button[aria-haspopup=listbox]`) on each
  step work; custom date pickers, multi-select prompts, repeat sections and tenant-specific widgets often
  stay yellow. Sign-in / Create Account pages are skipped on purpose.
- **LinkedIn is fill-only** and only inside the Easy Apply modal. LinkedIn changes its DOM often; if the
  modal isn't recognised, nothing is filled. Submission tracking doesn't cover LinkedIn yet.
- **Step detection is heuristic:** a new step is a new step number / progress value, a URL change, or less
  than half of the visible fields overlapping with the last step. A form that reveals many conditional
  fields at once can look like a new step (it is then filled again, which only touches empty fields).
- If you press Next while a fill is still running, the new step is filled as soon as that fill finishes.
- **Model actions** change at most one field per reply, and never file uploads, consent/terms boxes,
  anti-bot questions, EEO, personal questions, SSN/date of birth or passwords. Options must match exactly.
- **Chat history is stored locally** per job (last 80 messages, 60 jobs). Personal answers typed into the
  chat while a personal question is shown are not stored or sent. Turn history off in Settings → Local AI.
- **Backups exclude the resume file** (to keep the 5 snapshots small). "Backup to file" includes it.
  Backups live in the extension's storage, so **Remove** deletes them too: keep a backup file.
- **Submit guard window:** while a fill runs, page submits are cancelled unless they follow your own
  click / Enter within 1.5 s. A site that auto-submits on its own during a fill would be held back (that's
  intended). Your Submit is never blocked by the warning toast.
- Answers are cached per question for the browser session; changing the profile, answer bank or
  settings clears the cache.
- Labels are inferred heuristically; unusual layouts may get a vague label (the AI then sees less context).
- Async comboboxes (location / school search) only work when the typed value returns a close match.
- Lever/Ashby sometimes parse the uploaded resume and overwrite fields; review after the upload settles
  (verify-after-fill catches some of this and lists "didn't stick" fields).
- The 3B model can be wrong on yes/no screening questions: every AI answer is blue so you check it.
  Essays from a 3–4B model are drafts; the writing-style samples help, but edit them.
- Max 30 open questions per fill (sent in batches of 5, essays in 2s); long dropdowns are trimmed to the
  40 most relevant options.
- Answer learning keys on the question label. Near-identical questions (≥85% similar) share one entry.
- The personal-question filter is a keyword list (pets, family, religion, hobbies, favourites…). Unusual
  wording could slip past it; check the answer bank in Options now and then.
- Submission tracking is heuristic (confirmation wording, error styling). Status can be changed by hand.
  Ashby/Greenhouse endpoint patterns weren't confirmed against real submissions (none were sent in testing).
