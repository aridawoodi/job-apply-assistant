/* Shared defaults + storage helpers. Loaded by the background worker,
 * the options page, the popup and the content scripts (no build step). */
(function (g) {
  'use strict';

  const DEFAULT_SETTINGS = {
    ollamaUrl: 'http://127.0.0.1:11434',
    model: 'qwen2.5:3b',
    useLLM: true,              // send unmatched questions to the local model
    aiEngine: 'auto',          // 'auto' (Chrome built-in → Ollama → rules), 'chrome' (Chrome only), 'ollama' (Ollama only)
    useRewriter: true,         // use Chrome Rewriter/Writer API to polish longer answers when available
    overwriteExisting: false,  // leave fields that already have a value alone
    showFloatingButton: true,  // floating "Fill" button on application pages
    llmTimeoutSec: 90,         // per AI batch
    llmFirstTimeoutSec: 180,   // first batch / model load (slow on 8 GB)
    llmBatchSize: 5,           // questions per AI request
    warmUp: true,              // pre-load the model when an application page opens
    rememberAnswers: true,     // learn your own answers into the answer bank
    learnCompanySpecific: false, // also reuse answers to "Why <Company>?" style questions directly
    trackSubmissions: true,    // watch for your own Submit + the confirmation page
    showBadge: true,           // ✓ / ! / ↑ badge on the toolbar icon for the current tab
    draftLength: 'short',      // essay drafts: short (2-4 sentences) | medium (4-6) | long (6-9)
    chatHistory: true,         // keep the assistant chat per job posting
    autoBackup: true,          // rolling snapshots of profile + answer bank + tracker (last 5)
    warnOnSubmit: true,        // toast if you press Submit while fields still need you
    autoFillSteps: true,       // multi-step forms: fill each new step automatically once you started
    preferredResumeFormat: 'both', // tailored resumes: 'pdf' | 'docx' | 'both'
    attachTailored: true,      // put this job's tailored resume (if you made one) into the resume upload
    tailoringRules: [],        // your own rules for tailoring, e.g. "Keep to 2 pages"
    // v0.5
    fieldToggles: {},          // per-field on/off for Fill ({ phone: false } = never fill phone); missing = on
    applicationEmail: '',      // separate email for job applications (used instead of the profile email)
    panelAuto: 'manual',       // 'auto' = open the assistant panel by itself on application pages
    showMatch: true,           // resume match card on job posting pages
    trackWithoutFill: true,    // track applications you submit yourself even if you never pressed Fill
    whatsNew: true,            // short "what's new" notice after an update
    refineToolbar: true,       // Refine-with-AI toolbar under long-answer boxes
    matchAI: false             // let the local AI refine the match keywords (slower; deterministic otherwise)
  };
  const DRAFT_LENGTHS = { short: '2-4 sentences', medium: '4-6 sentences', long: '6-9 sentences' };

  // Tracker statuses. AUTO_* are set by submission tracking; MANUAL ones are never
  // overwritten automatically.
  const STATUS = { FILLED: 'Filled', SUBMITTED: 'Submitted', APPLIED: 'Applied', ERROR: 'Error - not sent' };
  const MANUAL_STATUSES = ['Interview', 'Offer', 'Rejected', 'Withdrawn'];
  const ALL_STATUSES = ['Filled', 'Submitted', 'Applied', 'Error - not sent', 'Interview', 'Offer', 'Rejected', 'Withdrawn'];
  // v0.5 pipeline stages (the tracker stepper). `status` above still records what submission
  // tracking saw; `stage` is where the application is in your pipeline.
  const STAGES = [['saved', 'Saved'], ['applied', 'Applied'], ['screen', 'Screen'], ['interview', 'Interview'], ['offer', 'Offer'], ['rejected', 'Rejected']];
  const STAGE_LABEL = Object.fromEntries(STAGES.concat([['withdrawn', 'Withdrawn']]));
  function stageFromStatus(status) {
    const s = String(status || '');
    if (s === 'Interview') return 'interview';
    if (s === 'Offer') return 'offer';
    if (s === 'Rejected') return 'rejected';
    if (s === 'Withdrawn') return 'withdrawn';
    if (s === 'Submitted' || s === 'Applied') return 'applied';
    return 'saved'; // Filled, Error - not sent, bookmarks
  }
  // Fields to fill (Options → Fields to fill). key = toggle id; rules = core.js rule keys it covers.
  const FIELD_GROUPS = [
    ['Personal', [['firstName', 'First name'], ['lastName', 'Last name'], ['fullName', 'Full name'], ['preferredName', 'Preferred name'], ['pronouns', 'Pronouns'], ['email', 'Email'], ['phone', 'Phone'], ['location', 'Location', ['location', 'city', 'state', 'zip', 'country']], ['signature', 'Signature & date', ['signature', 'date']]]],
    ['Documents', [['resume', 'Resume upload'], ['coverLetter', 'Cover letter']]],
    ['Education', [['school', 'School'], ['degree', 'Degree', ['degree', 'discipline']], ['gradYear', 'Start / graduation year', ['eduStartYear', 'eduEndYear']]]],
    ['Experience', [['currentEmployer', 'Current company'], ['currentTitle', 'Current title'], ['yearsExperience', 'Years of experience'], ['jobDescription', 'Job descriptions (work history entries)']]],
    ['EEO', [['gender', 'Gender'], ['transgender', 'Transgender'], ['sexualOrientation', 'Sexual orientation'], ['ethnicity', 'Race / ethnicity'], ['hispanic', 'Hispanic or Latino'], ['veteran', 'Veteran status'], ['disability', 'Disability']]],
    ['Work authorization', [['workAuth', 'Work authorization'], ['sponsorship', 'Sponsorship'], ['citizenship', 'Citizenship']]],
    ['Links', [['linkedin', 'LinkedIn'], ['github', 'GitHub'], ['portfolio', 'Portfolio / website']]],
    ['Other', [['salary', 'Salary expectation'], ['availability', 'Availability / start date'], ['relocate', 'Relocation'], ['hearAbout', 'How did you hear about us'], ['bank', 'Saved answers (answer bank)'], ['ai', 'Local AI answers']]]
  ];
  const RULE_TO_TOGGLE = {};
  FIELD_GROUPS.forEach(([, items]) => items.forEach(([key, , rules]) => (rules || [key]).forEach(r => { RULE_TO_TOGGLE[r] = key; })));
  // false when the user switched this field off in Options → Fields to fill
  function fieldOn(settings, ruleKey) {
    const t = (settings && settings.fieldToggles) || {};
    const k = RULE_TO_TOGGLE[ruleKey] || ruleKey;
    return t[k] !== false;
  }

  // Stable id for a job posting, so the job page, /apply, /confirmation, /thanks and a
  // Greenhouse embed on a company site all map to the same tracker row.
  function jobKey(url) {
    let u;
    try { u = new URL(url); } catch (_) { return String(url || '').toLowerCase(); }
    const h = u.hostname.toLowerCase();
    const p = u.pathname.split('/').filter(Boolean);
    if (/(^|\.)greenhouse\.io$/.test(h)) {
      const id = (u.pathname.match(/\/jobs\/(\d+)/) || [])[1] || u.searchParams.get('token') || u.searchParams.get('gh_jid') || '';
      const board = (p[0] && p[0] !== 'embed' ? p[0] : u.searchParams.get('for')) || '';
      if (id) return `greenhouse:${board.toLowerCase()}:${id}`;
    }
    if (/(^|\.)(myworkdayjobs|myworkday|myworkdaysite)\.com$/.test(h)) {
      // .../job/<location>/<Title>_JR12345[/apply/...]
      const m = u.pathname.match(/\/job\/[^/]+\/[^/]*?_([A-Za-z]*-?\d[\w-]*)(?=\/|$)/) || u.pathname.match(/_(R-?\d+|JR-?\d+|\d{4,})(?=\/|$)/i);
      if (m) return `workday:${h.split('.')[0]}:${m[1].toLowerCase()}`;
    }
    if (/(^|\.)linkedin\.com$/.test(h)) {
      const id = (u.pathname.match(/\/jobs\/view\/(\d+)/) || [])[1] || u.searchParams.get('currentJobId');
      if (id) return `linkedin:${id}`;
    }
    if (/(^|\.)lever\.co$/.test(h) && p.length >= 2) return `lever:${p[0].toLowerCase()}:${p[1].toLowerCase()}`;
    if (/(^|\.)ashbyhq\.com$/.test(h) && p.length >= 2) return `ashby:${p[0].toLowerCase()}:${p[1].toLowerCase()}`;
    const path = u.pathname.replace(/\/(apply|application|thanks|thank-you|confirmation|success)\/?$/i, '').replace(/\/+$/, '');
    return (h + path).toLowerCase();
  }

  const EMPTY_PROFILE = {
    firstName: '', lastName: '', preferredName: '', pronouns: '',
    email: '', phone: '',
    city: '', state: '', country: '', zip: '', location: '',
    linkedin: '', github: '', portfolio: '', website: '',
    workAuthorizedUS: '', needsSponsorship: '', citizenship: '', over18: '',
    currentEmployer: '', currentTitle: '', currentStartDate: '', yearsExperience: '',
    education: { school: '', degree: '', field: '', location: '', startYear: '', endYear: '' },
    eeo: { gender: '', transgender: '', sexualOrientation: '', disability: '', veteran: '', ethnicity: '', hispanicLatino: '' },
    availability: '', noticePeriod: '', salaryExpectation: '',
    willingToRelocate: '', howDidYouHear: '',
    signature: '',
    summary: '',
    resumeText: '',
    // writing style for essay drafts (only sent to the local model for long answers)
    writingSamples: '',
    toneNotes: '',
    // filled by the resume import (v0.4)
    workHistory: [],   // [{company, title, location, start, end, bullets: []}]
    // v0.6: the education list is the main record; `education` above is kept in sync with the
    // entry marked highest (single-field forms use it).
    educationList: [], // [{school, degree (one of DEGREES), field, start, end, location, status (EDU_STATUS), highest, degreeText}]
    projects: [],      // [{name, link, start, end, role, description, bullets: [], tech: []}]
    skills: [], certifications: [], languages: []
  };

  /* ---- v0.6 education helpers (shared by Options, the importer, the content scripts and the background) ---- */
  const DEGREES = ['High School', "Associate's", "Bachelor's", "Master's", 'Doctorate', 'Certificate', 'Bootcamp', 'Other'];
  const DEGREE_RANK = { 'High School': 1, Certificate: 2, Bootcamp: 2, Other: 2, "Associate's": 3, "Bachelor's": 4, "Master's": 5, Doctorate: 6 };
  const EDU_STATUS = [['completed', 'Completed'], ['in progress', 'In progress'], ['attended', 'Attended (not completed)']];
  const yearOf = s => (String(s || '').match(/(19|20)\d\d/) || [''])[0];
  // the list, or (profiles from before v0.6) the single education entry as a one-item list
  function educationListOf(p) {
    if (p && Array.isArray(p.educationList) && p.educationList.length) return p.educationList;
    const e = (p && p.education) || {};
    return e.school ? [{ school: e.school, degree: e.degree || '', field: e.field || '', start: e.startYear || '', end: e.endYear || '', location: e.location || '', status: 'completed', highest: true }] : [];
  }
  // the entry marked highest, else the highest completed degree, else the highest of any
  function highestEducation(list) {
    list = (list || []).filter(e => e && (e.school || e.degree));
    if (!list.length) return null;
    const marked = list.find(e => e.highest);
    if (marked) return marked;
    const rank = e => DEGREE_RANK[e.degree] || 0;
    const done = list.filter(e => !e.status || e.status === 'completed');
    return (done.length ? done : list).slice().sort((a, b) => rank(b) - rank(a))[0];
  }
  // keep profile.education (single) in sync with the list; returns the profile
  function syncEducation(p) {
    const list = educationListOf(p).map(e => Object.assign({}, e));
    const top = highestEducation(list);
    list.forEach(e => { e.highest = e === top; });
    p.educationList = list;
    if (top) p.education = Object.assign({}, p.education || {}, { school: top.school || '', degree: top.degree || '', field: top.field || '', location: top.location || '', startYear: yearOf(top.start), endYear: top.status === 'completed' || !top.status ? yearOf(top.end) : '' });
    else if (!list.length && p.education) p.education = { school: '', degree: '', field: '', location: '', startYear: '', endYear: '' };
    return p;
  }

  /* ---- v0.6.6 work experience: one list, "current" comes from the end date ----
   * workHistory: [{ title, company, location, start, end, current, bullets, check? }] in your order (newest
   * first after an import). `current` is true exactly when the end date is Present / Current / Now; nothing
   * else (an AI guess, the word "current" in a bullet) can make a job current. `check` = { field: reason } for
   * fields the reader was unsure about ("Check this" on screen); it goes away when you edit that field.
   * currentEmployer / currentTitle / currentStartDate are kept only as a mirror of the first current job. */
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const PRESENT_RE = /^(present|current(ly)?|now|today|ongoing|to date|till date|till now)$/i;
  const isPresentEnd = s => PRESENT_RE.test(String(s == null ? '' : s).trim().replace(/[.)]+$/, ''));
  const monthNo = s => { const k = String(s || '').slice(0, 3).toLowerCase(); const i = MONTHS.findIndex(m => m.toLowerCase() === k); return i + 1; };
  // "Jan 2021", "January 2021", "Sept. 2019", "03/2020", "2020-03", "2019", "Present" -> { y, m } / { present }
  function parseWhen(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return null;
    if (isPresentEnd(s)) return { present: true };
    let m = s.match(/^([A-Za-z]{3,9})\.?,?\s+((?:19|20)\d\d)$/);
    if (m && monthNo(m[1])) return { y: +m[2], m: monthNo(m[1]) };
    m = s.match(/^(\d{1,2})\s*[/.-]\s*((?:19|20)\d\d)$/);
    if (m && +m[1] >= 1 && +m[1] <= 12) return { y: +m[2], m: +m[1] };
    m = s.match(/^((?:19|20)\d\d)\s*[/.-]\s*(\d{1,2})(?:[/.-]\d{1,2})?$/);
    if (m && +m[2] >= 1 && +m[2] <= 12) return { y: +m[1], m: +m[2] };
    m = s.match(/^((?:19|20)\d\d)$/);
    if (m) return { y: +m[1], m: 0 };
    m = s.match(/\b((?:19|20)\d\d)\b/);
    return m ? { y: +m[1], m: 0, fuzzy: true } : null;
  }
  const fmtWhen = w => !w ? '' : w.present ? 'Present' : w.y ? (w.m ? MONTHS[w.m - 1] + ' ' + w.y : String(w.y)) : '';
  // a sortable number; month unknown = start of the year for starts, end of the year for ends
  const whenKey = (s, isEnd) => { const w = parseWhen(s); if (!w) return null; if (w.present) return Infinity; return w.y * 12 + (w.m ? w.m - 1 : (isEnd ? 11 : 0)); };
  function endBeforeStart(j) {
    const a = parseWhen(j && j.start), b = parseWhen(j && j.end);
    if (!a || !b || a.present || b.present || !a.y || !b.y) return false;
    if (a.y !== b.y) return b.y < a.y;
    return !!(a.m && b.m && b.m < a.m);
  }
  // tidy one job; `current` is derived from the end date only
  function normalizeJob(j) {
    j = j && typeof j === 'object' ? j : {};
    const s = v => String(v == null ? '' : v).trim();
    const out = Object.assign({}, j, { title: s(j.title), company: s(j.company), location: s(j.location), start: s(j.start), end: s(j.end), current: false,
      bullets: (Array.isArray(j.bullets) ? j.bullets : String(j.bullets || '').split('\n')).map(s).filter(Boolean) });
    delete out.check;
    const check = Object.assign({}, j.check && typeof j.check === 'object' ? j.check : {});
    const w = parseWhen(out.start); if (w && !w.fuzzy && !w.present) out.start = fmtWhen(w);
    if (isPresentEnd(out.end)) { out.end = 'Present'; out.current = true; } else {
      const e = parseWhen(out.end); if (e && !e.fuzzy) out.end = fmtWhen(e);
      if (j.current === true && !out.end && !check.end) check.end = 'Marked as your current job, but no end date says "Present". Tick "I currently work here" if it is.';
    }
    Object.keys(check).forEach(k => { if (!check[k]) delete check[k]; });
    if (Object.keys(check).length) out.check = check;
    return out;
  }
  // newest first by end date (Present first); jobs with the same end keep their order (your main job, listed
  // first in the resume, stays first); jobs with no dates at all go last
  function sortJobs(list) {
    const k = j => { const e = whenKey(j.end, true); return e != null ? e : whenKey(j.start, false); };
    return list.map((j, i) => ({ j, i, k: k(j) })).sort((a, b) => (a.k == null) - (b.k == null) || (b.k != null && a.k != null && b.k !== a.k ? (b.k > a.k ? 1 : -1) : 0) || a.i - b.i).map(x => x.j);
  }
  const currentJobs = p => ((p && p.workHistory) || []).filter(j => j && j.current);
  // the single fields older code and some forms read, mirrored from the first current job
  function syncCurrent(p) {
    p.workHistory = (Array.isArray(p.workHistory) ? p.workHistory : []).map(j => Object.assign(j, { current: isPresentEnd(j.end) }));
    const c = currentJobs(p)[0];
    p.currentEmployer = c ? c.company : '';
    p.currentTitle = c ? String(c.title || '').split(/\s+[·|•]\s+|\s+\/\s+/)[0] : '';
    p.currentStartDate = c ? c.start : '';
    return p;
  }
  // once per profile: the old single "Current job" fields become a list entry (or mark the matching job),
  // the old values are kept in legacyCurrent, and the list is sorted newest first. Safe to run every load.
  const EXP_VERSION = 2;
  function migrateProfile(p) {
    p = p && typeof p === 'object' ? p : {};
    const list = (Array.isArray(p.workHistory) ? p.workHistory : []).filter(j => j && typeof j === 'object').map(normalizeJob);
    if ((p.expVersion || 0) < EXP_VERSION) {
      const emp = String(p.currentEmployer || '').trim(), title = String(p.currentTitle || '').trim();
      if (emp || title) {
        p.legacyCurrent = p.legacyCurrent || { employer: emp, title, startDate: String(p.currentStartDate || '').trim() };
        const norm = x => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
        const hit = list.find(j => emp ? norm(j.company) === norm(emp) : norm(j.title) === norm(title));
        if (!hit) list.unshift(normalizeJob({ company: emp, title, start: p.currentStartDate || '', end: 'Present' }));
        else if (!hit.end) { hit.end = 'Present'; hit.current = true; if (!hit.title && title) hit.title = title; }
        else if (!hit.current) hit.check = Object.assign({}, hit.check, { end: `Your old profile said this is your current job, but its end date is ${hit.end}. Tick "I currently work here" if you still work here.` });
      }
      p.workHistory = sortJobs(list);
      p.expVersion = EXP_VERSION;
    } else p.workHistory = list;
    return syncCurrent(p);
  }
  // Options can be open in two tabs (or next to the setup wizard). Saving a page must not undo what another
  // page saved meanwhile: keep the keys you changed on this page, take everything else from storage.
  function mergeEdits(base, mine, latest) {
    const out = Object.assign({}, latest || {});
    // key order doesn't matter (the same job can be built in a different order on each page)
    const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { o[k] = canon(v[k]); return o; }, {}) : v;
    const same = (a, b) => JSON.stringify(canon(a === undefined ? null : a)) === JSON.stringify(canon(b === undefined ? null : b));
    for (const k of new Set(Object.keys(mine || {}).concat(Object.keys(base || {})))) if (!same((mine || {})[k], (base || {})[k])) out[k] = (mine || {})[k];
    return Array.isArray(out.workHistory) ? syncCurrent(out) : out; // the mirrors follow whichever job list won
  }
  // split "Python, AWS (Lambda, ECS); SQL" on commas/semicolons outside parentheses
  function splitList(s) {
    const out = []; let depth = 0, cur = '';
    for (const ch of String(s || '') + ',') {
      if (ch === '(' || ch === '[') depth++;
      if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
      if ((ch === ',' || ch === ';' || ch === '\n') && !depth) { const t = cur.trim(); if (t) out.push(t); cur = ''; } else cur += ch;
    }
    return out;
  }
  // One item per line (certifications): commas stay inside an item, and a line that is only a year
  // (or a date) is joined to the item before it, so "AWS Cloud Practitioner, 2023" never becomes two.
  function splitLines(s) {
    const out = [];
    for (const raw of String(s || '').split(/\n/)) {
      const t = raw.replace(/\s+/g, ' ').trim(); if (!t) continue;
      if (out.length && /^[(\[]?((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? )?(19|20)\d\d[)\]]?$/i.test(t)) out[out.length - 1] += ' — ' + t.replace(/[()\[\]]/g, '');
      else out.push(t);
    }
    return out;
  }

  // Deep-merge `src` onto a copy of `base` (only keys present in base + extras kept).
  function merge(base, src) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (!src || typeof src !== 'object') return out;
    for (const k of Object.keys(src)) {
      const b = base ? base[k] : undefined;
      const v = src[k];
      if (b && typeof b === 'object' && !Array.isArray(b) && v && typeof v === 'object' && !Array.isArray(v)) {
        out[k] = merge(b, v);
      } else if (v !== undefined && v !== null) {
        out[k] = v;
      }
    }
    return out;
  }

  const hasChromeStorage = () => typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  async function loadAll() {
    const raw = hasChromeStorage()
      ? await chrome.storage.local.get(['profile', 'answerBank', 'settings', 'resume'])
      : {};
    return {
      profile: migrateProfile(merge(EMPTY_PROFILE, raw.profile)),
      answerBank: Array.isArray(raw.answerBank) ? raw.answerBank : [],
      settings: merge(DEFAULT_SETTINGS, raw.settings),
      resume: raw.resume || null
    };
  }

  /* ---- answer bank helpers (shared by background + options) ---- */
  const STOP = new Set('a an the of to in on for and or is are you your do does did be been have has with at by this that as from we our us please any if will would can could which what'.split(' '));
  const normText = s => String(s == null ? '' : s).toLowerCase().replace(/[\u2018\u2019']/g, '').replace(/[^a-z0-9{}]+/g, ' ').trim();
  const toks = s => normText(s).split(' ').filter(t => t.length > 1 && !STOP.has(t));
  function textSim(a, b) {
    const A = new Set(toks(a)), B = new Set(toks(b));
    if (!A.size || !B.size) return 0;
    let inter = 0; A.forEach(t => { if (B.has(t)) inter++; });
    const jacc = inter / (A.size + B.size - inter);
    const contain = inter >= 2 ? inter / Math.min(A.size, B.size) : 0;
    return Math.max(jacc, contain * 0.85);
  }
  // Questions that must never be learned (personal/unrelated or one-off legal/consent text).
  // Voluntary self-identification (EEO) and pronouns. These are ALWAYS empty by default ("Not set"):
  // an empty value leaves the form field yellow for the user. Nothing picks a value (not even "decline")
  // for the user; the model never sees or answers these; resume import never sets them.
  const EEO_KEYS = ['gender', 'transgender', 'sexualOrientation', 'ethnicity', 'hispanicLatino', 'veteran', 'disability'];
  const NO_ANSWER = "I don't wish to answer";
  const EEO_CHOICES = {
    gender: ['Male', 'Female', 'Non-binary', NO_ANSWER],
    transgender: ['No', 'Yes', NO_ANSWER],
    sexualOrientation: ['Heterosexual / straight', 'Gay', 'Lesbian', 'Bisexual', 'Queer', 'Asexual', NO_ANSWER],
    ethnicity: ['American Indian or Alaska Native', 'Asian', 'Black or African American', 'Hispanic or Latino', 'Middle Eastern or North African', 'Native Hawaiian or Other Pacific Islander', 'White', 'Two or more races', NO_ANSWER],
    hispanicLatino: ['No', 'Yes', NO_ANSWER],
    veteran: ['I am not a protected veteran', 'I identify as one or more of the classifications of protected veteran', NO_ANSWER],
    disability: ['No, I do not have a disability', 'Yes, I have a disability', NO_ANSWER],
    pronouns: ['he/him', 'she/her', 'they/them', NO_ANSWER]
  };
  // question text / section that marks a field as voluntary self-identification (normalised text)
  const EEO_TEXT = /\b(gender|gender identity|sex|transgender|trans|sexual orientation|race|racial|ethnicity|ethnic|hispanic|latin[oax]|veteran|military|armed forces|protected veteran|disabilit\w*|pronouns?|self identif\w*|voluntary self|equal employment|equal opportunity|eeo|eeoc|ofccp)\b/;
  // option sets that only appear on EEO questions
  const EEO_OPTION = /\b(white|black or african american|african american|asian|american indian|alaska native|pacific islander|native hawaiian|middle eastern|north african|two or more races|hispanic|latin[oax]|non binary|nonbinary|cisgender|transgender|heterosexual|bisexual|lesbian|gay|asexual|protected veteran|not a veteran|have a disability|do not have a disability|he him|she her|they them)\b/;
  function isEeoText(label, options) {
    if (EEO_TEXT.test(normText(label || ''))) return true;
    const opts = options || [];
    const hits = opts.filter(o => EEO_OPTION.test(normText(typeof o === 'string' ? o : (o && o.text) || ''))).length;
    // a few EEO-looking words in a long list ("Asian University of …", "Institute of American Indian Arts" among
    // 1,400 schools) don't make it a self-ID question
    return hits >= 2 && hits >= opts.length * 0.25;
  }

  const NEVER_LEARN = /\b(password|captcha|not a bot|social security|ssn|date of birth|birth ?date|bank|routing|credit card|pet|pets|dog|cat|hobby|hobbies|favou?rite (food|movie|color|colour|book)|spouse|wife|husband|children|kids|religio\w*|consent|i agree|agree to|acknowledge|terms|privacy|arbitrat\w*|attest\w*|certif(y|ication)|signature|e ?sign|today s date|date signed|text messages?|sms)\b/;
  // Merge learned {q,a,...} into a bank: update a similar existing question instead of duplicating.
  function mergeIntoBank(bank, learned) {
    const out = bank.slice();
    let added = 0, updated = 0;
    const now = new Date().toISOString();
    for (const e of learned) {
      if (!e || !e.q || e.a == null || String(e.a).trim() === '') continue;
      let i = out.findIndex(x => x && normText(x.q) === normText(e.q));
      if (i < 0) {
        let best = -1, bestS = 0;
        out.forEach((x, k) => { if (!x || !!x.companySpecific !== !!e.companySpecific) return; const sc = textSim(x.q, e.q); if (sc > bestS) { bestS = sc; best = k; } });
        if (bestS >= 0.85) i = best;
      }
      if (i >= 0) {
        if (String(out[i].a) !== String(e.a) || out[i].companySpecific !== e.companySpecific) {
          out[i] = Object.assign({}, out[i], { a: e.a, source: e.source || 'learned', site: e.site || out[i].site, company: e.company || out[i].company, url: e.url || out[i].url, companySpecific: !!e.companySpecific, updatedAt: now, uses: (out[i].uses || 0) + 1 });
          updated++;
        }
      } else {
        out.push({ q: e.q, a: e.a, source: e.source || 'learned', site: e.site || '', company: e.company || '', url: e.url || '', companySpecific: !!e.companySpecific, createdAt: now, updatedAt: now, uses: 1 });
        added++;
      }
    }
    return { bank: out, added, updated };
  }

  // Public repository (Report a problem opens a prefilled GitHub issue here). Replace before publishing.
  const REPO_URL = 'https://github.com/aridawoodi/job-apply-assistant';
  // The in-page bundle, in load order. Same list for the built-in sites (manifest content_scripts), the
  // popup's one-click injection (activeTab) and sites the user allowed (scripting.registerContentScripts).
  const CONTENT_FILES = ['lib/defaults.js', 'lib/match.js', 'lib/jobdetect.js', 'content/core.js', 'content/sites.js', 'content/ui.js', 'content/learn.js', 'content/chat.js', 'content/panel.js', 'content/refine.js', 'content/steps.js', 'content/track.js', 'content/main.js', 'content/match.js'];
  g.JAA = g.JAA || {};
  Object.assign(g.JAA, { CONTENT_FILES, EEO_KEYS, EEO_CHOICES, NO_ANSWER, EEO_TEXT, isEeoText, REPO_URL, VERSION: '0.6.7', DEGREES, DEGREE_RANK, EDU_STATUS, educationListOf, highestEducation, syncEducation, MONTHS, isPresentEnd, parseWhen, fmtWhen, whenKey, endBeforeStart, normalizeJob, sortJobs, currentJobs, syncCurrent, migrateProfile, mergeEdits, EXP_VERSION, splitList, splitLines, DRAFT_LENGTHS, STAGES, STAGE_LABEL, stageFromStatus, FIELD_GROUPS, RULE_TO_TOGGLE, fieldOn, normText, textSim, NEVER_LEARN, mergeIntoBank, DEFAULT_SETTINGS, EMPTY_PROFILE, STATUS, MANUAL_STATUSES, ALL_STATUSES, jobKey, merge, loadAll });
})(typeof self !== 'undefined' ? self : this);
