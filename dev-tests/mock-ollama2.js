// Slow / "thinking" / streaming mock of Ollama. Behaviour is read per request from /tmp/mock-ollama-ctl.json:
// { warmDelayMs, chatDelayMs, delayForChat: {"2": 6000}, think: true, rejectThink: false, chunkMs: 40 }
// Modes: batch JSON answers (format json), single draft ("Write the candidate's answer..."), and chat.
const http = require('http');
const fs = require('fs');
const CTL = '/tmp/mock-ollama-ctl.json', LOG = '/tmp/mock-ollama-log.jsonl';
fs.writeFileSync(LOG, '');
let chatN = 0, draftN = 0;
const ctl = () => { try { return JSON.parse(fs.readFileSync(CTL, 'utf8')); } catch (_) { return {}; } };
const log = o => fs.appendFileSync(LOG, JSON.stringify(Object.assign({ t: Date.now() }, o)) + '\n');
http.createServer((req, res) => {
  const origin = req.headers.origin || '';
  const cors = origin ? { 'Access-Control-Allow-Origin': origin } : {};
  const json = (code, o) => { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json' }, cors)); res.end(JSON.stringify(o)); };
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    const c = ctl();
    const j = body ? JSON.parse(body) : {};
    if (req.url === '/api/tags') return json(200, { models: [{ name: 'qwen2.5:3b' }, { name: 'qwen3.5:4b' }] });
    if (req.url === '/api/show') return json(200, {});
    if (c.rejectThink && 'think' in j) { log({ path: req.url, rejected: 'think' }); return json(400, { error: `"${j.model}" does not support thinking` }); }
    if (req.url === '/api/generate') {
      log({ path: '/api/generate', think: j.think, keep_alive: j.keep_alive, prompt: j.prompt });
      return setTimeout(() => json(200, { model: j.model, response: '', done: true, done_reason: 'load' }), c.warmDelayMs || 0);
    }
    if (req.url === '/api/chat') {
      const n = ++chatN;
      const sysMsg = j.messages[0].content;
      const users = j.messages.filter(m => m.role === 'user');
      const user = users[0].content;
      const last = users[users.length - 1].content;
      let content, mode;
      const qm = user.match(/Questions \(JSON\): (\[.*\])\n/);
      if (qm) {
        mode = 'batch';
        const qs = JSON.parse(qm[1]);
        log({ path: '/api/chat', mode, n, stream: !!j.stream, think: j.think, format: j.format, keep_alive: j.keep_alive, options: j.options, ids: qs.map(q => q.id), types: qs.map(q => q.type), essay: qs.some(q => q.type === 'long-text'), userLen: user.length, savedAnswers: (user.match(/Saved answers \(relevant\): (.*)\n/) || [])[1], hasJD: /Job description \(excerpt\)/.test(user), hasTone: /Tone notes/.test(user), hasSamples: /Writing samples/.test(user), lengthRule: (sysMsg.match(/draft of ([^.]*?) each/) || [])[1] });
        const answers = {};
        for (const q of qs) {
          if (q.options) answers[q.id] = q.options.find(o => /^no\b/i.test(o)) || q.options[0];
          else if (q.type === 'long-text') answers[q.id] = `Draft: I am excited about this role because it matches my experience at Northwind. (${q.question.slice(0, 20)})`;
          else answers[q.id] = 'AI short answer';
        }
        content = (c.think ? '<think>\nOkay, the user wants JSON. Let me think about {braces} and "quotes"...\n</think>\n' : '') + JSON.stringify({ answers });
      } else if (/Write the candidate's answer to one job application question/.test(sysMsg)) {
        mode = 'draft'; draftN++;
        const q = (user.match(/Question: (.*)\n/) || [])[1] || '';
        const co = (user.match(/at (.*)\n/) || [])[1] || 'the company';
        log({ path: '/api/chat', mode, n, stream: !!j.stream, think: j.think, question: q, hasJD: /Job description/.test(user), hasTone: /Tone notes/.test(user), hasSamples: /Writing samples/.test(user), hasPrevious: /Previous draft/.test(user), lengthRule: (sysMsg.match(/Length: ([^.]*)\./) || [])[1] });
        content = (c.think ? '<think>planning the draft…</think>' : '') + `Regenerated draft ${draftN}: I want to join ${co} because I build reliable internal tools at Northwind and care about safe, useful AI. I would bring that same care to this team.`;
      } else {
        mode = 'chat';
        const fm = user.match(/Form fields \(JSON[^:]*\): (\[.*\])\n/);
        const fields = fm ? JSON.parse(fm[1]) : [];
        log({ path: '/api/chat', mode, n, stream: !!j.stream, think: j.think, message: last, fields: fields.length, hasJD: /Job description/.test(user), privateValues: fields.filter(f => f.value === '(private)').map(f => f.label), anyPetValue: fields.some(f => /pet/i.test(f.label) && f.value && f.value !== '(private)'), historyLen: j.messages.length });
        const why = fields.find(f => /why/i.test(f.label));
        const pet = fields.find(f => /pet/i.test(f.label));
        const sel = fields.find(f => /team/i.test(f.label) && f.options);
        if (/more technical/i.test(last) && why) content = `Sure, I made the “${why.label}” answer more technical.\nACTION {"action":"set_field","field":"${why.id}","value":"Technical version: I design fault-tolerant Python services and CI pipelines at Northwind, and I want to apply that rigor at Mockco."}`;
        else if (/pet/i.test(last) && pet) content = `Okay.\nACTION {"action":"set_field","field":"${pet.id}","value":"Rex"}`;
        else if (/team/i.test(last) && sel) content = `Okay.\nACTION {"action":"set_field","field":"${sel.id}","value":"Underwater Basket Weaving"}`;
        else if (/hello|hi\b/i.test(last)) content = (c.think ? '<think>greeting</think>' : '') + 'Hi! I can see the Mockco application. Ask me to rewrite an answer or what is left.';
        else content = 'Here is my take: the job wants backend experience, and your Northwind work fits well. Mention the internal tools you built.';
      }
      const delay = (c.delayForChat && c.delayForChat[String(n)]) != null ? c.delayForChat[String(n)] : (c.chatDelayMs || 0);
      if (!j.stream) return setTimeout(() => { try { json(200, { model: j.model, message: { role: 'assistant', content }, done: true }); } catch (_) { } }, delay);
      // streaming: NDJSON, small chunks
      setTimeout(async () => {
        try {
          res.writeHead(200, Object.assign({ 'Content-Type': 'application/x-ndjson' }, cors));
          const parts = content.match(/[\s\S]{1,12}/g) || [''];
          for (const p of parts) {
            if (res.destroyed) return;
            res.write(JSON.stringify({ model: j.model, message: { role: 'assistant', content: p }, done: false }) + '\n');
            await new Promise(r => setTimeout(r, c.chunkMs != null ? c.chunkMs : 15));
          }
          res.end(JSON.stringify({ model: j.model, message: { role: 'assistant', content: '' }, done: true }) + '\n');
        } catch (_) { }
      }, delay);
      return;
    }
    res.writeHead(200, cors); res.end('Ollama is running');
  });
}).listen(11434, '127.0.0.1', () => console.log('mock ollama2 up'));
