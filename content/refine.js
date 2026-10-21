/* "Refine with AI" toolbar under long-answer text boxes (v0.5).
 * Refine (shorter / more technical / more enthusiastic / your own instruction), Regenerate, 👍 / 👎.
 * Thumbs are stored on this computer only and become liked / disliked examples for later drafts.
 * Text boxes only: it never touches checkboxes, consent, EEO or submit buttons. */
(function () {
  'use strict';
  if (window.__JAA_REFINE__) return;
  window.__JAA_REFINE__ = true;
  const JAA = window.JAA;
  const C = () => JAA.core;
  const send = msg => new Promise(res => { try { chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; res(r || {}); }); } catch (_) { res({}); } });
  const PROMPTS = [
    ['shorter', 'Shorter', 'Make it shorter (about half as long). Keep the same facts.'],
    ['technical', 'More technical', 'Make it more technical and specific, using only skills and facts from my profile.'],
    ['enthusiastic', 'More enthusiastic', 'Make it sound more enthusiastic and warm, still professional and honest.']
  ];
  const CSS = `
    :host{all:initial}
    .bar{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin:4px 0 8px;font:12px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#334155}
    button{font:600 12px/1 inherit;border:1px solid #c7d2fe;background:#eef2ff;color:#3730a3;border-radius:7px;padding:5px 8px;cursor:pointer}
    button:hover{background:#e0e7ff}button:disabled{opacity:.55;cursor:default}
    button.g{background:#fff;border-color:#e2e8f0;color:#475569}
    button.on{background:#4f46e5;color:#fff;border-color:#4f46e5}
    .menu{display:none;gap:4px;flex-wrap:wrap;width:100%;padding:6px;border:1px solid #e0e7ff;border-radius:8px;background:#f8faff}
    .menu.open{display:flex}
    input{flex:1;min-width:160px;font:12px inherit;border:1px solid #cbd5e1;border-radius:7px;padding:5px 7px}
    .st{color:#64748b;font-size:11.5px;margin-left:4px}
    .st.err{color:#b91c1c}`;

  let enabled = null;
  async function isOn() {
    if (enabled === null) { try { const { settings } = await JAA.loadAll(); enabled = settings.refineToolbar !== false; } catch (_) { enabled = false; } }
    return enabled;
  }
  function eligible(ta) {
    if (!ta || ta.tagName !== 'TEXTAREA' || ta.disabled || ta.readOnly) return false;
    if (ta.closest('#jaa-host, #jaa-match-host, [data-jaa-ui]')) return false;
    if (!C().isVisible(ta)) return false;
    const r = ta.getBoundingClientRect();
    return r.width >= 200 && (r.height >= 48 || (+ta.rows || 0) >= 3);
  }
  function fieldFor(ta) {
    try { return (JAA.scan ? JAA.scan() : []).find(f => f.el === ta) || null; } catch (_) { return null; }
  }
  function labelOf(ta) {
    const f = fieldFor(ta);
    return f ? (f.label || '') : (ta.getAttribute('aria-label') || ta.placeholder || ta.name || '');
  }
  function stateItem(ta) { const st = JAA.state; if (!st || !st.items || !st.fields) return null; const f = st.fields.find(x => x.el === ta); return f ? st.items.find(i => i.id === f.id) || null : null; }

  async function draft(ta, instruction, bar) {
    const { settings } = await JAA.loadAll();
    const st = bar.querySelector('.st');
    st.className = 'st';
    if (!settings.useLLM && !JAA.demo) { st.className = 'st err'; st.textContent = 'Local AI is off (Options → Local AI).'; return; }
    const a = JAA.sites.detect(location);
    const info = (JAA.state && JAA.state.info) || (a.jobInfo ? a.jobInfo() : {}) || {};
    let jd = (JAA.state && JAA.state.jobDescription) || '';
    if (!jd) { try { jd = (a.jobDescription ? a.jobDescription() : '') || ''; } catch (_) { jd = ''; } }
    const prev = C().readValue({ el: ta, kind: 'textarea' }) || ta.value || '';
    const q = labelOf(ta);
    bar.querySelectorAll('button').forEach(b => { b.disabled = true; });
    st.textContent = '✦ Writing with your local AI…';
    const stream = JAA.chat && JAA.chat.stream;
    const r = stream ? await stream({ mode: 'draft', question: q, previous: prev, instruction, title: info.title, company: info.company, jobDescription: jd.slice(0, 2000) }, (t, type) => { if (type === 'status') st.textContent = '⏳ ' + t; }) : { error: 'Assistant not ready: reload the page.' };
    bar.querySelectorAll('button').forEach(b => { b.disabled = false; });
    const text = String(r.text || '').trim();
    if (!text) { st.className = 'st err'; st.textContent = r.error || 'The model returned nothing. Try again.'; return; }
    const f = fieldFor(ta) || { el: ta, kind: 'textarea', label: q };
    const res = JAA.fillField ? await JAA.fillField(f, text) : await C().fill(f, text);
    if (!res.ok) { st.className = 'st err'; st.textContent = 'Could not put it in the box: ' + (res.why || ''); return; }
    C().mark(f, 'jaa-ai');
    ta.__jaaUndo = prev;
    const it = stateItem(ta); if (it) Object.assign(it, { status: 'ai', source: 'ai', value: res.shown || text, reviewed: false });
    bar.querySelector('[data-act="undo"]').hidden = !prev;
    bar.querySelectorAll('[data-act="up"],[data-act="down"]').forEach(b => b.classList.remove('on'));
    st.textContent = '✦ Done: read it and edit anything that isn\'t right.';
    if (JAA.chat && JAA.chat.updateCount) JAA.chat.updateCount();
  }
  async function vote(ta, v, bar, btn) {
    const text = (ta.value || '').trim();
    const st = bar.querySelector('.st');
    if (!text) { st.textContent = 'Write or draft an answer first.'; return; }
    const info = (JAA.state && JAA.state.info) || {};
    const r = await send({ type: 'feedback:add', entry: { q: labelOf(ta), text, vote: v, company: info.company || '' } });
    bar.querySelectorAll('[data-act="up"],[data-act="down"]').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    st.className = 'st';
    st.textContent = r.ok === false ? (r.error || 'Not saved.') : v === 'up' ? 'Thanks: I\'ll write more like this (saved on this computer).' : 'Noted: I\'ll avoid this style. Regenerate?';
  }
  function attach(ta) {
    if (ta.__jaaRefine && ta.__jaaRefine.isConnected) return;
    const host = document.createElement('div');
    host.setAttribute('data-jaa-ui', 'refine');
    const root = host.attachShadow({ mode: 'open' });
    const h = JAA.ui.h;
    const style = document.createElement('style'); style.textContent = CSS;
    const custom = h('input', { type: 'text', placeholder: 'Your instruction, e.g. "mention my Python work"' });
    const menu = h('div', { class: 'menu' }, PROMPTS.map(([k, label, ins]) => h('button', { type: 'button', 'data-prompt': k, text: label, onclick: () => { menu.classList.remove('open'); draft(ta, ins, bar); } })),
      custom, h('button', { type: 'button', 'data-prompt': 'custom', text: 'Go', onclick: () => { const v = custom.value.trim(); if (!v) return custom.focus(); menu.classList.remove('open'); draft(ta, v, bar); } }));
    custom.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); menu.querySelector('[data-prompt="custom"]').click(); } });
    const bar = h('div', { class: 'bar', role: 'toolbar', 'aria-label': 'Refine with AI' },
      h('button', { type: 'button', 'data-act': 'refine', text: '✦ Refine with AI ▾', title: 'Rewrite this answer with your local AI', onclick: () => menu.classList.toggle('open') }),
      h('button', { type: 'button', class: 'g', 'data-act': 'regen', text: '↻ Regenerate', title: 'Write a new version', onclick: () => draft(ta, (ta.value || '').trim() ? 'Write a different version with a fresh angle. Keep it accurate.' : '', bar) }),
      h('button', { type: 'button', class: 'g', 'data-act': 'up', text: '👍', title: 'Good answer: write more like this', onclick: e => vote(ta, 'up', bar, e.currentTarget) }),
      h('button', { type: 'button', class: 'g', 'data-act': 'down', text: '👎', title: 'Not good: avoid this style', onclick: e => vote(ta, 'down', bar, e.currentTarget) }),
      h('button', { type: 'button', class: 'g', 'data-act': 'undo', hidden: true, text: '↶ Undo', onclick: async () => { const f = fieldFor(ta) || { el: ta, kind: 'textarea' }; await C().fill(f, ta.__jaaUndo || ''); bar.querySelector('[data-act="undo"]').hidden = true; bar.querySelector('.st').textContent = 'Restored your previous text.'; } }),
      h('span', { class: 'st' }), menu);
    // keep the site's keyboard handlers out of our toolbar
    ['keydown', 'keyup', 'keypress', 'input'].forEach(ev => bar.addEventListener(ev, e => e.stopPropagation()));
    root.append(style, bar);
    ta.insertAdjacentElement('afterend', host);
    ta.__jaaRefine = host;
  }
  let timer = 0;
  async function sweep() {
    timer = 0;
    if (!(await isOn())) return;
    if (JAA.frameHasForm && !JAA.frameHasForm()) return;
    document.querySelectorAll('textarea').forEach(ta => { if (eligible(ta)) attach(ta); });
  }
  const schedule = () => { if (!timer) timer = setTimeout(sweep, 600); };
  JAA.refine = { sweep, schedule, PROMPTS };
  if (window.__JAA_INJECTED_BY_POPUP__) return;
  const a = JAA.sites.detect(location);
  if (a.generic || a.stub) return;
  setTimeout(sweep, 1500);
  try { new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true }); } catch (_) { /* ignore */ }
  chrome.storage.onChanged.addListener(ch => { if (ch.settings) { enabled = null; schedule(); } });
})();
