/* Resume -> profile extraction (v0.6). Pure functions (no DOM), shared by the background worker
 * (which runs the local model), the importer pages and the node tests.
 * 1) sectionize(master): the parsed resume split into entries (one per job, school, certificate or
 *    project) without the model;
 * 2) rules: a rule-based reading of every entry. Used when the AI is off or fails, and to check the AI;
 * 3) prompts(sections): small strict prompts, one per section (education, experience, projects), each
 *    with a JSON schema (fixed degree list, completed / in progress / attended);
 * 4) combine(sections, ai): merges the AI's answers with the rules, keeping only facts found in the resume.
 * Skills, certifications, languages, contact details and links never need the model. */
(function (g) {
  'use strict';
  const JAA = g.JAA = g.JAA || {};
  const req = typeof require === 'function' ? require : null;
  const RS = () => (JAA.resume && JAA.resume.parseFile ? JAA.resume : req('./resume.js'));
  const D = () => (JAA.DEGREES ? JAA : req('./defaults.js').JAA);

  const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
  const MY_RE = new RegExp('\\b(' + MONTH + '\\s+)?((?:19|20)\\d\\d)\\b', 'gi');
  const str = v => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
  const lc = s => String(s || '').toLowerCase();
  const SEP_RE = /\s*\t\s*|\s+\|\s+|\s+—\s+|\s+–\s+(?=[A-Za-z(])|\s+-\s+(?=[A-Z])/;

  /* ---------------- degrees ---------------- */
  // spelled-out words (case-insensitive)
  const DEG_WORDS = [
    ['Doctorate', /\b(doctor of|doctorate|doctoral|ph\.?\s?d)\b/i],
    ["Master's", /\bmaster(['’]?s)?\b|\bmba\b/i],
    ["Bachelor's", /\bbachelor(['’]?s)?\b|\bbaccalaureate\b/i],
    ["Associate's", /\bassociate(['’]?s)?\s+(degree|of|in)\b/i],
    ['Bootcamp', /\bboot ?camp\b/i],
    ['High School', /\b(high school|secondary school|ged)\b/i],
    ['Certificate', /\b(certificate|diploma)\b/i]
  ];
  // abbreviations (case-sensitive; two-letter ones that are also US states need dots: M.S., M.A., M.D.)
  const ABBR = [
    ['Doctorate', 'Ph\\.?\\s?D|PhD|DPhil|Ed\\.D|J\\.D|M\\.D'],
    ["Master's", 'M\\.S\\.c?|M\\.Sc|MSc|M\\.A\\.|MBA|M\\.Eng|MEng|MPH|MFA|M\\.Ed|MEd|LLM|MS(?=\\s+(?:in\\s+)?[A-Z][a-z])|MA(?=\\s+(?:in\\s+)?[A-Z][a-z])'],
    ["Bachelor's", 'B\\.S\\.c?|B\\.Sc|BSc|BS|B\\.A\\.|BA|B\\.Eng|BEng|B\\.Tech|BTech|BBA|BFA|LLB'],
    ["Associate's", 'A\\.A\\.S\\.?|AAS|A\\.A\\.|A\\.S\\.']
  ];
  const abbrRe = (src, flags) => new RegExp('(^|[^A-Za-z])(' + src + ')\\.?(?![A-Za-z])', flags || '');
  const ABBR_ALL = abbrRe(ABBR.map(a => a[1]).join('|'), 'g');
  function degreeOf(text) {
    const t = String(text || '').replace(/,\s*[A-Z]{2}\b(?=\s*(,|$|—|–|-|\||\d))/g, ' ');
    for (const [lvl, re] of DEG_WORDS) if (re.test(t)) return lvl;
    for (const [lvl, src] of ABBR) if (abbrRe(src).test(t)) return lvl;
    return '';
  }
  function fieldFrom(tok) {
    let s = ' ' + String(tok || '') + ' ';
    s = s.replace(/\(([^)]*)\)/g, (m, inner) => (degreeOf(inner) ? ' ' : m));
    s = s.replace(/\b(bachelor|master|associate|doctor)(?:['’]?s)?(?:\s+degree)?(?:\s+of\s+(?:applied\s+)?(?:science|sciences|arts|engineering|technology|fine arts|business administration|philosophy|education|laws))?/ig, ' ');
    s = s.replace(ABBR_ALL, '$1 ');
    s = s.replace(/\b(degree|diploma|boot ?camp|certificate|program(me)?|candidate|doctorate|ph\.?\s?d)\b/ig, ' ');
    s = s.replace(/\s+/g, ' ').replace(/^[\s,;:.\-–—]*(?:(?:in|of)\s+)?/i, '').replace(/[\s,;:\-–—]+$/g, '').trim();
    if (!s && /business administration|\bMBA\b/i.test(tok)) s = 'Business Administration';
    return s;
  }

  /* ---------------- sections and entries ---------------- */
  function sectionize(master) {
    const blocks = (master && master.blocks) || [];
    const groups = new Map();
    for (const b of blocks) {
      if (b.type === 'heading' || !b.group || !/^(experience|projects|education|certifications)$/.test(b.section)) continue;
      let gr = groups.get(b.group);
      if (!gr) { gr = { id: b.group, section: b.section, lines: [], bullets: [] }; groups.set(b.group, gr); }
      (b.type === 'bullet' ? gr.bullets : gr.lines).push(String(b.text || '').trim());
    }
    const list = [...groups.values()].filter(x => x.lines.length);
    list.forEach(x => { x.text = x.lines.join(' | ').replace(/\t/g, ' | '); x.all = x.lines.concat(x.bullets).join('\n'); });
    const text = blocks.map(b => (b.type === 'bullet' ? '• ' : '') + b.text).join('\n');
    return {
      blocks, text,
      edu: list.filter(x => x.section === 'education' || x.section === 'certifications'),
      jobs: list.filter(x => x.section === 'experience'),
      projects: list.filter(x => x.section === 'projects'),
      hasSections: blocks.some(b => b.type === 'heading' && /^(experience|education|projects|skills)$/.test(b.section))
    };
  }

  /* ---------------- rules: one entry at a time ---------------- */
  function datesOf(text) {
    const m = String(text || '').match(RS().DATE_RANGE_RE);
    if (!m) return null;
    const cap = s => s.replace(/^(present|current|now|today)$/i, 'Present');
    return { raw: m[0], start: str((m[1] || '') + m[2]), end: cap(str((m[3] || '') + m[4])) };
  }
  function ruleEducation(e) {
    const { SCHOOL_RE, CERT_RE } = RS();
    const text = e.text;
    const r = { id: e.id, kind: '', school: '', degree: '', degreeText: '', field: '', start: '', end: '', location: '', status: 'completed', strong: {} };
    let rest = text;
    const dr = datesOf(text);
    const partial = /\bcredits?\b|\bcoursework\b|\bsome college\b|\bincomplete\b|\bnot completed\b|\bwithdrew\b/i.test(text);
    const expected = new RegExp('\\b(expected|anticipated|exp\\.)\\s*(' + MONTH + '\\s+)?((?:19|20)\\d\\d)', 'i').exec(text);
    if (dr) {
      r.start = dr.start; r.end = dr.end; rest = rest.replace(dr.raw, ' ');
      if (dr.end === 'Present') { r.status = 'in progress'; r.strong.status = true; }
    } else if (expected) {
      r.end = str((expected[2] || '') + expected[3]); r.status = 'in progress'; r.strong.status = true; rest = rest.replace(expected[0], ' ');
    } else {
      const ys = [...text.matchAll(MY_RE)].map(m => str(m[0]));
      if (ys.length >= 2) { r.start = ys[0]; r.end = ys[ys.length - 1]; } else if (ys.length === 1) { if (partial) r.start = ys[0]; else r.end = ys[0]; }
    }
    if (partial && r.status === 'completed') { r.status = 'attended'; r.strong.status = true; }
    rest = rest.replace(MY_RE, ' ');
    const toks = rest.split(/\s*(?:\||—|–(?=\s)|\s-\s|;|,)\s*/).map(str).filter(t => t && /[A-Za-z]/.test(t));
    let si = toks.findIndex(t => SCHOOL_RE.test(t));
    if (si >= 0) {
      const t = toks[si];
      const at = t.match(/^(.*?)\s+(?:at|from)\s+(.*)$/i); // "B.S. in Biology from State University"
      if (at && degreeOf(at[1]) && SCHOOL_RE.test(at[2])) { toks.splice(si, 1, at[1], at[2]); si++; }
      r.school = toks[si];
      const loc = [];
      for (let k = si + 1; k < toks.length && loc.length < 2; k++) {
        if (/^[A-Z][A-Za-z.'’ -]{1,30}$/.test(toks[k]) && !degreeOf(toks[k]) && !/credit|gpa|honou?rs|laude/i.test(toks[k])) loc.push(toks[k]); else break;
      }
      if (loc.length) r.location = loc.join(', ');
    }
    const degTok = toks.find((t, k) => k !== si && degreeOf(t)) || (si >= 0 && degreeOf(toks[si]) ? toks[si] : '');
    if (degTok) {
      r.degree = degreeOf(degTok); r.degreeText = degTok; r.strong.degree = true;
      r.field = degTok === r.school && r.degree !== 'Bootcamp' ? '' : fieldFrom(degTok);
      if (r.field === r.school) r.field = '';
    }
    if (SCHOOL_RE.test(text)) { r.kind = 'school'; r.strong.kind = true; }
    else if (r.degree && r.degree !== 'Certificate') { r.kind = 'school'; r.strong.kind = true; }
    else if (CERT_RE.test(text) || r.degree === 'Certificate') { r.kind = 'certification'; r.strong.kind = true; }
    else r.kind = e.section === 'certifications' ? 'certification' : 'other';
    if (e.section === 'certifications' && !SCHOOL_RE.test(text)) r.kind = 'certification';
    return r;
  }

  const TITLE_RE = /\b(engineer|developer|programmer|manager|analyst|administrator|director|intern|consultant|designer|scientist|lead|specialist|instructor|teacher|tutor|interpreter|translator|assistant|architect|officer|coordinator|associate|technician|representative|supervisor|head of|vp|vice president|president|founder|co-founder|owner|cashier|server|clerk|nurse|accountant|advis[eo]r|researcher|professor|lecturer|editor|writer|agent|operator|apprentice|fellow|trainee|contractor|freelancer?|chief|principal|staff|sre|devops|recruiter|strategist|marketer|planner|auditor|buyer|executive|attorney|paralegal|pharmacist|therapist|mechanic|electrician|driver|chef|cook|bartender|barista|receptionist|secretary)\b/i;
  const LOC_RE = /^([Rr]emote|[Hh]ybrid|[Oo]n-?site|[A-Z][A-Za-z.'’-]+(?: [A-Z][A-Za-z.'’-]+){0,2},\s*(?:[A-Z]{2}|[A-Z][a-z]+(?: [A-Z][a-z]+)?))(\s*\(([Rr]emote|[Hh]ybrid)\))?$/;
  const isLoc = p => LOC_RE.test(p) && !TITLE_RE.test(p);
  function piecesOf(line, dr) {
    let l = String(line || '');
    if (dr) l = l.replace(dr.raw, ' ');
    return l.split(SEP_RE).map(str).filter(p => p && /[A-Za-z]/.test(p));
  }
  // a job line with one date only ("IT Technician, Riverside Clinic   2016", "Since 2019", "2019 –"): the start
  // date; the end stays empty and is flagged for you (it might be a one-year job or a current one)
  const ONE_DATE_RE = new RegExp('(?:^|\\s)((?:since\\s+)?((?:' + MONTH + '\\s+)?(?:19|20)\\d\\d)(?:\\s*[-–—]\\s*)?)$', 'i');
  function oneDateOf(lines) {
    for (const l of lines) { const m = String(l || '').trim().match(ONE_DATE_RE); if (m) return { raw: m[1], start: str(m[2]), end: '', single: true }; }
    return null;
  }
  function ruleJob(e) {
    const dr = datesOf(e.lines.join('\n')) || oneDateOf(e.lines);
    const r = { id: e.id, title: '', company: '', location: '', start: dr ? dr.start : '', end: dr ? dr.end : '', single: !!(dr && dr.single) };
    const lines = e.lines.map(l => piecesOf(l, dr));
    const used = new Set();
    // the title: the first piece with a job-title word (first line preferred)
    for (let i = 0; i < lines.length && !r.title; i++) {
      const k = lines[i].findIndex(p => TITLE_RE.test(p));
      if (k >= 0) { r.title = lines[i][k]; used.add(i + ':' + k); }
    }
    for (let i = 0; i < lines.length; i++) {
      lines[i].forEach((p, k) => {
        if (used.has(i + ':' + k)) return;
        if (isLoc(p)) { if (!r.location) r.location = p; return; }
        if (!r.company && !TITLE_RE.test(p)) { r.company = p; used.add(i + ':' + k); }
      });
    }
    r.sure = !!(r.title && r.company && (r.start || r.end) && e.lines.length >= 2);
    if (!r.company || !r.title) { // "Data Engineer, Northwind Analytics" or "Data Engineer at Northwind"
      const one = (r.title || (lines[0] || [])[0] || '');
      const m = one.split(/,\s+|\s+at\s+|\s+@\s+/);
      if (m.length >= 2) {
        const ti = m.findIndex(x => TITLE_RE.test(x));
        if (ti >= 0) { r.title = m[ti]; r.company = r.company || m.filter((x, k) => k !== ti).join(', '); }
      }
      if (!r.company && !r.title && one) r.company = one;
    }
    return r;
  }
  function ruleProject(e, skills) {
    const dr = datesOf(e.lines.join('\n'));
    const first = piecesOf(e.lines[0], dr);
    const r = { id: e.id, name: first[0] || '', role: first.slice(1).join(' · '), start: dr ? dr.start : '', end: dr ? dr.end : '', link: '', description: '', bullets: e.bullets.slice(0, 15), tech: [] };
    const URL = new RegExp(RS().URL_RE.source, 'i');
    const desc = [];
    e.lines.slice(1).forEach(l => piecesOf(l, dr).forEach(p => { const u = p.match(URL); if (u && !r.link && u[0].length >= p.length - 2) r.link = u[0]; else desc.push(p); }));
    if (!r.link) { const u = e.all.match(URL); if (u) r.link = u[0]; }
    if (r.link && !/^https?:\/\//i.test(r.link)) r.link = 'https://' + r.link.replace(/[.)]+$/, '');
    r.description = desc.join(' · ');
    r.tech = techIn(e.all, skills);
    return r;
  }
  // skills from your own Skills section that a project's text mentions
  function techIn(text, skills) {
    const T = ' ' + lc(text).replace(/[^a-z0-9+#./]+/g, ' ').replace(/[./]+(?=\s|$)/g, ' ') + ' ';
    const out = [];
    for (const s of skills || []) {
      const base = str(String(s).replace(/\([^)]*\)/g, ' '));
      if (!base || base.length > 30) continue;
      const k = ' ' + lc(base).replace(/[^a-z0-9+#./]+/g, ' ').trim() + ' ';
      if (k.trim().length >= 2 && T.includes(k) && !out.some(o => lc(o) === lc(base))) out.push(base);
    }
    return out.slice(0, 15);
  }

  /* ---------------- skills, certifications, languages, basics ---------------- */
  function splitSkillText(body) {
    const out = [];
    let depth = 0, cur = '';
    for (const ch of body + ',') {
      if (ch === '(') depth++;
      if (ch === ')') depth = Math.max(0, depth - 1);
      if ((ch === ',' || ch === ';' || ch === '•' || ch === '|') && !depth) { out.push(cur); cur = ''; } else cur += ch;
    }
    const res = [];
    for (let t of out) {
      t = str(t).replace(/^(and|&)\s+/i, '').replace(/\.$/, '');
      if (!t) continue;
      if (t.length <= 60) { res.push(t); continue; }
      // a long "Power Platform (a, b, c, ...)" list: the name + each inner item; a long note in brackets
      // ("React (internal dashboards and admin panels)") stays one item
      const m = t.match(/^([^()]+)\((.*)\)\s*$/);
      if (m && /[,;]/.test(m[2])) { res.push(str(m[1])); splitSkillText(m[2]).forEach(x => res.push(x)); } else if (t.length <= 90) res.push(t);
    }
    return res;
  }
  function ruleSkills(blocks) {
    const items = [];
    const take = body => splitSkillText(body).forEach(x => items.push(x));
    for (const b of blocks.filter(x => x.section === 'skills' && x.type !== 'heading')) {
      // "Languages & Frameworks: a, b (c) Data & Reporting: d" -> the item lists after each label
      const t = String(b.text);
      const labels = [...t.matchAll(/(?:^|(?<=[\s)]))([A-Z][A-Za-z0-9&/+.'-]*(?: [A-Za-z0-9&/+.'-]+){0,4}):\s/g)];
      if (!labels.length) { take(t); continue; }
      if (labels[0].index > 0) take(t.slice(0, labels[0].index));
      labels.forEach((m, k) => take(t.slice(m.index + m[0].length, k + 1 < labels.length ? labels[k + 1].index : t.length)));
    }
    // "Tools: ..." / "Technologies: ..." lines anywhere (e.g. under a job)
    for (const b of blocks.filter(x => x.section !== 'skills' && x.type !== 'heading')) {
      const m = String(b.text).match(/^(tools|technologies|tech stack|stack|environment|skills)\s*:\s*(.+)$/i);
      if (m) take(m[2]);
    }
    const seen = new Set();
    const base = s => lc(s).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    return items.filter(s => { const k = base(s); if (!k || seen.has(k)) return false; seen.add(k); return true; }).slice(0, 80);
  }
  const LANGS = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Arabic', 'Kurdish', 'Turkish', 'Persian', 'Farsi', 'Dari', 'Pashto', 'Urdu', 'Hindi', 'Bengali', 'Punjabi', 'Gujarati', 'Tamil', 'Telugu', 'Marathi', 'Mandarin', 'Cantonese', 'Chinese', 'Japanese', 'Korean', 'Vietnamese', 'Thai', 'Tagalog', 'Filipino', 'Indonesian', 'Malay', 'Russian', 'Ukrainian', 'Polish', 'Czech', 'Slovak', 'Hungarian', 'Romanian', 'Bulgarian', 'Serbian', 'Croatian', 'Bosnian', 'Greek', 'Hebrew', 'Amharic', 'Somali', 'Swahili', 'Yoruba', 'Igbo', 'Hausa', 'Dutch', 'Swedish', 'Norwegian', 'Danish', 'Finnish', 'Armenian', 'Assyrian', 'Aramaic', 'Albanian', 'American Sign Language', 'ASL'];
  function ruleLanguages(blocks) {
    const src = blocks.filter(b => b.type !== 'heading' && (b.section === 'languages' || (b.section !== 'skills' && /lingual|fluent|native|speak|bilingual|languages?\s*:/i.test(b.text))));
    const out = [];
    for (const b of src) {
      const t = b.section === 'languages' ? b.text : (b.text.match(/[^.]*(?:lingual|fluent|native|speak|languages?\s*:)[^.]*/gi) || []).join(' ');
      for (const L of LANGS) if (new RegExp('\\b' + L + '\\b').test(t) && !out.includes(L)) out.push(L);
    }
    return out.slice(0, 10);
  }
  const US_STATES = 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR'.split(' ');
  function splitLocation(loc) {
    const parts = String(loc || '').split(/\s*,\s*/).filter(Boolean);
    if (parts.length < 2) return {};
    const last = parts[parts.length - 1];
    if (/^[A-Z]{2}$/.test(last) && US_STATES.includes(last)) return { city: parts[0], state: last, country: 'United States' };
    if (parts.length >= 3) return { city: parts[0], state: parts[1], country: last };
    return { city: parts[0], country: last };
  }
  function ruleBasics(blocks, text, jobs) {
    const res = RS();
    const det = res.deterministic(text);
    const head = blocks.filter(b => b.section === 'header');
    const headTxt = head.map(b => b.text).join(' | ');
    const hd = res.deterministic(headTxt);
    const name = res.guessName(blocks);
    const out = { firstName: name.firstName || '', lastName: name.lastName || '', email: det.email || '', phone: det.phone || '', linkedin: det.linkedin || '', github: det.github || '', portfolio: hd.portfolio || '', locationSource: '' };
    const hdr = headTxt.replace(res.EMAIL_RE, ' ').match(/\b([A-Z][a-zA-Z.'-]+(?: [A-Z][a-zA-Z.'-]+){0,3}),\s*([A-Z]{2}|[A-Z][a-z]+(?: [A-Z][a-z]+)?)\b(?!\w)/);
    if (hdr && !/linkedin|github|email|phone/i.test(hdr[1])) { out.location = hdr[1] + ', ' + hdr[2]; out.locationSource = 'header'; }
    else { const cur = (jobs || []).find(j => /present/i.test(j.end) && j.location && !/remote|hybrid/i.test(j.location)); if (cur) { out.location = cur.location.replace(/\s*\(.*\)$/, ''); out.locationSource = 'current job'; } }
    Object.assign(out, splitLocation(out.location));
    const sum = blocks.filter(b => b.section === 'summary' && b.type !== 'heading').map(b => b.text).join(' ');
    if (sum) { const sents = sum.match(/[^.!?]+[.!?]+(\s|$)/g) || [sum]; let s = ''; for (const x of sents) { if ((s + x).length > 450 && s) break; s += x; if (s.length > 160) break; } out.summary = str(s); }
    return out;
  }

  /* ---------------- prompts (one per section) ---------------- */
  const S = (props, req) => ({ type: 'object', properties: props, required: req || Object.keys(props) });
  const T = { type: 'string' };
  // Entries the rules read with confidence don't need the model (much faster on a small machine);
  // opts.all sends every entry (the importer's "Read again with AI").
  const eduSure = e => { const r = ruleEducation(e); return r.strong.kind && (r.kind === 'certification' || !!(r.school && r.degree && (r.start || r.end))); };
  function prompts(full, opts) {
    const all = !!(opts && opts.all);
    const sec = Object.assign({}, full, { edu: all ? full.edu : full.edu.filter(e => !eduSure(e)), jobs: all ? full.jobs : full.jobs.filter(e => !ruleJob(e).sure) });
    const out = [];
    const SYS = 'You read part of a resume and return facts as JSON. Copy names, titles, schools and dates EXACTLY as written. Never invent or guess; use "" when something is not there. One object per numbered entry, with the same id. Return only JSON.';
    if (sec.edu.length) {
      const DEG = D().DEGREES;
      out.push({ key: 'education', label: 'education', maxTokens: 60 + 75 * sec.edu.length,
        schema: S({ entries: { type: 'array', items: S({ id: T, kind: { type: 'string', enum: ['school', 'certification', 'other'] }, school: T, degree: { type: 'string', enum: DEG.concat(['']) }, field: T, start: T, end: T, location: T, status: { type: 'string', enum: ['completed', 'in progress', 'attended'] } }) } }),
        messages: [{ role: 'system', content: SYS },
          { role: 'user', content: 'EDUCATION entries:\n' + sec.edu.map(e => `[${e.id}] ${e.text}`).join('\n') +
            `\n\nReturn {"entries":[{"id":"","kind":"school | certification | other","school":"school name only","degree":"one of: ${DEG.join(', ')}","field":"field of study only, without the degree","start":"","end":"","location":"","status":"completed | in progress | attended"}]}\n` +
            'kind is "certification" for certificates, licenses and badges. status: "in progress" if the end is Present or Expected; "attended" if only credit hours or coursework are listed; otherwise "completed".' }] });
    }
    if (sec.jobs.length) {
      out.push({ key: 'jobs', label: 'work history', maxTokens: 60 + 60 * sec.jobs.length,
        schema: S({ jobs: { type: 'array', items: S({ id: T, title: T, company: T, location: T, start: T, end: T }) } }),
        messages: [{ role: 'system', content: SYS },
          { role: 'user', content: 'WORK EXPERIENCE entries (header lines only):\n' + sec.jobs.map(e => `[${e.id}] ${e.text}`).join('\n') +
            '\n\nReturn {"jobs":[{"id":"","title":"the job title(s) exactly as written","company":"the employer\'s name only (no city, no department)","location":"","start":"","end":"Present if current"}]}' }] });
    }
    if (sec.projects.length) {
      out.push({ key: 'projects', label: 'projects', maxTokens: 80 + 110 * sec.projects.length,
        schema: S({ projects: { type: 'array', items: S({ id: T, name: T, link: T, start: T, end: T, tech: { type: 'array', items: T } }) } }),
        messages: [{ role: 'system', content: SYS },
          { role: 'user', content: 'PROJECTS:\n' + sec.projects.map(e => `[${e.id}] ${e.text}\n   details: ${e.bullets.join(' ').slice(0, 500)}`).join('\n') +
            '\n\nReturn {"projects":[{"id":"","name":"project name only","link":"web address if one is written","start":"","end":"","tech":["each tool or technology named, copied exactly"]}]}' }] });
    }
    return out;
  }

  /* ---------------- combine AI + rules, check against the resume ---------------- */
  function byId(list, id) { return (Array.isArray(list) ? list : []).find(x => x && String(x.id || x.group || '').replace(/[^\w]/g, '') === id) || null; }
  function combine(sec, ai, parsed) {
    const res = RS();
    const dd = D();
    ai = ai || {};
    const text = (parsed && parsed.text) || sec.text;
    const out = { dropped: [], sources: {}, education: [], workHistory: [], projects: [], certifications: [] };
    const src = key => (!ai[key] ? 'rules' : ai[key].error ? 'rules (AI failed: ' + ai[key].error + ')' : 'ai');
    const ok = (v, et, share) => { v = str(v); return v && (share ? res.wordsInText(v, et, share) : res.inText(v, et)) ? v : ''; };
    // skills first (projects use them)
    const skills = ruleSkills(sec.blocks);
    // education + certifications
    const aiEdu = ai.education && ai.education.entries;
    for (const e of sec.edu) {
      const r = ruleEducation(e), m = byId(aiEdu, e.id) || {}, et = e.text;
      const kind = r.strong.kind ? r.kind : (['school', 'certification', 'other'].includes(m.kind) ? m.kind : r.kind);
      if (kind === 'certification' || (kind === 'other' && !r.school && !ok(m.school, et))) { out.certifications.push(str(e.lines.join(' — ').replace(/\t/g, ' '))); continue; }
      const mField = m.field ? fieldFrom(m.field) : '';
      const ed = {
        school: r.school || ok(m.school, et),
        degree: r.strong.degree ? r.degree : (dd.DEGREES.includes(m.degree) ? m.degree : r.degree),
        degreeText: r.degreeText,
        field: r.field || (mField && res.wordsInText(mField, et, 0.8) && mField !== r.school ? mField : ''),
        start: r.start || (r.strong.status && r.status === 'attended' ? '' : ok(m.start, et)),
        end: r.end || ok(m.end, et),
        location: r.location || ok(m.location, et, 0.8),
        status: r.strong.status ? r.status : (['completed', 'in progress', 'attended'].includes(m.status) ? m.status : r.status)
      };
      if (/present/i.test(ed.end)) ed.status = 'in progress';
      if (!ed.school && !ed.degree) { out.dropped.push('education: ' + et.slice(0, 60)); continue; }
      out.education.push(ed);
    }
    // what the AI said that isn't in the resume is listed on the review screen ("Left out ...")
    const known = new Set(sec.edu.concat(sec.jobs, sec.projects).map(e => e.id));
    const extra = (arr, fmt) => (Array.isArray(arr) ? arr : []).forEach(x => { if (x && !known.has(String(x.id || '').replace(/[^\w]/g, ''))) { const t = fmt(x); if (t) out.dropped.push(t); } });
    extra(aiEdu, x => x.school ? 'school: ' + str(x.school) : '');
    extra(ai.jobs && ai.jobs.jobs, x => x.company || x.title ? 'job: ' + str(x.title) + ' @ ' + str(x.company) : '');
    extra(ai.projects && ai.projects.projects, x => x.name ? 'project: ' + str(x.name) : '');
    const top = dd.highestEducation(out.education);
    out.education.forEach(e => { e.highest = e === top; });
    out.sources.education = sec.edu.length ? src('education') : 'none';
    // certifications from a Certifications section that has no entries (plain lines) are covered by groups above
    // jobs: only from the Experience section
    const aiJobs = ai.jobs && ai.jobs.jobs;
    for (const e of sec.jobs) {
      const r = ruleJob(e), m = byId(aiJobs, e.id) || {}, et = e.text;
      const mt = ok(m.title, et, 0.8), mc = ok(m.company, et);
      if (m.company && !mc) out.dropped.push('employer: ' + str(m.company));
      // the end date comes from the resume line only; the AI's "Present" is a hint shown as "Check this"
      const aiEnd = str(m.end), aiSaysNow = dd.isPresentEnd(aiEnd);
      const textNow = /\b(present|current(ly)?|now|today|ongoing)\b/i.test(e.lines.join(' '));
      const check = {};
      const j = {
        title: mt || r.title,
        company: mc && mc !== mt && !isLoc(mc) ? mc : r.company,
        location: r.location || ok(m.location, et, 0.8),
        start: r.start || ok(m.start, et),
        end: r.end || (aiSaysNow ? (textNow ? 'Present' : '') : ok(aiEnd, et)),
        bullets: e.bullets.slice(0, 25)
      };
      if (!j.company && !j.title) { out.dropped.push('job: ' + et.slice(0, 60)); continue; }
      if (aiSaysNow && !dd.isPresentEnd(j.end) && !r.end) check.end = 'The AI thinks this may be your current job, but your resume doesn\'t say "Present". Tick "I currently work here" if it is.';
      else if (r.single && !j.end) check.end = 'Your resume has only one date (' + j.start + ') here. Add the end date, or tick "I currently work here".';
      else if (!j.start && !j.end) { check.start = 'No dates found for this job.'; }
      if (mt && r.title && lc(mt) !== lc(r.title)) check.title = 'Read by the AI; the simple reader saw "' + r.title + '".';
      if (mc && r.company && lc(mc) !== lc(r.company) && j.company === mc) check.company = 'Read by the AI; the simple reader saw "' + r.company + '".';
      if (!j.title) check.title = 'No job title found.';
      if (!j.company) check.company = 'No company found.';
      out.workHistory.push(dd.normalizeJob(Object.assign(j, Object.keys(check).length ? { check } : {})));
    }
    out.workHistory = dd.sortJobs(out.workHistory);
    out.sources.jobs = sec.jobs.length ? src('jobs') : 'none';
    // projects: only from the Projects section, never added as jobs
    const aiProj = ai.projects && ai.projects.projects;
    for (const e of sec.projects) {
      const r = ruleProject(e, skills), m = byId(aiProj, e.id) || {};
      (Array.isArray(m.tech) ? m.tech : []).map(str).filter(t => t && !res.wordsInText(t, e.all, 0.99)).forEach(t => out.dropped.push('tech: ' + t));
      const mn = ok(m.name, e.text);
      const mlink = ok(m.link, e.all);
      const tech = r.tech.slice();
      const tb = t => lc(t).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
      (Array.isArray(m.tech) ? m.tech : []).map(str).filter(t => t && t.length <= 40 && res.wordsInText(t, e.all, 0.99)).forEach(t => { if (!tech.some(x => tb(x) === tb(t))) tech.push(t); });
      out.projects.push({ name: mn && mn.length <= r.name.length + 2 ? mn : (r.name || mn), link: r.link || (mlink ? (/^https?:/i.test(mlink) ? mlink : 'https://' + mlink) : ''), start: r.start || ok(m.start, e.text), end: r.end || ok(m.end, e.text), role: r.role, description: r.description, bullets: r.bullets, tech: tech.slice(0, 20) });
    }
    out.sources.projects = sec.projects.length ? src('projects') : 'none';
    // basics, skills, languages
    Object.assign(out, ruleBasics(sec.blocks, text, out.workHistory));
    out.skills = skills;
    out.languages = ruleLanguages(sec.blocks);
    const certSec = sec.blocks.filter(b => b.section === 'certifications' && b.type !== 'heading' && !b.group).map(b => b.text);
    certSec.forEach(c => { if (!out.certifications.includes(c)) out.certifications.push(c); });
    out.certifications = out.certifications.slice(0, 25);
    dd.syncCurrent(out); // currentEmployer / currentTitle / currentStartDate mirror the first current job
    const years = out.workHistory.map(j => +(String(j.start || '').match(/(19|20)\d\d/) || [])[0]).filter(Boolean);
    if (years.length) out.yearsExperience = String(Math.max(0, new Date().getFullYear() - Math.min(...years)));
    // a resume without recognisable sections: the old one-shot reading (if the AI gave one)
    if (ai.legacy && !ai.legacy.error && !sec.hasSections) {
      const L = Object.assign({}, ai.legacy);
      if (!L.workHistory && Array.isArray(L.jobs)) L.workHistory = L.jobs.map(j => Object.assign({}, j, { bullets: sec.blocks.filter(b => b.type === 'bullet' && b.group === String(j.group || '').replace(/[^\w]/g, '')).map(b => b.text) }));
      const v = res.validateExtraction(L, parsed || { blocks: sec.blocks, text });
      if (!out.workHistory.length) { out.workHistory = dd.sortJobs(v.workHistory.map(dd.normalizeJob)); dd.syncCurrent(out); }
      if (!out.education.length) { out.education = v.education.map(e => ({ school: e.school, degree: degreeOf(e.degree) || (dd.DEGREES.includes(e.degree) ? e.degree : ''), degreeText: e.degree, field: e.field || fieldFrom(e.degree), start: e.start, end: e.end, location: e.location, status: /present/i.test(e.end) ? 'in progress' : 'completed' })); const t2 = dd.highestEducation(out.education); out.education.forEach(e => { e.highest = e === t2; }); }
      if (!out.skills.length) out.skills = v.skills;
      if (!out.certifications.length) out.certifications = v.certifications;
      if (!out.languages.length) out.languages = v.languages;
      ['location', 'summary', 'currentEmployer', 'currentTitle', 'currentStartDate', 'yearsExperience'].forEach(k => { if (!out[k] && v[k]) out[k] = v[k]; });
      out.dropped = out.dropped.concat(v.dropped);
      out.sources.legacy = 'ai';
    }
    return out;
  }

  const api = { sectionize, prompts, combine, ruleEducation, ruleJob, ruleProject, ruleSkills, ruleLanguages, ruleBasics, degreeOf, fieldFrom, splitLocation, splitSkillText, techIn, TITLE_RE };
  JAA.extract = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : this);
