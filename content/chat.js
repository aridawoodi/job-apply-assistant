/* Chat assistant: greets, runs the fill, reports results, then asks you one question at a
 * time for every yellow field, walks through blue AI drafts (Accept / Edit / Regenerate),
 * shows a Review step, and answers free-form messages with the local model (streamed).
 * Model "actions" that change a field are validated here before anything is touched.
 * It never clicks Submit / Next / Continue. */
(function () {
  'use strict';
  if (window.__JAA_CHAT__) return;
  window.__JAA_CHAT__ = true;
  const JAA = window.JAA;
  const C = JAA.core;
  const ui = () => JAA.ui;
  const h = (...a) => JAA.ui.h(...a);

  const MAX_HISTORY = 80, MAX_CHATS = 60;
  let key = JAA.jobKey(location.href);
  let hist = [];            // persisted [{role, text, at}]
  let histLoaded = false, histShown = false;
  let runs = 0, resultCard = null, currentRun = null;
  let current = null;       // { item, f, kind:'question'|'draft', textInput, options }
  let reviewShownForRun = -1;
  let settingsCache = null;

  const send = msg => new Promise(resolve => { try { chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; resolve(r || null); }); } catch (_) { resolve(null); } });
  const st = () => JAA.state || { fields: [], items: [], info: {} };
  const fieldOf = item => (st().fields || []).find(f => f.id === item.id);
  const trunc = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const EEO_KEYS = new Set(['transgender', 'sexualOrientation', 'gender', 'hispanic', 'ethnicity', 'veteran', 'disability']);
  const ruleKey = f => { const r = C.ruleFor(f.kind === 'checkbox' && f.question ? Object.assign({}, f, { label: f.question }) : f); return r ? r.key : ''; };
  const isPrivate = f => { const k = ruleKey(f); return EEO_KEYS.has(k) || k === 'personal' || k === 'ssn/dob' || (f.el && f.el.type === 'password') || JAA.NEVER_LEARN.test(JAA.normText(f.label)) && /pet|dog|cat|hobb|spouse|wife|husband|children|kids|religio|favou?rite/.test(JAA.normText(f.label)); };
  async function settings() { if (!settingsCache) settingsCache = (await JAA.loadAll()).settings; return settingsCache; }
  try { chrome.storage.onChanged.addListener(ch => { if (ch.settings) settingsCache = null; }); } catch (_) { /* ignore */ }

  /* ---------- history (per job) ---------- */
  async function loadHistory() {
    if (histLoaded) return;
    histLoaded = true;
    try {
      const { chats = {} } = await chrome.storage.local.get('chats');
      hist = (chats[key] && chats[key].messages) || [];
    } catch (_) { hist = []; }
  }
  let saveTimer = null;
  function remember(role, text) {
    hist.push({ role, text: String(text).slice(0, 2000), at: Date.now() });
    if (hist.length > MAX_HISTORY) hist = hist.slice(-MAX_HISTORY);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const s = await settings();
      if (s.chatHistory === false) return;
      try {
        const { chats = {} } = await chrome.storage.local.get('chats');
        const info = st().info || {};
        chats[key] = { url: location.href, title: info.title || '', company: info.company || '', updatedAt: Date.now(), messages: hist };
        const ks = Object.keys(chats).sort((a, b) => chats[b].updatedAt - chats[a].updatedAt);
        ks.slice(MAX_CHATS).forEach(k => delete chats[k]);
        await chrome.storage.local.set({ chats });
      } catch (_) { /* ignore */ }
    }, 400);
  }
  function bot(text, cls) { const m = ui().add('bot', text, cls); remember('bot', text); return m; }
  function me(text) { const m = ui().add('me', text); remember('me', text); return m; }
  function sys(text) { return ui().add('sys', text); }

  function showOldHistory() {
    if (histShown) return;
    histShown = true;
    if (!hist.length) return;
    sys('Earlier in this application');
    hist.slice(-12).forEach(m => ui().add(m.role === 'me' ? 'me' : 'bot', m.text, 'old'));
    sys('Now');
  }

  /* ---------- attention count (badge + submit warning) ---------- */
  function attention() {
    const out = { yellow: 0, blue: 0, required: 0, total: 0, labels: [] };
    for (const it of st().items || []) {
      const f = fieldOf(it);
      if (!f || !f.el || !f.el.isConnected) continue;
      if (it.status === 'todo' && !C.hasValue(f)) { out.yellow++; if (it.required) out.required++; out.labels.push(it.label); }
      if (it.status === 'ai' && !it.reviewed) { out.blue++; out.labels.push(it.label); }
    }
    out.total = out.yellow + out.blue;
    return out;
  }
  function updateCount() { if (ui().isShown()) ui().setCount(attention().total); }
  let cTimer = null;
  ['input', 'change'].forEach(t => document.addEventListener(t, e => { if (e.isTrusted) { clearTimeout(cTimer); cTimer = setTimeout(updateCount, 400); } }, true));

  /* ---------- run lifecycle (called by main.js) ---------- */
  function beginRun(opts) {
    runs++;
    currentRun = { opts: opts || {}, n: runs };
    resultCard = null;
    current = null;
    key = JAA.jobKey(location.href);
  }

  function onSummary(s) {
    ui().open();
    if (!resultCard) {
      resultCard = ui().add('bot', '', 'card');
    }
    const c = resultCard;
    c.innerHTML = '';
    const stp = s.step && (s.step.total || s.step.n) ? `Step ${s.step.n}${s.step.total ? ' of ' + s.step.total : ''}${s.step.label ? ' · ' + s.step.label : ''}` : 'Fill results';
    c.appendChild(h('div', { class: 'kick', text: stp }));
    c.appendChild(h('div', { class: 'lbl', text: (s.title || 'Application') + (s.company ? ' · ' + s.company : '') }));
    const todo = s.items.filter(i => i.status === 'todo').length;
    const saved = s.items.filter(i => i.status === 'ok' && i.source === 'bank').length;
    c.appendChild(h('div', { class: 'stats' },
      h('span', { class: 'pill ok', text: `${s.filled} filled` }),
      saved ? h('span', { class: 'pill ok', title: 'Green fields that came from your answer bank', text: `${saved} from your saved answers` }) : null,
      h('span', { class: 'pill ai', text: `${s.ai} by local AI (check these)` }),
      h('span', { class: 'pill todo', text: `${todo} need you` }),
      s.kept ? h('span', { class: 'pill kept', text: `${s.kept} already filled` }) : null,
      (s.unstuck || []).length ? h('span', { class: 'pill bad', text: `${s.unstuck.length} didn't stick` }) : null));
    if (s.progress) c.appendChild(h('div', { class: 'prog' }, h('span', { class: 'dot' }), '⏳ ' + s.progress));
    if (s.llmError) c.appendChild(h('div', { class: 'err', text: 'Local AI: ' + s.llmError }));
    if (s.retryable && !s.progress) c.appendChild(h('div', { class: 'chips' }, h('button', { class: 'chip pri', type: 'button', 'data-act': 'retry', text: '↻ Retry AI for remaining', onclick: () => JAA.run({ retry: true }) })));
    const remember = s.remember !== false;
    const cb = h('input', { type: 'checkbox', 'data-act': 'remember' }); cb.checked = remember;
    cb.onchange = async () => { const r = await chrome.storage.local.get('settings'); await chrome.storage.local.set({ settings: Object.assign({}, r.settings || {}, { rememberAnswers: cb.checked }) }); };
    c.appendChild(h('div', { class: 'row' }, h('label', {}, cb, ' Remember my answers'),
      h('button', { class: 'chip ghost', type: 'button', 'data-act': 'save', title: 'Save what you typed in yellow/blue fields to your answer bank', text: 'Save answers now', onclick: async () => {
        const n = JAA.learn ? await JAA.learn.flush('button', true) : 0;
        ui().toast(n ? `Saved ${n} answer${n > 1 ? 's' : ''} to your answer bank` : 'Nothing new to save', n ? 'ok' : 'info', 'Job Apply Assistant · answer bank');
      } })));
    if (!s.progress) c.appendChild(h('div', { class: 'why', text: 'Green = profile / saved answers · Blue = AI draft · Teal = you · Yellow = needs you. Nothing was submitted.' }));
    ui().scrollDown();
    updateCount();
  }

  async function afterRun(s, fields, opts) {
    opts = opts || {};
    ui().header((s.company ? s.company + ' · ' : '') + 'Job Apply Assistant', s.title || '');
    ui().setStep(s.step);
    const need = s.items.filter(i => i.status === 'todo').length;
    const stepTxt = s.step && (s.step.n || s.step.pct != null) ? (s.step.total ? `Step ${s.step.n} of ${s.step.total}` : (s.step.n ? `Step ${s.step.n}` : `${s.step.pct}% done`)) : '';
    if (opts.source === 'step') {
      bot(`${stepTxt || 'Next step'}: filled ${s.filled + s.ai}, need ${need}.${s.ai ? ` ${s.ai} AI answer${s.ai > 1 ? 's' : ''} to check.` : ''} I never press Next or Submit: you do.`);
      if (!ui().isOpen()) ui().toast(`${stepTxt || 'Next step'} filled: ${need} need you`, need ? 'warn' : 'ok', 'Job Apply Assistant · auto-filled this step');
    } else {
      remember('bot', `Filled ${s.filled}${s.ai ? `, ${s.ai} by AI` : ''}, ${need} need you${stepTxt ? ` (${stepTxt})` : ''}.`);
    }
    if ((s.unstuck || []).length) bot(`These didn't stick after a retry (the site reset them), please fill them by hand: ${s.unstuck.map(x => '“' + trunc(x, 50) + '”').join(', ')}.`);
    if (JAA.steps) JAA.steps.record(s);
    updateCount();
    if (opts.retry && current) return;
    askNext(true);
  }

  /* ---------- the question / draft / review flow ---------- */
  function queue(all) {
    const items = st().items || [];
    const yellow = items.filter(i => { const f = fieldOf(i); return i.status === 'todo' && (all || !i.skipped) && f && f.el.isConnected && !C.hasValue(f); });
    const blue = items.filter(i => { const f = fieldOf(i); return i.status === 'ai' && !i.reviewed && (all || !i.skipped) && f && f.el.isConnected; });
    return { yellow, blue };
  }
  function disableCard(card) { card.querySelectorAll('button, input, textarea').forEach(b => { b.disabled = true; }); }

  function askNext(first) {
    const q = queue();
    if (q.yellow.length) {
      if (first) bot(`I couldn't fill ${q.yellow.length} field${q.yellow.length > 1 ? 's' : ''}. Let's do them one at a time (or answer on the page; I'll notice).`);
      return questionCard(q.yellow[0], q.yellow.length);
    }
    if (q.blue.length) {
      if (first || (current && current.kind === 'question')) bot(`${q.blue.length} answer${q.blue.length > 1 ? 's are' : ' is'} AI-drafted (blue). Please check ${q.blue.length > 1 ? 'each one' : 'it'}.`);
      return draftCard(q.blue[0], q.blue.length);
    }
    current = null;
    if (reviewShownForRun !== runs) { reviewShownForRun = runs; reviewCard(); }
  }

  function showMe(f) { return h('button', { class: 'chip ghost', type: 'button', text: '↗ Show me', onclick: () => C.flash(f) }); }

  async function questionCard(item, left) {
    const f = fieldOf(item);
    if (!f) { item.skipped = true; return askNext(); }
    C.flash(f);
    const card = ui().add('bot', '', 'card');
    current = { item, f, kind: 'question', card };
    card.appendChild(h('div', { class: 'kick', text: `Needs you${left > 1 ? ` · ${left} left` : ''}${item.required ? ' · required' : ''}` }));
    card.appendChild(h('div', { class: 'lbl', text: item.label || '(unlabelled field)' }));
    if (item.desc) card.appendChild(h('div', { class: 'why', text: trunc(item.desc, 200) }));
    if (item.why) card.appendChild(h('div', { class: 'why', text: item.why }));
    const k = ruleKey(f);
    const skip = h('button', { class: 'chip ghost', type: 'button', text: 'Skip', onclick: () => { item.skipped = true; disableCard(card); me('Skip'); askNext(); } });
    const chips = h('div', { class: 'chips' });
    card.appendChild(chips);
    const answer = async (value, shownAs) => {
      disableCard(card);
      me(isPrivate(f) ? `${trunc(item.label, 40)}: (answered)` : (shownAs || (Array.isArray(value) ? value.join(', ') : String(value))));
      const res = await JAA.fillField(f, value);
      if (!res.ok) {
        bot(`Couldn't fill that: ${res.why || 'unknown problem'}. Try again, or fill it on the page.`);
        return questionCard(item, left);
      }
      item.status = 'you'; item.value = res.shown; item.source = 'you'; item.reviewed = true;
      C.mark(f, 'jaa-you'); C.flash(f);
      const why = JAA.learn ? JAA.learn.whyNot(f) : '';
      const s = await settings();
      let note = '';
      if (why) note = ` Not saved: ${why}.`;
      else if (s.rememberAnswers === false) note = ' (Remember my answers is off, so not saved.)';
      else { const n = await JAA.learn.saveField(f, item); note = n ? ' Saved to your answers for next time.' : ''; }
      bot(`✓ Filled “${trunc(item.label, 60)}”.${note}`);
      updateCount();
      askNext();
    };
    current.answer = answer;

    if (k === 'personal') {
      card.appendChild(h('div', { class: 'why', text: 'This looks personal and unrelated to the job. Answer it on the page if you want; I won\'t save it or send it to the AI.' }));
      chips.append(showMe(f), skip);
      current.noText = true;
      return;
    }
    if (f.kind === 'file') {
      card.appendChild(h('div', { class: 'why', text: /resume/i.test(item.why || '') ? 'Add your resume in Options (gear icon) and press Fill again, or attach it on the page.' : 'Attach the file on the page yourself if you want to include one.' }));
      chips.append(showMe(f), skip);
      current.noText = true;
      return;
    }
    if (f.kind === 'checkbox' && !f.question) {
      card.appendChild(h('div', { class: 'why', text: 'Read the text on the page first. I only tick it if you say so.' }));
      chips.append(h('button', { class: 'chip pri', type: 'button', text: 'Tick it (I\'ve read it)', onclick: () => answer('yes', 'Tick it') }),
        h('button', { class: 'chip', type: 'button', text: 'Leave it unticked', onclick: () => { item.skipped = true; disableCard(card); me('Leave it unticked'); askNext(); } }), showMe(f));
      current.noText = true;
      return;
    }
    let options = f.options && f.options.length ? f.options.map(o => o.text) : [];
    if (!options.length && (f.kind === 'combobox' || f.kind === 'listbutton')) {
      const wait = h('div', { class: 'prog' }, h('span', { class: 'dot' }), 'Reading the options…');
      card.appendChild(wait);
      C.blockSubmits(true);
      try { options = await C.peekOptions(f); } finally { C.blockSubmits(false); }
      wait.remove();
    }
    if (f.kind === 'checkbox' && f.question) options = ['Yes', 'No'];
    current.options = options;
    if (options.length) {
      if (f.kind === 'checkboxGroup') {
        const picked = new Set();
        options.slice(0, 30).forEach(o => {
          const b = h('button', { class: 'chip', type: 'button', text: o, onclick: () => { if (picked.has(o)) { picked.delete(o); b.classList.remove('pri'); } else { picked.add(o); b.classList.add('pri'); } } });
          chips.appendChild(b);
        });
        chips.append(h('button', { class: 'chip pri', type: 'button', text: 'Done ✓', onclick: () => picked.size && answer(Array.from(picked)) }), showMe(f), skip);
        return;
      }
      const render = filter => {
        chips.innerHTML = '';
        const list = options.filter(o => !filter || C.norm(o).includes(C.norm(filter)));
        list.slice(0, 14).forEach(o => chips.appendChild(h('button', { class: 'chip', type: 'button', text: o, onclick: () => answer(o) })));
        if (list.length > 14) chips.appendChild(h('span', { class: 'why', text: `+${list.length - 14} more: type to filter` }));
        chips.append(showMe(f), skip);
      };
      if (options.length > 14) {
        const flt = h('input', { type: 'text', placeholder: 'Type to filter options…' });
        flt.addEventListener('input', () => render(flt.value));
        card.insertBefore(h('div', { class: 'ans' }, flt), chips);
      }
      render('');
      return;
    }
    // free text
    const long = f.kind === 'textarea' || (item.label || '').length > 110;
    const box = long ? h('textarea', { rows: '3', placeholder: 'Type your answer…' }) : h('input', { type: f.inputType === 'number' ? 'number' : 'text', placeholder: 'Type your answer…' });
    const go = () => { const v = box.value.trim(); if (v) answer(v); };
    box.addEventListener('keydown', e => { if (e.key === 'Enter' && (!long || e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } });
    card.appendChild(h('div', { class: 'ans' }, box, h('button', { class: 'chip pri', type: 'button', text: 'Fill', onclick: go })));
    if (long) chips.appendChild(h('button', { class: 'chip', type: 'button', text: '✨ Draft it for me', onclick: () => { disableCard(card); me('Draft it for me'); regenerate(item, f, ''); } }));
    chips.append(showMe(f), skip);
    current.textInput = box;
    setTimeout(() => { try { box.focus({ preventScroll: true }); } catch (_) { /* ignore */ } }, 50);
  }

  function draftCard(item, left, note) {
    const f = fieldOf(item);
    if (!f) { item.reviewed = true; return askNext(); }
    C.flash(f);
    const card = ui().add('bot', '', 'card');
    current = { item, f, kind: 'draft', card };
    card.appendChild(h('div', { class: 'kick', text: `AI draft · please check${left > 1 ? ` · ${left} left` : ''}` }));
    card.appendChild(h('div', { class: 'lbl', text: item.label }));
    if (note) card.appendChild(h('div', { class: 'why', text: note }));
    const val = C.readValue(f) || item.value || '';
    const d = h('div', { class: 'draft', text: val });
    card.appendChild(d);
    const chips = h('div', { class: 'chips' });
    card.appendChild(chips);
    const accept = h('button', { class: 'chip pri', type: 'button', text: '✓ Accept', onclick: () => {
      disableCard(card); me('Accept'); item.reviewed = true; item.source = 'ai'; item.accepted = true; C.mark(f, 'jaa-ok'); updateCount(); askNext();
    } });
    const textual = (f.kind === 'text' || f.kind === 'textarea') && !f.options;
    const edit = h('button', { class: 'chip', type: 'button', text: textual ? '✎ Edit' : '✎ Change', onclick: () => {
      chips.remove();
      if (!textual) { card.remove(); item.status = 'todo'; item.skipped = false; return questionCard(item, 1); }
      const ta = h('textarea', { rows: '5' }); ta.value = C.readValue(f) || val;
      const save = async () => {
        const v = ta.value.trim(); if (!v) return;
        disableCard(card); me('Edited: ' + trunc(v, 120));
        const res = await JAA.fillField(f, v);
        if (!res.ok) { bot('Couldn\'t put that in the field: ' + res.why); return draftCard(item, left); }
        item.status = 'you'; item.value = res.shown; item.reviewed = true; item.source = 'you'; C.mark(f, 'jaa-you');
        const why = JAA.learn.whyNot(f); const s = await settings();
        const n = !why && s.rememberAnswers !== false ? await JAA.learn.saveField(f, item) : 0;
        bot(`✓ Updated “${trunc(item.label, 60)}”.${n ? ' Saved to your answers.' : ''}`);
        updateCount(); askNext();
      };
      card.appendChild(h('div', { class: 'ans' }, ta));
      card.appendChild(h('div', { class: 'chips' }, h('button', { class: 'chip pri', type: 'button', text: 'Save', onclick: save }), h('button', { class: 'chip ghost', type: 'button', text: 'Cancel', onclick: () => { card.remove(); draftCard(item, left); } })));
      setTimeout(() => ta.focus(), 30);
    } });
    chips.append(accept, edit);
    if (textual) chips.appendChild(h('button', { class: 'chip', type: 'button', text: '↻ Regenerate', onclick: () => { disableCard(card); me('Regenerate'); regenerate(item, f, ''); } }));
    if (item.undo != null) chips.appendChild(h('button', { class: 'chip warn', type: 'button', text: '↶ Undo', onclick: async () => {
      disableCard(card); me('Undo');
      await JAA.fillField(f, item.undo.value === '' ? '' : item.undo.value).catch(() => null);
      Object.assign(item, item.undo.state); delete item.undo;
      C.mark(f, item.status === 'ai' ? 'jaa-ai' : item.status === 'todo' ? 'jaa-todo' : item.status === 'you' ? 'jaa-you' : 'jaa-ok');
      bot('Undone.'); updateCount(); askNext();
    } }));
    chips.append(showMe(f), h('button', { class: 'chip ghost', type: 'button', text: 'Later', onclick: () => { disableCard(card); item.skipped = true; askNext(); } }));
  }

  /* ---------- streaming helper ---------- */
  function stream(payload, onDelta) {
    return new Promise(resolve => {
      let port;
      try { port = chrome.runtime.connect({ name: 'jaa-stream' }); } catch (e) { return resolve({ error: 'Extension was reloaded: refresh this page.' }); }
      let done = false;
      port.onMessage.addListener(m => {
        if (m.type === 'delta' || m.type === 'status') onDelta(m.text, m.type);
        if (m.type === 'done' || m.type === 'error') { done = true; resolve(m); try { port.disconnect(); } catch (_) { /* ignore */ } }
      });
      port.onDisconnect.addListener(() => { void chrome.runtime.lastError; if (!done) resolve({ error: 'Connection to the extension closed.' }); });
      port.postMessage(payload);
    });
  }
  function typingBubble() {
    const m = ui().add('bot', '');
    m.appendChild(h('span', { class: 'dot' }));
    return m;
  }

  async function regenerate(item, f, instruction) {
    const s = await settings();
    if (!s.useLLM) { bot('Local AI is off (Options), so I can\'t draft this. Type your answer instead.'); return askNext(); }
    const info = st().info || {};
    const prev = C.readValue(f);
    const bubble = typingBubble();
    const r = await stream({ mode: 'draft', question: item.label, previous: prev, instruction, title: info.title, company: info.company, jobDescription: (st().jobDescription || '').slice(0, 2000) }, (t, type) => {
      bubble.textContent = type === 'status' ? '⏳ ' + t : t;
      ui().scrollDown();
    });
    if (r.error && !r.text) { bubble.textContent = ''; bubble.appendChild(h('div', { class: 'err', text: r.error })); return askNext(); }
    bubble.remove();
    const text = String(r.text || '').trim();
    if (!text) { bot('The model returned nothing. Try again or type it yourself.'); return askNext(); }
    const undo = { value: prev, state: { status: item.status, value: item.value, source: item.source, reviewed: item.reviewed } };
    const res = await JAA.fillField(f, text);
    if (!res.ok) { bot('Couldn\'t put the draft in the field: ' + res.why); return askNext(); }
    Object.assign(item, { status: 'ai', value: res.shown, source: 'ai', reviewed: false, skipped: false, undo });
    C.mark(f, 'jaa-ai');
    remember('bot', `Drafted “${trunc(item.label, 50)}”: ${trunc(text, 300)}`);
    updateCount();
    draftCard(item, 1, r.error || '');
  }

  /* ---------- review ---------- */
  const SRC = { rule: ['profile', 'ok'], bank: ['saved', 'ok'], ai: ['AI', 'ai'], you: ['you', 'you'] };
  function sourceOf(item, f) {
    const v = f ? C.readValue(f) : '';
    if (item.status === 'todo') return v ? ['you (on page)', 'you'] : ['needs you', 'todo'];
    if (item.status === 'kept') return ['already there', 'kept'];
    if (item.status === 'ai') {
      if (item.value && v && C.norm(v) !== C.norm(item.value) && !C.verify(f, item.value)) return ['you (edited)', 'you'];
      return item.reviewed ? ['AI ✓', 'ok'] : ['AI · check', 'ai'];
    }
    if ((item.status === 'ok') && item.value && v && !C.verify(f, item.value)) return ['you (edited)', 'you'];
    return SRC[item.source] || ['profile', 'ok'];
  }
  function shownValue(item, f) {
    if (!f) return item.value || '';
    if (isPrivate(f) && !EEO_KEYS.has(ruleKey(f))) return C.readValue(f) ? '(answered)' : '';
    if (f.el && f.el.type === 'password') return C.readValue(f) ? '••••' : '';
    return C.readValue(f);
  }
  async function reviewCard() {
    const items = st().items || [];
    const card = ui().add('bot', '', 'card review');
    current = null;
    card.appendChild(h('div', { class: 'kick', text: 'Review before you submit' }));
    card.appendChild(h('div', { class: 'lbl', text: (st().info.company ? st().info.company + ' · ' : '') + (st().info.title || 'Application') }));
    const groups = { todo: [], ai: [], done: [] };
    for (const it of items) {
      const f = fieldOf(it);
      if (!f || !f.el || !f.el.isConnected) continue;
      const [src, cls] = sourceOf(it, f);
      const row = { it, f, src, cls, v: shownValue(it, f) };
      if (cls === 'todo') groups.todo.push(row); else if (cls === 'ai') groups.ai.push(row); else groups.done.push(row);
    }
    const table = (rows) => h('table', { class: 'rv' }, rows.map(r => h('tr', {},
      h('td', { title: r.it.label, text: trunc(r.it.label, 46) }),
      h('td', { class: 'v', title: r.v, text: r.v ? trunc(r.v, 40) : '—' }),
      h('td', { class: 's' }, h('span', { class: 'pill ' + r.cls, text: r.src }), r.f ? h('button', { class: 'jump', type: 'button', title: 'Jump to this field', text: '↗', onclick: () => C.flash(r.f) }) : null))));
    if (groups.todo.length) { card.appendChild(h('div', { class: 'rvh', text: `Needs you (${groups.todo.length})` })); card.appendChild(table(groups.todo)); }
    if (groups.ai.length) { card.appendChild(h('div', { class: 'rvh', text: `AI answers to check (${groups.ai.length})` })); card.appendChild(table(groups.ai)); }
    if (groups.done.length) { card.appendChild(h('div', { class: 'rvh', text: `Filled (${groups.done.length})` })); card.appendChild(table(groups.done)); }
    // earlier steps of a multi-step application (recorded answers)
    const sess = JAA.steps ? await JAA.steps.session() : null;
    if (sess && sess.order && sess.order.length > 1) {
      for (const id of sess.order) {
        const stp = sess.steps[id];
        if (!stp || id === (JAA.steps.currentId && JAA.steps.currentId())) continue;
        card.appendChild(h('div', { class: 'rvh', text: `${stp.title || 'Earlier step'} (recorded)` }));
        card.appendChild(h('table', { class: 'rv' }, (stp.fields || []).slice(0, 40).map(r => h('tr', {},
          h('td', { title: r.label, text: trunc(r.label, 46) }), h('td', { class: 'v', title: r.value, text: r.value ? trunc(r.value, 40) : '—' }),
          h('td', { class: 's' }, h('span', { class: 'pill ' + (r.cls || 'ok'), text: r.src || '' }))))));
      }
    }
    const a = attention();
    const consentF = items.map(fieldOf).filter(f => f && f.el.isConnected && (ruleKey(f) === 'consent' || (f.kind === 'checkbox' && !f.question)));
    const hasConsent = consentF.length > 0, consentOk = hasConsent && consentF.every(f => C.hasValue(f));
    const resumeF = items.map(fieldOf).filter(f => f && f.kind === 'file' && f.el.isConnected && /resume|cv/i.test(f.label + ' ' + f.name + ' ' + f.idAttr));
    const unstuck = items.filter(it => it.unstuck && !C.hasValue(fieldOf(it) || { kind: 'x' }));
    const ck = (ok, text) => h('li', {}, (ok ? '✅ ' : '⚠️ ') + text);
    card.appendChild(h('div', { class: 'rvh', text: 'Final checklist' }));
    card.appendChild(h('ul', { class: 'ck' },
      ck(!a.yellow, a.yellow ? `${a.yellow} field${a.yellow > 1 ? 's' : ''} still empty${a.required ? ` (${a.required} required)` : ''}` : 'Every question has an answer'),
      ck(!a.blue, a.blue ? `${a.blue} AI answer${a.blue > 1 ? 's' : ''} not reviewed yet` : 'AI answers reviewed'),
      resumeF.length ? ck(resumeF.some(f => C.hasValue(f)), resumeF.some(f => C.hasValue(f)) ? 'Resume attached' : 'Resume not attached') : null,
      unstuck.length ? ck(false, `${unstuck.length} field${unstuck.length > 1 ? 's' : ''} didn't stick: fill by hand`) : null,
      hasConsent ? ck(consentOk, consentOk ? 'Consent / terms boxes ticked (by you)' : 'Consent / terms boxes: read and tick them yourself') : null,
      h('li', {}, '👉 When it looks right, press the site\'s Submit (or Next) button yourself. I never press it.')));
    const chips = h('div', { class: 'chips' });
    if (a.total) chips.appendChild(h('button', { class: 'chip pri', type: 'button', text: 'Go through what\'s left', onclick: () => { const q = queue(true); q.yellow.concat(q.blue).forEach(i => { i.skipped = false; }); askNext(); } }));
    chips.appendChild(h('button', { class: 'chip ghost', type: 'button', text: '↻ Refresh review', onclick: () => reviewCard() }));
    if (resumeF.length) chips.appendChild(h('button', { class: 'chip', type: 'button', 'data-act': 'tailor', text: '📄 Tailor my resume for this job', onclick: () => { me('Tailor my resume for this job'); tailorResume(); } }));
    card.appendChild(chips);
    remember('bot', `Review: ${a.yellow} empty, ${a.blue} AI to check, ${groups.done.length} filled.`);
    ui().scrollDown();
  }

  /* ---------- free-form chat ---------- */
  const HELP = 'You can type:\n• "what\'s left?" — fields that still need you\n• "review" — every field with its value and source\n• "next" — ask me the next question\n• "fill again" — re-run the fill (keeps your answers)\n• "tailor my resume for this job" — a version of your resume for this posting (you approve every change)\n• anything else goes to your local model, e.g. "make the Why us answer more technical" or "fill the cover letter field with a short note".';
  function fieldsContext() {
    return (st().items || []).map(it => {
      const f = fieldOf(it);
      if (!f || !f.el || !f.el.isConnected) return null;
      const priv = isPrivate(f);
      const status = it.status === 'ok' ? (it.source === 'bank' ? 'saved' : 'ok') : it.status;
      const o = { id: it.id, label: trunc(it.label, 140), type: f.kind, status, value: priv ? '(private)' : trunc(C.readValue(f), 400) };
      if (f.options && f.options.length) o.options = f.options.slice(0, 12).map(x => x.text);
      return o;
    }).filter(Boolean);
  }

  async function applyAction(a) {
    if (!a || typeof a !== 'object') return;
    const kind = String(a.action || a.type || '').toLowerCase();
    if (!/^(set_field|set|fill|update|replace)$/.test(kind)) return;
    const ref = String(a.field || a.field_id || a.id || '');
    let value = a.value;
    const items = st().items || [];
    let item = items.find(i => i.id === ref);
    if (!item && ref) { let best = null, bs = 0; items.forEach(i => { const sc = C.similarity(ref, i.label); if (sc > bs) { bs = sc; best = i; } }); if (bs >= 0.6) item = best; }
    const f = item && fieldOf(item);
    if (!f || !f.el.isConnected) return bot('I wanted to change a field, but couldn\'t find it on the page. Nothing was changed.');
    const k = ruleKey(f);
    if (f.kind === 'file') return bot('I can\'t attach files; please do that on the page.');
    if (['consent', 'botCheck', 'personal', 'ssn/dob'].includes(k) || EEO_KEYS.has(k) || (f.kind === 'checkbox' && !f.question) || (f.el && f.el.type === 'password'))
      return bot(`“${trunc(item.label, 50)}” is one you need to answer yourself, so I left it alone.`);
    if (value == null || (typeof value !== 'string' && !Array.isArray(value) && typeof value !== 'number' && typeof value !== 'boolean')) return bot('The model\'s change was malformed, so I ignored it.');
    if (typeof value !== 'string' && !Array.isArray(value)) value = String(value);
    if (typeof value === 'string') value = value.slice(0, 5000);
    if (f.options && f.options.length) {
      const vals = Array.isArray(value) ? value : [value];
      if (!vals.every(v => C.chooseOption(v, f.options))) return bot(`“${trunc(String(value), 60)}” isn't one of the options for “${trunc(item.label, 50)}”, so I didn't change it.`);
    }
    const prev = C.readValue(f);
    const undo = { value: prev, state: { status: item.status, value: item.value, source: item.source, reviewed: item.reviewed } };
    const res = await JAA.fillField(f, value);
    if (!res.ok) return bot(`Couldn't update “${trunc(item.label, 50)}”: ${res.why}`);
    Object.assign(item, { status: 'ai', value: res.shown, source: 'ai', reviewed: false, skipped: false, undo });
    C.mark(f, 'jaa-ai');
    updateCount();
    draftCard(item, 1, 'Changed by the AI at your request. Check it, or Undo.');
  }

  function looksLikeAnswer(text) {
    return !/\?\s*$/.test(text) && !/^(make|rewrite|change|what|why|how|can|could|would|please|help|set|update|explain|tell|write|draft|shorten|improve|fix|is|are|do|does|should)\b/i.test(text);
  }

  async function onUserText(text) {
    ui().interacted();
    // a pending question takes the reply directly ("Nashville, TN" answers "Location")
    if (current && current.kind === 'question' && current.answer && !current.noText) {
      if (current.options && current.options.length) {
        const o = C.chooseOption(text, current.options.map(t => ({ text: t })));
        if (o) { disableCard(current.card); return current.answer(o.text); }
      } else if (looksLikeAnswer(text) && !/^\/?(help|review|next|skip|what'?s left|tailor)/i.test(text)) {
        disableCard(current.card); return current.answer(text);
      }
    }
    // a personal question is on screen: don't keep or forward what you type for it
    if (current && current.kind === 'question' && current.f && ruleKey(current.f) === 'personal') {
      ui().add('me', '(hidden: personal)');
      ui().add('bot', 'That one is personal, so I don\'t store it or send it to the AI. Type it on the page yourself if you want, or press Skip.');
      return;
    }
    me(text);
    const t = text.trim();
    if (/^\/?(help|\?)$/i.test(t)) return bot(HELP);
    if (/^\/?skip$/i.test(t) && current) { current.item.skipped = true; disableCard(current.card); return askNext(); }
    if (/(what'?s|what is|anything) (left|remaining)|^\/?(left|remaining|todo|to do)\??$|what do i (still )?need/i.test(t)) {
      const q = queue(true); const a = q.yellow.concat(q.blue);
      if (!a.length) return bot('Nothing left on this page. Type "review" for the full list, then press Submit yourself.');
      const card = ui().add('bot', '', 'card');
      card.appendChild(h('div', { class: 'lbl', text: `${q.yellow.length} need you, ${q.blue.length} AI answer${q.blue.length === 1 ? '' : 's'} to check:` }));
      card.appendChild(h('ul', { class: 'ck' }, a.map(i => h('li', {}, (i.status === 'ai' ? '🔵 ' : '🟡 ') + trunc(i.label, 70) + ' ', h('button', { class: 'jump', type: 'button', text: '↗', onclick: () => { const f = fieldOf(i); if (f) C.flash(f); } })))));
      card.appendChild(h('div', { class: 'chips' }, h('button', { class: 'chip pri', type: 'button', text: 'Ask me one by one', onclick: () => { a.forEach(i => { i.skipped = false; }); askNext(); } })));
      remember('bot', `Left: ${a.map(i => i.label).slice(0, 8).join('; ')}`);
      return;
    }
    if (/^\/?(review|check( everything)?|summary)$/i.test(t)) return reviewCard();
    if (/^\/?(next|continue|ask( me)?)$/i.test(t)) { const q = queue(true); q.yellow.concat(q.blue).forEach(i => { i.skipped = false; }); return askNext(); }
    if (/^\/?(fill|refill|fill again|retry)$/i.test(t)) return JAA.run({ retry: true, source: 'chat' });
    if (/^\/?tailor\b|tailor (my )?(resume|cv)|(resume|cv) for this job/i.test(t)) return tailorResume();
    const s = await settings();
    if (!s.useLLM) return bot('Local AI is off (Options → Local AI), so I can only do the built-in commands. ' + HELP);
    const info = st().info || {};
    const stp = st().step;
    const bubble = typingBubble();
    const r = await stream({
      mode: 'chat', message: t, history: hist.slice(-9, -1), title: info.title, company: info.company, site: (st().adapter || {}).name,
      step: stp && stp.total ? `${stp.n} of ${stp.total}` : '', jobDescription: (st().jobDescription || '').slice(0, 1800), fields: fieldsContext()
    }, (txt, type) => { bubble.textContent = type === 'status' ? '⏳ ' + txt : txt; ui().scrollDown(); });
    if (r.error && !r.text) { bubble.textContent = ''; bubble.appendChild(h('div', { class: 'err', text: r.error })); return; }
    bubble.textContent = r.text || (r.action ? 'Okay.' : '(no reply)');
    if (r.error) bubble.appendChild(h('div', { class: 'why', text: r.error }));
    remember('bot', r.text || '');
    if (r.action) await applyAction(r.action);
  }

  /* ---------- tailored resume ---------- */
  async function tailorResume() {
    const a = JAA.sites.detect(location);
    const info = (a.jobInfo ? a.jobInfo() : {}) || {};
    JAA.__jdMax = 12000;
    let description = '';
    try { description = (a.jobDescription ? a.jobDescription() : '') || ''; } catch (_) { /* paste it on the Tailor page */ }
    JAA.__jdMax = 0;
    const job = { key: JAA.jobKey(location.href), title: info.title || '', company: info.company || '', site: a.name || '', url: window.top === window ? location.href : (document.referrer || location.href), description };
    const r = await send({ type: 'tailor:open', job });
    if (!r || !r.ok) return bot((r && r.error) || 'Could not open the tailoring page.');
    bot(`I opened the tailoring page in a new tab${job.title ? ' for ' + job.title : ''}. I'll only reword and reorder what's already in your resume, and you approve each change. ${description ? '' : 'I couldn\'t read the job description here, so paste it there. '}Once it's made you can attach it to this application with one click.`);
  }

  /* ---------- entry points ---------- */
  async function greet() {
    await loadHistory();
    showOldHistory();
    const { profile } = await JAA.loadAll();
    const info = (JAA.sites.detect(location).jobInfo || (() => ({})))() || {};
    ui().header((info.company ? info.company + ' · ' : '') + 'Job Apply Assistant', info.title || '');
    bot(`Hi${profile.firstName ? ' ' + profile.firstName : ''} 👋 I'll fill this ${info.company ? info.company + ' ' : ''}application from your profile and saved answers, then ask you about anything I couldn't fill. I never press Submit, Next or Continue — you do.`);
  }
  async function onButton() {
    if (ui().isOpen() && runs) { ui().close(); return; }
    ui().open();
    if (!runs && !(JAA.isRunning && JAA.isRunning())) {
      await greet();
      JAA.run({ source: 'chat' });
    } else if (!histShown) { await loadHistory(); showOldHistory(); }
  }
  function onHeader(a) {
    if (a === 'review') { if (!runs) return bot('Press Fill first: there\'s nothing to review yet.'); return reviewCard(); }
    if (a === 'settings') send({ type: 'options:open', section: 'profile' });
  }
  // a step or popup run without the chat opened first: still show history + greet once
  async function ensureIntro() { if (!histShown) { await loadHistory(); showOldHistory(); } }

  JAA.chat = { tailorResume, onButton, onHeader, onUserText, onSummary, afterRun, beginRun, attention, updateCount, reviewCard, askNext, ensureIntro, applyAction, hasRun: () => runs > 0, _hist: () => hist };
})();
