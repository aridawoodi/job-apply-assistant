/* Background service worker: talks to the local Ollama server and stores the
 * application tracker. All model calls happen here (not in the page).
 * Ollama rejects requests whose Origin header isn't localhost (chrome-extension:// gets 403).
 * A declarativeNetRequest rule (installOriginRules) removes the Origin header from THIS
 * extension's own requests to the local Ollama port, so no OLLAMA_ORIGINS setup is needed. */
'use strict';
importScripts('lib/defaults.js', 'lib/tailor.js', 'lib/cover.js', 'lib/resume.js', 'lib/extract.js', 'lib/rating.js', 'lib/activation.js');

const ORIGINS_HINT =
  'Ollama refused the request (403). The extension normally fixes this by itself. Make sure Chrome is up to date (version 110 or newer), ' +
  'then open the extension menu → Setup → "Fix connection" for a one-time fix.';

function trimUrl(u) { return String(u || '').replace(/\/+$/, ''); }

async function fetchWithTimeout(url, opts, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
  } finally {
    clearTimeout(t);
  }
}

function explainFetchError(err, base, timeoutSec) {
  if (err && err.name === 'AbortError') {
    return `Ollama took longer than ${timeoutSec}s. The first request after starting can be slow while the model loads; try again, or close other apps to free memory.`;
  }
  return `Can't reach Ollama at ${base}. Is the Ollama app running? (Check: open ${base} in a tab; it should say "Ollama is running".)`;
}

async function testConnection(overrides) {
  const { settings } = await JAA.loadAll();
  const s = Object.assign({}, settings, overrides || {});
  const base = trimUrl(s.ollamaUrl);
  let res;
  try {
    res = await fetchWithTimeout(base + '/api/tags', { method: 'GET' }, 8000);
  } catch (e) {
    return { ok: false, error: explainFetchError(e, base, 8) };
  }
  if (res.status === 403) return { ok: false, error: ORIGINS_HINT };
  if (!res.ok) return { ok: false, error: `Ollama answered HTTP ${res.status}.` };
  const data = await res.json().catch(() => ({}));
  const models = (data.models || []).map(m => m.name);
  // GET requests from the worker carry no Origin header, so they pass even when Ollama
  // would block the real (POST) calls. Probe with a cheap POST to catch the 403 early.
  try {
    const probe = await fetchWithTimeout(base + '/api/show', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: s.model, name: s.model })
    }, 8000);
    if (probe.status === 403) return { ok: false, models, error: ORIGINS_HINT };
  } catch (e) {
    return { ok: false, models, error: explainFetchError(e, base, 8) };
  }
  const want = s.model.includes(':') ? s.model : s.model + ':latest';
  const hasModel = models.includes(s.model) || models.includes(want);
  return {
    ok: hasModel,
    models,
    error: hasModel ? null : `Connected, but model "${s.model}" isn't downloaded. Run: ollama pull ${s.model}`
  };
}

const KEEP_ALIVE = '30m';
const NUM_CTX = 4096;
const SLOW_MODEL_HINT = ' On an 8 GB Mac, qwen2.5:3b is much faster than bigger or "thinking" models: run `ollama pull qwen2.5:3b` and set it in Options → Local AI.';

function profileFacts(profile, essay) {
  const facts = JSON.parse(JSON.stringify(profile));
  const resumeText = String(facts.resumeText || '').trim();
  delete facts.resumeText;
  delete facts.writingSamples; delete facts.toneNotes; // style is passed separately, for long answers only
  delete facts.eeo;            // EEO answers are filled by rules only, never given to the model
  delete facts.pronouns;       // self-identification too
  delete facts.salaryExpectation;
  // work history etc. from the resume import: compact one-liners (bullets are in resumeText for essays)
  if (Array.isArray(facts.workHistory)) facts.workHistory = facts.workHistory.slice(0, 8).map(j => `${j.title || ''} at ${j.company || ''}${j.start || j.end ? ` (${j.start || '?'} – ${j.end || '?'})` : ''}`);
  if (Array.isArray(facts.educationList) && facts.educationList.length) { facts.educationList = facts.educationList.slice(0, 6).map(e => [e.degree, e.field, e.school, [e.start, e.end].filter(Boolean).join('–'), e.status && e.status !== 'completed' ? e.status : ''].filter(Boolean).join(', ')); delete facts.education; } else delete facts.educationList;
  // projects (v0.6): one line each; essays also get the details
  if (Array.isArray(facts.projects)) facts.projects = facts.projects.slice(0, 6).map(x => `${x.name || ''}${x.role ? ' (' + x.role + ')' : ''}${(x.tech || []).length ? ' — ' + x.tech.slice(0, 8).join(', ') : ''}${x.description ? ': ' + x.description : ''}${essay && (x.bullets || []).length ? ' · ' + x.bullets.slice(0, 3).join(' · ').slice(0, 300) : ''}`);
  if (Array.isArray(facts.skills)) facts.skills = facts.skills.slice(0, 40).join(', ');
  if (Array.isArray(facts.certifications)) facts.certifications = facts.certifications.join('; ');
  if (Array.isArray(facts.languages)) facts.languages = facts.languages.join(', ');
  delete facts.resumeMaster;
  // drop empty fields: smaller prompt = faster on a small machine
  const prune = o => { for (const k of Object.keys(o)) { if (o[k] && typeof o[k] === 'object') { prune(o[k]); if (!Object.keys(o[k]).length) delete o[k]; } else if (o[k] === '' || o[k] == null) delete o[k]; } return o; };
  prune(facts);
  return { facts, resumeText: essay ? resumeText.slice(0, 3000) : '' };
}

// Only the saved answers relevant to this batch go into the prompt (keeps it small), plus
// company-specific templates (with {company} filled in) as style examples for long answers.
function relevantBank(answerBank, questions, essay, company) {
  const scored = answerBank.filter(x => x && x.q && x.a)
    .map(x => ({ x, s: Math.max(...questions.map(q => JAA.textSim(q.question, x.q))) }))
    .filter(o => o.s >= 0.2 || (essay && o.x.companySpecific))
    .sort((a, b) => b.s - a.s).slice(0, essay ? 6 : 8);
  return scored.map(({ x }) => {
    const fillCo = t => String(t).replace(/\{company\}/g, company || 'the company');
    return x.companySpecific ? { q: fillCo(x.q), a: fillCo(x.a), note: 'earlier answer for another company; adapt, do not copy names' } : { q: x.q, a: x.a };
  });
}

function styleBlock(profile) {
  const tone = String(profile.toneNotes || '').trim().slice(0, 400);
  const samples = String(profile.writingSamples || '').trim().slice(0, 1500);
  return (tone ? `Tone notes from the candidate: ${tone}\n` : '') +
    (samples ? `Writing samples by the candidate (copy the voice and rhythm only, not the content):\n---\n${samples}\n---\n` : '');
}

function buildPrompt(profile, answerBank, questions, kind, company, extra) {
  extra = extra || {};
  const essay = kind === 'essay';
  const len = JAA.DRAFT_LENGTHS[extra.draftLength] || JAA.DRAFT_LENGTHS.short;
  const { facts, resumeText } = profileFacts(profile, essay);
  const today = new Date().toISOString().slice(0, 10);
  const system =
    'You fill out job application forms for the candidate described below. ' +
    'Answer ONLY from the candidate facts, resume text and saved answers. Never invent employers, dates, numbers, ' +
    'phone numbers, URLs, salary figures, or skills that are not in the facts. ' +
    'If a question cannot be answered from the facts, use null. ' +
    'When a question lists options, the answer MUST be copied exactly from the options ' +
    '(for multi-select checkboxes return an array of option strings). ' +
    (essay
      ? `These are open-ended questions: write a first-person draft of ${len} each, grounded in the facts and resume, tailored to the job description, in the candidate's own voice; the candidate will edit it. `
      : 'For short free-text questions answer in a few words. ') +
    'Do not think out loud. Reply with JSON only: {"answers": {"<id>": <answer or null>}}.';
  const user =
    `Today: ${today}\n` +
    `Candidate facts (JSON): ${JSON.stringify(facts)}\n` +
    (resumeText ? `Resume text: ${resumeText}\n` : '') +
    `Saved answers (relevant): ${JSON.stringify(relevantBank(answerBank, questions, essay, company))}\n` +
    (company ? `Company being applied to: ${company}\n` : '') +
    (essay && extra.jobTitle ? `Job title: ${extra.jobTitle}\n` : '') +
    (essay && extra.jobDescription ? `Job description (excerpt): ${String(extra.jobDescription).slice(0, 2000)}\n` : '') +
    (essay ? styleBlock(profile) : '') +
    `Questions (JSON): ${JSON.stringify(questions)}\n` +
    'Return {"answers": {...}} with one key per question id.';
  return { system, user };
}

// Reasoning models (qwen3.x, deepseek-r1, …) may still emit <think>…</think>; drop it.
function stripThink(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').replace(/<think>[\s\S]*$/i, '').trim();
}

function parseModelJson(text) {
  if (!text) return null;
  text = stripThink(text).replace(/^```(?:json)?\s*|\s*```$/g, '');
  try { return JSON.parse(text); } catch (_) { /* fall through */ }
  const m = String(text).match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) { /* ignore */ } }
  return null;
}

// Some Ollama builds / non-reasoning models reject the "think" field; remember and retry without it.
let thinkUnsupported = false;
async function postOllama(base, path, body, timeoutMs) {
  const send = b => fetchWithTimeout(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }, timeoutMs);
  const b1 = Object.assign({}, body);
  if (thinkUnsupported) delete b1.think;
  let res = await send(b1);
  if (res.status === 400 && 'think' in b1) {
    const t = await res.clone().text().catch(() => '');
    if (/think/i.test(t)) { thinkUnsupported = true; delete b1.think; res = await send(b1); }
  }
  return res;
}

/* Streaming: Ollama sends NDJSON lines {message:{content}, done}. Timeouts: the whole
 * request must finish within totalMs; once tokens flow, a stall of idleMs also aborts. */
async function streamOllama(base, path, body, { totalMs, idleMs, onDelta }) {
  const ctrl = new AbortController();
  let timedOut = false;
  const total = setTimeout(() => { timedOut = true; ctrl.abort(); }, totalMs);
  let idle = null;
  const bump = () => { if (!idleMs) return; clearTimeout(idle); idle = setTimeout(() => { timedOut = true; ctrl.abort(); }, idleMs); };
  const sendOnce = b => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b), signal: ctrl.signal });
  const b1 = Object.assign({}, body, { stream: true });
  if (thinkUnsupported) delete b1.think;
  let text = '';
  try {
    let res = await sendOnce(b1);
    if (res.status === 400 && 'think' in b1) {
      const tt = await res.clone().text().catch(() => '');
      if (/think/i.test(tt)) { thinkUnsupported = true; delete b1.think; res = await sendOnce(b1); }
    }
    if (!res.ok) return { ok: false, status: res.status, error: await res.text().catch(() => ''), text };
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bump();
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        let o; try { o = JSON.parse(line); } catch (_) { continue; }
        if (o.error) return { ok: false, status: 500, error: o.error, text };
        const d = (o.message && o.message.content) || o.response || '';
        if (d) { text += d; if (onDelta) onDelta(d, text); }
        if (o.done) { reader.cancel().catch(() => {}); return { ok: true, text }; }
      }
    }
    return { ok: true, text };
  } catch (e) {
    if (timedOut || (e && e.name === 'AbortError')) return { ok: false, timeout: true, text };
    return { ok: false, network: true, error: String(e && e.message || e), text };
  } finally { clearTimeout(total); clearTimeout(idle); }
}

// Pull completed "id": value pairs out of a JSON reply that was cut off by a timeout.
function salvageAnswers(text) {
  const out = {};
  const t = stripThink(text);
  const re = /"(f\d+)"\s*:\s*("(?:[^"\\]|\\.)*"|null|true|false|-?\d+(?:\.\d+)?|\[(?:[^\]"]|"(?:[^"\\]|\\.)*")*\])/g;
  let m;
  while ((m = re.exec(t))) { try { out[m[1]] = JSON.parse(m[2]); } catch (_) { /* ignore */ } }
  return out;
}

