// Node unit tests for the v0.6 resume import (no browser): PDF parsing of a made-up resume whose layout
// broke v0.5 (fixtures/sam-taylor-resume.pdf), rule-based reading, AI answers checked against the resume,
// merging into the profile, the education list helpers and multi-entry form fill rules.
// Run: node dev-tests/unit-v6.js
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
const parse = async f => { const b = fs.readFileSync(path.join(__dirname, 'fixtures', f)); return R.parseFile({ name: f, data: b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }); };
const J = o => JSON.stringify(o);

(async () => {
  console.log('PDF parsing (fixtures/sam-taylor-resume.pdf)');
  const sam = await parse('sam-taylor-resume.pdf');
  const eduB = sam.blocks.filter(b => b.section === 'education' && b.type !== 'heading');
  check(eduB.length === 7, 'education & certifications: 7 separate lines, none glued together (' + eduB.length + ')');
  check(new Set(eduB.map(b => b.group)).size === 7, 'each school / certificate is its own entry');
  const skB = sam.blocks.filter(b => b.section === 'skills' && b.type !== 'heading');
  check(skB.some(b => /^Data & Reporting:/.test(b.text)) && !skB.some(b => /admin panels\) Data/.test(b.text)), '"Category:" skills lines are not merged');
  const plat = skB.find(b => /^Platforms & Cloud/.test(b.text));
  check(plat && /Jira, Figma$/.test(plat.text), 'a skills line that wraps is still joined');

  const sec = X.sectionize(sam);
  check(sec.edu.length === 7 && sec.jobs.length === 3 && sec.projects.length === 1, `sections: ${sec.edu.length} education, ${sec.jobs.length} jobs, ${sec.projects.length} project`);

  console.log('rule-based reading (AI off)');
  const f = X.combine(sec, {}, sam);
  const ed = f.education;
  check(ed.length === 4, 'four schools: ' + ed.map(e => e.school).join(' | '));
  const by = n => ed.find(e => e.school.includes(n)) || {};
  check(J([by('Lakeside').degree, by('Lakeside').field, by('Lakeside').start, by('Lakeside').end, by('Lakeside').status]) === J(["Master's", 'Data Science', '2022', '', 'attended']), 'M.S. with credit hours only: Master\'s, Data Science, started 2022, attended: ' + J(by('Lakeside')));
  check(by('Example Coding').degree === 'Bootcamp' && by('Example Coding').field === 'Web Development' && by('Example Coding').end === '2016', 'bootcamp: ' + J(by('Example Coding')));
  check(by('Riverbend').degree === "Bachelor's" && by('Riverbend').start === '2012' && by('Riverbend').end === '2014' && by('Riverbend').location === 'Dallas, TX' && by('Riverbend').status === 'attended', 'B.S. 2012–2014 in Dallas: ' + J(by('Riverbend')));
  const top = by('Northgate');
  check(top.degree === "Bachelor's" && top.field === 'Information Systems / Software Engineering' && top.start === '2006' && top.end === '2010' && top.status === 'completed' && top.location === 'Springfield, IL', 'completed bachelor\'s: ' + J(top));
  check(top.highest && ed.filter(e => e.highest).length === 1, 'highest degree = the completed bachelor\'s (not the unfinished master\'s)');
  check(J(f.certifications) === J(['Kubernetes Administrator Certificate, 2024', 'Example Learn: Cloud training badges', 'Cloud Practitioner, 2022']), 'certifications kept apart: ' + J(f.certifications));
  check(f.workHistory.length === 3, 'three jobs');
  const w0 = f.workHistory[0];
  check(w0.title === 'Senior Developer · Platform Engineer · Technology Analyst' && w0.company === 'Fabrikam' && w0.location === 'Austin, TX' && w0.start === '2020' && w0.end === 'Present' && w0.bullets.length === 3, 'job 1: ' + J(Object.assign({}, w0, { bullets: w0.bullets.length })));
  check(f.workHistory[2].company === 'Example Language Services / Contoso Linguists (CLS)' && f.workHistory[2].location === 'Springfield, IL', 'job 3 company / location');
  check(!f.workHistory.some(j => /tidepool/i.test(j.company + j.title)), 'the project is not a job');
  const pr = f.projects[0] || {};
  check(f.projects.length === 1 && pr.name === 'Tidepool' && pr.link === 'https://tidepool.example.com' && pr.start === '2024' && pr.end === 'Present' && pr.bullets.length === 2, 'project: ' + J(Object.assign({}, pr, { bullets: (pr.bullets || []).length })));
  check(['PostgreSQL', 'Supabase', 'Vercel', 'Figma'].every(t => (pr.tech || []).includes(t)), 'project tech from your skills: ' + J(pr.tech));
  const want = ['Python', 'Go', 'TypeScript/JavaScript and React (internal dashboards and admin panels)', 'Grafana (dashboards)', 'Excel/VBA', 'AWS (Lambda, ECS)', 'Terraform (infrastructure as code)', 'Power Platform', 'Copilot Studio', 'Dataverse', 'Docker', 'Google Cloud', 'Django'];
  check(want.every(w => f.skills.includes(w)), 'skills incl. long and bracketed items and the job\'s "Tools:" line (' + f.skills.length + '): missing ' + J(want.filter(w => !f.skills.includes(w))));
  check(!f.skills.some(s => /:|^Data &|^Languages &/.test(s)) && !f.skills.includes('Terraform') && f.skills.length >= 25, 'no category labels or duplicates in skills');
  check(J(f.languages) === J(['English', 'Spanish']), 'languages: ' + J(f.languages));
  check(f.email === 'sam.taylor@example.com' && f.phone === '(555) 010-0142' && /sam-taylor-example$/.test(f.linkedin) && /github\.com\/sam-taylor-example$/.test(f.github), 'contact + links');
  check(f.portfolio === '', 'portfolio only from header links (the project site is not a portfolio)');
  check(f.location === 'Austin, TX' && f.city === 'Austin' && f.state === 'TX' && f.country === 'United States' && f.locationSource === 'current job', 'location from the current job, split into city/state/country');
  check(f.currentEmployer === 'Fabrikam' && f.currentTitle === 'Senior Developer', 'current job');

  console.log('AI prompts');
  const fast = X.prompts(sec), all = X.prompts(sec, { all: true });
  check(fast.map(p => p.key).join() === 'projects', 'entries the rules read with confidence are not sent to the AI (fast): ' + fast.map(p => p.key).join());
  check(all.map(p => p.key).join() === 'education,jobs,projects', '"Read again with AI" sends every section');
  const edS = all[0].schema.properties.entries.items.properties;
  check(edS.degree.enum.includes("Master's") && edS.degree.enum.includes('Bootcamp') && edS.status.enum.join() === 'completed,in progress,attended', 'education schema: fixed degree list + status');
  check(!all.some(p => /•/.test(p.messages[1].content.split('details:')[0]) && p.key === 'jobs'), 'job prompt has header lines only (no bullets)');
  check(all.every(p => p.messages.map(m => m.content).join('').length < 4000), 'each prompt is small (<4000 chars)');

  console.log('AI answers are checked against the resume');
  const ids = sec.edu.map(e => e.id), jid = sec.jobs.map(e => e.id);
  const ai = {
    education: { entries: [
      { id: ids[3], kind: 'school', school: 'Lakeside State University', degree: "Master's", field: 'Data Science', start: '2023', end: '2026', location: 'Texas, USA', status: 'completed' }, // invented dates
      { id: ids[6], kind: 'other', school: 'Northgate Technical Institute', degree: 'PhD', field: 'Underwater Basket Weaving', start: '2006', end: '2010', location: '', status: 'completed' }, // bad enum + invented field
      { id: 'g999', kind: 'school', school: 'Imaginary University', degree: "Master's", field: 'Magic', start: '2001', end: '2002', location: '', status: 'completed' }
    ] },
    jobs: { jobs: [{ id: jid[1], title: 'Support Analyst', company: 'Imaginary Corp', location: '', start: '2016', end: '2020' }, { id: 'g998', title: 'Chief Wizard', company: 'Imaginary Corp', start: '2010', end: '2012' }] },
    projects: { projects: [{ id: sec.projects[0].id, name: 'Tidepool', link: 'tidepool.example.com', start: '2024', end: 'Present', tech: ['TypeScript', 'React', 'Kubernetes Operator', 'Vercel'] }] }
  };
  const fa = X.combine(sec, ai, sam);
  check(fa.education.length === 4 && !fa.education.some(e => /Imaginary/.test(e.school)), 'an invented school is ignored');
  const lk = fa.education.find(e => /Lakeside/.test(e.school));
  check(lk.start === '2022' && lk.end === '' && lk.status === 'attended', 'invented dates / status lose to what the resume says: ' + J(lk));
  const ng = fa.education.find(e => /Northgate/.test(e.school));
  check(ng.degree === "Bachelor's" && ng.field === 'Information Systems / Software Engineering', 'degree outside the fixed list and an invented field are dropped');
  check(fa.workHistory.length === 3 && fa.workHistory[1].company === 'Tailspin Toys' && !J(fa.workHistory).includes('Imaginary'), 'an invented employer / job is dropped');
  check(fa.projects[0].tech.includes('TypeScript') && fa.projects[0].tech.includes('React') && !fa.projects[0].tech.includes('Kubernetes Operator'), 'project tech from the AI only if it is in the project text: ' + J(fa.projects[0].tech));
  const fe = X.combine(sec, { education: { error: 'took too long' } }, sam);
  check(/AI failed/.test(fe.sources.education) && fe.education.length === 4, 'when the AI fails, the rules still give every school (sources: ' + fe.sources.education + ')');

  console.log('Jordan Rivera (one-line "Title, Company\\tdates" entries)');
  const jr = await parse('jordan-rivera-resume.pdf');
  const js = X.sectionize(jr);
  const jf = X.combine(js, {}, jr);
  check(jf.workHistory.length === 2 && jf.workHistory[0].title === 'Data Engineer' && jf.workHistory[0].company === 'Northwind Analytics' && jf.workHistory[0].start === 'Mar 2021', 'rules split "Data Engineer, Northwind Analytics": ' + J(jf.workHistory.map(j => [j.title, j.company, j.start, j.end])));
  check(X.prompts(js).some(p => p.key === 'jobs'), 'one-line job entries are still checked by the AI');
  check(jf.education.length === 1 && jf.education[0].degree === "Bachelor's" && jf.education[0].field === 'Computer Science' && jf.education[0].school === 'State University', 'school: ' + J(jf.education));
  check(jf.location === 'Springfield, IL' && jf.locationSource === 'header' && jf.portfolio === '', 'header location; linkedin is not a portfolio');

  console.log('degrees');
  const dg = [['B.S. Computer Science', "Bachelor's", 'Computer Science'], ['Master of Business Administration', "Master's", 'Business Administration'], ['Bachelor of Science in Biology', "Bachelor's", 'Biology'],
    ['Ph.D. in Physics', 'Doctorate', 'Physics'], ['Associate of Applied Science in Nursing', "Associate's", 'Nursing'], ['Johns Hopkins University, Baltimore, MD', '', ''], ['Boston, MA', '', ''], ['MS Data Science', "Master's", 'Data Science']];
  for (const [t, lvl, fld] of dg) check(X.degreeOf(t) === lvl && (!lvl || X.fieldFrom(t) === fld), `"${t}" -> ${X.degreeOf(t) || '(none)'} / ${lvl ? X.fieldFrom(t) : ''}`);

  console.log('profile merge');
  const old = JAA.merge(JAA.EMPTY_PROFILE, { firstName: 'Sam', education: { school: 'Old School', degree: "Bachelor's", field: 'Art', startYear: '2000', endYear: '2004' }, eeo: { gender: '', ethnicity: '' }, workHistory: [{ company: 'Old Co', title: 'Clerk' }], skills: ['Old skill'] });
  const legacy = JAA.educationListOf(old);
  check(legacy.length === 1 && legacy[0].school === 'Old School' && legacy[0].end === '2004', 'a pre-0.6 single school becomes a one-item list');
  const p1 = R.applyToProfile(old, { education: f.education, projects: f.projects, workHistory: [], skills: f.skills, eeo: { gender: 'Male' }, gender: 'Male' }, ['education', 'projects', 'workHistory', 'skills']);
  check(p1.educationList.length === 4 && p1.education.school === 'Northgate Technical Institute' && p1.education.endYear === '2010' && p1.education.degree === "Bachelor's", 'education list saved; the single entry = highest degree');
  check(p1.workHistory.length === 1 && p1.workHistory[0].company === 'Old Co', 'an empty list never erases saved jobs');
  check(p1.projects.length === 1 && p1.skills.length === f.skills.length, 'projects + skills saved');
  check(p1.eeo.gender === '' && p1.eeo.ethnicity === '' && !p1.gender, 'EEO untouched by import');
  const p2 = R.applyToProfile(old, { education: f.education, skills: f.skills }, ['skills']);
  check(p2.education.school === 'Old School' && !(p2.educationList || []).length, 'unticked "replace" keeps the saved education');
  const mk = f.education.map(e => Object.assign({}, e, { highest: /Lakeside/.test(e.school) }));
  const p3 = JAA.syncEducation(Object.assign({}, old, { educationList: mk }));
  check(p3.education.school === 'Lakeside State University' && p3.education.endYear === '', 'a degree you mark highest is used (no end year when not completed)');
  check(J(JAA.splitList('Python, AWS (Lambda, ECS); SQL')) === J(['Python', 'AWS (Lambda, ECS)', 'SQL']), 'splitList keeps commas inside brackets');
  check(J(JAA.splitLines('Example Cloud Associate, 2024\n2024\nData Basics (Oct 2023)\n\nOct 2023')) === J(['Example Cloud Associate, 2024 — 2024', 'Data Basics (Oct 2023) — Oct 2023']), 'splitLines: one certification per line, commas kept, bare dates join the item before');

  console.log('multi-entry form fill rules (content/core.js)');
  global.window = global; global.JAA = JAA; window.JAA = JAA;
  global.addEventListener = global.addEventListener || (() => {}); global.document = global.document || { addEventListener() {}, querySelectorAll: () => [] };
  require(path.join(ROOT, 'content/core.js'));
  const C = JAA.core;
  const data = { profile: JAA.merge(JAA.EMPTY_PROFILE, p1), answerBank: [], settings: JAA.DEFAULT_SETTINGS };
  data.profile.workHistory = f.workHistory; data.profile.currentTitle = 'Senior Developer'; data.profile.currentEmployer = 'Fabrikam';
  const fld2 = (label, id) => ({ kind: 'text', label, name: '', idAttr: id || '', el: null });
  const v = (label, id) => { const r = C.resolve(fld2(label, id), data); return r && (r.value !== undefined ? r.value : (r.missing ? '(missing)' : '(other)')); };
  check(v('School') === 'Northgate Technical Institute' && v('Degree') === "Bachelor's" && v('Discipline') === 'Information Systems / Software Engineering', 'single School / Degree / Discipline = highest degree');
  check(v('School', 'school--0') === 'Northgate Technical Institute' && v('School', 'school--1') === 'Lakeside State University' && v('Degree', 'degree--1') === "Master's" && v('Start Year', 'start-year--1') === '2022', 'Greenhouse school--1 / degree--1 = the next school');
  check(v('School', 'school--4') === '(missing)', 'an extra empty entry is left for you');
  const r1 = C.resolve(fld2('Degree', 'degree--0'), data);
  check(r1.alts && r1.alts.some(re => re.test('bachelor s degree')), 'degree options like "Bachelor\'s Degree" match');
  check(v('Job Title', 'workExperience-7--jobTitle') === w0.title && v('Company', 'workExperience-7--companyName') === 'Fabrikam', 'Workday work experience 1 = current job');
  check(v('Job Title') === 'Senior Developer', 'a plain "Job title" question = current title');
  check(/^• Build and maintain/.test(v('Role Description', 'workExperience-7--roleDescription')), 'role description = that job\'s bullets');
  const plainDesc = C.resolve(fld2('Description'), data);
  check(plainDesc === null || plainDesc.source !== 'rule', 'a plain "Description" question is not filled from a job');
  const eeoR = C.resolve(Object.assign(fld2('Race / Ethnicity'), { kind: 'select', options: [{ text: 'White' }, { text: 'Asian' }] }), data);
  check(eeoR && eeoR.missing && eeoR.eeo, 'EEO still empty by default (left for you)');


  console.log('0.6.6 chooseOption: Yes/No intent + closed lists');
  {
    const yn = [{ text: 'Yes' }, { text: 'No' }];
    check(C.chooseOption('Yes', yn).text === 'Yes', 'exact Yes');
    check(C.chooseOption('Open to discussing', yn).text === 'Yes', 'Open to discussing → Yes');
    check(C.chooseOption('Willing to relocate', yn).text === 'Yes', 'Willing → Yes');
    check(C.chooseOption('No, I cannot relocate', yn).text === 'No', 'cannot → No');
    check(C.chooseOption('25% in-person', yn) == null, 'invented "25% in-person" does not match Yes/No');
    check(C.chooseOption('maybe weekends', yn) == null, 'unrelated free text stays unmatched');
    check(C.isClosedYesNo(yn) && !C.isClosedYesNo([{ text: 'Yes' }, { text: 'No' }, { text: 'Maybe' }, { text: 'Other' }, { text: 'N/A' }, { text: 'Skip' }, { text: 'X' }]), 'isClosedYesNo size guard');
    check(C.yesNoIntent('Open to discussing') === 'yes' && C.yesNoIntent('not willing') === 'no', 'yesNoIntent helpers');
  }

  { // 0.6.5: a long school list with a couple of EEO-looking names is not a self-ID question (seen on a live Lever form)
    const schools = ['Aalborg University', 'Asian University of Bangladesh', 'Institute of American Indian Arts'].concat(Array.from({ length: 60 }, (_, i) => `State University ${i}`));
    check(!JAA.isEeoText('Which university are you currently attending or did you last attend?', schools), 'school dropdown with "Asian University…" is not EEO');
    check(JAA.isEeoText('Please choose one', ['White', 'Black or African American', 'Asian', 'Hispanic or Latino', 'Two or more races', 'I don\'t wish to answer']), 'race options still detected as EEO');
    check(JAA.isEeoText('Status', ['I am not a protected veteran', 'I identify as one or more of the classifications of protected veteran', 'I don\'t wish to answer']), 'veteran options still detected as EEO');
  }

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
