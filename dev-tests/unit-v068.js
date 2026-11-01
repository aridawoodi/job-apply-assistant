// v0.6.8 unit tests (no browser).
// 1) Voluntary self-identification (EEO): every question type x every saved value x the option wordings
//    used by real forms. A saved decline maps only to the form's decline option (or stays empty for the
//    user); nothing ever turns into "Yes" or another category the user didn't choose.
// Run: node dev-tests/unit-v068.js
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.self = global;
const JAA = require(path.join(ROOT, 'lib/defaults.js')).JAA || global.JAA;
global.window = global; global.JAA = JAA; window.JAA = JAA;
global.addEventListener = global.addEventListener || (() => {});
global.document = global.document || { addEventListener() {}, querySelectorAll: () => [] };
require(path.join(ROOT, 'content/core.js'));
const C = JAA.core;
let failures = 0, passes = 0;
const check = (c, m) => { if (c) { passes++; if (process.env.VERBOSE) console.log('  PASS ' + m); } else { console.log('  FAIL ' + m); failures++; } };
const opts = list => list.map(text => ({ text, value: text }));

// Decline wordings seen on Greenhouse, Lever, Ashby, Workday, iCIMS, SmartRecruiters and custom forms.
const DECLINES = [
  "I don't wish to answer", 'I do not wish to answer', 'Decline to self-identify', 'Decline To Self Identify',
  'Decline to state', 'Decline to answer', 'I decline to answer', 'Prefer not to say', 'Prefer not to answer',
  'Prefer not to disclose', 'I prefer not to specify', 'I do not want to answer', "I don't want to answer",
  'I choose not to disclose', 'I choose not to self-identify', 'Rather not say', "I'd rather not say", 'Not declared',
  'Choose not to identify', 'I wish not to answer'
];
const isDecline = t => DECLINES.some(d => C.norm(d) === C.norm(t)) || /wish|decline|prefer not|rather not|choose not|want to answer|not declared/i.test(t);

// Option lists per question, as real forms word them. Each list has at most one decline option.
const FORMS = {
  gender: { label: 'Gender', lists: [
    ['Male', 'Female', 'Decline To Self Identify'], ['Male', 'Female', 'Non-binary', "I don't wish to answer"],
    ['Man', 'Woman', 'Non-binary', 'Prefer not to say'], ['Male', 'Female'] ] },
  transgender: { label: 'Do you identify as transgender?', lists: [
    ['Yes', 'No', "I don't wish to answer"], ['No', 'Yes', 'Prefer not to say'], ['Yes', 'No'] ] },
  sexualOrientation: { label: 'What is your sexual orientation?', lists: [
    ['Heterosexual', 'Gay', 'Lesbian', 'Bisexual', "I don't wish to answer"],
    ['Straight', 'Gay or Lesbian', 'Bisexual', 'Queer', 'Asexual', 'Prefer not to say'], ['Heterosexual', 'Gay', 'Bisexual'] ] },
  ethnicity: { label: 'Race', lists: [
    ['American Indian or Alaskan Native', 'Asian', 'Black or African American', 'Hispanic or Latino', 'White', 'Native Hawaiian or Other Pacific Islander', 'Two or More Races', 'Decline To Self Identify'],
    ['White (Not Hispanic or Latino)', 'Hispanic or Latino', 'Asian (Not Hispanic or Latino)', 'Middle Eastern or North African', 'Decline to self-identify'],
    ['Asian', 'Black or African American', 'White', 'Middle Eastern or North African', 'Two or More Races', "I don't wish to answer"] ] },
  hispanicLatino: { label: 'Are you Hispanic/Latino?', lists: [
    ['Yes', 'No', 'Decline To Self Identify'], ['No', 'Yes', "I don't wish to answer"], ['Yes', 'No'], ['Yes', 'No', 'I do not want to answer'] ] },
  veteran: { label: 'Veteran Status', lists: [
    ['I am not a protected veteran', 'I identify as one or more of the classifications of protected veteran', "I don't wish to answer"],
    ['I am a veteran', 'I am not a veteran', 'Decline to self-identify'], ['I am not a protected veteran', 'I identify as one or more of the classifications of protected veteran'] ] },
  disability: { label: 'Disability Status', lists: [
    ['Yes, I have a disability (or previously had a disability)', 'No, I do not have a disability and have not had one in the past', 'I do not want to answer'],
    ['Yes, I have a disability', 'No, I do not have a disability', "I don't wish to answer"], ['Yes, I have a disability', 'No, I do not have a disability'] ] }
};
// What a correct pick looks like for each saved (non-decline) value.
const AGREES = {
  gender: { Male: /^(male|man)$/i, Female: /^(female|woman)$/i, 'Non-binary': /non-binary/i },
  transgender: { No: /^no$/i, Yes: /^yes$/i },
  sexualOrientation: { 'Heterosexual / straight': /heterosexual|straight/i, Gay: /^gay/i, Lesbian: /lesbian/i, Bisexual: /bisexual/i, Queer: /queer/i, Asexual: /asexual/i },
  ethnicity: { 'American Indian or Alaska Native': /american indian/i, Asian: /^asian/i, 'Black or African American': /^black/i, 'Hispanic or Latino': /^hispanic/i, 'Middle Eastern or North African': /middle eastern/i, 'Native Hawaiian or Other Pacific Islander': /hawaiian/i, White: /^white/i, 'Two or more races': /two or more/i },
  hispanicLatino: { No: /^no$/i, Yes: /^yes$/i },
  veteran: { 'I am not a protected veteran': /not a (protected )?veteran/i, 'I identify as one or more of the classifications of protected veteran': /identify as one or more|i am a veteran/i },
  disability: { 'No, I do not have a disability': /^no,/i, 'Yes, I have a disability': /^yes,/i }
};

