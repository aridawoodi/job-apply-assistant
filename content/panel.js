/* Panel tabs other than the chat (v0.5): Resume (match + tailor + cover letter), Profile (click to copy),
 * Tracker (this job + recent), Report (diagnostics + prefilled GitHub issue, no personal data).
 * Also the job card and the privacy card at the top of the Assistant tab. Rendered lazily on first view. */
(function () {
  'use strict';
  if (window.__JAA_PANEL__) return;
  window.__JAA_PANEL__ = true;
  const JAA = window.JAA;
  const h = (...a) => JAA.ui.h(...a);
  const send = msg => new Promise(res => { try { chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; res(r || {}); }); } catch (_) { res({}); } });
  const trunc = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const adapter = () => JAA.sites.detect(location);
  const jobUrl = () => (window.top === window ? location.href : (document.referrer || location.href));
  const supported = () => { const a = adapter(); return !a.generic && !a.stub && !(/LinkedIn/.test(a.name) && !/\/jobs\//.test(location.pathname)); };
  const sec = (title, ...kids) => h('div', { class: 'sec' }, h('h4', { text: title }), ...kids);

  async function copy(text, what) {
    const v = String(text == null ? '' : text);
    let ok = false;
    try { await navigator.clipboard.writeText(v); ok = true; } catch (_) {
      const ta = document.createElement('textarea'); ta.value = v; ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta); ta.select(); try { ok = document.execCommand('copy'); } catch (__) { ok = false; } ta.remove();
    }
    JAA.ui.toast(ok ? `Copied ${what} ✓` : 'Could not copy (the page blocked the clipboard)', ok ? 'ok' : 'err', ok ? trunc(v, 70) : 'Select the text and press Ctrl/Cmd+C');
    return ok;
  }
  const cpBtn = (text, what) => { const b = h('button', { class: 'cp', type: 'button', title: 'Copy ' + what, text: 'Copy', onclick: async () => { if (await copy(text, what)) { b.textContent = '✓'; b.classList.add('done'); setTimeout(() => { b.textContent = 'Copy'; b.classList.remove('done'); }, 1400); } } }); return b; };
  const copyRow = (k, v, what) => v ? h('li', {}, h('span', { class: 'k', text: k }), h('span', { class: 'v', title: v, text: v }), cpBtn(v, what || k.toLowerCase())) : null;

  /* ---------- job card + privacy card (Assistant tab) ---------- */
  function meta() { try { return JAA.jobMeta ? JAA.jobMeta() : {}; } catch (_) { return {}; } }
  function jobCard(m, opts) {
    opts = opts || {};
    const initial = (m.company || m.title || '?').trim()[0] || '?';
    const fav = h('div', { class: 'fav', text: initial.toUpperCase() });
    if (m.logo) { const img = h('img', { alt: '', src: m.logo, referrerpolicy: 'no-referrer' }); img.onerror = () => img.remove(); img.onload = () => { fav.textContent = ''; fav.appendChild(img); }; }
    const bm = h('button', { class: 'bm', type: 'button', 'data-act': 'bookmark', text: '☆ Save job', title: 'Save this job to your tracker (stage: Saved)' });
    const setBm = on => { bm.classList.toggle('on', on); bm.textContent = on ? '★ Saved' : '☆ Save job'; };
    const entry = () => ({ key: JAA.jobKey(location.href), company: m.company, title: m.title, url: jobUrl(), formUrl: location.href, site: m.site, location: m.location, salary: m.salary });
    send({ type: 'tracker:get', entry: entry() }).then(r => setBm(!!(r.row && (r.row.bookmarked || r.row.stage !== 'saved' || r.row.via === 'fill'))));
    bm.onclick = async () => {
      const on = !bm.classList.contains('on');
      const r = await send({ type: 'tracker:bookmark', entry: entry(), on });
      if (r.ok) { setBm(on); JAA.ui.toast(on ? 'Saved to your tracker ★' : 'Removed the bookmark', on ? 'ok' : 'info', 'Job Apply Assistant · tracker'); }
    };
    const chips = [m.location ? '📍 ' + trunc(m.location, 40) : '', m.salary ? '💰 ' + trunc(m.salary, 40) : '', m.posted ? '🕒 ' + m.posted : ''].filter(Boolean);
    return h('div', { class: 'jc', 'data-card': 'job' }, fav,
      h('div', { style: 'min-width:0;flex:1' }, h('div', { class: 'jt', text: trunc(m.title || 'This job', 80) }), h('div', { class: 'jco', text: m.company || m.site || '' }),
        chips.length ? h('div', { class: 'meta' }, chips.map(c => h('span', { text: c }))) : null),
      opts.noBookmark || m.site === 'Practice' || m.site === 'Generic' ? null : bm);
  }
  async function privacyCard() {
    const { uiPrefs = {} } = await chrome.storage.local.get('uiPrefs');
    const open = () => send({ type: 'privacy:open' });
    if (uiPrefs.privacySeen) return h('div', { class: 'priv mini', 'data-card': 'privacy' }, '🔒 Everything stays on your computer · ', h('a', { text: 'Privacy', onclick: open }));
    const card = h('div', { class: 'priv', 'data-card': 'privacy' }, h('span', { style: 'font-size:20px', text: '🔒' }),
      h('div', { style: 'flex:1' }, h('b', { text: 'Everything stays on your computer' }), 'Your profile, resume and answers live in this browser, and the AI runs locally. No account, no tracking. ', h('a', { text: 'Privacy', onclick: open })),
      h('button', { class: 'cp', type: 'button', text: 'Got it', onclick: async () => { const r = await chrome.storage.local.get('uiPrefs'); await chrome.storage.local.set({ uiPrefs: Object.assign({}, r.uiPrefs || {}, { privacySeen: true }) }); card.replaceWith(await privacyCard()); } }));
    return card;
  }
  async function fillTop() {
    const slot = JAA.ui.topSlot();
    if (slot.dataset.done) return;
    slot.dataset.done = '1';
    const m = meta();
    if (supported() || adapter().name === 'Practice') slot.appendChild(jobCard(m));
    slot.appendChild(await privacyCard());
  }

  /* ---------- Resume tab ---------- */
  function coverFields() {
    let fields = [];
    try { fields = JAA.scan ? JAA.scan() : []; } catch (_) { fields = []; }
    return fields.filter(f => /\bcover\b/i.test((f.label || '') + ' ' + (f.name || '') + ' ' + (f.idAttr || '')) && (f.kind === 'file' || f.kind === 'textarea' || f.kind === 'text'));
  }
  async function renderResume(box) {
    box.innerHTML = '';
    const m = meta();
    box.appendChild(jobCard(m, { noBookmark: true }));
    // match
    const ms = sec('Resume match');
    box.appendChild(ms);
    const body = h('div', { class: 'muted', text: 'Scoring…' }); ms.appendChild(body);
    const draw = async (force, ai) => {
      body.innerHTML = ''; body.textContent = ai ? 'Asking your local AI for keywords…' : 'Scoring…';
      const r = JAA.match && JAA.match.get ? await JAA.match.get(force, { ai }) : null;
      body.textContent = '';
      if (!r) { body.textContent = 'Not available on this page.'; return; }
      body.appendChild(JAA.match.render(h, r, { full: true }));
      if (!r.none && !r.noResume) body.appendChild(h('div', { class: 'row', style: 'margin-top:8px' },
        h('button', { class: 'chip ghost', type: 'button', text: '↻ Recalculate', onclick: () => draw(true, false) }),
        h('button', { class: 'chip', type: 'button', 'data-act': 'match-ai', text: '✦ Refine with local AI', onclick: () => draw(true, true) })));
    };
    draw(false, false);
    // tailoring
    const ts = sec('Tailored resume');
    const { tailored = [] } = await chrome.storage.local.get('tailored');
    const mine = tailored.filter(t => t.jobKey === JAA.jobKey(location.href)).sort((a, b) => b.createdAt - a.createdAt)[0];
    ts.appendChild(h('div', { class: 'muted', text: mine ? `Made ${new Date(mine.createdAt).toLocaleDateString()}: ${mine.changes || 0} change(s). ${(mine.files || []).map(f => f.name).join(' · ')}` : 'A version of your resume for this job: I only reword and reorder what\'s already in it, and you approve each change.' }));
    ts.appendChild(h('div', { class: 'row', style: 'margin-top:8px' },
      h('button', { class: 'btnp', type: 'button', 'data-act': 'tailor', text: mine ? '✨ Tailor again' : '✨ Tailor my resume for this job', onclick: () => JAA.chat && JAA.chat.tailorResume() })));
    if (mine && JAA.attachTailored) ts.appendChild(h('button', { class: 'btns', type: 'button', style: 'margin-top:6px', text: '📎 Attach it to this application', onclick: async () => { const r = await JAA.attachTailored(mine.id); JAA.ui.toast(r.ok ? 'Attached ' + r.name : r.error, r.ok ? 'ok' : 'err', 'Job Apply Assistant'); } }));
    box.appendChild(ts);
    // cover letter
    const cs = sec('Cover letter');
    const cf = coverFields();
    const { coverLetters = [] } = await chrome.storage.local.get('coverLetters');
    const letter = coverLetters.filter(t => t.jobKey === JAA.jobKey(location.href)).sort((a, b) => b.createdAt - a.createdAt)[0];
    const status = !cf.length ? 'No cover letter field on this page.' : cf.map(f => `${f.kind === 'file' ? 'Upload field' : 'Text box'}${f.required ? ' (required)' : ' (optional)'}: ${JAA.core.hasValue(f) ? 'filled ✓' : 'empty'}`).join(' · ');
    cs.appendChild(h('div', { class: 'muted', 'data-cover-status': cf.length ? (cf[0].kind === 'file' ? 'file' : 'text') : 'none', text: status }));
    if (letter) cs.appendChild(h('div', { class: 'muted', style: 'margin-top:4px', text: `Your letter for this job: ${trunc(letter.text, 90)}` }));
    cs.appendChild(h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'btnp', type: 'button', 'data-act': 'cover', text: letter ? '✍️ Rewrite the cover letter' : '✍️ Write a cover letter with my resume', onclick: () => openCover(cf[0]) })));
    if (letter && cf.length && JAA.coverFill) cs.appendChild(h('button', { class: 'btns', type: 'button', style: 'margin-top:6px', text: cf[0].kind === 'file' ? '📎 Attach my letter' : '↧ Put my letter in the text box', onclick: async () => { const r = await JAA.coverFill(letter.id); JAA.ui.toast(r.ok ? 'Cover letter added ✓' : r.error, r.ok ? 'ok' : 'err', 'Job Apply Assistant'); } }));
    cs.appendChild(h('div', { class: 'muted', style: 'margin-top:6px;font-size:11px', text: 'Written by your local AI from your resume and this job, then fact-checked like tailoring. You approve it first.' }));
    box.appendChild(cs);
  }
  function jobForPages() {
    const a = adapter();
    const info = (a.jobInfo ? a.jobInfo() : {}) || {};
    JAA.__jdMax = 12000;
    let description = ''; try { description = (a.jobDescription ? a.jobDescription() : '') || ''; } catch (_) { /* paste it */ }
    JAA.__jdMax = 0;
    return { key: JAA.jobKey(location.href), title: info.title || '', company: info.company || '', site: a.name || '', url: jobUrl(), description };
  }
  async function openCover(f) {
    const field = f ? { kind: f.kind === 'file' ? 'file' : 'text', accept: f.el && f.el.accept || '', required: !!f.required, label: f.label || '' } : null;
    const r = await send({ type: 'cover:open', job: jobForPages(), field });
    if (!r.ok) JAA.ui.toast(r.error || 'Could not open the cover letter page', 'err', 'Job Apply Assistant');
    else if (JAA.chat) JAA.chat.say('I opened the cover letter page in a new tab. It writes from your resume and this job, checks every fact, and waits for your approval before anything goes into the form.');
  }

  /* ---------- Profile tab: click to copy ---------- */
  async function renderProfile(box) {
    box.innerHTML = '';
    const { profile, settings, answerBank } = await JAA.loadAll();
    const p = profile;
    const name = [p.firstName, p.lastName].filter(Boolean).join(' ');
    if (!name && !p.email) {
      box.appendChild(sec('Your profile', h('div', { class: 'muted', text: 'Nothing saved yet. Add your resume in Setup and your details appear here, ready to copy into any site.' }),
        h('button', { class: 'btns', type: 'button', style: 'margin-top:8px', text: 'Open setup', onclick: () => send({ type: 'onboarding:open' }) })));
      return;
    }
    box.appendChild(h('div', { class: 'muted', text: 'Click Copy, then paste into any form (works on every site).' }));
    box.appendChild(sec('Contact', h('ul', { class: 'copyl' }, copyRow('Name', name, 'name'), copyRow('First name', p.firstName), copyRow('Last name', p.lastName),
      copyRow('Email', settings.applicationEmail || p.email, 'email'), settings.applicationEmail && p.email !== settings.applicationEmail ? copyRow('Personal email', p.email, 'personal email') : null,
      copyRow('Phone', p.phone), copyRow('Location', p.location || [p.city, p.state].filter(Boolean).join(', '), 'location'))));
    const links = [copyRow('LinkedIn', p.linkedin), copyRow('GitHub', p.github), copyRow('Portfolio', p.portfolio), copyRow('Website', p.website)].filter(Boolean);
    if (links.length) box.appendChild(sec('Links', h('ul', { class: 'copyl' }, links)));
    const edu = JAA.educationListOf ? JAA.educationListOf(p) : (p.educationList || []);
    if (edu.length) box.appendChild(sec('Education', h('ul', { class: 'copyl' }, edu.slice(0, 6).flatMap(e => [
      copyRow('School', e.school), copyRow('Degree', [e.degree, e.field].filter(Boolean).join(', '), 'degree'), copyRow('Dates', [e.start, e.end].filter(Boolean).join(' – '), 'dates')]))));
    const jobs = p.workHistory || [];
    if (jobs.length) {
      const s = sec('Experience');
      jobs.slice(0, 8).forEach(j => {
        const desc = (j.bullets || []).map(b => '• ' + b).join('\n');
        s.appendChild(h('div', { class: 'trow' }, h('div', { class: 't1', text: [j.title, j.company].filter(Boolean).join(' · ') }), h('div', { class: 't2', text: [j.start, j.end].filter(Boolean).join(' – ') + (j.location ? ' · ' + j.location : '') }),
          h('div', { class: 'row', style: 'justify-content:flex-start;margin-top:4px;flex-wrap:wrap' }, j.title ? cpBtn(j.title, 'title') : null, j.company ? cpBtn(j.company, 'company') : null,
            desc ? h('button', { class: 'cp', type: 'button', 'data-act': 'copy-desc', text: 'Copy description', onclick: () => copy(desc, 'description') }) : null)));
      });
      box.appendChild(s);
    }
    const projects = p.projects || [];
    if (projects.length) {
      const s = sec('Projects');
      projects.slice(0, 6).forEach(x => {
        const desc = [x.description].concat((x.bullets || []).map(b => '• ' + b)).filter(Boolean).join('\n');
        s.appendChild(h('div', { class: 'trow' }, h('div', { class: 't1', text: x.name || '' }), h('div', { class: 't2', text: [[x.start, x.end].filter(Boolean).join(' – '), (x.tech || []).slice(0, 6).join(', ')].filter(Boolean).join(' · ') }),
          h('div', { class: 'row', style: 'justify-content:flex-start;margin-top:4px;flex-wrap:wrap' }, x.name ? cpBtn(x.name, 'project') : null, x.link ? cpBtn(x.link, 'link') : null,
            desc ? h('button', { class: 'cp', type: 'button', text: 'Copy description', onclick: () => copy(desc, 'description') }) : null)));
      });
      box.appendChild(s);
    }
    if ((p.skills || []).length) {
      const s = sec('Skills');
      s.appendChild(h('div', { class: 'kw' }, p.skills.slice(0, 40).map(k => h('span', { style: 'cursor:pointer;background:#eef2ff;color:#3730a3', title: 'Copy', text: k, onclick: () => copy(k, 'skill') }))));
      s.appendChild(h('button', { class: 'cp', type: 'button', style: 'margin-top:6px', text: 'Copy all skills', onclick: () => copy(p.skills.join(', '), 'skills') }));
      box.appendChild(s);
    }
    const bank = (answerBank || []).filter(e => e && e.q && e.a && !JAA.NEVER_LEARN.test(JAA.normText(e.q)));
    if (bank.length) {
      const s = sec('Saved answers');
      const list = h('div');
      const flt = h('input', { class: 'in', type: 'text', placeholder: 'Search your saved answers…' });
      const draw = () => {
        list.innerHTML = '';
        const q = flt.value.trim().toLowerCase();
        bank.filter(e => !q || (e.q + ' ' + e.a).toLowerCase().includes(q)).slice(0, 25).forEach(e => list.appendChild(h('div', { class: 'trow' },
          h('div', { class: 't2', text: trunc(e.q, 90) }), h('div', { style: 'display:flex;gap:6px;align-items:flex-start' }, h('div', { style: 'flex:1;font-size:12.5px', text: trunc(String(e.a), 160) }), cpBtn(String(e.a), 'answer')))));
      };
      flt.addEventListener('input', draw); draw();
      s.append(flt, list); box.appendChild(s);
    }
    box.appendChild(h('button', { class: 'btns', type: 'button', text: 'Edit profile in Options', onclick: () => send({ type: 'options:open', section: 'profile' }) }));
  }

  /* ---------- Tracker tab (mini) ---------- */
  function stepper(row, onPick) {
    const cur = row.stage || 'saved';
    const order = JAA.STAGES.map(s => s[0]);
    const ci = order.indexOf(cur);
    return h('div', { class: 'stepper', role: 'group', 'aria-label': 'Stage' }, JAA.STAGES.map(([k, label], i) => {
      const d = row.stageDates && row.stageDates[k];
      return h('button', { type: 'button', 'data-stage': k, class: (k === cur ? 'cur' : (k !== 'rejected' && i < ci && cur !== 'rejected' ? 'past' : '')) + (k === 'rejected' ? ' rej' : ''), title: label + (d ? ' · ' + new Date(d).toLocaleDateString() : ''), text: label, onclick: () => onPick(k) });
    }));
  }
  async function renderTracker(box) {
    box.innerHTML = '';
    const m = meta();
    const entry = { key: JAA.jobKey(location.href), url: jobUrl(), company: m.company, title: m.title, site: m.site, location: m.location, salary: m.salary };
    const r = await send({ type: 'tracker:get', entry });
    const row = r.row;
    const s = sec('This job');
    if (!row) {
      s.appendChild(h('div', { class: 'muted', text: supported() ? 'Not in your tracker yet. It\'s added when you fill or submit, or save it now.' : 'Open a job page to track it.' }));
      if (supported()) s.appendChild(h('button', { class: 'btnp', type: 'button', style: 'margin-top:8px', 'data-act': 'bookmark', text: '☆ Save this job', onclick: async () => { await send({ type: 'tracker:bookmark', entry, on: true }); renderTracker(box); } }));
    } else {
      s.appendChild(h('div', { class: 't1', style: 'font-weight:700', text: [row.company, row.title].filter(Boolean).join(' · ') }));
      s.appendChild(h('div', { class: 'muted', text: `${row.status || ''}${row.submittedAt ? ' · submitted ' + new Date(row.submittedAt).toLocaleDateString() : ''}` }));
      s.appendChild(stepper(row, async k => { await send({ type: 'tracker:update', entry, patch: { stage: k } }); renderTracker(box); }));
      const notes = h('textarea', { class: 'ta', placeholder: 'Notes (recruiter name, referral, what to follow up on…)' }); notes.value = row.notes || '';
      const rem = h('input', { class: 'in', type: 'date', style: 'width:auto' }); rem.value = row.reminderAt || '';
      const out = h('span', { class: 'muted' });
      const save = async () => { await send({ type: 'tracker:update', entry, patch: { notes: notes.value, reminderAt: rem.value } }); out.textContent = 'Saved ✓'; setTimeout(() => { out.textContent = ''; }, 1500); };
      notes.addEventListener('change', save); rem.addEventListener('change', save);
      s.append(notes, h('div', { class: 'row' }, h('label', { style: 'display:flex;gap:6px;align-items:center' }, 'Remind me', rem), out));
    }
    box.appendChild(s);
    const all = await send({ type: 'tracker:list', limit: 8 });
    const rs = sec('Recent');
    (all.rows || []).slice(0, 8).forEach(a => rs.appendChild(h('div', { class: 'trow' }, h('div', { class: 't1', text: trunc([a.company, a.title].filter(Boolean).join(' · ') || a.url, 60) }),
      h('div', { class: 't2', text: `${JAA.STAGE_LABEL[a.stage] || a.stage || ''} · ${a.date ? new Date(a.date).toLocaleDateString() : ''}${a.reminderAt ? ' · ⏰ ' + a.reminderAt : ''}` }))));
    if (!(all.rows || []).length) rs.appendChild(h('div', { class: 'muted', text: 'Nothing tracked yet.' }));
    rs.appendChild(h('button', { class: 'btns', type: 'button', style: 'margin-top:8px', text: 'Open the full tracker', onclick: () => send({ type: 'options:open', section: 'tracker' }) }));
    box.appendChild(rs);
  }

  /* ---------- Report tab ---------- */
  const CATS = ['Not supported site', 'Filled incorrectly', 'Bug', 'Feature request', 'Question'];
  async function diagnostics() {
    const a = adapter();
    let fields = [];
    try { fields = JAA.scan ? JAA.scan() : []; } catch (_) { fields = []; }
    const d = await send({ type: 'diag:info' });
    const st = JAA.state || {};
    const sup = supported();
    return {
      site: !sup ? 'not supported (' + location.hostname + ')' : a.name, host: location.hostname, supported: sup,
      fields: fields.length, kinds: Object.entries(fields.reduce((m, f) => { m[f.kind] = (m[f.kind] || 0) + 1; return m; }, {})).map(([k, n]) => `${k} ${n}`).join(', '),
      lastFill: st.items ? { filled: st.items.filter(i => i.status === 'ok').length, ai: st.items.filter(i => i.status === 'ai').length, todo: st.items.filter(i => i.status === 'todo').length } : null,
      version: d.version || chrome.runtime.getManifest().version, browser: d.browser || '', os: [d.os, d.arch].filter(Boolean).join(' '),
      ollama: d.ollama || {}, profile: d.profile || {}, useLLM: d.useLLM
    };
  }
  function issueBody(dg, cat, desc) {
    const yes = v => v ? 'yes' : 'no';
    const lines = [
      `**Category:** ${cat}`, '', '**What happened**', desc.trim() || '(no description)', '', '**Diagnostics** (collected by the extension; no personal data)',
      `- Extension: ${dg.version}`, `- Browser: ${dg.browser}`, `- OS: ${dg.os}`,
      `- Site: ${dg.site}${dg.supported ? '' : ' (host only, no page address)'}`,
      `- Fields found on the page: ${dg.fields}${dg.kinds ? ' (' + dg.kinds + ')' : ''}`,
      dg.lastFill ? `- Last fill: ${dg.lastFill.filled} filled, ${dg.lastFill.ai} AI, ${dg.lastFill.todo} left` : '- Last fill: not run on this page',
      `- Local AI: ${dg.useLLM ? 'on' : 'off'} · Ollama reachable: ${yes(dg.ollama.reachable)} · connection allowed: ${dg.ollama.originOk === false ? 'no (403)' : yes(dg.ollama.originOk !== false && dg.ollama.reachable)} · model ${dg.ollama.model || '?'} downloaded: ${yes(dg.ollama.hasModel)}`,
      `- Profile complete: ${yes(dg.profile.complete)}${dg.profile.missing && dg.profile.missing.length ? ' (missing: ' + dg.profile.missing.join(', ') + ')' : ''} · resume saved: ${yes(dg.profile.resume)}`
    ];
    return lines.join('\n');
  }
  async function renderReport(box, preset) {
    box.innerHTML = '';
    const ds = sec('Before you report: quick check');
    const list = h('ul', { class: 'diag' }, h('li', { text: 'Checking…' }));
    ds.appendChild(list); box.appendChild(ds);
    const dg = await diagnostics();
    list.innerHTML = '';
    const li = (ok, text, fix) => h('li', {}, (ok ? '✅ ' : '⚠️ ') + text, fix ? h('div', { class: 'muted', style: 'margin-left:22px', text: fix }) : null);
    list.append(
      li(dg.supported, dg.supported ? `Supported site: ${dg.site}` : `This site (${dg.host}) isn't supported yet`, dg.supported ? '' : 'You can still copy your details from the Profile tab, or request support below.'),
      li(dg.fields > 0, `${dg.fields} form field${dg.fields === 1 ? '' : 's'} found on this page`, dg.fields ? '' : 'Open the application form first (the "Apply" button), then check again.'),
      li(dg.ollama.reachable, dg.ollama.reachable ? 'Local AI (Ollama) is running' : 'Local AI (Ollama) isn\'t reachable', dg.ollama.reachable ? '' : 'Start the Ollama app, or run Setup again.'),
      dg.ollama.reachable ? li(dg.ollama.originOk !== false, dg.ollama.originOk === false ? 'Ollama refuses the extension (403)' : 'The extension may talk to Ollama', dg.ollama.originOk === false ? 'Setup → "Try the automatic fix".' : '') : null,
      li(dg.ollama.hasModel, dg.ollama.hasModel ? `Model ${dg.ollama.model} is downloaded` : `Model ${dg.ollama.model || ''} isn't downloaded`, dg.ollama.hasModel ? '' : 'Setup → AI model → Download.'),
      li(dg.profile.complete, dg.profile.complete ? 'Profile complete' : 'Profile is missing: ' + (dg.profile.missing || []).join(', '), dg.profile.complete ? '' : 'Options → Profile.'));
    const fs = sec('Tell us what happened');
    const cat = h('select', { class: 'sel', 'data-act': 'category' }, CATS.map(c => h('option', { text: c })));
    cat.value = preset ? 'Not supported site' : (dg.supported ? 'Filled incorrectly' : 'Not supported site');
    const desc = h('textarea', { class: 'ta', placeholder: 'What did you expect, and what happened instead? Please don\'t include personal details (name, email, answers).' });
    if (preset) desc.value = `Please add support for ${dg.host}. It has job applications I'd like to fill.`;
    const prev = h('pre', { class: 'prev', 'data-act': 'preview' });
    const title = () => `[${cat.value}] ${dg.supported ? dg.site : dg.host}: ${trunc(desc.value, 60) || cat.value}`;
    const upd = () => { prev.textContent = 'Title: ' + title() + '\n\n' + issueBody(dg, cat.value, desc.value); };
    cat.addEventListener('change', upd); desc.addEventListener('input', upd); upd();
    const open = h('button', { class: 'btnp', type: 'button', 'data-act': 'open-issue', text: 'Open a GitHub issue (you review it there)', onclick: () => {
      const url = `${JAA.REPO_URL}/issues/new?title=${encodeURIComponent(title())}&body=${encodeURIComponent(issueBody(dg, cat.value, desc.value))}&labels=${encodeURIComponent(cat.value.toLowerCase().replace(/ /g, '-'))}`;
      window.open(url, '_blank', 'noopener');
    } });
    fs.append(h('label', { class: 'muted', text: 'Category' }), cat, h('label', { class: 'muted', style: 'display:block;margin-top:6px', text: 'Description' }), desc,
      h('div', { class: 'muted', style: 'margin-top:8px', text: 'Exactly what will be included (nothing else is sent; GitHub opens with this text and you press "Submit new issue" yourself):' }), prev, open);
    box.appendChild(fs);
    if (!preset) box.appendChild(h('button', { class: 'btns', type: 'button', 'data-act': 'request-site', text: '🌐 Request support for this site', onclick: () => renderReport(box, true) }));
    box.dataset.diag = JSON.stringify({ supported: dg.supported, fields: dg.fields, reachable: !!dg.ollama.reachable, hasModel: !!dg.ollama.hasModel, complete: !!dg.profile.complete });
  }

  const RENDER = { resume: renderResume, profile: renderProfile, tracker: renderTracker, report: renderReport };
  JAA.panel = {
    render(name, box) { if (RENDER[name] && box) RENDER[name](box).catch(e => { box.textContent = 'Something went wrong: ' + (e && e.message || e); }); },
    fillTop, jobCard, copy, issueBody, diagnostics, openCover
  };
})();
