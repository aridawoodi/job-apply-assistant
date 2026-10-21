'use strict';
const $ = id => document.getElementById(id);
const YN = ['', 'Yes', 'No'];
// [path, label, type, options?]
const SECTIONS = [
  ['Contact', [['firstName', 'First name'], ['lastName', 'Last name'], ['preferredName', 'Preferred name'], ['pronouns', 'Pronouns'], ['email', 'Email', 'email'], ['phone', 'Phone', 'tel']]],
  ['Location', [['city', 'City'], ['state', 'State'], ['zip', 'ZIP'], ['country', 'Country'], ['location', 'Location as written on forms (e.g. "Nashville, TN")']]],
  ['Links', [['linkedin', 'LinkedIn URL', 'url'], ['github', 'GitHub URL', 'url'], ['portfolio', 'Portfolio URL', 'url'], ['website', 'Other website', 'url']]],
  ['Work authorization', [['workAuthorizedUS', 'Authorized to work in the US?', 'select', YN], ['needsSponsorship', 'Need visa sponsorship?', 'select', YN], ['citizenship', 'Citizenship'], ['over18', 'At least 18?', 'select', YN]]],
  ['Current job', [['currentEmployer', 'Current employer'], ['currentTitle', 'Current title'], ['currentStartDate', 'Start date (YYYY-MM)'], ['yearsExperience', 'Years of experience']]],
  ['Education', [['education.school', 'School'], ['education.degree', 'Degree'], ['education.field', 'Field of study'], ['education.location', 'School location'], ['education.startYear', 'Start year'], ['education.endYear', 'End year']]],
  ['Availability & preferences', [['availability', 'Earliest start date'], ['noticePeriod', 'Notice period'], ['salaryExpectation', 'Salary expectation (blank = you answer each time)'], ['willingToRelocate', 'Willing to relocate?', 'select', YN], ['howDidYouHear', 'Default "How did you hear about us?"']]],
  ['Voluntary self-identification (EEO)', [['eeo.gender', 'Gender'], ['eeo.transgender', 'Transgender?'], ['eeo.sexualOrientation', 'Sexual orientation'], ['eeo.disability', 'Disability'], ['eeo.veteran', 'Veteran status'], ['eeo.ethnicity', 'Race / ethnicity'], ['eeo.hispanicLatino', 'Hispanic or Latino?']]],
  ['Signature & summary', [['signature', 'E-signature (typed name)'], ['summary', 'Short professional summary (used by the AI for free-text answers)', 'textarea'], ['resumeText', 'Resume text (paste plain text; the AI uses it to draft long answers like "Why us?")', 'textarea']]]
];
const STYLE_FIELDS = [['toneNotes', 'Tone notes (e.g. "direct, warm, concrete examples, no buzzwords, short sentences")', 'textarea'], ['writingSamples', 'Writing samples: a few paragraphs you wrote yourself', 'textarea']];

