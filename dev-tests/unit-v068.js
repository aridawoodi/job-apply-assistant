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

console.log(failures ? `\n${failures} FAILURE(S), ${passes} passed` : `\nALL PASSED (${passes} checks)`);
process.exit(failures ? 1 : 0);
