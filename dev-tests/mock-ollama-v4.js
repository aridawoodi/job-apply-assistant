// Mock Ollama for the v0.4 tests. Mirrors the real server where it matters:
// - Origin check like Ollama's (no Origin, or http(s)://localhost|127.0.0.1|0.0.0.0[:port], app://, file://, tauri://
//   are allowed; anything else, including chrome-extension://, gets 403 unless allowExtensionOrigin is set)
// - GET /api/version, GET /api/tags, POST /api/show, POST /api/pull (NDJSON progress like the real one), POST /api/chat
// Use as a module (createMock) or run `node mock-ollama-v4.js [port]`.
const http = require('http');

const ALLOWED = [/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/, /^(app|file|tauri|vscode-webview|vscode-file):\/\//];
function originOk(o, opts) {
  if (!o) return true;
  if (ALLOWED.some(r => r.test(o))) return true;
  if (opts.allowExtensionOrigin && /^chrome-extension:\/\//.test(o)) return true;
  return false;
}

function extractAnswer(text) {
  const lines = text.split('\n');
  const group = re => { const l = lines.find(x => re.test(x)); const m = l && l.match(/^\[(g\d+)\]/); return m ? m[1] : ''; };
  return {
    firstName: 'Jordan', lastName: 'Rivera', location: 'Springfield, IL', city: 'Springfield', state: 'IL', country: '',
    summary: 'Data engineer with 6 years of experience building reliable batch and streaming pipelines, analytics tooling and dashboards.',
    jobs: [
      { group: group(/Northwind/), company: 'Northwind Analytics', title: 'Data Engineer', location: '', start: 'Mar 2021', end: 'Present' },
      { group: group(/Contoso/), company: 'Contoso Retail', title: 'Software Developer', location: '', start: 'Jul 2018', end: 'Feb 2021' },
      { group: '', company: 'Imaginary Corp', title: 'Chief Wizard', start: '2010', end: '2012' } // not in the resume: must be dropped
    ],
    education: [{ school: 'State University', degree: 'B.S.', field: 'Computer Science', start: '2014', end: '2018', location: '' }],
    skills: ['Python', 'SQL', 'Bash', 'Airflow', 'Spark', 'dbt', 'PostgreSQL', 'Looker', 'AWS', 'Docker', 'Git', 'Kubernetes'],
    certifications: [], languages: []
  };
}

function tailorAnswer(prompt) {
  const ids = {};
  for (const m of prompt.matchAll(/^\[(b\d+)\] (?:• )?(.*)$/gm)) ids[m[2]] = m[1];
  const find = re => Object.keys(ids).find(t => re.test(t));
  const sum = find(/^Data engineer with 6 years/);
  const skills = find(/^Data: Airflow/);
  const b1 = find(/^Partnered with product managers/);
  const b2 = find(/^Built batch and streaming/);
  const groups = [...prompt.matchAll(/\) group (g\d+)\n((?:\[b\d+\][^\n]*\n?)+)/g)].map(m => ({ g: m[1], ids: [...m[2].matchAll(/\[(b\d+)\]/g)].map(x => x[1]) }));
  const out = { summary: [], skills: [], bullets: [], order: [] };
  if (sum) out.summary.push({ id: ids[sum], text: 'Data engineer with 6 years of experience turning product data into clear decisions: dashboards, experiments and reliable batch and streaming pipelines, explained to non-technical partners.' });
  if (skills) out.skills.push({ id: ids[skills], text: 'Data: Looker, PostgreSQL, dbt, Airflow, Spark' });
  if (b1) out.bullets.push({ id: ids[b1], text: 'Defined experiment metrics with product managers and explained the results to them.', why: 'The job asks for experiment analysis' });
  if (b2) out.bullets.push({ id: ids[b2], text: 'Built Kubernetes pipelines in Python and SQL that feed 60 internal dashboards.', why: 'The job lists Kubernetes' });
  if (groups[0] && groups[0].ids.length > 2) out.order.push({ group: groups[0].g, ids: [groups[0].ids[3], groups[0].ids[0], groups[0].ids[1], groups[0].ids[2]].filter(Boolean) });
  return out;
}

function createMock(opts) {
  opts = Object.assign({ port: 11434, host: '127.0.0.1', models: [], allowExtensionOrigin: false, pullMs: 1500, chatChunkMs: 10 }, opts || {});
  const state = { requests: [], models: opts.models.slice(), opts };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', async () => {
      const origin = req.headers.origin || '';
      state.requests.push({ method: req.method, path: req.url, origin, at: Date.now() });
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      if (!originOk(origin, state.opts)) { res.writeHead(403, { 'Content-Type': 'text/plain' }); return res.end(''); }
      if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
      let j = {}; try { j = body ? JSON.parse(body) : {}; } catch (_) { /* ignore */ }
      const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.url === '/api/version') return json(200, { version: '0.40.6-mock' });
      if (req.url === '/api/tags') return json(200, { models: state.models.map(n => ({ name: n, model: n, size: 1929912432 })) });
      if (req.url === '/api/show') return state.models.includes(j.model || j.name) ? json(200, { details: { family: 'qwen2' } }) : json(404, { error: `model '${j.model}' not found` });
      if (req.url === '/api/generate') return json(200, { done: true, response: '' });
      if (req.url === '/api/pull') {
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        const w = o => res.write(JSON.stringify(o) + '\n');
        w({ status: 'pulling manifest' });
        const layers = [['sha256:5ee4f07cdb9b', 1929903712], ['sha256:66b9ea09bd5b', 6834]];
        const steps = 10;
        for (const [dg, total] of layers) {
          for (let i = 0; i <= steps; i++) {
            w({ status: 'pulling ' + dg.slice(7, 19), digest: dg, total, completed: Math.round(total * i / steps) });
            await new Promise(r => setTimeout(r, state.opts.pullMs / steps / layers.length));
          }
        }
        w({ status: 'verifying sha256 digest' }); w({ status: 'writing manifest' }); w({ status: 'success' });
        if (!state.models.includes(j.model)) state.models.push(j.model);
        return res.end();
      }
      if (req.url === '/api/chat') {
        const sys = (j.messages || []).map(m => m.content).join('\n');
        let content;
        if (/You read a resume/.test(sys)) content = JSON.stringify(extractAnswer(j.messages[1].content));
        else if (/You tailor a resume/.test(sys)) content = JSON.stringify(tailorAnswer(j.messages[1].content));
        else content = JSON.stringify({ answers: {} });
        state.last = j;
        if (j.stream === false) return json(200, { message: { role: 'assistant', content }, done: true });
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        for (let i = 0; i < content.length; i += 40) {
          res.write(JSON.stringify({ message: { role: 'assistant', content: content.slice(i, i + 40) }, done: false }) + '\n');
          await new Promise(r => setTimeout(r, state.opts.chatChunkMs));
        }
        res.write(JSON.stringify({ message: { role: 'assistant', content: '' }, done: true }) + '\n');
        return res.end();
      }
      json(404, { error: 'not found' });
    });
  });
  return new Promise(resolve => server.listen(opts.port, opts.host, () => resolve({ server, state, close: () => new Promise(r => { server.closeAllConnections && server.closeAllConnections(); server.close(r); }) })));
}
module.exports = { createMock, originOk, extractAnswer, tailorAnswer };
if (require.main === module) createMock({ port: +(process.argv[2] || 11434), models: ['qwen2.5:3b'] }).then(() => console.log('mock ollama v4 on', process.argv[2] || 11434));