const state = { profile: null, answerBank: [], settings: null, resume: null, applications: [] };
const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const set = (o, path, v) => { const ks = path.split('.'); let a = o; ks.slice(0, -1).forEach(k => { a[k] = a[k] || {}; a = a[k]; }); a[ks[ks.length - 1]] = v; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderProfile() {
  const root = $('profileForm');
  root.innerHTML = '';
  $('styleForm').innerHTML = '';
  for (const [title, fields] of SECTIONS.concat([['__style', STYLE_FIELDS]])) {
    const isStyle = title === '__style';
    if (!isStyle) { const h = document.createElement('h3'); h.textContent = title; root.appendChild(h); }
    const grid = isStyle ? $('styleForm') : document.createElement('div'); grid.className = 'grid';
    for (const [path, label, type, opts] of fields) {
      const l = document.createElement('label');
      l.textContent = label;
      let input;
      if (type === 'select') {
        input = document.createElement('select');
        opts.forEach(o => { const op = document.createElement('option'); op.value = o; op.textContent = o || '—'; input.appendChild(op); });
      } else if (type === 'textarea') {
        input = document.createElement('textarea');
        l.style.gridColumn = '1 / -1';
      } else {
        input = document.createElement('input'); input.type = type || 'text';
      }
      input.dataset.path = path;
      input.value = get(state.profile, path) || '';
      if (type === 'select' && input.value && !opts.includes(input.value)) {
        const op = document.createElement('option'); op.value = op.textContent = input.value; input.appendChild(op); input.value = get(state.profile, path);
      }
      l.appendChild(input); grid.appendChild(l);
    }
    if (!isStyle) root.appendChild(grid);
  }
  const ws = document.querySelector('[data-path="writingSamples"]'); if (ws) ws.rows = 8;
  renderJobs(root);
}

/* work history + skills (filled from your resume; editable here) */
const JOB_FIELDS = [['title', 'Title'], ['company', 'Company'], ['location', 'Location'], ['start', 'Start'], ['end', 'End']];
function renderJobs(root) {
  const p = state.profile;
  const h3 = document.createElement('h3'); h3.textContent = 'Work history'; root.appendChild(h3);
  const box = document.createElement('div'); box.className = 'jobs'; box.id = 'jobsBox'; root.appendChild(box);
  (p.workHistory || []).forEach((j, i) => {
    const d = document.createElement('div'); d.className = 'jobed';
    d.innerHTML = `<div class="grid">${JOB_FIELDS.map(([k, l]) => `<label>${l}<input type="text" data-job="${i}" data-jk="${k}" value="${esc(j[k] || '')}"></label>`).join('')}</div>
      <label style="margin-top:6px">Bullets (one per line)<textarea rows="3" data-job="${i}" data-jk="bullets">${esc((j.bullets || []).join('\n'))}</textarea></label>
      <button class="x" data-jobdel="${i}" type="button" title="Remove this job">× remove</button>`;
    box.appendChild(d);
  });
  const add = document.createElement('button'); add.type = 'button'; add.className = 'secondary'; add.textContent = '+ Add job';
  add.onclick = () => { readProfile(); (state.profile.workHistory = state.profile.workHistory || []).push({ company: '', title: '', location: '', start: '', end: '', bullets: [] }); renderProfile(); dirty(); };
  root.appendChild(add);
  box.querySelectorAll('[data-jobdel]').forEach(b => b.onclick = () => { readProfile(); state.profile.workHistory.splice(+b.dataset.jobdel, 1); renderProfile(); dirty(); });
  const h3b = document.createElement('h3'); h3b.textContent = 'Skills, certifications & languages (comma-separated)'; root.appendChild(h3b);
  const g = document.createElement('div'); g.className = 'grid';
  [['skills', 'Skills'], ['certifications', 'Certifications'], ['languages', 'Languages']].forEach(([k, l]) => {
    const lab = document.createElement('label'); lab.textContent = l; lab.style.gridColumn = '1 / -1';
    const ta = document.createElement('textarea'); ta.dataset.list = k; ta.value = (p[k] || []).join(', ');
    lab.appendChild(ta); g.appendChild(lab);
  });
  root.appendChild(g);
}

const fmtDay = d => d ? new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '';
function renderBank() {
  const tb = $('bankRows');
  tb.innerHTML = '';
  state.answerBank.forEach((row, i) => {
    const tr = document.createElement('tr');
    const src = row.source === 'learned'
      ? `learned${row.site ? ' · ' + esc(row.site) : ''}${row.company ? ' · ' + esc(row.company) : ''}<br>${esc(fmtDay(row.updatedAt || row.createdAt))}`
      : (row.source === 'manual' || !row.source ? 'added by you' + (row.updatedAt ? '<br>' + esc(fmtDay(row.updatedAt)) : '') : esc(row.source));
    tr.innerHTML = `<td><textarea data-i="${i}" data-k="q">${esc(row.q)}</textarea></td><td><textarea data-i="${i}" data-k="a">${esc(row.a)}</textarea></td>
      <td class="muted small">${src}${row.companySpecific ? '<br><span class="tagcs" title="Saved as a template: {company} is replaced with the company you apply to">company-specific</span>' : ''}</td>
      <td><button class="x" data-del="${i}" title="Delete">×</button></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('textarea').forEach(t => t.oninput = () => {
    const r = state.answerBank[+t.dataset.i];
    r[t.dataset.k] = t.value; r.updatedAt = new Date().toISOString();
    if (!r.source) r.source = 'manual';
    dirty();
  });
  tb.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { state.answerBank.splice(+b.dataset.del, 1); renderBank(); dirty(); });
}

function renderSettings() {
  for (const k of Object.keys(JAA.DEFAULT_SETTINGS)) {
    const el = $('s_' + k); if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!state.settings[k]; else el.value = state.settings[k];
  }
}
function readSettings() {
  for (const k of Object.keys(JAA.DEFAULT_SETTINGS)) {
    const el = $('s_' + k); if (!el) continue;
    state.settings[k] = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? Number(el.value) || JAA.DEFAULT_SETTINGS[k] : el.value.trim());
  }
}
function readProfile() {
  document.querySelectorAll('#profileForm [data-path], #styleForm [data-path]').forEach(el => set(state.profile, el.dataset.path, el.value.trim()));
  const jobs = state.profile.workHistory || [];
  document.querySelectorAll('#profileForm [data-job]').forEach(el => {
    const j = jobs[+el.dataset.job]; if (!j) return;
    j[el.dataset.jk] = el.dataset.jk === 'bullets' ? el.value.split('\n').map(x => x.trim()).filter(Boolean) : el.value.trim();
  });
  document.querySelectorAll('#profileForm [data-list]').forEach(el => { state.profile[el.dataset.list] = el.value.split(',').map(x => x.trim()).filter(Boolean); });
}

function renderResume() {
  const r = state.resume;
  $('resumeInfo').textContent = r ? `Master resume: ${r.name} (${Math.round((r.size || 0) / 1024)} KB). Drop a new file below to replace it.` : 'No resume saved yet. Drop your PDF or Word resume below.';
  $('resumeRemove').hidden = !r;
}
function mountImporter() {
  JAA.importer.mount($('importer'), {
    useAI: $('importAI').checked,
    onSaved: async () => { const all = await JAA.loadAll(); state.profile = all.profile; state.resume = all.resume; renderProfile(); renderResume(); $('saved').textContent = 'Profile updated from your resume'; }
  });
}

/* ---------- tailoring rules + saved resumes ---------- */
const RULE_EXAMPLES = ['Keep to 2 pages', 'Use US spelling', "Don't change job titles", 'Never remove my most recent job bullets', 'Never use the word "passionate"'];
function renderRules() {
  const ul = $('ruleList'); ul.innerHTML = '';
  const rules = state.settings.tailoringRules || [];
  if (!rules.length) ul.innerHTML = '<li class="muted">No rules yet. Add one below, or click an example.</li>';
  const parsed = JAA.tailor.parseRules(rules).notes;
  rules.forEach((r, i) => {
    const n = parsed.find(x => x.rule === r.trim());
    const li = document.createElement('li');
    li.innerHTML = `<span class="t">${esc(r)}</span>${n && n.check !== 'ai' ? '<span class="tagok">checked</span>' : '<span class="tagai">AI</span>'}<button class="x" data-rdel="${i}" type="button" title="Remove">×</button>`;
    ul.appendChild(li);
  });
  ul.querySelectorAll('[data-rdel]').forEach(b => b.onclick = () => { state.settings.tailoringRules.splice(+b.dataset.rdel, 1); renderRules(); dirty(); });
  const ex = $('ruleExamples'); ex.innerHTML = '<span class="muted">Examples:</span>';
  RULE_EXAMPLES.filter(e => !rules.includes(e)).forEach(e => { const b = document.createElement('button'); b.type = 'button'; b.className = 'ex'; b.textContent = '+ ' + e; b.onclick = () => addRule(e); ex.appendChild(b); });
}
function addRule(text) {
  text = String(text || '').trim(); if (!text) return;
  state.settings.tailoringRules = (state.settings.tailoringRules || []).concat([text]);
  renderRules(); dirty();
}
async function renderLibrary() {
  const { tailored = [] } = await chrome.storage.local.get('tailored');
  const tb = $('libRows'); tb.innerHTML = '';
  const list = tailored.slice().sort((a, b) => b.createdAt - a.createdAt);
  if (!list.length) { tb.innerHTML = '<tr><td colspan="6" class="muted">None yet. On a job page, type "tailor my resume for this job" in the assistant chat.</td></tr>'; return; }
  list.forEach(t => {
    const app = state.applications.find(a => a.tailoredId === t.id || (t.jobKey && a.key === t.jobKey));
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(fmtFull(t.createdAt))}</td><td>${t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.title || t.url)}</a>` : esc(t.title)}<div class="muted small">${esc(t.company)}</div></td>
      <td class="muted">${t.changes || 0} · ${t.pages || '?'} p.</td><td>${(t.files || []).map((f, k) => `<a class="dl" href="#" data-dl="${esc(t.id)}" data-k="${k}">⬇ ${/pdf/.test(f.mime) ? 'PDF' : 'Word'}</a>`).join('')}</td>
      <td class="muted">${app ? esc(app.status || '') : 'not in tracker'}</td><td><button class="x" data-tdel="${esc(t.id)}" type="button" title="Delete">×</button></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('[data-dl]').forEach(a => a.onclick = e => {
    e.preventDefault();
    const t = list.find(x => x.id === a.dataset.dl); const f = t && t.files[+a.dataset.k]; if (!f) return;
    const el = document.createElement('a'); el.href = f.dataUrl; el.download = f.name; el.click();
  });
  tb.querySelectorAll('[data-tdel]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this tailored resume?')) return;
    const { tailored: cur = [] } = await chrome.storage.local.get('tailored');
    await chrome.storage.local.set({ tailored: cur.filter(x => x.id !== b.dataset.tdel) });
    renderLibrary();
  });
}

