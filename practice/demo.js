/* Practice tour demo mode (practice.html?tour=1): a made-up person with obviously fake details, and
 * canned "AI" answers, so the tour works before setup and never touches your real profile, answer
 * bank, tracker or local AI. Loaded only on the practice page. */
(function () {
  'use strict';
  if (!/[?&]tour=1\b/.test(location.search)) return;
  const JAA = window.JAA;
  const profile = JAA.merge(JAA.EMPTY_PROFILE, {
    firstName: 'Sam', lastName: 'Sample', email: 'sam.sample@example.com', phone: '(555) 010-0199',
    city: 'Springfield', state: 'IL', country: 'United States', location: 'Springfield, IL',
    linkedin: 'https://www.linkedin.com/in/sam-sample-demo', github: 'https://github.com/sam-sample-demo',
    workAuthorizedUS: 'Yes', needsSponsorship: 'No', over18: 'Yes',
    currentEmployer: 'Pretend Analytics LLC', currentTitle: 'Junior Data Analyst', yearsExperience: '3',
    education: { school: 'Imaginary State University', degree: 'B.S.', field: 'Statistics', startYear: '2017', endYear: '2021' },
    eeo: { gender: '', veteran: '' }, // left empty on purpose: EEO answers are yours to give
    salaryExpectation: '', howDidYouHear: 'Company website',
    summary: 'Data analyst who likes turning messy spreadsheets into clear dashboards.',
    workHistory: [
      { company: 'Pretend Analytics LLC', title: 'Junior Data Analyst', start: '2021', end: 'Present', location: 'Springfield, IL', bullets: ['Wrote SQL reports used by 4 teams every week', 'Built dashboards in Tableau for the sales team', 'Automated a weekly Excel report with Python, saving 3 hours a week'] },
      { company: 'Campus Library (student job)', title: 'Data Assistant', start: '2019', end: '2021', location: 'Springfield, IL', bullets: ['Cleaned circulation data and shared monthly charts'] }
    ],
    educationList: [{ school: 'Imaginary State University', degree: 'B.S.', field: 'Statistics', start: '2017', end: '2021' }],
    skills: ['SQL', 'Python', 'Tableau', 'Excel', 'Statistics', 'Dashboards', 'A/B testing']
  });
  const resumeText = [
    'Sam Sample · Springfield, IL · sam.sample@example.com',
    'Junior Data Analyst, Pretend Analytics LLC (2021 – Present)',
    '• Wrote SQL reports used by 4 teams every week', '• Built dashboards in Tableau for the sales team',
    '• Automated a weekly Excel report with Python, saving 3 hours a week', '• Ran A/B testing analysis for two product experiments',
    'Data Assistant, Campus Library (2019 – 2021)', '• Cleaned circulation data and shared monthly charts',
    'Education: B.S. Statistics, Imaginary State University (2021)', 'Skills: SQL, Python, Tableau, Excel, Statistics, Dashboards, A/B testing'
  ].join('\n');
  profile.resumeText = resumeText;

  // a tiny real PDF so the Resume upload can be filled
  function tinyPdf(text) {
    const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', null,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    const stream = `BT /F1 14 Tf 72 720 Td (${text}) Tj ET`;
    objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    let out = '%PDF-1.4\n'; const offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const x = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
    return 'data:application/pdf;base64,' + btoa(out);
  }
  const resume = { name: 'Sam Sample - Resume.pdf', type: 'application/pdf', dataUrl: tinyPdf('Sam Sample - practice resume (fake)'), size: 600 };
  const answerBank = [{ q: 'How many years have you used SQL?', a: '3', source: 'manual', createdAt: '2026-01-01T00:00:00Z' }];
  const settings = JAA.merge(JAA.DEFAULT_SETTINGS, { useLLM: true, chatHistory: false, rememberAnswers: false, warmUp: false, panelAuto: 'manual', showMatch: true, refineToolbar: true });

  const WHY = 'I like how Example Co uses data to make everyday decisions. In my current role I write SQL reports that 4 teams use every week and build Tableau dashboards for sales, so turning questions into clear answers is the part of the job I enjoy most. I would love to bring that to your product and operations teams.';
  const VARIANTS = {
    shorter: 'Example Co turns data into everyday decisions, which is what I enjoy most. I write weekly SQL reports for 4 teams and build Tableau dashboards today, and I want to do that for your product teams.',
    technical: 'At Pretend Analytics I write SQL reports used by 4 teams weekly, build Tableau dashboards, and automated a weekly Excel report with Python (saving 3 hours a week). I would bring that SQL, Python and A/B testing analysis to Example Co\'s product and operations questions.',
    enthusiastic: 'I would genuinely love to join Example Co. Turning questions into clear answers is my favourite part of the job: I write SQL reports that 4 teams rely on every week and build Tableau dashboards for sales. Doing that for your product teams sounds great.',
    other: 'What draws me to Example Co is how close the analytics work is to real decisions. I already write weekly SQL reports for 4 teams and build Tableau dashboards for sales, and I would like to do the same kind of work for your product and operations teams.'
  };
  function pick(instruction) {
    const i = String(instruction || '').toLowerCase();
    return /short/.test(i) ? VARIANTS.shorter : /technical/.test(i) ? VARIANTS.technical : /enthusias/.test(i) ? VARIANTS.enthusiastic : VARIANTS.other;
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  JAA.demo = {
    profile, resumeText, answerBank,
    handle(msg) {
      if (msg.type === 'ollama:warm') return Promise.resolve({ ok: true });
      if (msg.type === 'ollama:answer') {
        const answers = {};
        (msg.questions || []).forEach(q => { if (/why do you want|why .*work/i.test(q.question)) answers[q.id] = WHY; });
        return sleep(900).then(() => ({ ok: true, answers, demo: true }));
      }
      if (msg.type === 'tracker:log' || msg.type === 'bank:learn') return Promise.resolve({ ok: true, practice: true });
      return null;
    },
    async stream(payload, onDelta) {
      const text = payload.mode === 'draft' ? pick(payload.instruction) : 'This is the practice tour: in real use your local AI answers here.';
      onDelta('Writing with your local AI (demo)…', 'status');
      let out = '';
      for (const w of text.split(/(\s+)/)) { out += w; if (/\S/.test(w)) { onDelta(out, 'delta'); await sleep(12); } }
      return { type: 'done', text };
    }
  };
  JAA.loadAll = async () => ({ profile: JAA.merge(JAA.EMPTY_PROFILE, profile), answerBank: answerBank.slice(), settings: JAA.merge(JAA.DEFAULT_SETTINGS, settings), resume });
})();