// Display text while streaming: drop <think> blocks (complete or still open).
function visibleText(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/i, '').replace(/^\s+/, '');
}

/* Session answer cache for short questions (cleared when profile/answers/settings change). */
const cacheKey = (model, q) => model + '|' + JAA.normText(q.question) + '|' + (q.options || []).map(JAA.normText).join('/') + '|' + (q.type || '');
async function cacheGet() { try { return (await chrome.storage.session.get('answerCache')).answerCache || {}; } catch (_) { return {}; } }
async function cachePut(entries) {
  try { const c = await cacheGet(); Object.assign(c, entries); const ks = Object.keys(c); if (ks.length > 400) ks.slice(0, ks.length - 400).forEach(k => delete c[k]); await chrome.storage.session.set({ answerCache: c }); } catch (_) { /* ignore */ }
}

/* Warm-up: load the model into memory before the real request (first load on 8 GB can take a while). */
let warm = { model: '', at: 0, promise: null };
async function warmUp(force) {
  const { settings } = await JAA.loadAll();
  if (!settings.useLLM || settings.warmUp === false) return { ok: true, skipped: true };
  if (warm.promise && warm.model === settings.model) return warm.promise;
  if (!force && warm.model === settings.model && Date.now() - warm.at < 20 * 60 * 1000) return { ok: true, cached: true };
  const base = trimUrl(settings.ollamaUrl);
  warm.model = settings.model;
  warm.promise = (async () => {
    const t0 = Date.now();
    try {
      // /api/generate with no prompt just loads the model and keeps it resident
      const res = await postOllama(base, '/api/generate', { model: settings.model, keep_alive: KEEP_ALIVE, think: false, stream: false }, Math.max(60, settings.llmFirstTimeoutSec || 180) * 1000);
      if (res.status === 403) return { ok: false, error: ORIGINS_HINT };
      if (res.status === 404) return { ok: false, error: `Model "${settings.model}" not found. Run: ollama pull ${settings.model}` };
      if (!res.ok) return { ok: false, error: `Ollama warm-up HTTP ${res.status}` };
      warm.at = Date.now();
      return { ok: true, ms: Date.now() - t0 };
    } catch (e) {
      return { ok: false, error: explainFetchError(e, base, settings.llmFirstTimeoutSec || 180) };
    } finally { warm.promise = null; }
  })();
  return warm.promise;
}

/* ---------------- Chrome built-in AI (LanguageModel API) ---------------- */
async function checkChromeAI() {
  if (typeof globalThis.LanguageModel === 'undefined') return { available: false, reason: 'api_unavailable' };
  try {
    const availability = await LanguageModel.availability({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }]
    });
    return { available: availability !== 'unavailable', status: availability };
  } catch (e) {
    return { available: false, reason: 'check_failed', error: String(e.message || e) };
  }
}

async function answerWithChromeAI(questions, opts) {
  opts = opts || {};
  const { profile, answerBank } = await JAA.loadAll();
  const kind = opts.kind === 'essay' ? 'essay' : 'short';
  const cached = {};
  
  // Try session cache for short answers
  if (kind === 'short') {
    const c = await cacheGet();
    const cacheKey = (q) => 'chrome|' + JAA.normText(q.question) + '|' + (q.options || []).map(JAA.normText).join('/') + '|' + (q.type || '');
    for (const q of questions) { const v = c[cacheKey(q)]; if (v != null) cached[q.id] = v; }
    questions = questions.filter(q => !(q.id in cached));
    if (!questions.length) return { ok: true, answers: cached, cached: Object.keys(cached).length, engine: 'chrome' };
  }

  const { system, user } = buildPrompt(profile, answerBank, questions, kind, opts.company, { 
    jobTitle: opts.jobTitle, jobDescription: opts.jobDescription, draftLength: opts.draftLength || 'short' 
  });
  
  let session;
  try {
    session = await LanguageModel.create({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
      initialPrompts: [{ role: 'system', content: system }],
      temperature: kind === 'essay' ? 0.4 : 0.1,
      topK: 40,
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          // Download progress events - could be forwarded to UI in future
          const pct = e.total ? Math.floor((e.loaded / e.total) * 100) : 0;
          console.log(`Chrome AI model downloading: ${pct}%`);
        });
      }
    });
  } catch (e) {
    return { ok: false, error: `Chrome AI session creation failed: ${String(e.message || e)}`, engine: 'chrome' };
  }

  const t0 = Date.now();
  let text = '';
  try {
    text = await session.prompt(user);
  } catch (e) {
    session.destroy();
    return { ok: false, error: `Chrome AI prompt failed: ${String(e.message || e)}`, engine: 'chrome' };
  } finally {
    session.destroy();
  }

  const parsed = parseModelJson(text);
  if (!parsed) return { ok: false, error: 'Chrome AI reply was not valid JSON.', engine: 'chrome' };
  const answers = parsed.answers && typeof parsed.answers === 'object' ? parsed.answers : parsed;
  
  if (kind === 'short') {
    const put = {};
    const cacheKey = (q) => 'chrome|' + JAA.normText(q.question) + '|' + (q.options || []).map(JAA.normText).join('/') + '|' + (q.type || '');
    for (const q of questions) if (answers[q.id] != null && answers[q.id] !== '') put[cacheKey(q)] = answers[q.id];
    cachePut(put);
  }
  
  return { ok: true, answers: Object.assign({}, answers, cached), ms: Date.now() - t0, engine: 'chrome' };
}

