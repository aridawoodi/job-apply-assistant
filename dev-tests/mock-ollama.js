// Mimics Ollama's API + its CORS origin check (403 for chrome-extension:// unless allowed).
const http = require('http');
const allowExt = process.env.ALLOW_EXT === '1';
const log = [];
const srv = http.createServer((req, res) => {
  const origin = req.headers.origin || '';
  log.push(`${req.method} ${req.url} origin=${origin}`);
  if (origin.startsWith('chrome-extension://') && !allowExt) { res.writeHead(403); return res.end(); }
  const cors = origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type' } : {};
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (req.url === '/api/show') { res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)); return res.end('{}'); }
  if (req.url === '/api/tags') { res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)); return res.end(JSON.stringify({ models: [{ name: 'qwen2.5:3b' }] })); }
  if (req.url === '/api/chat') {
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      const j = JSON.parse(body);
      const user = j.messages.find(m => m.role === 'user').content;
      const qs = JSON.parse(user.match(/Questions \(JSON\): (\[.*\])\n/)[1]);
      const answers = {};
      for (const q of qs) answers[q.id] = q.options ? (q.options.find(o => /^no\b/i.test(o)) || q.options[0]) : `Mock local-model answer (${q.question.slice(0, 30)})`;
      require('fs').writeFileSync('/workspace/jaa-tests/last-ollama-request.json', JSON.stringify({ model: j.model, format: j.format, system: j.messages[0].content, user }, null, 2));
      res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
      res.end(JSON.stringify({ model: j.model, message: { role: 'assistant', content: JSON.stringify({ answers }) }, done: true }));
    });
    return;
  }
  res.writeHead(200, cors); res.end('Ollama is running');
});
srv.listen(11434, '127.0.0.1', () => console.log('mock ollama on 11434 allowExt=' + allowExt));
process.on('SIGTERM', () => { console.log(log.join('\n')); process.exit(0); });
