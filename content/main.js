/* Orchestrates a fill run and answers messages from the popup. */
(function () {
  'use strict';
  if (window.__JAA_MAIN__) return;
  window.__JAA_MAIN__ = true;
  const JAA = window.JAA;
  const C = JAA.core;
  let running = false;

  function send(msg) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(msg, r => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(r || { ok: false, error: 'No reply from extension background.' });
        });
      } catch (e) { resolve({ ok: false, error: String(e.message || e) }); }
    });
  }

  function scan(adapter) {
    const root = adapter.formRoot ? adapter.formRoot() : document;
    if (!root) return []; // e.g. LinkedIn without the Easy Apply modal open
    let fields = C.collect(root, adapter);
    if (!fields.length && root !== document) fields = C.collect(document, adapter);
    const files = fields.filter(f => f.kind === 'file');
    if (files.length === 1) files[0].isOnlyFile = true;
    return fields;
  }

  const MAX_LLM_QUESTIONS = 30;
  let lastRetryable = false;
  // Answer bank used for matching: normal entries, plus company-specific templates
  // ("Why {company}?") only when the user opted in, with the current company filled in.
  function prepareBank(bank, settings, company) {
    return (bank || []).filter(e => e && e.q && e.a != null && e.a !== '').flatMap(e => {
      if (!e.companySpecific) return [e];
      if (!settings.learnCompanySpecific || !company) return [];
      const fillCo = t => String(t).replace(/\{company\}/g, company);
      return [Object.assign({}, e, { q: fillCo(e.q), a: fillCo(e.a) })];
    });
  }
  // The submit guard is armed only while we touch the page (a few ms per field), never while
  // waiting minutes for the model, so the user can still press Submit himself at any time.
  async function guardedFill(f, v, alts) {
    C.blockSubmits(true);
    try { return await C.fill(f, v, alts); } catch (e) { return { ok: false, why: e.message }; } finally { C.blockSubmits(false); }
  }
  // Fill, then re-read the value after a moment; if the site dropped it, try once more.
  async function fillVerified(f, v, alts) {
    let res = await guardedFill(f, v, alts);
    if (!res.ok || f.kind === 'file') return res;
    await C.sleep(250);
    if (C.verify(f, res.shown)) return res;
    res = await guardedFill(f, v, alts);
    if (!res.ok) return res;
    await C.sleep(400);
    if (C.verify(f, res.shown)) return Object.assign(res, { retried: true });
    return { ok: false, unstuck: true, why: 'Didn\'t stick: the site cleared or changed it (fill it by hand)' };
  }
  JAA.fillField = fillVerified;
  const ESSAY = /(why|describe|tell us|explain|share|what excites|what interests|most impressive|proud|cover letter|additional information|anything else|motivat|walk us through|example of)/i;
  const isEssay = f => (f.kind === 'textarea' || f.kind === 'text') && !f.options && (f.kind === 'textarea' || (f.label || '').length > 110 || ESSAY.test(f.label || ''));
  const MAX_OPTIONS = 40;
  // Long dropdowns (e.g. 2,000 universities) would blow the small model's context:
  // keep "Other / not listed" style options plus the ones closest to the hint/question.
  function trimOptions(f, question) {
    if (f.options.length <= MAX_OPTIONS) return f.options;
    const keep = f.options.filter(o => /\b(other|not listed|none|n\/a|prefer not|decline)\b/i.test(o.text));
    const ref = (f.hint ? String(f.hint) + ' ' : '') + question;
    const ranked = f.options.filter(o => !keep.includes(o))
      .map(o => ({ o, s: C.similarity(ref, o.text) }))
      .sort((a, b) => b.s - a.s).slice(0, MAX_OPTIONS - keep.length).map(x => x.o);
    return ranked.concat(keep);
  }

  async function run(opts) {
    opts = opts || {};
    if (running) return { ok: false, error: 'Already filling.' };
    running = true;
    const adapter = opts.generic ? JAA.sites.generic : JAA.sites.detect(location);
    try {
      if (adapter.stub && !opts.generic) {
        JAA.ui.message(adapter.name, adapter.note);
        return { ok: false, stub: true, error: adapter.note };
      }
      if (adapter.accountPage && adapter.accountPage()) {
        JAA.ui.message('Sign in yourself', adapter.accountNote);
        return { ok: false, account: true, error: adapter.accountNote };
      }
      const data = await JAA.loadAll();
      data.tailored = await tailoredForThisJob();
      const info0 = (adapter.jobInfo ? adapter.jobInfo() : {}) || {};
      data.answerBank = prepareBank(data.answerBank, data.settings, info0.company);
      let fields = scan(adapter);
      if (!fields.length) {
        const msg = adapter.needsApplyPage && adapter.needsApplyPage()
          ? (adapter.applyHint || 'Open the application form first (click "Apply" on the job page), then press Fill again.')
          : 'No application fields found on this page.';
        JAA.ui.message('Nothing to fill', msg);
        return { ok: false, error: msg };
      }
      JAA.ui.busy('Filling…');
      if (JAA.chat) { JAA.chat.beginRun(opts); if (opts.source !== 'chat') await JAA.chat.ensureIntro(); }
      if (!opts.retry) C.clearMarks(document);

      const items = [];
      const pending = [];
      const unstuck = [];
      let filled = 0, ai = 0, kept = 0;
      const step = opts.step || (adapter.stepInfo ? adapter.stepInfo() : null);
      const jobDescription = (adapter.jobDescription ? adapter.jobDescription() : '') || '';
      JAA.state = { fields, items, adapter, info: info0, data, step, jobDescription, at: Date.now() };
      for (const f of fields) {
        const item = { id: f.id, label: f.label || f.question || f.name, kind: f.kind, required: !!f.required, desc: f.desc || '' };
        items.push(item);
        if (!data.settings.overwriteExisting && C.hasValue(f)) { kept++; item.status = 'kept'; continue; }
        const r = C.resolve(f, data);
        if (r && 'value' in r) {
          const res = await fillVerified(f, r.value, r.alts);
          if (res.ok) { filled++; item.status = 'ok'; item.value = res.shown; item.source = r.source; item.ruleKey = r.key; C.mark(f, 'jaa-ok'); continue; }
          if (res.unstuck) { unstuck.push(item.label); item.status = 'todo'; item.why = res.why; item.unstuck = true; C.mark(f, 'jaa-todo'); continue; }
          // option not found: EEO answers are never guessed by the model
          if (r.eeo || f.kind === 'file') { item.status = 'todo'; item.why = res.why; C.mark(f, 'jaa-todo'); continue; }
          f.hint = r.value;
          pending.push({ f, item });
          continue;
        }
        if (r && r.missing) { item.status = 'todo'; item.why = r.missing === 'resume' ? 'Add your resume in Options' : `Not in your profile (${r.missing})`; C.mark(f, 'jaa-todo'); continue; }
        if (r && r.skip) { item.status = 'todo'; item.why = r.skip; C.mark(f, 'jaa-todo'); continue; }
        pending.push({ f, item });
      }

      let llmError = null;
      const summarize = (progress, retryable) => ({ ok: true, site: adapter.name, title: info0.title || '', company: info0.company || '', url: location.href, filled, ai, kept, todo: items.filter(i => i.status === 'todo' || (!i.status && i.pendingAI)).length, llmError, items, progress, retryable, unstuck, step, remember: data.settings.rememberAnswers !== false });
      if (pending.length) {
        if (!data.settings.useLLM) {
          llmError = 'Local AI is off (Options), so open questions were left for you.';
        } else {
          pending.forEach(p => { p.item.pendingAI = true; p.essay = isEssay(p.f); });
          // short factual questions first; long free-text drafts last
          const ordered = pending.filter(p => !p.essay).sort((x, y) => (y.f.options ? 1 : 0) - (x.f.options ? 1 : 0)).concat(pending.filter(p => p.essay)).slice(0, MAX_LLM_QUESTIONS);
          const size = Math.max(1, Math.min(10, Number(data.settings.llmBatchSize) || 5));
          const batches = [];
          let cur = [];
          for (const p of ordered) {
            const lim = p.essay ? 2 : size;
            if (cur.length && (cur.length >= lim || cur[0].essay !== p.essay)) { batches.push(cur); cur = []; }
            cur.push(p);
          }
          if (cur.length) batches.push(cur);

          JAA.ui.busy('Loading local model…');
          JAA.ui.summary(summarize('Loading local model… (first time can take a minute on 8 GB)'), fields);
          const w = await send({ type: 'ollama:warm' });
          if (w && w.ok === false && w.error && !/took longer/i.test(w.error)) llmError = w.error;

          let timeouts = 0;
          const errors = [];
          for (let bi = 0; bi < batches.length && !llmError; bi++) {
            const batch = batches[bi];
            const label = `Local AI: batch ${bi + 1}/${batches.length} (${batch.length} ${batch[0].essay ? 'long answer' + (batch.length > 1 ? 's' : '') : 'question' + (batch.length > 1 ? 's' : '')})…`;
            JAA.ui.busy(`AI ${bi + 1}/${batches.length}…`);
            JAA.ui.summary(summarize(label), fields);
            const questions = batch.map(({ f, essay }) => {
              const qd = { id: f.id, question: (f.question ? f.question + ' — ' : '') + (f.label || f.name || 'Untitled field'), type: f.kind === 'checkboxGroup' ? 'multi-select' : (essay ? 'long-text' : f.kind) };
              if (f.options && f.options.length) qd.options = trimOptions(f, qd.question).map(o => o.text);
              if (f.kind === 'combobox') qd.note = 'dropdown; give the most likely option text';
              if (f.hint) qd.suggested = String(f.hint);
              if (f.required) qd.required = true;
              return qd;
            });
            const timeoutSec = bi === 0 ? (data.settings.llmFirstTimeoutSec || 180) : (data.settings.llmTimeoutSec || 90);
            const isE = batch[0].essay;
            const res = await send({ type: 'ollama:answer', questions, kind: isE ? 'essay' : 'short', timeoutSec, company: info0.company || '', jobTitle: isE ? info0.title || '' : '', jobDescription: isE ? jobDescription.slice(0, 2000) : '' });
            if (res.ok && res.partial) {
              // timed out mid-reply: keep the answers that were complete, retry the rest later
              errors.push(`batch ${bi + 1}: ${res.error}`);
              batch.forEach(p => { if (!(p.f.id in (res.answers || {}))) p.item.why = 'AI timed out (Retry AI)'; });
            }
            if (!res.ok) {
              errors.push(`batch ${bi + 1}: ${res.error}`);
              batch.forEach(p => { p.item.why = res.timeout ? 'AI timed out (Retry AI)' : 'AI error (Retry AI)'; });
              if (res.fatal) { llmError = res.error; break; }
              if (res.timeout && ++timeouts >= 2) {
                llmError = res.error + (/qwen2\.5:3b/.test(res.error) ? '' : ' Timeouts keep happening: on an 8 GB Mac use qwen2.5:3b (Options → Local AI).');
                break;
              }
              continue; // a failed batch doesn't throw away the others
            }
            if (res.partial) { if (++timeouts >= 2) llmError = res.error; } else timeouts = 0;
            const answers = res.answers || {};
            for (const { f, item } of batch) {
              item.pendingAI = false;
              const a = answers[f.id];
              if (a == null || a === '' || (Array.isArray(a) && !a.length)) { item.why = item.why || 'AI had no answer'; continue; }
              if (!data.settings.overwriteExisting && C.hasValue(f)) { item.status = 'kept'; kept++; continue; } // the user typed it meanwhile
              const out = await fillVerified(f, a);
              if (out.ok) { ai++; item.status = 'ai'; item.value = out.shown; item.source = 'ai'; item.essay = isEssay(f); C.mark(f, 'jaa-ai'); }
              else if (out.unstuck) { unstuck.push(item.label); item.why = out.why; item.unstuck = true; }
              else item.why = 'AI answer didn\'t fit: ' + out.why;
            }
            JAA.ui.summary(summarize(bi + 1 < batches.length ? `Filled batch ${bi + 1}/${batches.length}…` : ''), fields);
          }
          if (!llmError && errors.length) llmError = `${errors.length} of ${batches.length} AI batches failed (the rest were filled). ${errors[errors.length - 1].replace(/^batch \d+: /, '')}`;
          if (pending.length > ordered.length) llmError = (llmError ? llmError + ' ' : '') + `Only the first ${MAX_LLM_QUESTIONS} open questions were sent to the model.`;
        }
        for (const { f, item } of pending) {
          item.pendingAI = false;
          if (!item.status) { item.status = 'todo'; item.why = item.why || (llmError ? 'Local AI unavailable' : 'No answer found'); C.mark(f, 'jaa-todo'); }
        }
      }
      lastRetryable = items.some(i => i.status === 'todo' && /AI|Local AI/.test(i.why || ''));

      const info = (adapter.jobInfo ? adapter.jobInfo() : {}) || {};
      const summary = { ok: true, site: adapter.name, title: info.title || '', company: info.company || '', url: location.href, filled, ai, kept, todo: items.filter(i => i.status === 'todo').length, llmError, items, retryable: lastRetryable && data.settings.useLLM, unstuck, step, remember: data.settings.rememberAnswers !== false };
      JAA.ui.summary(summary, fields);
      if (JAA.chat) JAA.chat.afterRun(summary, fields, opts);
      if (JAA.learn) JAA.learn.watch(fields, items, { company: summary.company, site: adapter.name });
      send({ type: 'tracker:log', entry: { key: JAA.jobKey(location.href), company: summary.company, title: summary.title, url: (window.top === window ? location.href : (document.referrer || location.href)), formUrl: location.href, site: adapter.name, filled, ai, todo: summary.todo } });
      return summary;
    } catch (e) {
      C.blockSubmits(false);
      console.error('[Job Apply Assistant]', e);
      JAA.ui.message('Something went wrong', String(e && e.message || e), true);
      return { ok: false, error: String(e && e.message || e) };
    } finally {
      C.blockSubmits(false); // always disarm the submit guard
      running = false;
      JAA.ui.busy(null);
    }
  }
  JAA.run = run;
  JAA.isRunning = () => running;
  JAA.scan = () => scan(JAA.sites.detect(location));
  JAA.frameHasForm = () => frameHasForm();

  function frameHasForm() {
    const a = JAA.sites.detect(location);
    if (a.stub) return window.top === window;
    try { return scan(a).length >= 2; } catch (_) { return false; }
  }

  // the newest tailored resume made for this job (Tailor page), if any
  async function tailoredForThisJob() {
    try {
      const { tailored = [] } = await chrome.storage.local.get('tailored');
      const k = JAA.jobKey(location.href);
      return tailored.filter(t => t.jobKey === k).sort((a, b) => b.createdAt - a.createdAt)[0] || null;
    } catch (_) { return null; }
  }
  // "Attach to the application" from the Tailor page: put the tailored file into the resume upload
  async function attachTailored(entryId) {
    const { tailored = [], settings } = await chrome.storage.local.get(['tailored', 'settings']);
    const entry = tailored.find(t => t.id === entryId);
    if (!entry) return { ok: false, error: 'Tailored resume not found.' };
    const adapter = JAA.sites.detect(location);
    const fields = scan(adapter).filter(f => f.kind === 'file' && !/cover/i.test(f.label + ' ' + f.name + ' ' + f.idAttr) && (/resume|cv|curriculum/i.test(f.label + ' ' + f.name + ' ' + f.idAttr) || f.isOnlyFile));
    if (!fields.length) return { ok: false, error: 'No resume upload field found on this page.' };
    const file = C.pickTailored(fields[0], { tailored: entry, settings: JAA.merge(JAA.DEFAULT_SETTINGS, settings) }, true);
    if (!file) return { ok: false, error: 'This upload field does not accept the formats you created.' };
    const r = await C.fill(fields[0], file);
    if (r.ok) { C.mark(fields[0], 'jaa-ok'); C.flash(fields[0]); }
    return r.ok ? { ok: true, name: file.name } : { ok: false, error: r.why || 'Could not attach.' };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return false;
    if (msg.type === 'tailor:attach') {
      if (!frameHasForm()) return false;
      if (location.protocol === 'chrome-extension:' && !msg.practice) return false; // only the background's relay
      attachTailored(msg.entryId).then(sendResponse);
      return true;
    }
    if (msg.type === 'jaa:ping') {
      const has = frameHasForm();
      if (!has && window.top !== window) return false; // let the frame with the form answer
      const a = JAA.sites.detect(location);
      sendResponse({ ok: true, hasForm: has, site: a.name, stub: !!a.stub, note: a.note || '', top: window.top === window });
      return false;
    }
    if (msg.type === 'jaa:fill') {
      if (!msg.generic && !frameHasForm() && window.top !== window) return false;
      if (!msg.generic && !frameHasForm()) {
        // top frame without a form: if the form lives in an embedded ATS iframe, let that frame answer
        const embedded = Array.from(document.querySelectorAll('iframe')).some(f => /greenhouse\.io|lever\.co|ashbyhq\.com/.test(f.src || ''));
        if (embedded) return false;
      }
      run(msg).then(sendResponse);
      return true;
    }
    return false;
  });

  // Show the floating button once the page has a form (Ashby/Greenhouse render late).
  async function maybeShowButton() {
    const { settings } = await JAA.loadAll();
    if (!settings.showFloatingButton) return;
    const a = JAA.sites.detect(location);
    if (a.generic || a.stub) return;
    // Workday and LinkedIn open their forms later (wizard pages / Easy Apply modal): keep looking
    const patient = a.name === 'Workday' || /LinkedIn/.test(a.name);
    let tries = 0, warmed = false;
    const tick = () => {
      if (frameHasForm()) {
        JAA.ui.showButton(true);
        if (!warmed && settings.useLLM && settings.warmUp !== false) { warmed = true; send({ type: 'ollama:warm' }); } // load the model before the user clicks Fill
        if (JAA.steps) JAA.steps.start();
        // SPA frameworks (Remix/React hydration on Greenhouse, Ashby) can wipe nodes they
        // don't own; put the button back if that happens.
        setInterval(() => { if (!document.getElementById('jaa-host') && frameHasForm()) JAA.ui.showButton(true); }, 2000);
        return;
      }
      if (patient || ++tries < 20) setTimeout(tick, patient ? 2500 : 1500);
    };
    tick();
  }
  if (!window.__JAA_INJECTED_BY_POPUP__) maybeShowButton();
})();