async function polishWithRewriter(text, instruction) {
  // Chrome Rewriter/Writer API for polishing longer text
  if (typeof globalThis.Rewriter === 'undefined' && typeof globalThis.Writer === 'undefined') {
    return { ok: false, unavailable: true };
  }
  
  try {
    const API = typeof globalThis.Rewriter !== 'undefined' ? globalThis.Rewriter : globalThis.Writer;
    const availability = await API.availability({ expectedInputs: [{ type: 'text', languages: ['en'] }] });
    if (availability === 'unavailable') return { ok: false, unavailable: true };
    
    const session = await API.create({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      tone: instruction === 'shorter' ? 'more-casual' : instruction === 'more technical' ? 'more-formal' : 'as-is',
      length: instruction === 'shorter' ? 'shorter' : 'as-is'
    });
    
    const result = await session.rewrite(text);
    session.destroy();
    return { ok: true, text: result };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

async function answerQuestions(questions, opts) {
  opts = opts || {};
  const { profile, answerBank, settings } = await JAA.loadAll();
  if (!settings.useLLM) return { ok: false, error: 'Local AI is turned off in Options.' };
  // the model never answers (or guesses) voluntary self-identification questions
  questions = (questions || []).filter(q => !JAA.isEeoText([q.question, q.label, q.desc, q.hint].filter(Boolean).join(' '), q.options));
  if (!questions.length) return { ok: true, answers: {} };
  
  const engine = settings.aiEngine || 'auto';
  
  // Try Chrome built-in AI first if engine is 'auto' or 'chrome'
  if (engine === 'auto' || engine === 'chrome') {
    const chromeCheck = await checkChromeAI();
    if (chromeCheck.available) {
      const result = await answerWithChromeAI(questions, opts);
      if (result.ok) return result;
      // If Chrome AI failed and engine is 'chrome', return the error
      if (engine === 'chrome') return result;
      // If engine is 'auto', fall through to Ollama
      console.log('Chrome AI failed, falling back to Ollama:', result.error);
    } else if (engine === 'chrome') {
      // User explicitly wants Chrome only, but it's not available
      return { ok: false, error: `Chrome built-in AI is not available on this device. ${chromeCheck.reason === 'api_unavailable' ? 'Chrome 138+ required.' : ''}` };
    }
  }
  
  // Ollama path (original implementation)
  // Ollama path (original implementation)
  if (engine === 'ollama' || engine === 'auto') {
    const kind = opts.kind === 'essay' ? 'essay' : 'short';
    // short factual answers are cached for this browser session: the same question on the
    // next application (or a re-fill) is answered instantly
    const cached = {};
    if (kind === 'short') {
      const c = await cacheGet();
      for (const q of questions) { const v = c[cacheKey(settings.model, q)]; if (v != null) cached[q.id] = v; }
      questions = questions.filter(q => !(q.id in cached));
      if (!questions.length) return { ok: true, answers: cached, cached: Object.keys(cached).length, engine: 'ollama' };
    }
    if (warm.promise) await warm.promise; // don't queue behind a model load twice
    const base = trimUrl(settings.ollamaUrl);
    const timeoutSec = Number(opts.timeoutSec) || settings.llmTimeoutSec || 90;
    const { system, user } = buildPrompt(profile, answerBank, questions, kind, opts.company, { jobTitle: opts.jobTitle, jobDescription: opts.jobDescription, draftLength: settings.draftLength });
    const perQ = kind === 'essay' ? ({ short: 220, medium: 320, long: 480 }[settings.draftLength] || 220) : 60;
    const body = {
      model: settings.model,
      think: false,
      format: 'json',
      keep_alive: KEEP_ALIVE,
      options: { temperature: kind === 'essay' ? 0.4 : 0.1, num_ctx: NUM_CTX, num_predict: Math.min(1536, 80 + perQ * questions.length) },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    };
    const t0 = Date.now();
    const r = await streamOllama(base, '/api/chat', body, { totalMs: timeoutSec * 1000 });
    if (r.status === 403) return { ok: false, fatal: true, error: ORIGINS_HINT, engine: 'ollama' };
    if (r.status === 404) return { ok: false, fatal: true, error: `Model "${settings.model}" not found. Run: ollama pull ${settings.model}`, engine: 'ollama' };
    if (r.network) return { ok: false, fatal: true, error: explainFetchError(r, base, timeoutSec), engine: 'ollama' };
    const hint = !/qwen2\.5:3b/.test(settings.model) ? SLOW_MODEL_HINT : '';
    if (r.timeout) {
      // keep whatever answers were complete before the timeout
      const part = salvageAnswers(r.text);
      const n = Object.keys(part).length;
      const err = explainFetchError({ name: 'AbortError' }, base, timeoutSec) + hint;
      if (n) return { ok: true, partial: true, timeout: true, answers: Object.assign(part, cached), error: err, engine: 'ollama' };
      return { ok: false, timeout: true, error: err, answers: cached, engine: 'ollama' };
    }
    if (!r.ok) return { ok: false, error: `Ollama error HTTP ${r.status}: ${String(r.error || '').slice(0, 200)}`, engine: 'ollama' };
    warm.at = Date.now(); warm.model = settings.model;
    const parsed = parseModelJson(r.text);
    if (!parsed) return { ok: false, error: 'The model reply was not valid JSON. Try again, or use qwen2.5:3b.', engine: 'ollama' };
    const answers = parsed.answers && typeof parsed.answers === 'object' ? parsed.answers : parsed;
    if (kind === 'short') {
      const put = {};
      for (const q of questions) if (answers[q.id] != null && answers[q.id] !== '') put[cacheKey(settings.model, q)] = answers[q.id];
      cachePut(put);
    }
    return { ok: true, answers: Object.assign({}, answers, cached), ms: Date.now() - t0, engine: 'ollama' };
  }
  
  // If we get here, engine setting is invalid
  return { ok: false, error: `Invalid AI engine setting: ${engine}` };
}

/* ---------------- chat assistant + single-answer drafts (streamed over a port) ---------------- */
function chatPrompt(profile, ctx) {
  const { facts, resumeText } = profileFacts(profile, true);
  const system =
    'You are AI Job Application Assistant, a helper running locally inside the candidate\'s browser while they fill out a job application. ' +
    'You can see the job, its description, the candidate\'s profile and resume, and the current form fields. ' +
    'Be brief and practical (1-4 sentences) unless you are writing an answer for a field. Never invent facts that are not in the profile or resume. ' +
    'You never submit anything and never press Next/Continue/Submit; the candidate does that himself. ' +
    'Do not ask about, store or mention personal details unrelated to the job (pets, family, religion, health). ' +
    'If the candidate asks you to fill, change or rewrite a form field, reply with one short sentence, then on its own last line write exactly: ' +
    'ACTION {"action":"set_field","field":"<field id from the list>","value":"<the complete new value>"} . ' +
    'Use only field ids from the list; for fields with options the value must be one of the options. Only one ACTION per reply. ' +
    'Do not think out loud.';
  const fieldsJson = JSON.stringify((ctx.fields || []).slice(0, 40));
  const user =
    `Job: ${ctx.title || '?'} at ${ctx.company || '?'} (${ctx.site || ''})\n` +
    (ctx.step ? `Application step: ${ctx.step}\n` : '') +
    (ctx.jobDescription ? `Job description (excerpt): ${String(ctx.jobDescription).slice(0, 1800)}\n` : '') +
    `Candidate facts (JSON): ${JSON.stringify(facts)}\n` +
    (resumeText ? `Resume text: ${resumeText.slice(0, 2000)}\n` : '') +
    styleBlock(profile) +
    `Form fields (JSON; status ok=filled from profile, saved=from saved answers, ai=AI draft, you=answered by the candidate, todo=still empty): ${fieldsJson}\n`;
  const history = (ctx.history || []).slice(-8).map(m => ({ role: m.role === 'me' ? 'user' : 'assistant', content: String(m.text || '').slice(0, 1200) }));
  return [{ role: 'system', content: system }, { role: 'user', content: user + '\n(Context above. The conversation follows.)' }, { role: 'assistant', content: 'Got it. How can I help with this application?' }]
    .concat(history).concat([{ role: 'user', content: String(ctx.message || '').slice(0, 2000) }]);
}

function draftPrompt(profile, ctx, settings) {
  const { facts, resumeText } = profileFacts(profile, true);
  const len = JAA.DRAFT_LENGTHS[settings.draftLength] || JAA.DRAFT_LENGTHS.short;
  const system =
    `Write the candidate's answer to one job application question, in first person, in their own voice. Length: ${len}. ` +
    'Ground every claim in the profile facts and resume text; never invent employers, numbers or skills. ' +
    'Tailor it to the job description. Match the tone notes and the voice of the writing samples (do not copy their content). ' +
    'Output only the answer text: no preamble, no title, no quotes, no markdown. Do not think out loud.';
  const user =
    `Job: ${ctx.title || '?'} at ${ctx.company || '?'}\n` +
    (ctx.jobDescription ? `Job description (excerpt): ${String(ctx.jobDescription).slice(0, 2000)}\n` : '') +
    `Candidate facts (JSON): ${JSON.stringify(facts)}\n` +
    (resumeText ? `Resume text: ${resumeText.slice(0, 2500)}\n` : '') +
    styleBlock(profile) +
    (ctx.examples && ctx.examples.length ? `Earlier answers to similar questions (adapt, don't copy company names): ${JSON.stringify(ctx.examples.slice(0, 3))}\n` : '') +
    (ctx.liked && ctx.liked.length ? `Answers the candidate liked (👍; match this quality and style, don't copy): ${JSON.stringify(ctx.liked.slice(0, 2))}\n` : '') +
    (ctx.disliked && ctx.disliked.length ? `Answers the candidate disliked (👎; avoid writing like this): ${JSON.stringify(ctx.disliked.slice(0, 2))}\n` : '') +
    `Question: ${ctx.question}\n` +
    (ctx.previous ? `Previous draft (write a clearly different, better version): ${String(ctx.previous).slice(0, 1500)}\n` : '') +
    (ctx.instruction ? `Instruction from the candidate: ${String(ctx.instruction).slice(0, 400)}\n` : '');
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

function splitAction(text) {
  const t = stripThink(text);
  const i = t.search(/\n?\s*ACTION\s*:?\s*\{/);
  if (i < 0) return { reply: t.trim(), action: null };
  const reply = t.slice(0, i).trim();
  const m = t.slice(i).match(/\{[\s\S]*\}/);
  let action = null;
  if (m) { try { action = JSON.parse(m[0]); } catch (_) { const k = m[0].match(/\{[^{}]*\}/); if (k) { try { action = JSON.parse(k[0]); } catch (__) { /* ignore */ } } } }
  return { reply, action };
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'jaa-stream') return;
  let closed = false;
  port.onDisconnect.addListener(() => { closed = true; });
  const post = m => { if (!closed) try { port.postMessage(m); } catch (_) { /* gone */ } };
  port.onMessage.addListener(async msg => {
    const { profile, answerBank, settings } = await JAA.loadAll();
    if (!settings.useLLM) return post({ type: 'error', error: 'Local AI is turned off in Options.' });
    if (warm.promise) { post({ type: 'status', text: 'Loading local model…' }); await warm.promise; }
    const base = trimUrl(settings.ollamaUrl);
    const draft = msg.mode === 'draft';
    if (draft && !msg.examples) {
      msg.examples = answerBank.filter(x => x && x.q && x.a && JAA.textSim(x.q, msg.question) >= 0.35).slice(0, 3)
        .map(x => ({ q: String(x.q).replace(/\{company\}/g, msg.company || 'the company'), a: String(x.a).replace(/\{company\}/g, msg.company || 'the company') }));
    }
    if (draft) { const fb = await feedbackExamples(msg.question || '', msg.company || ''); msg.liked = fb.liked; msg.disliked = fb.disliked; }
    const messages = draft ? draftPrompt(profile, msg, settings) : chatPrompt(profile, msg);
    const predict = draft ? ({ short: 260, medium: 380, long: 560 }[settings.draftLength] || 260) : 700;
    const timeoutSec = (Date.now() - warm.at < 20 * 60 * 1000) ? (settings.llmTimeoutSec || 90) : (settings.llmFirstTimeoutSec || 180);
    const r = await streamOllama(base, '/api/chat', {
      model: settings.model, think: false, keep_alive: KEEP_ALIVE,
      options: { temperature: draft ? 0.6 : 0.3, num_ctx: NUM_CTX, num_predict: predict },
      messages
    }, { totalMs: Math.max(timeoutSec, 60) * 1000 * 2, idleMs: timeoutSec * 1000, onDelta: (d, all) => post({ type: 'delta', text: visibleText(all).replace(/\n?\s*ACTION\s*:?[\s\S]*$/, '') }) });
    if (r.status === 403) return post({ type: 'error', error: ORIGINS_HINT });
    if (r.status === 404) return post({ type: 'error', error: `Model "${settings.model}" not found. Run: ollama pull ${settings.model}` });
    if (r.network) return post({ type: 'error', error: explainFetchError(r, base, timeoutSec) });
    if (!r.ok && !r.timeout) return post({ type: 'error', error: `Ollama error HTTP ${r.status}: ${String(r.error || '').slice(0, 200)}` });
    warm.at = Date.now(); warm.model = settings.model;
    if (draft) {
      const txt = stripThink(r.text).replace(/^["“]|["”]$/g, '').trim();
      return post({ type: 'done', text: txt, timeout: !!r.timeout, error: r.timeout ? 'The model stopped before finishing (timeout).' + SLOW_MODEL_HINT : '' });
    }
    const { reply, action } = splitAction(r.text);
    post({ type: 'done', text: reply, action, timeout: !!r.timeout, error: r.timeout ? 'The model took too long and was cut off.' + SLOW_MODEL_HINT : '' });
  });
});

/* ---------------- answer bank learning ---------------- */
let bankLock = Promise.resolve();
function learnAnswers(entries, force) {
  const run = bankLock.then(async () => {
    const { answerBank = [], settings = {} } = await chrome.storage.local.get(['answerBank', 'settings']);
    if (settings.rememberAnswers === false && !force) return { ok: false, disabled: true, added: 0, updated: 0 };
    const clean = (entries || []).filter(e => e && e.q && !JAA.NEVER_LEARN.test(JAA.normText(e.q)) && String(e.a || '').length <= 4000);
    const r = JAA.mergeIntoBank(answerBank, clean);
    await chrome.storage.local.set({ answerBank: r.bank });
    return { ok: true, added: r.added, updated: r.updated };
  });
  bankLock = run.catch(() => {});
  return run;
}

/* ---------------- tracker ---------------- */
const TRACKER_VERSION = 3;
const PENDING_TTL_MS = 30 * 60 * 1000; // a submit is "pending" for 30 min

const normUrl = u => String(u || '').split('#')[0].split('?')[0].replace(/\/+$/, '');

// v1 rows: {company,title,url,site,date,firstFilled,status,filled,ai,todo}
// v2 adds: key, submittedAt, confirmedAt, errorAt, lastError, history[]
// v3 (0.5) adds: stage (saved|applied|screen|interview|offer|rejected|withdrawn), stageDates{}, notes,
//   reminderAt, bookmarked, via ('fill' | 'tracked' | 'bookmark'), location, salary
function migrateRow(a) {
  const row = Object.assign({ status: JAA.STATUS.FILLED, submittedAt: '', confirmedAt: '', errorAt: '', lastError: '', history: [], notes: '', reminderAt: '' }, a);
  if (!row.key) row.key = JAA.jobKey(row.formUrl || row.url);
  if (!row.firstFilled && row.date && row.status === JAA.STATUS.FILLED && !row.bookmarked) row.firstFilled = row.date;
  if (!Array.isArray(row.history)) row.history = [];
  if (!row.stage) row.stage = JAA.stageFromStatus(row.status);
  if (!row.stageDates || typeof row.stageDates !== 'object') {
    row.stageDates = {};
    row.stageDates[row.stage] = (row.stage === 'applied' ? (row.confirmedAt || row.submittedAt) : '') || row.date || '';
    if (row.stage !== 'saved' && row.stage !== 'applied' && (row.submittedAt || row.confirmedAt)) row.stageDates.applied = row.confirmedAt || row.submittedAt;
  }
  if (!row.via) row.via = row.bookmarked ? 'bookmark' : (row.firstFilled || row.filled != null ? 'fill' : 'tracked');
  return row;
}
function setStage(row, stage, when) {
  if (!JAA.STAGE_LABEL[stage]) return false;
  row.stage = stage;
  row.stageDates = Object.assign({}, row.stageDates || {});
  if (!row.stageDates[stage]) row.stageDates[stage] = when || new Date().toISOString();
  return true;
}

let trackerLock = Promise.resolve();
// Serialise read-modify-write of the tracker so near-simultaneous events don't clobber each other.
function withTracker(fn) {
  const run = trackerLock.then(async () => {
    const st = await chrome.storage.local.get(['applications', 'trackerVersion', 'pendingSubmissions']);
    let apps = (st.applications || []).map(migrateRow);
    if ((st.trackerVersion || 1) < TRACKER_VERSION) {
      // merge v1 duplicates that now share a key (e.g. /jobs/1 and /jobs/1/apply)
      const seen = new Map();
      apps = apps.filter(r => {
        const prev = seen.get(r.key);
        if (!prev) { seen.set(r.key, r); return true; }
        Object.keys(r).forEach(k => { if (prev[k] === undefined || prev[k] === '') prev[k] = r[k]; });
        return false;
      });
    }
    const pending = st.pendingSubmissions || {};
    for (const k of Object.keys(pending)) if (Date.now() - pending[k].at > PENDING_TTL_MS) delete pending[k];
    const out = await fn(apps, pending);
    await chrome.storage.local.set({ applications: apps, pendingSubmissions: pending, trackerVersion: TRACKER_VERSION });
    return out;
  });
  trackerLock = run.catch(() => {});
  return run;
}

function findRow(apps, entry) {
  const key = entry.key || JAA.jobKey(entry.formUrl || entry.url);
  let i = apps.findIndex(a => a.key === key);
  if (i < 0 && entry.url) i = apps.findIndex(a => normUrl(a.url) === normUrl(entry.url));
  return { i, key };
}

function upsert(apps, entry) {
  const { i, key } = findRow(apps, entry);
  const now = new Date().toISOString();
  const clean = {};
  for (const k of ['company', 'title', 'url', 'formUrl', 'site', 'location', 'salary']) if (entry[k]) clean[k] = entry[k];
  if (i >= 0) {
    // keep a good company/title we already had (confirmation pages often have generic titles)
    if (entry.weakInfo) {
      for (const k of ['title', 'company', 'url', 'formUrl']) if (apps[i][k]) delete clean[k];
    }
    Object.assign(apps[i], clean, { key, date: now });
    return apps[i];
  }
  const row = migrateRow(Object.assign({ status: JAA.STATUS.FILLED, firstFilled: '' }, clean, { key, date: now }));
  apps.unshift(row);
  return row;
}

async function logApplication(entry) {
  return withTracker(apps => {
    const isNew = findRow(apps, entry).i < 0;
    const row = upsert(apps, entry);
    Object.assign(row, { filled: entry.filled, ai: entry.ai, todo: entry.todo });
    if (isNew || !row.firstFilled) row.firstFilled = row.date;
    return { ok: true, count: apps.length };
  });
}

const BADGE = {
  [JAA.STATUS.SUBMITTED]: ['…', '#d97706'],
  [JAA.STATUS.APPLIED]: ['✓', '#16a34a'],
  [JAA.STATUS.ERROR]: ['!', '#dc2626']
};
async function setBadge(tabId, status) {
  if (tabId == null || tabId < 0) return;
  const { settings } = await JAA.loadAll();
  if (!settings.showBadge) return;
  const b = BADGE[status];
  try {
    await chrome.action.setBadgeText({ tabId, text: b ? b[0] : '' });
    if (b) await chrome.action.setBadgeBackgroundColor({ tabId, color: b[1] });
    await chrome.action.setTitle({ tabId, title: 'AI Job Application Assistant' + (b ? ' — ' + status : '') });
  } catch (_) { /* tab may be gone */ }
}

// event: 'submitted' | 'confirmed' | 'error'
async function trackerEvent(msg, sender) {
  const { settings } = await JAA.loadAll();
  if (!settings.trackSubmissions) return { ok: false, disabled: true };
  const tabId = sender && sender.tab ? sender.tab.id : null;
  const res = await withTracker((apps, pending) => {
    const entry = Object.assign({}, msg.entry);
    // "Track applications submitted without Fill" off: only follow jobs that were filled (or are already tracked)
    if (settings.trackWithoutFill === false && !entry.filledHere && !findRowExists(apps, entry) && !Object.values(pending).some(x => x.tabId === tabId)) return { ok: false, disabled: true, withoutFill: true };
    // a confirmation page may only know the tab: fall back to that tab's pending submit
    if (msg.event !== 'submitted' && !findRowExists(apps, entry)) {
      const p = Object.values(pending).find(x => x.tabId === tabId);
      if (p) { entry.key = p.key; entry.weakInfo = true; }
    }
    const isNew = !findRowExists(apps, entry);
    const row = upsert(apps, entry);
    if (isNew) { row.via = entry.filledHere ? 'fill' : 'tracked'; if (!entry.filledHere) { row.stageDates = {}; row.firstFilled = ''; } }
    const now = new Date().toISOString();
    const before = row.status;
    const manual = JAA.MANUAL_STATUSES.includes(row.status);
    const log = (what, detail) => { row.history.push({ at: now, event: what, detail: detail || '' }); if (row.history.length > 20) row.history.shift(); };
    if (msg.event === 'submitted') {
      row.submittedAt = now;
      row.lastError = '';
      if (!manual && row.status !== JAA.STATUS.APPLIED) row.status = JAA.STATUS.SUBMITTED;
      pending[row.key] = { key: row.key, tabId, at: Date.now(), url: entry.url };
      if (row.stage === 'saved' || !row.stage) setStage(row, 'applied', now);
      log('submitted', msg.detail);
    } else if (msg.event === 'confirmed') {
      row.confirmedAt = now;
      if (!row.submittedAt) row.submittedAt = now;
      row.lastError = '';
      if (!manual) row.status = JAA.STATUS.APPLIED;
      if (row.stage === 'saved' || !row.stage) setStage(row, 'applied', now);
      delete pending[row.key];
      log('confirmed', msg.detail);
    } else if (msg.event === 'error') {
      row.errorAt = now;
      row.lastError = String(msg.detail || 'Validation error after submit').slice(0, 300);
      if (!manual && row.status !== JAA.STATUS.APPLIED) row.status = JAA.STATUS.ERROR;
      log('error', row.lastError);
    }
    const bump = markRatingCounted(row);
    return { ok: true, changed: before !== row.status, status: row.status, isNew, bump, row: Object.assign({}, row, { history: undefined }) };
  });
  if (res.bump) await ratingBump(res.bump);
  delete res.bump;
  await setBadge(tabId, res.status);
  return res;
}
function findRowExists(apps, entry) { return findRow(apps, entry).i >= 0; }

async function getPending(msg, sender) {
  const tabId = sender && sender.tab ? sender.tab.id : null;
  const { pendingSubmissions = {} } = await chrome.storage.local.get('pendingSubmissions');
  const fresh = Object.values(pendingSubmissions).filter(p => Date.now() - p.at < PENDING_TTL_MS);
  // same job first; otherwise a very recent submit from this tab (confirmation URL in another format)
  const p = fresh.find(x => x.key === msg.key) || fresh.find(x => x.tabId === tabId && Date.now() - x.at < 10 * 60 * 1000) || null;
  return { ok: true, pending: p };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && V4_TYPES.has(msg.type)) return false; // answered by the v0.4 listener below
  // the built-in practice page: nothing it does goes into the tracker or the answer bank
  if (msg && sender && sender.url && sender.url.startsWith(chrome.runtime.getURL('practice/')) && /^(tracker:log|tracker:event|tracker:pending|bank:learn)$/.test(msg.type)) {
    // ...but a finished fill there ticks "Try a practice fill" on the setup checklist
    if (msg.type === 'tracker:log' && msg.entry && msg.entry.filled > 0) activationSet(s => ACT.mark(s, 'practice')).catch(() => {});
    sendResponse({ ok: true, practice: true }); return false;
  }
  if (msg && msg.type === 'tracker:log' && msg.entry && msg.entry.filled > 0 && sender && sender.tab && /^https?:/.test(sender.url || '')) {
    activationSet(s => ACT.mark(s, 'real')).catch(() => {}); // first real application filled (local only)
  }
  (async () => {
    switch (msg && msg.type) {
      case 'ollama:test': return testConnection(msg.settings);
      case 'ollama:answer': return answerQuestions(msg.questions, { kind: msg.kind, timeoutSec: msg.timeoutSec, company: msg.company, jobTitle: msg.jobTitle, jobDescription: msg.jobDescription });
      case 'chromeai:check': return checkChromeAI();
      case 'chromeai:polish': return polishWithRewriter(msg.text, msg.instruction);
      case 'session:get': return getSession(msg.key);
      case 'session:update': return updateSession(msg.key, msg.patch, msg.step);
      case 'backup:list': return listBackups();
      case 'backup:now': return snapshot(msg.reason || 'manual', true);
      case 'backup:restore': return restoreBackup(msg.at);
      case 'bank:learn': return learnAnswers(msg.entries, msg.force);
      case 'ollama:warm': return warmUp(msg.force);
      case 'tracker:log': return logApplication(msg.entry);
      case 'tracker:event': return trackerEvent(msg, sender);
      case 'tracker:pending': return getPending(msg, sender);
      case 'tracker:migrate': return withTracker(apps => ({ ok: true, count: apps.length }));
      case 'options:open':
        // deep link: the options page reads optionsGoto and scrolls to that section
        await chrome.storage.local.set({ optionsGoto: { section: msg.section || 'profile', at: Date.now() } });
        await chrome.runtime.openOptionsPage();
        return { ok: true };
      default: return { ok: false, error: 'Unknown message ' + (msg && msg.type) };
    }
  })().then(sendResponse, err => sendResponse({ ok: false, error: String(err && err.message || err) }));
  return true; // keep the channel open for the async reply
});

