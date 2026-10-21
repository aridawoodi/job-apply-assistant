// Injects the extension's content scripts into a page with a fake `chrome` API,
// a mocked Ollama reply, and the sample profile; runs a fill; reports results.
const fs = require('fs');
const path = require('path');
const EXT = '/workspace/job-apply-extension';
const FILES = ['content/netwatch.js', 'lib/defaults.js', 'content/core.js', 'content/sites.js', 'content/ui.js', 'content/learn.js', 'content/chat.js', 'content/steps.js', 'content/track.js', 'content/main.js'];
const sample = JSON.parse(fs.readFileSync(path.join(EXT, 'dev-tests/fixtures/test-profile.json'), 'utf8'));
// tiny valid PDF as the resume
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
const resume = { name: 'Alex_Morgan_Resume.pdf', type: 'application/pdf', size: pdf.length, dataUrl: 'data:application/pdf;base64,' + pdf.toString('base64') };

function shim(store, ollamaMode) {
  return `(() => {
    const store = ${JSON.stringify(store)};
    const mode = ${JSON.stringify(ollamaMode)};
    window.__msgs = [];
    const pick = k => { if (!k) return Object.assign({}, store); const ks = Array.isArray(k) ? k : [k]; const o = {}; ks.forEach(x => { if (x in store) o[x] = store[x]; }); return o; };
    function mockAnswer(q) {
      if (q.options && q.options.length) {
        if (q.type === 'multi-select') return [q.options[0]];
        const o = q.options.find(o => !/decline|wish|select/i.test(o)) || q.options[0];
        return o;
      }
      if (q.type === 'combobox') return q.suggested || null;
      return '[mock AI] answer for: ' + q.question.slice(0, 40);
    }
    function handle(msg) {
      window.__msgs.push(msg);
      if (msg.type === 'ollama:answer') {
        if (mode === 'offline') return { ok: false, fatal: true, error: "Can't reach Ollama at http://localhost:11434. Is the Ollama app running?" };
        const answers = {}; msg.questions.forEach(q => answers[q.id] = mockAnswer(q));
        return { ok: true, answers };
      }
      if (msg.type === 'tracker:log') { (store.applications = store.applications || []).push(msg.entry); return { ok: true }; }
      return { ok: true };
    }
    window.chrome = window.chrome || {};
    chrome.storage = { local: { get: async k => pick(k), set: async o => Object.assign(store, o) }, onChanged: { addListener() {} } };
    chrome.runtime = { sendMessage(msg, cb) { setTimeout(() => cb && cb(handle(msg)), 30); }, onMessage: { addListener(fn) { window.__onMessage = fn; } }, lastError: undefined };
    window.__store = store;
  })();`;
}

async function inject(page, { ollamaMode = 'mock', settings = {} } = {}) {
  const store = { profile: sample.profile, answerBank: sample.answerBank, settings: Object.assign({}, sample.settings, settings), resume };
  await page.addScriptTag({ content: shim(store, ollamaMode) });
  for (const f of FILES) await page.addScriptTag({ content: fs.readFileSync(path.join(EXT, f), 'utf8') });
}

async function runFill(page) {
  return page.evaluate(async () => {
    const s = await window.JAA.run({ source: 'test' });
    const files = Array.from(document.querySelectorAll('input[type=file]')).map(i => ({ id: i.id || i.name, files: Array.from(i.files || []).map(f => f.name + ' (' + f.size + 'b)') }));
    return { summary: s, files, submitted: !!window.__submitted, msgs: window.__msgs.map(m => ({ type: m.type, n: m.questions ? m.questions.length : undefined, questions: m.questions, entry: m.entry })) };
  });
}

function report(name, r) {
  const s = r.summary;
  console.log(`\n===== ${name} =====`);
  if (!s.ok) { console.log('RUN FAILED:', s.error); return; }
  console.log(`site=${s.site} company="${s.company}" title="${s.title}"`);
  console.log(`filled=${s.filled} ai=${s.ai} kept=${s.kept} todo=${s.todo} llmError=${s.llmError || '-'}`);
  for (const i of s.items) console.log(`  [${(i.status || '?').padEnd(4)}] ${i.kind.padEnd(13)} ${String(i.label).slice(0, 70).padEnd(70)} -> ${i.value != null ? JSON.stringify(String(i.value).slice(0, 50)) : ''}${i.why ? '  (' + i.why + ')' : ''}`);
  console.log('  file inputs:', JSON.stringify(r.files));
  console.log('  form submitted?', r.submitted, '| messages:', r.msgs.map(m => m.type + (m.n ? '(' + m.n + ')' : '')).join(', '));
}

module.exports = { inject, runFill, report };