const profileWith = (key, val) => { const p = JAA.merge(JAA.EMPTY_PROFILE, {}); p.eeo = Object.assign({}, p.eeo, { [key]: val }); return p; };
const settings = JAA.DEFAULT_SETTINGS;
function pick(key, label, list, saved, kind) {
  const f = { kind: kind || 'select', label, name: '', idAttr: '', el: null, options: opts(list) };
  const r = C.resolve(f, { profile: profileWith(key, saved), answerBank: [], settings });
  if (!r) return { r, o: undefined };
  if (r.value === undefined) return { r, o: null };
  return { r, o: C.chooseOption(r.value, f.options, r.alts) };
}

console.log('EEO: every question x every saved value x real option wordings');
let combos = 0;
for (const [key, form] of Object.entries(FORMS)) {
  const saved = (JAA.EEO_CHOICES && JAA.EEO_CHOICES[key]) || Object.keys(AGREES[key]).concat(["I don't wish to answer"]);
  const values = Array.from(new Set(saved.concat(DECLINES, ['', 'Unknown', 'N/A'])));
  for (const list of form.lists) {
    const declineOpt = list.find(isDecline);
    for (const v of values) {
      for (const kind of ['select', 'radio']) {
        combos++;
        const { r, o } = pick(key, form.label, list, v, kind);
        const tag = `${key} [${list.join(' | ')}] saved "${v}" (${kind})`;
        check(r && r.eeo && r.source !== 'model' && !r.noLLM === (v !== ''), tag + ': handled as EEO, never the model');
        if (v === '') { check(r.missing && o === null, tag + ': not set → left for you'); continue; }
        if (isDecline(v)) {
          if (declineOpt) check(o && o.text === declineOpt, tag + ' → the form\'s decline option, got ' + (o && o.text));
          else check(o == null, tag + ' → no decline option on the form, left for you (got ' + (o && o.text) + ')');
          continue;
        }
        const want = AGREES[key][v];
        if (!want) { check(o == null || C.norm(o.text) === C.norm(v), tag + ': unknown value stays empty (got ' + (o && o.text) + ')'); continue; }
        const exists = list.some(t => want.test(t));
        if (exists) check(o && want.test(o.text), tag + ' → matching option, got ' + (o && o.text));
        else check(o == null, tag + ': no matching option → left for you (got ' + (o && o.text) + ')');
        check(!o || !isDecline(o.text), tag + ': a real answer never becomes "decline"');
      }
    }
  }
}
console.log(`  ${combos} combinations`);