/* ---------------- application sessions (multi-step / multi-page forms) ---------------- */
const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
let sessionLock = Promise.resolve();
async function getSession(key) {
  const { sessions = {} } = await chrome.storage.local.get('sessions');
  const s = sessions[key];
  return { ok: true, session: s && Date.now() - s.updatedAt < SESSION_TTL_MS ? s : null };
}
function updateSession(key, patch, step) {
  const run = sessionLock.then(async () => {
    const { sessions = {} } = await chrome.storage.local.get('sessions');
    const now = Date.now();
    const s = sessions[key] && now - sessions[key].updatedAt < SESSION_TTL_MS ? sessions[key] : { key, startedAt: now, active: true, steps: {}, order: [] };
    Object.assign(s, patch || {}, { updatedAt: now });
    if (step && step.id) {
      s.steps[step.id] = Object.assign(s.steps[step.id] || {}, step, { at: now });
      if (!s.order.includes(step.id)) s.order.push(step.id);
      s.current = step.id;
    }
    sessions[key] = s;
    // keep the 40 most recent sessions
    const keys = Object.keys(sessions).sort((a, b) => sessions[b].updatedAt - sessions[a].updatedAt);
    keys.slice(40).forEach(k => delete sessions[k]);
    await chrome.storage.local.set({ sessions });
    return { ok: true, session: s };
  });
  sessionLock = run.catch(() => {});
  return run;
}

/* ---------------- automatic backups (rolling last 5) ---------------- */
const BACKUP_KEYS = ['profile', 'answerBank', 'applications', 'settings'];
const MAX_BACKUPS = 5;
const AUTO_BACKUP_EVERY_MS = 30 * 60 * 1000;
function hashStr(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; return h.toString(36) + ':' + str.length; }
let backupLock = Promise.resolve();
function snapshot(reason, force) {
  const run = backupLock.then(async () => {
    const st = await chrome.storage.local.get(BACKUP_KEYS.concat(['backups']));
    if (st.settings && st.settings.autoBackup === false && !force) return { ok: false, disabled: true };
    const data = {}; BACKUP_KEYS.forEach(k => { if (st[k] !== undefined) data[k] = st[k]; });
    if (!data.profile && !(data.answerBank || []).length && !(data.applications || []).length) return { ok: false, empty: true };
    const backups = st.backups || [];
    const h = hashStr(JSON.stringify(data));
    const last = backups[backups.length - 1];
    if (last && last.hash === h) return { ok: true, unchanged: true, at: last.at };
    if (!force && last && Date.now() - last.at < AUTO_BACKUP_EVERY_MS && reason === 'auto') return { ok: true, skipped: true };
    const entry = { at: Date.now(), reason, version: chrome.runtime.getManifest().version, hash: h,
      counts: { answers: (data.answerBank || []).length, applications: (data.applications || []).length, profile: !!data.profile }, data };
    backups.push(entry);
    while (backups.length > MAX_BACKUPS) backups.shift();
    await chrome.storage.local.set({ backups });
    return { ok: true, at: entry.at };
  });
  backupLock = run.catch(() => {});
  return run;
}
async function listBackups() {
  const { backups = [] } = await chrome.storage.local.get('backups');
  return { ok: true, backups: backups.map(b => ({ at: b.at, reason: b.reason, version: b.version, counts: b.counts })) };
}
async function restoreBackup(at) {
  const { backups = [] } = await chrome.storage.local.get('backups');
  const b = backups.find(x => x.at === at);
  if (!b) return { ok: false, error: 'Backup not found.' };
  await snapshot('before restore', true);
  await chrome.storage.local.set(b.data);
  return { ok: true };
}
let autoTimer = null;
chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== 'local') return;
  if (ch.profile || ch.answerBank || ch.settings) { try { chrome.storage.session.remove('answerCache'); } catch (_) { /* ignore */ } }
  if (ch.profile || ch.answerBank || ch.applications) { clearTimeout(autoTimer); autoTimer = setTimeout(() => snapshot('auto'), 5000); }
});
chrome.runtime.onStartup.addListener(() => { snapshot('browser start'); syncSiteScripts().catch(() => {}); });