const fmt = d => d ? new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
function renderApps() {
  const tb = $('appRows');
  tb.innerHTML = '';
  if (!state.applications.length) { tb.innerHTML = '<tr><td colspan="9" class="muted">Nothing yet. Fill or submit an application and it shows up here.</td></tr>'; return; }
  state.applications.forEach((a, i) => {
    const tr = document.createElement('tr');
    const statuses = JAA.ALL_STATUSES.includes(a.status) ? JAA.ALL_STATUSES : JAA.ALL_STATUSES.concat([a.status]);
    const cls = a.status === 'Applied' ? 'st-ok' : a.status === 'Error - not sent' ? 'st-err' : a.status === 'Submitted' ? 'st-wait' : '';
    tr.innerHTML = `<td>${esc(fmt(a.date))}</td><td>${esc(a.company)}</td><td><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title || a.url)}</a></td><td>${esc(a.site)}</td>
      <td class="muted">${a.filled != null ? `${a.filled || 0} / ${a.ai || 0} AI / ${a.todo || 0} open` : 'not filled'}</td>
      <td><select data-i="${i}" class="${cls}">${statuses.map(s => `<option${s === a.status ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>${a.lastError && a.status === 'Error - not sent' ? `<div class="bad small" title="${esc(a.lastError)}">${esc(a.lastError.slice(0, 80))}</div>` : ''}</td>
      <td>${esc(fmt(a.submittedAt))}</td><td>${esc(fmt(a.confirmedAt))}</td>
      <td><button class="x" data-del="${i}" title="Remove">×</button></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('select').forEach(s => s.onchange = async () => {
    const a = state.applications[+s.dataset.i];
    a.status = s.value;
    (a.history = a.history || []).push({ at: new Date().toISOString(), event: 'manual', detail: s.value });
    await chrome.storage.local.set({ applications: state.applications });
  });
  tb.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { state.applications.splice(+b.dataset.del, 1); await chrome.storage.local.set({ applications: state.applications }); renderApps(); });
}

let dirtyFlag = false;
const pageOpenedAt = new Date().toISOString();
function dirty() { dirtyFlag = true; $('saved').textContent = 'Unsaved changes'; }
async function save() {
  readProfile(); readSettings();
  state.answerBank = state.answerBank.filter(r => (r.q || '').trim() || (r.a || '').trim());
  // keep answers learned on a job tab while this page was open
  const { answerBank: stored = [] } = await chrome.storage.local.get('answerBank');
  const have = new Set(state.answerBank.map(r => JAA.normText(r.q)));
  stored.filter(r => r && r.source === 'learned' && (r.updatedAt || r.createdAt) > pageOpenedAt && !have.has(JAA.normText(r.q))).forEach(r => state.answerBank.push(r));
  await chrome.storage.local.set({ profile: state.profile, answerBank: state.answerBank, settings: state.settings });
  dirtyFlag = false;
  $('saved').textContent = 'Saved ' + new Date().toLocaleTimeString();
  renderBank();
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function csvCell(v) { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

async function importJson(file) {
  const text = await file.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { alert('That file is not valid JSON.'); return; }
  const profile = data.profile || (data.firstName !== undefined || data.email !== undefined ? data : null);
  if (!profile) { alert('No profile found in that file.'); return; }
  state.profile = JAA.merge(JAA.EMPTY_PROFILE, profile);
  if (Array.isArray(data.answerBank)) state.answerBank = data.answerBank.map(r => Object.assign({}, r, { q: r.q || r.question || '', a: r.a || r.answer || '' }));
  if (data.settings) state.settings = JAA.merge(JAA.DEFAULT_SETTINGS, data.settings);
  const toSet = { profile: state.profile, answerBank: state.answerBank, settings: state.settings };
  if (data.resume && data.resume.dataUrl) { state.resume = data.resume; toSet.resume = data.resume; }
  await chrome.storage.local.set(toSet);
  renderProfile(); renderBank(); renderSettings(); renderResume(); renderRules();
  $('saved').textContent = 'Imported ' + file.name;
}

/* ---------- backups ---------- */
const fmtFull = d => new Date(d).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const msg = m => new Promise(r => chrome.runtime.sendMessage(m, x => { void chrome.runtime.lastError; r(x || {}); }));
async function renderBackups() {
  const r = await msg({ type: 'backup:list' });
  const tb = $('backupRows'); tb.innerHTML = '';
  const list = (r.backups || []).slice().reverse();
  if (!list.length) { tb.innerHTML = '<tr><td colspan="5" class="muted">No snapshots yet (one is made automatically when your data changes).</td></tr>'; return; }
  list.forEach(b => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(fmtFull(b.at))}</td><td>${esc(b.reason)}</td><td>${esc(b.version || '')}</td><td class="muted">${b.counts ? `${b.counts.profile ? 'profile, ' : ''}${b.counts.answers} answers, ${b.counts.applications} applications` : ''}</td><td><button class="secondary" data-at="${b.at}" type="button">Restore</button></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('[data-at]').forEach(b => b.onclick = async () => {
    if (!confirm('Restore this snapshot? Your current data is snapshotted first, so you can undo this.')) return;
    const x = await msg({ type: 'backup:restore', at: Number(b.dataset.at) });
    $('backupOut').textContent = x.ok ? 'Restored ✓ Reloading…' : (x.error || 'Restore failed');
    if (x.ok) setTimeout(() => location.reload(), 600);
  });
}
async function backupToFile() {
  const all = await chrome.storage.local.get(['profile', 'answerBank', 'applications', 'settings', 'resume', 'chats', 'sessions']);
  const out = Object.assign({ kind: 'job-apply-assistant-backup', version: chrome.runtime.getManifest().version, exportedAt: new Date().toISOString() }, all);
  download(`job-apply-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out, null, 2), 'application/json');
  $('backupOut').textContent = `Saved backup file (${(all.answerBank || []).length} answers, ${(all.applications || []).length} applications${all.resume ? ', resume' : ''}).`;
}
async function restoreFromFile(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch (_) { alert('That file is not valid JSON.'); return; }
  const isBackup = data.kind === 'job-apply-assistant-backup' || (data.profile && (data.applications || data.answerBank));
  if (!isBackup) { alert('That is not a Job Apply Assistant backup file. (Profile exports can be loaded under Import / export.)'); return; }
  if (!confirm(`Restore from ${file.name}? It replaces your profile, answer bank, settings and tracker. Your current data is snapshotted first.`)) return;
  await msg({ type: 'backup:now', reason: 'before restore from file' });
  const toSet = {};
  ['profile', 'answerBank', 'applications', 'settings', 'resume', 'chats', 'sessions'].forEach(k => { if (data[k] !== undefined && data[k] !== null) toSet[k] = data[k]; });
  if (toSet.profile) toSet.profile = JAA.merge(JAA.EMPTY_PROFILE, toSet.profile);
  if (toSet.settings) toSet.settings = JAA.merge(JAA.DEFAULT_SETTINGS, toSet.settings);
  await chrome.storage.local.set(toSet);
  dirtyFlag = false;
  $('backupOut').textContent = 'Restored ✓ Reloading…';
  setTimeout(() => location.reload(), 600);
}
function initBackups() {
  $('backupFile').onclick = backupToFile;
  $('restoreFile').onchange = e => { const f = e.target.files[0]; if (f) restoreFromFile(f); e.target.value = ''; };
  $('backupNow').onclick = async () => { const r = await msg({ type: 'backup:now', reason: 'manual' }); $('backupOut').textContent = r.unchanged ? 'Nothing changed since the last snapshot.' : (r.ok ? 'Snapshot saved ✓' : 'Snapshot failed'); renderBackups(); };
  renderBackups();
}

(async function init() {
  const all = await JAA.loadAll();
  Object.assign(state, all);
  await new Promise(r => chrome.runtime.sendMessage({ type: 'tracker:migrate' }, () => { void chrome.runtime.lastError; r(); }));
  state.applications = (await chrome.storage.local.get('applications')).applications || [];
  renderProfile(); renderBank(); renderSettings(); renderResume(); renderApps(); renderRules(); mountImporter(); renderLibrary();
  $('importAI').onchange = mountImporter;
  if (!state.settings.useLLM) $('importAI').checked = false, mountImporter();
  $('ruleAdd').onclick = () => { addRule($('ruleNew').value); $('ruleNew').value = ''; };
  $('ruleNew').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('ruleAdd').click(); } };

  document.addEventListener('input', e => { if (e.target.closest('#profileForm, #ai, #style, #backups, #tailoring') && e.target.id !== 'ruleNew') dirty(); });
  document.addEventListener('change', e => { if (e.target.closest('#profileForm, #ai, #style, #backups, #tailoring') && e.target.id !== 'restoreFile' && e.target.id !== 'ruleNew') dirty(); });
  $('ver').textContent = 'v' + chrome.runtime.getManifest().version;
  initBackups();
  // deep links: options.html#profile, or a request from the chat/popup gear button
  const goto = section => { const el = document.getElementById(section); if (!el) return; el.scrollIntoView({ block: 'start' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1500); const first = el.querySelector('input, textarea, select'); if (first && section === 'profile') first.focus({ preventScroll: true }); };
  const takeGoto = async () => { const { optionsGoto } = await chrome.storage.local.get('optionsGoto'); if (optionsGoto && Date.now() - optionsGoto.at < 15000) { await chrome.storage.local.remove('optionsGoto'); goto(optionsGoto.section); } };
  if (location.hash.length > 1) setTimeout(() => goto(location.hash.slice(1)), 50); else takeGoto();
  chrome.storage.onChanged.addListener(ch => { if (ch.optionsGoto && ch.optionsGoto.newValue) takeGoto(); if (ch.backups) renderBackups(); });
  $('save').onclick = save;
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } });
  window.addEventListener('beforeunload', e => { if (dirtyFlag) { e.preventDefault(); e.returnValue = ''; } });

  $('bankAdd').onclick = () => { state.answerBank.push({ q: '', a: '', source: 'manual', createdAt: new Date().toISOString() }); renderBank(); dirty(); const t = document.querySelectorAll('#bankRows textarea'); if (t.length) t[t.length - 2].focus(); };

  $('resumeRemove').onclick = async () => { if (!confirm('Remove your master resume from this browser? (Your profile and saved tailored resumes stay.)')) return; state.resume = null; await chrome.storage.local.remove(['resume', 'resumeMaster']); renderResume(); };

  $('test').onclick = async () => {
    readSettings();
    $('testOut').className = 'muted'; $('testOut').textContent = 'Testing…';
    chrome.runtime.sendMessage({ type: 'ollama:test', settings: { ollamaUrl: state.settings.ollamaUrl, model: state.settings.model } }, r => {
      const out = $('testOut');
      if (!r) { out.className = 'bad'; out.textContent = 'No reply from background.'; return; }
      out.className = r.ok ? 'good' : 'bad';
      out.textContent = r.ok ? `Connected ✓  Model "${state.settings.model}" is ready. Installed: ${r.models.join(', ')}` : r.error + (r.models && r.models.length ? `\nInstalled: ${r.models.join(', ')}` : '');
    });
  };

  $('export').onclick = () => {
    readProfile(); readSettings();
    const out = { exportedAt: new Date().toISOString(), profile: state.profile, answerBank: state.answerBank, settings: state.settings };
    if ($('exportResume').checked && state.resume) out.resume = state.resume;
    download('job-apply-profile.json', JSON.stringify(out, null, 2), 'application/json');
  };
  $('import').onchange = e => { const f = e.target.files[0]; if (f) importJson(f); e.target.value = ''; };

  $('csv').onclick = () => {
    const cols = ['date', 'company', 'title', 'site', 'status', 'url', 'submittedAt', 'confirmedAt', 'errorAt', 'lastError', 'filled', 'ai', 'todo', 'firstFilled'];
    const rows = [cols.join(',')].concat(state.applications.map(a => cols.map(c => csvCell(a[c])).join(',')));
    download(`job-applications-${new Date().toISOString().slice(0, 10)}.csv`, rows.join('\n'), 'text/csv');
  };
  $('clearApps').onclick = async () => { if (!confirm('Delete every tracked application?')) return; state.applications = []; await chrome.storage.local.set({ applications: [] }); renderApps(); };

  chrome.storage.onChanged.addListener((ch) => {
    if (ch.applications) { state.applications = ch.applications.newValue || []; renderApps(); renderLibrary(); }
    if (ch.tailored) renderLibrary();
    if (ch.answerBank && !dirtyFlag) { state.answerBank = ch.answerBank.newValue || []; renderBank(); }
  });
})();