console.log('EEO: the 0.6.7 bugs');
{
  const hl = pick('hispanicLatino', 'Are you Hispanic/Latino?', ['Yes', 'No', 'Decline To Self Identify'], 'Decline to self-identify');
  check(hl.o && hl.o.text === 'Decline To Self Identify', 'Hispanic/Latino + saved "Decline to self-identify" → decline (was "Yes")');
  const hlA = pick('hispanicLatino', 'Are you Hispanic/Latino?', ['Yes', 'No', "I don't wish to answer"], 'Decline to self-identify');
  check(hlA.o && hlA.o.text === "I don't wish to answer", 'gh-eeo wording: saved "Decline to self-identify" → "I don\'t wish to answer" (0.6.7 picked "Yes")');
  const hl2 = pick('hispanicLatino', 'Are you Hispanic/Latino?', ['Yes', 'No'], "I don't wish to answer");
  check(hl2.o == null, 'Hispanic/Latino with only Yes/No + saved decline → left for you (was "Yes")');
  const hl3 = pick('hispanicLatino', 'Are you Hispanic/Latino?', ['Yes', 'No'], 'Something else');
  check(hl3.o == null, 'Hispanic/Latino + unrecognised saved value → left for you (was "Yes")');
  const dis = pick('disability', 'Disability Status', ['Yes, I have a disability (or previously had a disability)', 'No, I do not have a disability and have not had one in the past', 'I do not want to answer'], "I don't wish to answer");
  check(dis.o && dis.o.text === 'I do not want to answer', 'Disability + saved "I don\'t wish to answer" → "I do not want to answer" (was left empty)');
  const vet = pick('veteran', 'Veteran Status', ['I am a veteran', 'I am not a veteran'], 'I do not want to answer');
  check(vet.o == null, 'Veteran + saved "I do not want to answer" with no decline option → left for you, not "I am not a veteran"');
  const g = pick('gender', 'Gender', ['Male', 'Female'], 'Male');
  check(g.o && g.o.text === 'Male', 'Gender Male stays Male');
  const g2 = pick('gender', 'Gender', ['Female', 'Male'], 'Male');
  check(g2.o && g2.o.text === 'Male', 'Male never fuzzy-matches Female');
}

console.log('chooseOption: decline wording outside EEO');
{
  const relo = opts(['Yes', 'No', 'Prefer not to say']);
  check(C.chooseOption('I would rather not say', relo).text === 'Prefer not to say', 'non-EEO decline phrase → decline option');
  check(C.chooseOption('Yes', relo).text === 'Yes', 'non-EEO Yes still Yes');
  check(C.chooseOption('No', opts(['No', 'Yes', 'No answer'])).text === 'No', '"No" is not read as "No answer"');
}

console.log('tracker: company + job title from the page (lib/jobdetect.js jobInfo)');
{
  const D = require(path.join(ROOT, 'lib/jobdetect.js'));
  const J = (src, title, company, m) => { const r = D.jobInfo(src); check(r.title === title && r.company === company, `${m}: ${JSON.stringify(r)}`); };
  J({ docTitle: 'Job Application for Software Engineer at Acme', hostname: 'localhost' }, 'Software Engineer', 'Acme', 'Greenhouse-style title');
  J({ docTitle: 'Product Engineer @ Acme', hostname: 'localhost' }, 'Product Engineer', 'Acme', 'Ashby-style title');
  J({ docTitle: 'Acme - Data Analyst', hostname: '127.0.0.1' }, 'Data Analyst', 'Acme', 'Lever-style title, company first');
  J({ docTitle: 'Support Engineer · Example Company Careers', hostname: 'localhost' }, 'Support Engineer', 'Example Company', '"· Company Careers"');
  J({ docTitle: 'Contoso Careers | Customer Success Manager', hostname: 'jobs.contoso.com' }, 'Customer Success Manager', 'Contoso', '"Company Careers | Title"');
  J({ docTitle: 'Apply', h1: 'Apply', ld: { '@type': 'JobPosting', title: 'Field Support Technician', hiringOrganization: { name: 'Northwind Example' } }, hostname: 'localhost' }, 'Field Support Technician', 'Northwind Example', 'JSON-LD JobPosting wins');
  J({ docTitle: 'Senior Analyst', ogSiteName: 'Fabrikam Careers', hostname: 'apply.fabrikam-example.com' }, 'Senior Analyst', 'Fabrikam', 'og:site_name without "Careers"');
  J({ docTitle: 'Apply · Data Analyst', hostname: 'localhost' }, 'Data Analyst', '', 'no company anywhere: empty, never "localhost"');
  J({ docTitle: 'Application form', hostname: '192.168.1.20' }, '', '', 'an IP address is never a company');
  J({ docTitle: 'Application form', hostname: 'careers.example-company.test' }, '', 'Example Company', 'hostname brand (careers. stripped)');
  J({ docTitle: 'Apply now', hostname: 'www.contoso.co.uk' }, '', 'Contoso', 'co.uk hostname brand');
  J({ docTitle: 'Apply', hostname: 'apply.workable.com', pathname: '/tailspin-toys/j/ABC123/' }, '', 'Tailspin Toys', 'hosted ATS: company from the path, not "Workable"');
  J({ docTitle: 'Jobs', h1: 'Careers at Contoso', hostname: 'localhost' }, '', '', 'generic headings are not a job title');
  check(D.brandFromHost('localhost') === '' && D.brandFromHost('jobs.example.org') === 'Example', 'brandFromHost basics');
}