// v0.6.6: work history is one list; the old single "Current job" fields become a list entry (kept in
// profile.legacyCurrent too) and "current" follows each job's end date. A snapshot is taken before updates.
async function migrateExperience() {
  const { profile } = await chrome.storage.local.get('profile');
  if (!profile || (profile.expVersion || 0) >= JAA.EXP_VERSION) return;
  await chrome.storage.local.set({ profile: JAA.migrateProfile(profile) });
}
// v0.6.7: a fresh install opens the welcome page once (never on updates, reloads or Chrome updates)
async function openWelcomeOnce() {
  const { welcomeOpenedAt } = await chrome.storage.local.get('welcomeOpenedAt');
  if (welcomeOpenedAt) return false;
  await chrome.storage.local.set({ welcomeOpenedAt: Date.now() });
  await chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/welcome.html') });
  return true;
}
async function handleInstalled(details) {
  if (details.reason === 'install') await openWelcomeOnce();
  // update/reload: snapshot first, then migrate in place (data in chrome.storage.local is kept)
  if (details.reason === 'update') await snapshot('before update to ' + chrome.runtime.getManifest().version, true);
  await withTracker(() => null);
  const { dataVersion } = await chrome.storage.local.get('dataVersion');
  if ((dataVersion || 2) < 4) await migrateV4();
  if ((dataVersion || 2) < 5) await migrateV5(details.reason);
  await migrateExperience();
  if (details.reason === 'update') await noteWhatsNew(details.previousVersion);
  await ratingInit();
  await activationInit(details.reason);
  await installOriginRules();
  await setDefaultIcon();
  await syncSiteScripts().catch(e => console.warn('site scripts', e));
}
chrome.runtime.onInstalled.addListener(details => { handleInstalled(details); });
globalThis.handleInstalled = handleInstalled; // e2e tests replay install/update events

/* ---------- v0.6.7 any site: one click via the popup (activeTab), or "always allow" per site ----------
 * The required host permissions stay the built-in job sites (+ the local AI). Other sites are optional
 * host permissions that the user grants one site at a time from the popup (chrome.permissions.request, a
 * Chrome prompt). For each allowed site we register the same in-page bundle as the built-in sites
 * (scripting.registerContentScripts, persisted), and the Fill button shows only on pages that look like a
 * job application. List: chrome.storage.local `userSites` [{ origin, host, addedAt }]. */
const SITE_SCRIPT_ID = 'jaa-user-sites';
const MANIFEST = chrome.runtime.getManifest();
const REQUIRED_ORIGINS = new Set(MANIFEST.host_permissions || []);
const BUILTIN_JOB_MATCHES = (MANIFEST.content_scripts.find(c => c.js.includes('content/main.js')) || { matches: [] }).matches;
function patternToRegExp(p) {
  const m = /^(\*|https?):\/\/([^/]+)(\/.*)$/.exec(p); if (!m) return null;
  const host = m[2] === '*' ? '[^/]+' : m[2].replace(/\./g, '\\.').replace(/^\*\\\./, '(?:[^/]+\\.)?');
  return new RegExp('^' + (m[1] === '*' ? 'https?' : m[1]) + ':\\/\\/' + host + '(?::\\d+)?\\/');
}
const BUILTIN_RES = BUILTIN_JOB_MATCHES.map(patternToRegExp).filter(Boolean);
const isBuiltInJobSite = url => BUILTIN_RES.some(re => re.test(String(url || '')));
function sitePattern(url) {
  let u; try { u = new URL(url); } catch (_) { return null; }
  if (!/^https?:$/.test(u.protocol) || !u.hostname) return null;
  return { origin: `${u.protocol}//${u.hostname}/*`, host: u.hostname };
}
async function userSitesGet() { const { userSites } = await chrome.storage.local.get('userSites'); return Array.isArray(userSites) ? userSites : []; }
let siteSync = Promise.resolve();
function syncSiteScripts() {
  siteSync = siteSync.catch(() => {}).then(async () => {
    const list = await userSitesGet();
    const granted = [];
    for (const s of list) if (s && s.origin && await chrome.permissions.contains({ origins: [s.origin] }).catch(() => false)) granted.push(s.origin);
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SITE_SCRIPT_ID] }).catch(() => []);
    if (!granted.length) { if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [SITE_SCRIPT_ID] }); return { ok: true, registered: [] }; }
    const def = { id: SITE_SCRIPT_ID, matches: granted, js: globalThis.JAA.CONTENT_FILES, runAt: 'document_idle', allFrames: true, persistAcrossSessions: true };
    if (existing.length) await chrome.scripting.updateContentScripts([def]); else await chrome.scripting.registerContentScripts([def]);
    return { ok: true, registered: granted };
  });
  return siteSync;
}
globalThis.syncSiteScripts = syncSiteScripts;
async function sitesAdd(origin) {
  const pat = sitePattern(String(origin || '').replace(/\*$/, ''));
  if (!pat || pat.origin !== origin) return { ok: false, error: 'Not a web address.' };
  if (!(await chrome.permissions.contains({ origins: [origin] }))) return { ok: false, error: 'Chrome did not grant access to this site.' };
  const list = await userSitesGet();
  if (!list.some(s => s.origin === origin)) list.push({ origin, host: pat.host, addedAt: Date.now() });
  await chrome.storage.local.set({ userSites: list });
  const r = await syncSiteScripts();
  return { ok: true, registered: r.registered };
}
async function sitesRemove(origin) {
  const list = (await userSitesGet()).filter(s => s.origin !== origin);
  await chrome.storage.local.set({ userSites: list });
  // required origins (the local AI addresses) can't be removed; everything the user granted can
  if (!REQUIRED_ORIGINS.has(origin)) await chrome.permissions.remove({ origins: [origin] }).catch(() => false);
  const r = await syncSiteScripts();
  return { ok: true, registered: r.registered };
}
async function sitesOffer(url) {
  const pat = sitePattern(url);
  if (!pat) return { ok: true, show: false, reason: 'not a web page' };
  if (isBuiltInJobSite(url)) return { ok: true, show: false, builtIn: true, host: pat.host };
  const list = await userSitesGet();
  const allowed = list.some(s => s.origin === pat.origin) && await chrome.permissions.contains({ origins: [pat.origin] }).catch(() => false);
  const { siteOffers = {} } = await chrome.storage.local.get('siteOffers');
  const declined = siteOffers[pat.host] && Date.now() - siteOffers[pat.host] < 30 * 864e5;
  return { ok: true, show: !allowed && !declined, allowed, declined: !!declined, host: pat.host, origin: pat.origin };
}
async function sitesDecline(host) {
  const { siteOffers = {} } = await chrome.storage.local.get('siteOffers');
  siteOffers[String(host || '')] = Date.now();
  await chrome.storage.local.set({ siteOffers });
  return { ok: true };
}
async function sitesList() {
  const list = await userSitesGet();
  const user = [];
  for (const s of list) user.push(Object.assign({}, s, { granted: await chrome.permissions.contains({ origins: [s.origin] }).catch(() => false) }));
  return { ok: true, builtIn: BUILTIN_JOB_MATCHES.slice(), user };
}
// access granted or taken away outside our UI (Chrome's site-access menu, chrome://extensions)
chrome.permissions.onAdded.addListener(async p => {
  const extra = (p.origins || []).filter(o => !REQUIRED_ORIGINS.has(o) && /^https?:\/\//.test(o));
  if (extra.length) {
    const list = await userSitesGet();
    for (const o of extra) if (!list.some(s => s.origin === o)) list.push({ origin: o, host: o.replace(/^https?:\/\//, '').replace(/\/\*$/, ''), addedAt: Date.now() });
    await chrome.storage.local.set({ userSites: list });
  }
  syncSiteScripts().catch(() => {});
});
chrome.permissions.onRemoved.addListener(async p => {
  const gone = new Set(p.origins || []);
  if (gone.size) await chrome.storage.local.set({ userSites: (await userSitesGet()).filter(s => !gone.has(s.origin)) });
  syncSiteScripts().catch(() => {});
});

/* ---------- v0.6.7 setup checklist (local only; see lib/activation.js) ---------- */
const ACT = globalThis.JAA.activation;
async function activationSet(fn) {
  const { activation } = await chrome.storage.local.get('activation');
  const next = fn(ACT.normalize(activation));
  if (!ACT.same(activation, next) || !activation) await chrome.storage.local.set({ activation: next });
  return next;
}
const hasProfileData = (profile, resume) => !!(resume || (profile && (profile.firstName || profile.email) && ((profile.workHistory || []).length || profile.resumeText)));
// updating users: mark what they already did, so nobody is asked to redo it
async function activationInit(reason) {
  if (reason !== 'update') return;
  const { applications = [], profile, resume } = await chrome.storage.local.get(['applications', 'profile', 'resume']);
  const real = applications.find(a => a && (a.filled > 0 || a.firstFilled));
  await activationSet(s => {
    if (hasProfileData(profile, resume)) s = ACT.mark(s, 'profile');
    if (real) s = ACT.mark(s, 'real', Date.parse(real.firstFilled || real.date) || Date.now());
    return s;
  });
}
async function aiReadyNow() {
  const c = await checkChromeAI().catch(() => ({}));
  if (c && c.status === 'available') return true;
  const o = await ollamaStatus().catch(() => null);
  return !!(o && o.reachable && o.originOk !== false && o.hasModel);
}
// the checklist as it stands: stored stamps + what is true right now (resume saved, an AI engine answering)
async function activationGet() {
  const { activation, profile, resume } = await chrome.storage.local.get(['activation', 'profile', 'resume']);
  const s0 = ACT.normalize(activation);
  const facts = { hasProfile: hasProfileData(profile, resume), aiReady: s0.aiAt ? true : await aiReadyNow() };
  const s = await activationSet(cur => ACT.reconcile(cur, facts));
  return { ok: true, state: s, view: ACT.view(s) };
}
const ACT_TARGET = { profile: 'onboarding/welcome.html#welcome', ai: 'onboarding/welcome.html#ollama', practice: 'practice/practice.html', real: 'onboarding/welcome.html#ready' };
async function activationGo(step) {
  if (step === 'profile' || step === 'ai' || step === 'real') {
    const url = chrome.runtime.getURL(ACT_TARGET[step]);
    try { // reuse an open setup tab when we can see it (own extension pages); otherwise open a new one
      const base = chrome.runtime.getURL('onboarding/welcome.html');
      const open = (await chrome.tabs.query({})).find(t => t.url && t.url.startsWith(base));
      if (open) { await chrome.tabs.update(open.id, { url, active: true }); return { ok: true, reused: true }; }
    } catch (_) { /* fall through */ }
    await chrome.tabs.create({ url }); return { ok: true };
  }
  if (step === 'practice') { await chrome.tabs.create({ url: chrome.runtime.getURL(ACT_TARGET.practice) }); return { ok: true }; }
  return { ok: false, error: 'Unknown step' };
}
// v0.4: keep everything; switch the old default Ollama URL to 127.0.0.1; existing users skip the setup wizard.
async function migrateV4() {
  const { settings, profile, onboarding } = await chrome.storage.local.get(['settings', 'profile', 'onboarding']);
  const patch = { dataVersion: 4 };
  if (settings && /^http:\/\/localhost:11434\/?$/.test(settings.ollamaUrl || '')) patch.settings = Object.assign({}, settings, { ollamaUrl: 'http://127.0.0.1:11434' });
  if (!onboarding && profile && (profile.firstName || profile.email)) patch.onboarding = { done: true, migrated: true, at: Date.now() };
  await chrome.storage.local.set(patch);
}

// v0.5: new settings get their defaults (merge), tracker rows get stages (withTracker migrates them),
// people who finished setup before 0.5 haven't seen the tour yet (offered, never forced).
async function migrateV5(reason) {
  const { settings, tour } = await chrome.storage.local.get(['settings', 'tour']);
  const patch = { dataVersion: 5 };
  if (settings) patch.settings = JAA.merge(JAA.DEFAULT_SETTINGS, settings);
  if (!tour && reason === 'update') patch.tour = { done: false, offered: false };
  await chrome.storage.local.set(patch);
}
async function noteWhatsNew(prev) {
  const { settings } = await JAA.loadAll();
  const ver = chrome.runtime.getManifest().version;
  if (!settings.whatsNew || prev === ver) return;
  await chrome.storage.local.set({ whatsNew: { version: ver, from: prev || '', at: Date.now(), seen: false } });
}

/* ================= v0.4: no-terminal Ollama setup ================= */
// Ollama only accepts requests with no Origin header or a localhost Origin. Our requests carry
// Origin: chrome-extension://<id>, which Ollama answers with 403 unless OLLAMA_ORIGINS is set.
// This dynamic rule removes the Origin header, but ONLY on requests that this extension itself
// makes (initiatorDomains = our id) to the local Ollama address. Web pages are not affected,
// so Ollama keeps protecting itself from websites.
const ORIGIN_RULE_BASE = 9100;
function localOllamaHosts(url) {
  const hosts = new Set(['127.0.0.1:11434', 'localhost:11434']);
  try { const u = new URL(url); if (/^(127\.0\.0\.1|localhost|\[::1\])$/.test(u.hostname)) hosts.add(u.host || (u.hostname + ':80')); } catch (_) { /* ignore */ }
  return Array.from(hosts);
}
async function installOriginRules() {
  if (!chrome.declarativeNetRequest) return { ok: false, error: 'declarativeNetRequest not available' };
  const { settings } = await JAA.loadAll();
  const hosts = localOllamaHosts(settings.ollamaUrl);
  const addRules = hosts.map((h, i) => ({
    id: ORIGIN_RULE_BASE + i, priority: 1,
    action: { type: 'modifyHeaders', requestHeaders: [{ header: 'origin', operation: 'remove' }] },
    condition: { urlFilter: '|http://' + h + '/', initiatorDomains: [chrome.runtime.id], resourceTypes: ['xmlhttprequest', 'other'] }
  }));
  try {
    const old = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old.map(r => r.id), addRules });
    return { ok: true, hosts };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}
installOriginRules();
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'local' && ch.settings && (!ch.settings.oldValue || (ch.settings.newValue || {}).ollamaUrl !== ch.settings.oldValue.ollamaUrl)) installOriginRules();
});

