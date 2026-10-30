// Node unit tests for v0.6.6 work experience: date / "current" parsing, newest-first order, the
// legacy single-job migration, the review -> profile save, the stale-tab merge and form fill.
// Fake data only (fixtures/casey-morgan-resume.pdf is a made-up person; see make-multijob.py).
// Run: node dev-tests/unit-exp.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.self = global;
global.pdfjsLib = require(path.join(ROOT, 'lib/vendor/pdf.min.js'));
pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(ROOT, 'lib/vendor/pdf.worker.min.js');
const JAA = require(path.join(ROOT, 'lib/defaults.js')).JAA || global.JAA;
const R = require(path.join(ROOT, 'lib/resume.js'));
const X = require(path.join(ROOT, 'lib/extract.js'));
let failures = 0;
const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) failures++; };
const J = o => JSON.stringify(o);
const parse = async f => { const b = fs.readFileSync(path.join(__dirname, 'fixtures', f)); return R.parseFile({ name: f, data: b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }); };
const has = fn => { if (typeof fn !== 'function') { check(false, 'missing helper'); return false; } return true; };

(async () => {
  console.log('dates and "current"');
  if (has(JAA.parseWhen) && has(JAA.isPresentEnd)) {
    const w = JAA.parseWhen;
    check(J(w('Jan 2021')) === J({ y: 2021, m: 1 }) && J(w('January 2021')) === J({ y: 2021, m: 1 }) && J(w('Sept. 2019')) === J({ y: 2019, m: 9 }), 'month names: Jan / January / Sept.');
    check(J(w('03/2020')) === J({ y: 2020, m: 3 }) && J(w('2020-03')) === J({ y: 2020, m: 3 }) && J(w('2019')) === J({ y: 2019, m: 0 }), 'numeric month formats and year only');
    check(w('Present').present && w('current').present && w('Now').present && w('Today').present && w('ongoing').present, 'Present / current / Now / Today / ongoing end a current job');
    check(w('') === null && w('Summer 2019').fuzzy && w('Summer 2019').y === 2019 && w('soon') === null, 'empty, fuzzy ("Summer 2019" keeps its year) and nonsense');
    check(JAA.isPresentEnd('Present') && JAA.isPresentEnd(' Current ') && !JAA.isPresentEnd('2021') && !JAA.isPresentEnd('Migrated the current ticket system') && !JAA.isPresentEnd('Nowhere'), 'only an end date that IS Present/Current/Now counts (not a sentence containing "current")');
    check(JAA.fmtWhen({ y: 2021, m: 1 }) === 'Jan 2021' && JAA.fmtWhen({ y: 2016, m: 0 }) === '2016', 'formats Month YYYY / YYYY');
    check(JAA.endBeforeStart({ start: 'Mar 2021', end: 'Jan 2021' }) && !JAA.endBeforeStart({ start: '2021', end: 'Jan 2021' }) && !JAA.endBeforeStart({ start: 'Jan 2021', end: 'Present' }), 'end-before-start check (same year without months is fine)');
  }

  console.log('resume import: 4 jobs with tricky dates (fixtures/casey-morgan-resume.pdf)');
  const cm = await parse('casey-morgan-resume.pdf');
  const sec = X.sectionize(cm);
  const f = X.combine(sec, {}, cm);
  const by = c => f.workHistory.find(j => j.company === c) || {};
  check(f.workHistory.length === 4, 'all 4 jobs read (' + f.workHistory.length + ')');
  check(by('Bluefin Devices').current === true && by('Bluefin Devices').end === 'Present', '"Jan 2021 – Present" is current');
  check(by('Lakeview Code Club').current === true, 'overlapping "2022 – Present" side job is current too (several current jobs are allowed)');
  check(by('Harbor Cloud').current === false && by('Harbor Cloud').start === '2019' && by('Harbor Cloud').end === '2021', '"2019–2021" with "current" in a bullet is NOT current');
  const rv = by('Riverside Clinic');
  check(rv.start === '2016' && rv.end === '' && rv.current === false && rv.check && rv.check.end, 'start-year-only job keeps "2016", is not current and its end is flagged "Check this": ' + J({ s: rv.start, e: rv.end, check: rv.check }));
  check(J(f.workHistory.map(j => j.company)) === J(['Bluefin Devices', 'Lakeview Code Club', 'Harbor Cloud', 'Riverside Clinic']), 'newest first by end date; jobs that are all "Present" keep the resume order (main job first): ' + f.workHistory.map(j => j.company).join(' > '));
  check(f.currentEmployer === 'Bluefin Devices' && f.currentTitle === 'Senior Support Engineer', 'current employer/title derived from the first current job: ' + f.currentEmployer);

  console.log('the AI is a hint only');
  const jobsSec = sec.jobs.map(e => ({ id: e.id }));
  const ai = { jobs: { jobs: sec.jobs.map(e => /Riverside|Harbor/.test(e.text) ? { id: e.id, end: 'Present' } : { id: e.id }) } };
  const f2 = X.combine(sec, ai, cm);
  const rv2 = f2.workHistory.find(j => j.company === 'Riverside Clinic') || {}, hb2 = f2.workHistory.find(j => j.company === 'Harbor Cloud') || {};
  check(jobsSec.length === 4 && rv2.current === false && rv2.end === '' && rv2.check && /AI/.test(rv2.check.end || ''), 'AI says "Present" for a job whose resume line has only "2016": not current, flagged for you: ' + J(rv2.check));
  check(hb2.current === false && hb2.end === '2021', 'AI "Present" never beats a real end date in the resume');

  console.log('review -> profile save keeps every job');
  const saved = R.applyToProfile(JAA.merge(JAA.EMPTY_PROFILE, { firstName: 'Casey', currentEmployer: 'Old Co', currentTitle: 'Old Title', workHistory: [{ company: 'Old Co', title: 'Old Title', start: '2015', end: 'Present' }] }), { workHistory: f.workHistory, currentEmployer: 'Ignored Inc' }, null);
  check(saved.workHistory.length === 4, 'saved exactly the 4 jobs shown (' + saved.workHistory.length + ')');
  check(saved.currentEmployer === (saved.workHistory.find(j => j.current) || {}).company && saved.currentEmployer !== 'Old Co' && saved.currentEmployer !== 'Ignored Inc', 'current employer/title follow the jobs marked current, not a stale single field: ' + saved.currentEmployer);

  console.log('migration from the single "Current job" fields (never drops data)');
  if (has(JAA.migrateProfile)) {
    const legacy = { currentEmployer: 'Acme Widgets', currentTitle: 'Analyst', currentStartDate: '2020-05', workHistory: [{ company: 'Beta Labs', title: 'Intern', start: '2018', end: '2019', bullets: ['Did things'] }] };
    const m1 = JAA.migrateProfile(JSON.parse(J(legacy)));
    check(m1.workHistory.length === 2 && m1.workHistory[0].company === 'Acme Widgets' && m1.workHistory[0].title === 'Analyst' && m1.workHistory[0].current && m1.workHistory[0].start === 'May 2020', 'legacy current job becomes a list entry (current, start May 2020): ' + J(m1.workHistory[0]));
    check(m1.workHistory[1].bullets[0] === 'Did things' && m1.legacyCurrent && m1.legacyCurrent.employer === 'Acme Widgets', 'existing jobs kept; the original single fields are kept in legacyCurrent');
    const m2 = JAA.migrateProfile(JSON.parse(J(m1)));
    check(J(m2) === J(m1), 'migration is idempotent');
    const m3 = JAA.migrateProfile({ currentEmployer: 'Beta Labs', currentTitle: 'Intern', workHistory: [{ company: 'beta labs', title: 'Intern', start: '2018', end: '' }] });
    check(m3.workHistory.length === 1 && m3.workHistory[0].current, 'matching job with no end date is the current one (no duplicate)');
    const m4 = JAA.migrateProfile({ currentEmployer: 'Beta Labs', workHistory: [{ company: 'Beta Labs', title: 'Intern', start: '2018', end: '2019' }] });
    check(m4.workHistory.length === 1 && !m4.workHistory[0].current && m4.workHistory[0].check && m4.workHistory[0].check.end && m4.legacyCurrent.employer === 'Beta Labs', 'a real end date wins over the old field, flagged "Check this" and the old value kept');
    const m5 = JAA.migrateProfile({ workHistory: [{ company: 'A', title: 'T', start: '2010', end: '2012' }, { company: 'B', title: 'T', start: '2019', end: 'Present' }, { company: 'C', title: 'T', start: '2014', end: '2018' }] });
    check(J(m5.workHistory.map(j => j.company)) === J(['B', 'C', 'A']) && m5.currentEmployer === 'B', 'old unsorted lists are sorted newest first once');
    const m6 = JAA.migrateProfile(Object.assign({}, m5, { workHistory: [m5.workHistory[2], m5.workHistory[0], m5.workHistory[1]] }));
    check(m6.workHistory[0].company === 'A', 'after migration your own order is respected (no re-sorting)');
    const m7 = JAA.migrateProfile({ workHistory: 'oops' });
    check(Array.isArray(m7.workHistory) && m7.workHistory.length === 0, 'a broken list becomes an empty list');
    const m8 = JAA.migrateProfile({ workHistory: [{ company: 'Z', title: 'T', start: '2020', end: '', current: true }] });
    check(!m8.workHistory[0].current && m8.workHistory[0].check && m8.workHistory[0].check.end, 'a stray current:true without "Present" is a hint, not a fact');
  }

  console.log('several current jobs, toggling current off');
  if (has(JAA.syncCurrent) && has(JAA.currentJobs)) {
    const p = JAA.migrateProfile({ workHistory: [{ company: 'Lakeview Code Club', title: 'Weekend Instructor', start: '2022', end: 'Present' }, { company: 'Bluefin Devices', title: 'Senior Support Engineer', start: 'Jan 2021', end: 'Present' }] });
    check(JAA.currentJobs(p).length === 2 && p.currentEmployer === 'Lakeview Code Club', 'two current jobs; forms use the first in your order');
    p.workHistory[0].end = 'Dec 2024'; JAA.syncCurrent(p);
    check(p.workHistory[0].current === false && p.currentEmployer === 'Bluefin Devices' && p.currentTitle === 'Senior Support Engineer', 'un-marking one moves "current employer" to the other');
    p.workHistory[1].end = '2025'; JAA.syncCurrent(p);
    check(p.currentEmployer === '' && p.currentTitle === '', 'no current job: current employer is blank (not a stale value)');
  }

  console.log('stale Options tab cannot overwrite a newer import');
  if (has(JAA.mergeEdits)) {
    const base = { phone: '1', workHistory: [{ company: 'Old Co' }], currentEmployer: 'Old Co' };
    const latest = { phone: '1', workHistory: [{ company: 'A', end: 'Present' }, { company: 'B', end: '2020' }], currentEmployer: 'A' };
    const mine = { phone: '555-0100', workHistory: [{ company: 'Old Co' }], currentEmployer: 'Old Co' };
    const out = JAA.mergeEdits(base, mine, latest);
    check(out.phone === '555-0100' && out.workHistory.length === 2 && out.currentEmployer === 'A', 'your edit (phone) is kept, the newer job list from the other tab is kept: ' + J(out));
    const eb = { educationList: [{ school: 'Old U' }], projects: [] }, el = { educationList: [{ school: 'Old U' }, { school: 'New U' }], projects: [{ name: 'P' }] };
    const eo = JAA.mergeEdits(eb, Object.assign({}, eb, { phone: '2' }), el);
    check(eo.educationList.length === 2 && eo.projects.length === 1, 'education and projects from the other tab are kept too');
    check(JAA.mergeEdits({ w: [{ a: 1, b: 2 }] }, { w: [{ b: 2, a: 1 }] }, { w: [] }).w.length === 0, 'the same job written with keys in another order is not "your change"');
    const mine2 = { phone: '1', workHistory: [{ company: 'Mine' }], currentEmployer: 'Old Co' };
    check(JAA.mergeEdits(base, mine2, latest).workHistory[0].company === 'Mine', 'a list you edited yourself wins');
  }

  console.log('many jobs');
  { const big = []; for (let i = 0; i < 300; i++) big.push({ title: 'T' + i, company: 'C' + i, start: 'Jan ' + (1990 + i % 35), end: i % 7 ? String(1991 + i % 35) : 'Present', bullets: ['x', 'y'] });
    const t0 = Date.now(); const mp = JAA.migrateProfile({ workHistory: big }); JAA.syncCurrent(mp); const ms = Date.now() - t0;
    check(mp.workHistory.length === 300 && ms < 200, '300 jobs migrated and sorted in ' + ms + ' ms'); }

  console.log('form fill uses the job(s) marked current');
  global.window = global; global.JAA = JAA; window.JAA = JAA;
  global.addEventListener = global.addEventListener || (() => {}); global.document = global.document || { addEventListener() {}, querySelectorAll: () => [] };
  require(path.join(ROOT, 'content/core.js'));
  const C = JAA.core;
  const prof = JAA.migrateProfile ? JAA.migrateProfile(JAA.merge(JAA.EMPTY_PROFILE, { workHistory: [{ company: 'Harbor Cloud', title: 'Support Engineer', start: '2019', end: '2021' }, { company: 'Bluefin Devices', title: 'Senior Support Engineer', start: 'Jan 2021', end: 'Present' }], currentEmployer: 'Stale Corp', expVersion: 2 })) : {};
  const data = { profile: prof, answerBank: [], settings: JAA.DEFAULT_SETTINGS };
  const v = label => { const r = C.resolve({ kind: 'text', label, name: '', idAttr: '', el: null }, data); return r && r.value; };
  check(v('Current employer') === 'Bluefin Devices' && v('Current title') === 'Senior Support Engineer', 'current employer/title = the job marked current even when it is not first: ' + v('Current employer'));
  check(v('Most recent employer') === 'Bluefin Devices', 'most recent employer = the current one');
  prof.workHistory[1].end = 'Jun 2024'; JAA.syncCurrent(prof);
  check(!v('Current employer') && v('Most recent employer') === 'Harbor Cloud', 'no current job: "current employer" is left for you; "most recent" = first in your list: ' + J([v('Current employer'), v('Most recent employer')]));

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