console.log('answer guard (lib/guard.js): invented facts in AI answers');
{
  require(path.join(ROOT, 'lib/tailor.js'));
  const G = require(path.join(ROOT, 'lib/guard.js'));
  // Casey Morgan, the made-up person in fixtures/casey-morgan-resume.pdf
  const profile = {
    firstName: 'Casey', lastName: 'Morgan', city: 'Lakeview', state: 'OR',
    workHistory: [
      { title: 'IT Support Specialist', company: 'Bluefin Devices', start: '2021', end: 'Present', bullets: ['Resolved 40 tickets a week in Zendesk and Jira', 'Cut onboarding time by 30% with Python scripts'] },
      { title: 'Volunteer Instructor', company: 'Lakeview Code Club', start: '2018', end: '2021', bullets: ['Taught Python basics to 25 students'] },
      { title: 'Help Desk Technician', company: 'Harbor Cloud', start: '2016', end: '2018', bullets: [] }
    ],
    skills: ['Python', 'SQL', 'Linux', 'Zendesk', 'Jira'],
    educationList: [{ school: 'Lakeview State University', degree: "Bachelor's", field: 'Information Systems', start: '2012', end: '2016' }],
    resumeText: 'Casey Morgan\nIT Support Specialist, Bluefin Devices, 2021 – Present\n• Resolved 40 tickets a week in Zendesk and Jira\n• Cut onboarding time by 30% with Python scripts\nVolunteer Instructor, Lakeview Code Club, 2018 – 2021\n• Taught Python basics to 25 students\nHelp Desk Technician, Harbor Cloud, 2016 – 2018\nLakeview State University, B.S. Information Systems, 2012 – 2016\nSkills: Python, SQL, Linux, Zendesk, Jira'
  };
  const ctx = (o) => Object.assign({ profile, company: 'Acme', title: 'Support Engineer' }, o || {});
  const terms = g => g.flagged.map(f => f.term);
  let g = G.review('At Bluefin Devices I resolved 40 tickets a week in Zendesk and Jira. I also made our deployments 55% faster. I would bring the same care to Acme.', ctx({ essay: true }));
  check(!/55%/.test(g.text) && /40 tickets/.test(g.text) && g.removed.includes('55%') && !g.flagged.length, '"55% faster" (not in the resume) removed from a long answer, the rest kept: ' + g.text);
  check(g.sources.some(l => /40 tickets/.test(l)), 'source resume line for the answer: ' + JSON.stringify(g.sources));
  g = G.review('I led the help desk at Contoso Health for three years. At Harbor Cloud I worked as a help desk technician. I enjoy supporting people.', ctx({ essay: true }));
  check(!/Contoso/.test(g.text) && g.removed.some(t => /Contoso/.test(t)), 'an employer that isn\'t in the resume is removed: ' + g.text);
  g = G.review('I studied computer science at Stanford University. I taught Python basics to 25 students at Lakeview Code Club. I like explaining things clearly.', ctx({ essay: true }));
  check(!/Stanford/.test(g.text) && g.removed.some(t => /Stanford/.test(t)), 'a school that isn\'t in the resume is removed');
  g = G.review('I have hands-on experience with Kubernetes and Terraform.', ctx({ essay: true, jobDescription: 'You will run Kubernetes clusters with Terraform.' }));
  check(!g.retry && terms(g).includes('Kubernetes') && /job description/.test(g.flagged[0].why) && g.text.includes('Kubernetes'), 'tools only the job description names: kept but flagged "Check this" with the claim and why: ' + JSON.stringify(g.flagged));
  g = G.review('I have hands-on experience with Kubernetes.', ctx({ essay: true }));
  check(g.retry && terms(g).includes('Kubernetes'), 'one-sentence answer claiming a tool from nowhere: retried with a stricter prompt (can\'t be trimmed)');
  g = G.review('I have hands-on experience with Kubernetes.', ctx({ essay: true, final: true }));
  check(!g.retry && terms(g).includes('Kubernetes') && /isn't in your resume/.test(g.flagged[0].why), 'still there after the retry: flagged with the exact claim');
  g = G.review('Yes, 3 years of Salesforce administration.', ctx({ question: 'Do you have Salesforce experience?' }));
  check(g.retry && terms(g).includes('Salesforce'), 'short answer: the question naming a tool doesn\'t make the claim true (retry)');
  g = G.review('Yes, 3 years of Salesforce administration.', ctx({ question: 'Do you have Salesforce experience?', final: true }));
  check(!g.retry && terms(g).includes('Salesforce') && g.text === 'Yes, 3 years of Salesforce administration.', 'short answer after the retry: kept, flagged with "Salesforce"');
  g = G.review('I have about 10 years of IT support experience, most recently at Bluefin Devices.', ctx());
  check(!g.flagged.length && !g.retry, 'years computed from the resume dates are fine (10 years): ' + JSON.stringify(g.flagged));
  g = G.review('I have 35 years of experience.', ctx({ final: true }));
  check(terms(g).includes('35'), '35 years (more than the resume spans) flagged');
  g = G.review('My salary at Bluefin Devices was $150k.', ctx({ final: true }));
  check(terms(g).some(t => /150k/.test(t)), 'an invented money figure is flagged: ' + JSON.stringify(terms(g)));
  g = G.review('I have worked in IT support since 2010.', ctx({ final: true }));
  check(terms(g).includes('2010'), 'a date that isn\'t in the resume is flagged');
  g = G.review('I resolved 40 tickets a week in Zendesk and Jira at Bluefin Devices, and cut onboarding time by 30% with Python scripts. I am excited about Acme and the Support Engineer role. I can start on a Monday and work in English.', ctx({ essay: true }));
  check(!g.flagged.length && !g.removed.length && !g.retry, 'a fully supported answer is untouched (company and title being applied to, weekdays, languages are fine): ' + JSON.stringify(g.flagged));
  g = G.review('I can start two weeks from today, on ' + new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10) + '.', ctx());
  check(!g.retry, 'a start date in the next year is fine (today is in the prompt)');
  g = G.review('Lakeview, OR', ctx());
  check(!g.flagged.length, 'a city from the profile is fine');
  g = G.review('Salesforce and HubSpot', ctx({ final: true }));
  check(terms(g).includes('Salesforce') && terms(g).includes('HubSpot'), 'short list answer: first-word names count too: ' + JSON.stringify(terms(g)));
  g = G.review('Zendesk and Jira', ctx());
  check(!g.flagged.length, 'short list answer from the resume is fine');
  g = G.review('Absolutely, I enjoy explaining technical problems in plain words to customers and teammates.', ctx({ essay: true }));
  check(!g.flagged.length && !g.retry, 'an ordinary capitalised first word is not a claim');
  check(/"Kubernetes"/.test(G.strictNote(['Kubernetes', '55%'])) && /NOT in the candidate/.test(G.strictNote(['x'])), 'strict retry prompt names the claims');
  check(G.review('', ctx()).text === '' && G.review(null, ctx()).flagged.length === 0, 'empty answers pass through');
}

console.log(failures ? `\n${failures} FAILURE(S), ${passes} passed` : `\nALL PASSED (${passes} checks)`);
process.exit(failures ? 1 : 0);