async function platformInfo() {
  const info = { os: 'unknown', ramGB: 0 };
  try { info.os = (await chrome.runtime.getPlatformInfo()).os; } catch (_) { /* ignore */ }
  try { if (chrome.system && chrome.system.memory) info.ramGB = Math.round((await chrome.system.memory.getInfo()).capacity / 1073741824); } catch (_) { /* ignore */ }
  return info;
}
// Model choice by RAM. Small machines: qwen2.5:3b (fast, ~2 GB). 16 GB+: qwen2.5:7b (better writing, ~4.7 GB).
const MODELS = {
  'qwen2.5:3b': { label: 'Qwen 2.5 3B (fast)', sizeGB: 1.9, minRam: 0 },
  'qwen2.5:7b': { label: 'Qwen 2.5 7B (better writing)', sizeGB: 4.7, minRam: 15 }
};
function recommendModel(ramGB) { return ramGB >= 15 ? 'qwen2.5:7b' : 'qwen2.5:3b'; }

async function ollamaStatus(overrideUrl) {
  const { settings } = await JAA.loadAll();
  const base = trimUrl(overrideUrl || settings.ollamaUrl);
  const out = { base, reachable: false, originOk: null, version: '', models: [], model: settings.model, hasModel: false };
  try {
    const v = await fetchWithTimeout(base + '/api/version', { method: 'GET' }, 3000);
    if (v.ok) { out.reachable = true; out.version = ((await v.json().catch(() => ({}))).version) || ''; }
    else if (v.status === 403) { out.reachable = true; out.originOk = false; }
  } catch (_) { return out; }
  try {
    const t = await fetchWithTimeout(base + '/api/tags', { method: 'GET' }, 4000);
    if (t.ok) out.models = ((await t.json().catch(() => ({}))).models || []).map(m => ({ name: m.name, size: m.size }));
    // POSTs carry an Origin header (GETs don't): this is the request that would get 403.
    const p = await fetchWithTimeout(base + '/api/show', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: settings.model }) }, 4000);
    out.originOk = p.status !== 403;
  } catch (_) { /* ignore */ }
  const want = settings.model.includes(':') ? settings.model : settings.model + ':latest';
  out.hasModel = out.models.some(m => m.name === settings.model || m.name === want);
  return out;
}

/* ---------- long tasks over a port: model download, resume extraction, tailoring ---------- */
async function pullModel(base, model, post, signal) {
  let res;
  try { res = await fetch(base + '/api/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, stream: true }), signal }); }
  catch (e) { return post({ type: 'error', error: signal.aborted ? 'Cancelled.' : 'Can\'t reach Ollama. Is the Ollama app running?' }); }
  if (res.status === 403) return post({ type: 'error', error: ORIGINS_HINT });
  if (!res.ok) return post({ type: 'error', error: 'Ollama answered HTTP ' + res.status + ': ' + (await res.text().catch(() => '')).slice(0, 200) });
  const layers = {};
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        let o; try { o = JSON.parse(line); } catch (_) { continue; }
        if (o.error) return post({ type: 'error', error: 'Download failed: ' + String(o.error).slice(0, 200) });
        if (o.digest && o.total) layers[o.digest] = { total: o.total, completed: o.completed || (layers[o.digest] || {}).completed || 0 };
        const total = Object.values(layers).reduce((n, l) => n + l.total, 0);
        const completed = Object.values(layers).reduce((n, l) => n + Math.min(l.total, l.completed), 0);
        post({ type: 'progress', status: o.status || '', total, completed, pct: total ? Math.floor(100 * completed / total) : 0 });
        if (o.status === 'success') return post({ type: 'done', model });
      }
    }
    post({ type: 'done', model });
  } catch (e) { post({ type: 'error', error: signal.aborted ? 'Cancelled.' : 'Download interrupted: ' + String(e && e.message || e) }); }
}

function extractPrompt(text) {
  return [
    { role: 'system', content: 'You read a resume and return facts as JSON. Copy names, companies, titles, schools and dates EXACTLY as written in the resume. Never invent or guess anything; use "" or [] when something is not in the resume. Return only JSON.' },
    { role: 'user', content: 'Return JSON with these keys:\n{"firstName":"","lastName":"","location":"city, state/country as written","city":"","state":"","country":"","summary":"1-2 sentence summary copied or shortened from the resume","jobs":[{"group":"gN from the marker before the job","company":"","title":"","location":"","start":"","end":"Present if current"}],"education":[{"school":"","degree":"","field":"","start":"","end":"","location":""}],"skills":["each skill as written"],"certifications":[""],"languages":["spoken languages"]}\n\nRESUME (lines starting with [gN] begin a job, project or school):\n' + text }
  ];
}
// resume text with group markers, so jobs can be matched back to their bullets
function markedResume(master) {
  let last = '';
  return master.blocks.map(b => {
    const mark = b.type === 'entry' && b.group !== last ? '[' + b.group + '] ' : '';
    if (b.type === 'entry') last = b.group;
    return mark + (b.type === 'bullet' ? '• ' : '') + b.text.replace(/\t/g, '  ');
  }).join('\n').slice(0, 9000);
}

/* v0.6 resume import: one small, strict request per section (education, work history, projects), each
 * with a JSON schema. Skills, certifications, languages, contact details and links are read without the
 * model. A section the model can't read is reported (the importer then uses the rule-based reading). */
let schemaUnsupported = false;
async function runExtract(msg, settings, base, post, signal) {
  const sec = JAA.extract.sectionize(msg.master || {});
  const list = JAA.extract.prompts(sec, { all: !!msg.all });
  if (!sec.hasSections) list.push({ key: 'legacy', label: 'your resume', messages: extractPrompt(markedResume(msg.master)), maxTokens: 1600 });
  const ai = {}, timings = {};
  const t0 = Date.now();
  for (let i = 0; i < list.length; i++) {
    if (signal && signal.aborted) return;
    const p = list[i];
    post({ type: 'progress', section: p.key, step: i + 1, steps: list.length, text: `Your local AI is reading ${p.label} (${i + 1} of ${list.length})…` });
    const t1 = Date.now();
    const body = { model: settings.model, think: false, format: p.schema && !schemaUnsupported ? p.schema : 'json', keep_alive: KEEP_ALIVE, options: { temperature: 0, num_ctx: NUM_CTX, num_predict: p.maxTokens || 600 }, messages: p.messages };
    const run = b => streamOllama(base, '/api/chat', b, { totalMs: (msg.timeoutSec || 240) * 1000, idleMs: 90000, onDelta: (d, all) => { if (all.length % 60 < d.length) post({ type: 'progress', section: p.key, step: i + 1, steps: list.length, chars: all.length }); } });
    let r = await run(body);
    if (!r.ok && r.status === 400 && typeof body.format === 'object') { schemaUnsupported = true; body.format = 'json'; r = await run(body); } // older Ollama: plain JSON mode
    timings[p.key] = Math.round((Date.now() - t1) / 100) / 10;
    // problems that will hit every section: stop and let the importer explain
    if (r.status === 403) return post({ type: 'error', error: ORIGINS_HINT });
    if (r.status === 404) return post({ type: 'error', error: `Model "${settings.model}" isn't downloaded yet. Open Setup to download it.` });
    if (r.network) return post({ type: 'error', error: explainFetchError(r, base, 0) });
    const data = r.ok || r.timeout ? parseModelJson(stripThink(r.text)) : null;
    ai[p.key] = data || { error: r.timeout ? 'took too long' : (!r.ok ? 'Ollama error ' + String(r.error || r.status).slice(0, 120) : 'no usable JSON') };
  }
  post({ type: 'done', data: { ai, timings, seconds: Math.round((Date.now() - t0) / 100) / 10, model: settings.model } });
}

async function runTask(msg, post, signal) {
  const { settings, profile } = await JAA.loadAll();
  const base = trimUrl(msg.ollamaUrl || settings.ollamaUrl);
  if (msg.mode === 'pull') return pullModel(base, msg.model, post, signal);
  if (!settings.useLLM && !msg.force) return post({ type: 'error', error: 'Local AI is turned off in Options.' });
  let messages, opts;
  if (msg.mode === 'extract') return runExtract(msg, settings, base, post, signal);
  if (msg.mode === 'extract-legacy') {
    messages = extractPrompt(markedResume(msg.master));
    opts = { temperature: 0, num_ctx: 8192, num_predict: 1600 };
  } else if (msg.mode === 'tailor') {
    messages = JAA.tailor.buildPrompt(msg.master, msg.job || {}, (settings.tailoringRules || []).concat(msg.extraRules || []), { maxBullets: 6 });
    opts = { temperature: 0.3, num_ctx: 8192, num_predict: 1800 };
  } else if (msg.mode === 'cover') {
    messages = JAA.cover.buildPrompt(Object.assign({}, msg.job || {}, { resumeText: msg.resumeText, length: msg.length, extra: msg.extra, previous: msg.previous, tone: profile.toneNotes, samples: profile.writingSamples }));
    opts = { temperature: 0.5, num_ctx: 8192, num_predict: 1100 };
  } else return post({ type: 'error', error: 'Unknown task' });
  post({ type: 'status', text: 'Reading with your local AI (' + settings.model + ')…' });
  let chars = 0;
  const r = await streamOllama(base, '/api/chat', { model: settings.model, think: false, format: 'json', keep_alive: KEEP_ALIVE, options: opts, messages },
    { totalMs: (msg.timeoutSec || 420) * 1000, idleMs: 120000, onDelta: (d, all) => { chars = all.length; if (chars % 40 < d.length) post({ type: 'progress', chars }); } });
  if (r.status === 403) return post({ type: 'error', error: ORIGINS_HINT });
  if (r.status === 404) return post({ type: 'error', error: `Model "${settings.model}" isn't downloaded yet. Open Setup to download it.` });
  if (r.network) return post({ type: 'error', error: explainFetchError(r, base, 0) });
  if (!r.ok && !r.timeout) return post({ type: 'error', error: 'Ollama error: ' + String(r.error || r.status).slice(0, 200) });
  const data = parseModelJson(stripThink(r.text));
  if (!data) return post({ type: 'error', error: r.timeout ? 'The local AI took too long. Try again, or use a smaller model.' : 'The local AI did not return usable JSON. Try again.' , raw: r.text.slice(0, 400) });
  if (msg.mode === 'extract-legacy') {
    // attach each job's bullets from the parsed resume (copied text, never from the model)
    data.workHistory = (Array.isArray(data.jobs) ? data.jobs : []).map(j => {
      const g = String(j.group || '').replace(/[^\w]/g, '');
      const bullets = msg.master.blocks.filter(b => b.group === g && b.type === 'bullet').map(b => b.text).slice(0, 12);
      return Object.assign({}, j, { bullets });
    });
    delete data.jobs;
  }
  post({ type: 'done', data, timeout: !!r.timeout });
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'jaa-task') return;
  const ctrl = new AbortController();
  let closed = false;
  port.onDisconnect.addListener(() => { closed = true; ctrl.abort(); });
  const post = m => { if (!closed) try { port.postMessage(m); } catch (_) { /* gone */ } };
  port.onMessage.addListener(msg => { runTask(msg, post, ctrl.signal).catch(e => post({ type: 'error', error: String(e && e.message || e) })); });
});

/* ---------- tailored resumes library ---------- */
async function tailorOpen(msg, sender) {
  const id = 't' + Date.now().toString(36);
  const job = Object.assign({}, msg.job || {}, { tabId: sender && sender.tab ? sender.tab.id : msg.tabId || null, frameId: sender ? sender.frameId : 0 });
  const { tailorJobs = {} } = await chrome.storage.local.get('tailorJobs');
  const keys = Object.keys(tailorJobs).sort();
  while (keys.length > 20) delete tailorJobs[keys.shift()];
  tailorJobs[id] = Object.assign(job, { at: Date.now() });
  await chrome.storage.local.set({ tailorJobs });
  await chrome.tabs.create({ url: chrome.runtime.getURL('tailor/tailor.html?job=' + id), index: sender && sender.tab ? sender.tab.index + 1 : undefined });
  return { ok: true, id };
}
async function tailoredFor(key) {
  const { tailored = [] } = await chrome.storage.local.get('tailored');
  const hit = tailored.filter(t => t.jobKey === key).sort((a, b) => b.createdAt - a.createdAt)[0];
  return { ok: true, entry: hit || null };
}
async function tailoredSave(entry) {
  const { tailored = [] } = await chrome.storage.local.get('tailored');
  const list = tailored.filter(t => t.id !== entry.id);
  list.push(entry);
  await chrome.storage.local.set({ tailored: list.slice(-60) });
  // link to the tracker row for this job, if it was filled/logged already
  if (entry.jobKey) {
    await withTracker(apps => {
      const i = apps.findIndex(a => a.key === entry.jobKey);
      if (i >= 0) apps[i] = Object.assign({}, apps[i], { tailoredId: entry.id });
      return null;
    });
  }
  return { ok: true };
}
async function tailoredAttach(msg) {
  // send the file to the application tab's content script, which puts it in the resume input
  const { tailorJobs = {} } = await chrome.storage.local.get('tailorJobs');
  const job = tailorJobs[msg.jobId];
  if (!job || !job.tabId) return { ok: false, error: 'The application tab is gone. Open the job page again and press Fill.' };
  try {
    // the practice page is an extension page, not a content script: reach it with a runtime message
    const r = job.url && job.url.startsWith(chrome.runtime.getURL('practice/'))
      ? await chrome.runtime.sendMessage({ type: 'tailor:attach', entryId: msg.entryId, practice: true })
      : await chrome.tabs.sendMessage(job.tabId, { type: 'tailor:attach', entryId: msg.entryId }, { frameId: job.frameId || 0 });
    if (r && r.ok) { try { await chrome.tabs.update(job.tabId, { active: true }); } catch (_) { /* ignore */ } }
    return r || { ok: false, error: 'No answer from the application page. Reload it and try again.' };
  } catch (e) { return { ok: false, error: 'Could not reach the application page (' + String(e && e.message || e) + '). Reload it and try again.' }; }
}

const V4_TYPES = new Set(['sites:list', 'sites:add', 'sites:remove', 'sites:offer', 'sites:decline', 'sites:sync', 'activation:get', 'activation:go', 'activation:dismiss', 'tracker:update', 'tracker:bookmark', 'tracker:get', 'tracker:list', 'page:status', 'feedback:add', 'diag:info', 'tour:open', 'cover:open', 'cover:save', 'cover:fill', 'match:ai', 'whatsnew:seen', 'privacy:open', 'ollama:status', 'ollama:fixOrigin', 'system:info', 'tailor:open', 'tailor:forJob', 'tailor:save', 'tailor:attach', 'onboarding:open', 'rating:get', 'rating:act']);
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // the practice page (and its tour) never writes to your real tracker, feedback or cover letters
  if (msg && sender && sender.url && sender.url.startsWith(chrome.runtime.getURL('practice/')) && /^(tracker:update|tracker:bookmark|feedback:add|cover:save)$/.test(msg.type)) {
    sendResponse({ ok: true, practice: true }); return false;
  }
  const handlers = {
    'ollama:status': () => ollamaStatus(msg.url),
    'ollama:fixOrigin': () => installOriginRules(),
    'system:info': async () => { const info = await platformInfo(); return Object.assign(info, { recommended: recommendModel(info.ramGB), models: MODELS }); },
    'tailor:open': () => tailorOpen(msg, sender),
    'tailor:forJob': () => tailoredFor(msg.key),
    'tailor:save': () => tailoredSave(msg.entry),
    'tailor:attach': () => tailoredAttach(msg),
    'onboarding:open': () => chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/welcome.html' + (msg.step ? '#' + msg.step : '')) }).then(() => ({ ok: true })),
    'tour:open': () => chrome.tabs.create({ url: chrome.runtime.getURL('practice/practice.html?tour=1') }).then(() => ({ ok: true })),
    'tracker:update': () => trackerUpdate(msg),
    'tracker:bookmark': () => trackerBookmark(msg.entry, msg.on !== false),
    'tracker:get': () => withTracker(apps => { const { i } = findRow(apps, msg.entry || { key: msg.key }); return { ok: true, row: i >= 0 ? apps[i] : null }; }),
    'tracker:list': () => withTracker(apps => ({ ok: true, rows: apps.slice(0, msg.limit || 200) })),
    'page:status': () => pageStatus(msg, sender),
    'feedback:add': () => feedbackAdd(msg.entry),
    'diag:info': () => diagInfo(),
    'cover:open': () => coverOpen(msg, sender),
    'cover:save': () => coverSave(msg.entry),
    'cover:fill': () => coverFill(msg),
    'match:ai': () => matchAI(msg),
    'rating:get': () => ratingState(),
    'rating:act': () => ratingActMsg(msg, sender),
    'privacy:open': () => chrome.tabs.create({ url: chrome.runtime.getURL('privacy/privacy.html') }).then(() => ({ ok: true })),
    'sites:list': () => sitesList(),
    'sites:add': () => sitesAdd(msg.origin),
    'sites:remove': () => sitesRemove(msg.origin),
    'sites:offer': () => sitesOffer(msg.url),
    'sites:decline': () => sitesDecline(msg.host),
    'sites:sync': () => syncSiteScripts(),
    'activation:get': () => activationGet(),
    'activation:go': () => activationGo(msg.step),
    'activation:dismiss': () => activationSet(s => ACT.dismiss(s)).then(s => ({ ok: true, view: ACT.view(s) })),
    'whatsnew:seen': () => chrome.storage.local.get('whatsNew').then(({ whatsNew }) => chrome.storage.local.set({ whatsNew: Object.assign({}, whatsNew || {}, { seen: true }) })).then(() => ({ ok: true }))
  };
  const h = msg && handlers[msg.type];
  if (!h) return false; // handled by the main listener
  Promise.resolve(h()).then(sendResponse, e => sendResponse({ ok: false, error: String(e && e.message || e) }));
  return true;
});


/* ================= v0.5 ================= */
/* ---------- tracker: stages, notes, reminders, bookmarks ---------- */
async function trackerUpdate(msg) {
  return withTracker(apps => {
    const { i } = findRow(apps, msg.entry || { key: msg.key });
    if (i < 0) return { ok: false, error: 'Not in your tracker.' };
    const row = apps[i];
    const p = msg.patch || {};
    const now = new Date().toISOString();
    if (p.stage && p.stage !== row.stage) {
      setStage(row, p.stage, p.stageDate || now);
      if (p.stageDate) row.stageDates[p.stage] = p.stageDate;
      // keep the old status field meaningful for CSV / older views
      const manualMap = { interview: 'Interview', offer: 'Offer', rejected: 'Rejected', withdrawn: 'Withdrawn' };
      if (manualMap[p.stage]) row.status = manualMap[p.stage];
      else if (p.stage === 'applied' && !/Submitted|Applied/.test(row.status)) row.status = JAA.STATUS.APPLIED;
      else if (p.stage === 'saved' || p.stage === 'screen') { if (JAA.MANUAL_STATUSES.includes(row.status)) row.status = row.confirmedAt ? JAA.STATUS.APPLIED : (row.submittedAt ? JAA.STATUS.SUBMITTED : JAA.STATUS.FILLED); }
      row.history.push({ at: now, event: 'stage', detail: JAA.STAGE_LABEL[p.stage] });
      if (row.history.length > 20) row.history.shift();
    }
    if (p.stageDates && typeof p.stageDates === 'object') row.stageDates = Object.assign({}, row.stageDates, p.stageDates);
    if (typeof p.notes === 'string') row.notes = p.notes.slice(0, 4000);
    if (typeof p.reminderAt === 'string') row.reminderAt = p.reminderAt.slice(0, 10);
    row.date = now;
    // you marked it Applied (or later) yourself: that counts for the rating prompt too
    const bump = markRatingCounted(row, p.stage === 'applied');
    return { ok: true, row, bump };
  }).then(async r => { if (r && r.bump) await ratingBump(r.bump); if (r) delete r.bump; return r; });
}
async function trackerBookmark(entry, on) {
  return withTracker(apps => {
    const { i } = findRow(apps, entry || {});
    if (i >= 0) {
      apps[i].bookmarked = !!on;
      if (entry.location && !apps[i].location) apps[i].location = entry.location;
      if (entry.salary && !apps[i].salary) apps[i].salary = entry.salary;
      return { ok: true, row: apps[i], existed: true };
    }
    if (!on) return { ok: true, row: null };
    const row = upsert(apps, Object.assign({}, entry));
    Object.assign(row, { bookmarked: true, via: 'bookmark', firstFilled: '', filled: undefined });
    row.status = JAA.STATUS.FILLED;
    row.stage = 'saved'; row.stageDates = { saved: new Date().toISOString() };
    return { ok: true, row };
  });
}

/* ---------- v0.6.4: optional Chrome Web Store rating prompt (logic in lib/rating.js) ---------- */
// Counts each job once, when the application really went out (see JAA_RATING.countsAsApplied). Only a
// number and the install time are stored. All writes go through this one queue so the popup's buttons
// and a tracker event at the same moment can't overwrite each other.
let ratingLock = Promise.resolve();
function withRating(fn) {
  const run = ratingLock.then(async () => {
    const { rating } = await chrome.storage.local.get('rating');
    const next = fn(JAA_RATING.normalize(rating, Date.now()));
    if (next) await chrome.storage.local.set({ rating: next });
    return next;
  });
  ratingLock = run.catch(() => {});
  return run;
}
function markRatingCounted(row, force) {
  if (!row || row.ratingCounted) return 0;
  if (!force && !JAA_RATING.countsAsApplied(row)) return 0;
  row.ratingCounted = true;
  return 1;
}
const ratingBump = n => withRating(s => JAA_RATING.increment(s, Date.now(), n));
// install: start the clock. Update from an older version: start the clock now (so people who already
// use it still wait 3 days) and count the applications already in the tracker.
async function ratingInit() {
  const { rating } = await chrome.storage.local.get('rating');
  if (rating && rating.installedAt) return;
  const seeded = await withTracker(apps => apps.reduce((n, r) => n + markRatingCounted(r), 0));
  await withRating(s => JAA_RATING.increment(s, Date.now(), seeded));
}
async function ratingState() {
  const { rating } = await chrome.storage.local.get('rating');
  if (!rating) await ratingInit();
  const st = JAA_RATING.normalize((await chrome.storage.local.get('rating')).rating, Date.now());
  return { ok: true, eligible: JAA_RATING.eligible(st, Date.now()), state: st, reviewUrl: JAA_RATING.REVIEW_URL, feedbackUrl: JAA_RATING.FEEDBACK_URL };
}
async function ratingActMsg(msg, sender) {
  // only the extension's own pages (popup, settings) can answer the card; never content scripts or the practice page
  const ownPage = !!(sender && sender.url && sender.url.startsWith(chrome.runtime.getURL('')) && !sender.url.startsWith(chrome.runtime.getURL('practice/')));
  if (!ownPage) return { ok: false, error: 'not allowed' };
  if (!['rate', 'later', 'never'].includes(msg.action)) return { ok: false, error: 'unknown action' };
  const st = await withRating(s => JAA_RATING.act(s, msg.action, Date.now()));
  return { ok: true, state: st };
}

/* ---------- toolbar icon: colour on supported job pages, gray elsewhere ---------- */
const ICON_ON = { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' };
const ICON_OFF = { 16: 'icons/gray16.png', 32: 'icons/gray32.png', 48: 'icons/gray48.png', 128: 'icons/gray128.png' };
const SUPPORTED_SITES = [
  [/(^|\.)greenhouse\.io$/, 'Greenhouse', () => true],
  [/(^|\.)lever\.co$/, 'Lever', () => true],
  [/(^|\.)ashbyhq\.com$/, 'Ashby', () => true],
  [/(^|\.)(myworkdayjobs|myworkday|myworkdaysite)\.com$/, 'Workday', () => true],
  [/(^|\.)linkedin\.com$/, 'LinkedIn', u => /^\/jobs\//.test(u.pathname)]
];
function siteForUrl(url) {
  let u; try { u = new URL(url); } catch (_) { return null; }
  if (u.protocol === 'chrome-extension:' && u.host === chrome.runtime.id && /\/practice\//.test(u.pathname)) return 'Practice';
  if (u.protocol !== 'https:') return null;
  const hit = SUPPORTED_SITES.find(([re, , ok]) => re.test(u.hostname) && ok(u));
  return hit ? hit[1] : null;
}
async function setDefaultIcon() { try { await chrome.action.setIcon({ path: ICON_OFF }); await chrome.action.setTitle({ title: 'AI Job Application Assistant: not a supported job page. Click for your profile, tracker and tools.' }); } catch (_) { /* ignore */ } }
const tabState = new Map(); // tabId -> { site, kind }
async function paintTab(tabId, site, kind) {
  if (tabId == null || tabId < 0) return;
  const on = !!site && kind !== 'none';
  const what = kind === 'application' ? 'application form found: click Fill or open the assistant' : kind === 'posting' ? 'job posting: see your resume match' : 'supported job site';
  try {
    await chrome.action.setIcon({ tabId, path: on ? ICON_ON : ICON_OFF });
    await chrome.action.setTitle({ tabId, title: on ? `AI Job Application Assistant: ${site} · ${what}` : 'AI Job Application Assistant: not a supported job page. Click for your profile, tracker and tools.' });
  } catch (_) { /* tab closed */ }
}
async function pageStatus(msg, sender) {
  const tabId = sender && sender.tab ? sender.tab.id : null;
  if (tabId == null) return { ok: false };
  if (sender.frameId && msg.kind !== 'application') return { ok: true }; // only the frame with the form upgrades the icon
  const prev = tabState.get(tabId) || {};
  const rank = { none: 0, site: 1, posting: 2, application: 3 };
  const kind = sender.frameId && prev.kind && rank[prev.kind] > rank[msg.kind] ? prev.kind : msg.kind;
  const site = siteForUrl(sender.tab.url || '') || (msg.kind === 'application' ? msg.site : null);
  tabState.set(tabId, { site, kind });
  await paintTab(tabId, site, kind);
  return { ok: true, site, kind };
}
try {
  chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (!info.url && info.status !== 'loading') return;
    const url = info.url || tab.url || '';
    const site = siteForUrl(url);
    tabState.set(tabId, { site, kind: site ? 'site' : 'none' });
    paintTab(tabId, site, site ? 'site' : 'none');
  });
  chrome.tabs.onRemoved.addListener(tabId => tabState.delete(tabId));
} catch (_) { /* no tabs api in tests */ }
setDefaultIcon();

/* ---------- 👍 / 👎 feedback on drafts: kept locally, used as examples for later drafts ---------- */
async function feedbackAdd(entry) {
  if (!entry || !entry.text || !/^(up|down)$/.test(entry.vote)) return { ok: false, error: 'bad feedback' };
  const q = String(entry.q || '');
  if (JAA.NEVER_LEARN.test(JAA.normText(q))) return { ok: false, skipped: 'personal or one-off question' };
  const { draftFeedback = [] } = await chrome.storage.local.get('draftFeedback');
  const list = draftFeedback.filter(x => !(x.text === entry.text && x.q === q));
  list.push({ q: q.slice(0, 300), text: String(entry.text).slice(0, 2000), vote: entry.vote, company: String(entry.company || '').slice(0, 80), at: Date.now() });
  await chrome.storage.local.set({ draftFeedback: list.slice(-60) });
  return { ok: true, count: list.length };
}
async function feedbackExamples(question, company) {
  const { draftFeedback = [] } = await chrome.storage.local.get('draftFeedback');
  const score = x => JAA.textSim(x.q, question) + (Date.now() - x.at < 30 * 864e5 ? 0.05 : 0);
  const pick = vote => draftFeedback.filter(x => x.vote === vote).sort((a, b) => score(b) - score(a)).slice(0, 2)
    .map(x => ({ q: x.q, a: company && x.company ? x.text.split(x.company).join(company) : x.text }));
  return { liked: pick('up'), disliked: pick('down') };
}

/* ---------- diagnostics for "Report a problem" (no personal data) ---------- */
async function diagInfo() {
  const all = await chrome.storage.local.get(['profile', 'resume', 'settings', 'answerBank', 'applications']);
  const st = await ollamaStatus();
  const p = JAA.merge(JAA.EMPTY_PROFILE, all.profile);
  const has = k => !!(p[k] && String(p[k]).trim());
  const core = ['firstName', 'lastName', 'email', 'phone', 'location', 'linkedin', 'workAuthorizedUS', 'needsSponsorship'];
  const missing = core.filter(k => !has(k));
  let plat = {}; try { plat = await chrome.runtime.getPlatformInfo(); } catch (_) { /* ignore */ }
  return {
    ok: true, version: chrome.runtime.getManifest().version, os: plat.os || '', arch: plat.arch || '',
    browser: (navigator.userAgent.match(/Chrom(e|ium)\/[\d.]+/) || [''])[0],
    ollama: { reachable: st.reachable, originOk: st.originOk, version: st.version, model: st.model, hasModel: st.hasModel },
    profile: { complete: missing.length === 0, missing, resume: !!all.resume, answers: (all.answerBank || []).length },
    useLLM: JAA.merge(JAA.DEFAULT_SETTINGS, all.settings).useLLM
  };
}

/* ---------- cover letters (cover/cover.html does the writing; same plumbing as tailoring) ---------- */
async function coverOpen(msg, sender) {
  const id = 'c' + Date.now().toString(36);
  const job = Object.assign({}, msg.job || {}, { tabId: sender && sender.tab ? sender.tab.id : msg.tabId || null, frameId: sender ? sender.frameId : 0, field: msg.field || null });
  const { tailorJobs = {} } = await chrome.storage.local.get('tailorJobs');
  const keys = Object.keys(tailorJobs).sort();
  while (keys.length > 20) delete tailorJobs[keys.shift()];
  tailorJobs[id] = Object.assign(job, { at: Date.now() });
  await chrome.storage.local.set({ tailorJobs });
  await chrome.tabs.create({ url: chrome.runtime.getURL('cover/cover.html?job=' + id), index: sender && sender.tab ? sender.tab.index + 1 : undefined });
  return { ok: true, id };
}
async function coverSave(entry) {
  const { coverLetters = [] } = await chrome.storage.local.get('coverLetters');
  const list = coverLetters.filter(t => t.id !== entry.id);
  list.push(entry);
  await chrome.storage.local.set({ coverLetters: list.slice(-40) });
  if (entry.jobKey) await withTracker(apps => { const i = apps.findIndex(a => a.key === entry.jobKey); if (i >= 0) apps[i] = Object.assign({}, apps[i], { coverId: entry.id }); return null; });
  return { ok: true };
}
async function coverFill(msg) {
  // relay to the application tab: put the approved text into the cover letter box, or attach the file
  const { tailorJobs = {} } = await chrome.storage.local.get('tailorJobs');
  const job = tailorJobs[msg.jobId];
  if (!job || !job.tabId) return { ok: false, error: 'The application tab is gone. Open the job page again.' };
  const payload = { type: 'cover:fill', entryId: msg.entryId, mode: msg.mode };
  try {
    const r = job.url && job.url.startsWith(chrome.runtime.getURL('practice/'))
      ? await chrome.runtime.sendMessage(Object.assign({ practice: true }, payload))
      : await chrome.tabs.sendMessage(job.tabId, payload, { frameId: job.frameId || 0 });
    if (r && r.ok) { try { await chrome.tabs.update(job.tabId, { active: true }); } catch (_) { /* ignore */ } }
    return r || { ok: false, error: 'No answer from the application page. Reload it and try again.' };
  } catch (e) { return { ok: false, error: 'Could not reach the application page (' + String(e && e.message || e) + ').' }; }
}

/* ---------- optional local-AI refinement of match keywords ---------- */
async function matchAI(msg) {
  const { settings } = await JAA.loadAll();
  if (!settings.useLLM) return { ok: false, error: 'Local AI is off.' };
  const base = trimUrl(settings.ollamaUrl);
  let res;
  try { res = await postOllama(base, '/api/chat', {
    model: settings.model, stream: false, think: false, format: 'json', keep_alive: KEEP_ALIVE,
    options: { temperature: 0, num_ctx: 4096, num_predict: 300 },
    messages: [
      { role: 'system', content: 'You pick the skills and requirements from a job description. Return JSON {"keywords":["..."]} with 8-20 short items (tools, languages, methods, domains) copied as written in the text. No soft skills like "communication" unless stressed. Only JSON.' },
      { role: 'user', content: 'JOB DESCRIPTION:\n' + String(msg.text || '').slice(0, 5000) }
    ]
  }, 90000); } catch (e) { return { ok: false, error: explainFetchError(e, base, 90) }; }
  if (!res.ok) return { ok: false, error: res.status === 403 ? ORIGINS_HINT : 'Local AI error HTTP ' + res.status };
  const j = await res.json().catch(() => ({}));
  const data = parseModelJson(stripThink((j.message && j.message.content) || ''));
  const kw = data && Array.isArray(data.keywords) ? data.keywords.map(String).filter(k => k.length > 1 && k.length < 40).slice(0, 25) : [];
  return { ok: true, keywords: kw };
}

// Exported for the Node test harness.
if (typeof module !== 'undefined') module.exports = { buildPrompt, parseModelJson, stripThink, salvageAnswers, splitAction, visibleText };
