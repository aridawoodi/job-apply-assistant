/* First-run setup: Ollama install check (no terminal), model download with progress,
 * resume import, a few questions, then a practice application. */
(function () {
  'use strict';
  const { h, send, task, os, fmtBytes } = JAA.page;
  const $ = s => document.querySelector(s);
  const STEPS = [['welcome', 'Welcome'], ['ollama', 'Ollama'], ['model', 'AI model'], ['resume', 'Resume'], ['questions', 'Questions'], ['ready', 'Ready']];
  const OS = os();
  const OS_NAME = { mac: 'Mac', win: 'Windows', linux: 'Linux', other: 'your computer' }[OS];
  let cur = 0, sys = { ramGB: 0, recommended: 'qwen2.5:3b', models: {} }, status = null;
  $('#ver').textContent = 'v' + chrome.runtime.getManifest().version;

  function renderSteps() {
    $('#steps').innerHTML = '';
    STEPS.forEach(([id, label], i) => $('#steps').appendChild(h('span', { class: i === cur ? 'on' : i < cur ? 'done' : '' }, (i < cur ? '✓ ' : '') + label)));
    document.querySelectorAll('.step').forEach(s => s.classList.toggle('on', s.dataset.step === STEPS[cur][0]));
    chrome.storage.local.set({ onboarding: { step: STEPS[cur][0], done: cur === STEPS.length - 1, at: Date.now() } });
    if (location.hash.slice(1) !== STEPS[cur][0]) history.replaceState(null, '', '#' + STEPS[cur][0]);
    onEnter(STEPS[cur][0]);
    window.scrollTo(0, 0);
  }
  const go = i => { cur = Math.max(0, Math.min(STEPS.length - 1, i)); renderSteps(); };
  document.querySelectorAll('[data-next]').forEach(b => b.addEventListener('click', () => go(cur + 1)));
  document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => go(cur - 1)));

  /* ---------- step: welcome ---------- */
  $('#osName').textContent = OS_NAME;
  send({ type: 'system:info' }).then(r => { if (r) { sys = r; if (r.ramGB) $('#ramTxt').textContent = ` with ${r.ramGB} GB of memory`; } });

  /* ---------- step: Ollama ---------- */
  const DL = {
    mac: { url: 'https://ollama.com/download/Ollama.dmg', label: '⬇ Download Ollama for Mac', note: 'Free, from ollama.com (the official site)' },
    win: { url: 'https://ollama.com/download/OllamaSetup.exe', label: '⬇ Download Ollama for Windows', note: 'Free, from ollama.com (the official site)' },
    linux: { url: 'https://ollama.com/download/linux', label: 'Get Ollama for Linux', note: 'Linux installs Ollama with one command on that page.' },
    other: { url: 'https://ollama.com/download', label: '⬇ Download Ollama', note: '' }
  }[OS];
  $('#dlBtn').href = DL.url; $('#dlBtn').textContent = DL.label; $('#dlNote').textContent = DL.note;
  const ILLUS = {
    mac: [
      ['1. Download', svgDownload('Ollama.dmg')],
      ['2. Open it and drag the llama to Applications, then open Ollama from Applications', svgDrag()],
      ['3. A small llama appears in the menu bar (top right). That\'s it!', svgMenubar()]
    ],
    win: [
      ['1. Download', svgDownload('OllamaSetup.exe')],
      ['2. Open the file and click Install', svgInstaller()],
      ['3. A small llama appears in the taskbar tray (bottom right). That\'s it!', svgTray()]
    ]
  }[OS] || [['1. Download Ollama', svgDownload('Ollama')], ['2. Install and open it', svgInstaller()], ['3. Leave it running', svgTray()]];
  ILLUS.forEach(([t, svg]) => { const d = h('div'); d.innerHTML = svg; d.appendChild(h('div', {}, t)); $('#illus').appendChild(d); });
  // one-time manual fallback (only if the automatic Origin fix can't work on this Chrome)
  $('#manualFix').innerHTML = OS === 'win'
    ? '<ol><li>Press the Windows key and type <b>environment variables</b>, then open <b>Edit environment variables for your account</b>.</li><li>Click <b>New…</b>. Name: <code>OLLAMA_ORIGINS</code> · Value: <code>chrome-extension://*</code> · OK, OK.</li><li>Right-click the llama in the taskbar tray → <b>Quit Ollama</b>, then start Ollama again from the Start menu.</li></ol>'
    : '<ol><li>Open the <b>Terminal</b> app (press ⌘ Space, type Terminal).</li><li>Paste this line and press Return: <code>launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"</code></li><li>Click the llama in the menu bar → <b>Quit Ollama</b>, then open Ollama again.</li></ol>';
  $('#fixOrigin').addEventListener('click', async () => { $('#fixOut').textContent = 'Applying…'; const r = await send({ type: 'ollama:fixOrigin' }); $('#fixOut').textContent = r && r.ok ? 'Done, checking again…' : 'Could not apply: ' + (r && r.error); poll(true); });

  let pollTimer = null;
  async function poll(once) {
    clearTimeout(pollTimer);
    status = await send({ type: 'ollama:status' });
    const box = $('#ollamaStatus');
    const dot = box.querySelector('.dot'), txt = box.querySelector('.txt');
    if (!status || !status.reachable) {
      dot.className = 'dot wait'; txt.textContent = 'Waiting for Ollama… Install it with the button below, then open it.';
      $('#installBox').classList.remove('hidden'); $('#originBox').classList.add('hidden'); $('#ollamaNext').disabled = true;
    } else if (status.originOk === false) {
      dot.className = 'dot bad'; txt.textContent = 'Ollama is running, but it refused the connection.';
      $('#installBox').classList.add('hidden'); $('#originBox').classList.remove('hidden'); $('#ollamaNext').disabled = true;
    } else {
      dot.className = 'dot ok'; txt.textContent = `Ollama is running${status.version ? ' (version ' + status.version + ')' : ''} and connected. ✓`;
      $('#installBox').classList.add('hidden'); $('#originBox').classList.add('hidden'); $('#ollamaNext').disabled = false;
      return;
    }
    if (!once && STEPS[cur][0] === 'ollama') pollTimer = setTimeout(poll, 2000);
  }

  /* ---------- step: model ---------- */
  let chosen = null, pulling = null;
  async function renderModels() {
    status = await send({ type: 'ollama:status' }) || status;
    const have = new Set(((status && status.models) || []).map(m => m.name));
    const rec = sys.recommended || 'qwen2.5:3b';
    $('#ramAdvice').textContent = sys.ramGB
      ? `Your computer has ${sys.ramGB} GB of memory. ${rec === 'qwen2.5:3b' ? 'A small, fast model is the best fit (bigger ones would be slow).' : 'You have room for a bigger model that writes better answers.'}`
      : 'A small, fast model works on almost any computer.';
    const cards = $('#modelCards'); cards.innerHTML = '';
    chosen = chosen || rec;
    const list = Object.entries(sys.models || { 'qwen2.5:3b': { label: 'Qwen 2.5 3B (fast)', sizeGB: 1.9 } });
    for (const [name, m] of list) {
      const installed = have.has(name);
      const c = h('div', { class: 'mcard' + (chosen === name ? ' sel' : ''), tabindex: '0', role: 'radio', 'aria-checked': String(chosen === name) },
        name === rec ? h('span', { class: 'pill ok rec' }, 'Recommended') : null,
        h('h3', {}, m.label), h('div', { class: 'muted small' }, `${name} · ${m.sizeGB} GB download${m.minRam ? ' · needs 16 GB memory' : ''}`),
        h('div', { style: 'margin-top:6px' }, installed ? h('span', { class: 'pill ok' }, '✓ Already downloaded') : h('span', { class: 'pill' }, 'Not downloaded yet')));
      c.addEventListener('click', () => { chosen = name; renderModels(); });
      cards.appendChild(c);
    }
    const others = Array.from(have).filter(n => !sys.models || !sys.models[n]);
    if (others.length) {
      const sel = h('select', {}, h('option', { value: '' }, 'Or use a model you already have…'), others.map(n => h('option', { value: n }, n)));
      sel.addEventListener('change', () => { if (sel.value) { chosen = sel.value; useModel(); } });
      cards.appendChild(h('div', { class: 'mcard' }, h('h3', {}, 'Other installed models'), sel));
    }
    const installed = have.has(chosen);
    $('#modelMsg').innerHTML = '';
    const btn = h('button', { class: 'primary big', type: 'button' }, installed ? '✓ Use ' + chosen : '⬇ Download ' + chosen);
    btn.addEventListener('click', () => (installed ? useModel() : pull(chosen)));
    $('#modelMsg').appendChild(btn);
    const { settings } = await JAA.loadAll();
    $('#modelNext').disabled = !have.has(settings.model);
    if (have.has(settings.model)) $('#modelMsg').appendChild(h('span', { class: 'ok', style: 'margin-left:10px' }, `Using ${settings.model} ✓`));
  }
  async function useModel() {
    const st = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: Object.assign({}, st.settings || {}, { model: chosen }) });
    send({ type: 'ollama:warm', force: true });
    renderModels();
  }
  function pull(name) {
    $('#pullBox').classList.remove('hidden');
    $('#pullTitle').textContent = 'Downloading ' + name + '…';
    const t0 = Date.now();
    pulling = task({ mode: 'pull', model: name }, m => {
      if (m.type !== 'progress') return;
      $('#pullBar').style.width = m.pct + '%';
      $('#pullPct').textContent = m.pct + '%';
      const secs = (Date.now() - t0) / 1000, rate = m.completed / Math.max(1, secs);
      const left = rate > 0 && m.total ? Math.round((m.total - m.completed) / rate) : 0;
      $('#pullTxt').textContent = m.total ? `${fmtBytes(m.completed)} of ${fmtBytes(m.total)}${left > 3 ? ' · about ' + (left > 90 ? Math.round(left / 60) + ' min' : left + ' s') + ' left' : ''}` : (m.status || 'Starting…');
    });
    pulling.then(async () => {
      $('#pullBar').style.width = '100%'; $('#pullPct').textContent = '100%'; $('#pullTxt').textContent = 'Downloaded ✓';
      await useModel();
    }).catch(e => { $('#pullTxt').textContent = e.message; $('#pullTxt').className = 'bad small'; }).finally(() => { pulling = null; });
  }
  $('#pullCancel').addEventListener('click', () => { if (pulling) pulling.cancel(); });

  /* ---------- step: resume ---------- */
  let importerMounted = false;
  function mountImporter() {
    if (importerMounted) return; importerMounted = true;
    JAA.importer.mount($('#importer'), { useAI: true, onSaved: () => { $('#resumeNext').disabled = false; } });
    chrome.storage.local.get('resume').then(r => { if (r.resume) { $('#resumeNext').disabled = false; $('#importer').prepend(h('p', { class: 'ok' }, `Current master resume: ${r.resume.name}. Upload a new one to replace it, or continue.`)); } });
  }
  $('#skipResume').addEventListener('click', () => go(cur + 1));

  /* ---------- step: questions ---------- */
  const DECLINE = 'Decline to self-identify';
  const QUESTIONS = [
    { k: 'phone', q: 'What phone number should applications use?', text: true, onlyIfEmpty: true },
    { k: 'location', q: 'Where do you live (city, state / country)?', text: true, onlyIfEmpty: true },
    { k: 'workAuthorizedUS', q: 'Are you legally authorized to work in the United States?', chips: ['Yes', 'No'] },
    { k: 'needsSponsorship', q: 'Will you now or in the future need visa sponsorship to work?', chips: ['No', 'Yes'] },
    { k: 'over18', q: 'Are you 18 or older?', chips: ['Yes', 'No'] },
    { k: 'availability', q: 'When could you start a new job?', chips: ['Immediately', '2 weeks notice', '1 month notice'], text: true },
    { k: 'willingToRelocate', q: 'Are you open to relocating?', chips: ['Yes', 'No', 'Depends on the role'] },
    { k: 'salaryExpectation', q: 'What salary are you looking for? (Only typed into forms that ask. It is never sent to the AI.)', text: true, placeholder: 'e.g. $120,000' },
    { intro: 'The next questions are optional US equal-opportunity questions (voluntary self-identification). They are only used to fill those optional form sections and are never sent to the AI. "Decline" is always fine.' },
    { k: 'eeo.gender', q: 'Gender', chips: ['Male', 'Female', 'Non-binary', DECLINE] },
    { k: 'eeo.hispanicLatino', q: 'Are you Hispanic or Latino?', chips: ['No', 'Yes', DECLINE] },
    { k: 'eeo.ethnicity', q: 'Race / ethnicity', chips: ['White', 'Black or African American', 'Asian', 'Hispanic or Latino', 'American Indian or Alaska Native', 'Native Hawaiian or Other Pacific Islander', 'Middle Eastern or North African', 'Two or more races', DECLINE] },
    { k: 'eeo.veteran', q: 'Veteran status', chips: ['I am not a protected veteran', 'I identify as one or more of the classifications of protected veteran', DECLINE] },
    { k: 'eeo.disability', q: 'Disability status', chips: ['No, I do not have a disability', 'Yes, I have a disability', DECLINE] }
  ];
  let qaStarted = false;
  async function startQA() {
    if (qaStarted) return; qaStarted = true;
    const box = $('#qa');
    const bot = t => box.appendChild(h('div', { class: 'msg bot' }, t));
    const me = t => box.appendChild(h('div', { class: 'msg me' }, t));
    const get = (o, k) => k.split('.').reduce((a, p) => (a ? a[p] : undefined), o);
    const setp = (o, k, v) => { const ps = k.split('.'); let a = o; ps.slice(0, -1).forEach(p => { a[p] = a[p] || {}; a = a[p]; }); a[ps[ps.length - 1]] = v; };
    let i = 0;
    const next = async () => {
      const { profile } = await JAA.loadAll();
      while (i < QUESTIONS.length && QUESTIONS[i].onlyIfEmpty && get(profile, QUESTIONS[i].k)) i++;
      if (i >= QUESTIONS.length) { bot('All done. You can change any of these later in Settings → Profile. ✓'); return; }
      const Q = QUESTIONS[i++];
      if (Q.intro) { bot(Q.intro); return next(); }
      const existing = get(profile, Q.k);
      const card = h('div', { class: 'msg bot' }, h('div', {}, Q.q + (existing ? ` (now: ${existing})` : '')));
      const chips = h('div', { class: 'chips' });
      const answer = async v => {
        chips.querySelectorAll('button,input').forEach(b => { b.disabled = true; });
        me(v === null ? 'Skip' : v);
        if (v !== null) { const st = await chrome.storage.local.get('profile'); const p = JAA.merge(JAA.EMPTY_PROFILE, st.profile); setp(p, Q.k, v); await chrome.storage.local.set({ profile: p }); }
        next(); box.lastElementChild.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      };
      (Q.chips || []).forEach(c => chips.appendChild(h('button', { class: 'chip', type: 'button', onclick: () => answer(c) }, c)));
      if (Q.text) {
        const inp = h('input', { type: 'text', placeholder: Q.placeholder || 'Type your answer' });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter' && inp.value.trim()) answer(inp.value.trim()); });
        chips.appendChild(h('div', { class: 'qrow', style: 'width:100%' }, inp, h('button', { class: 'primary', type: 'button', onclick: () => inp.value.trim() && answer(inp.value.trim()) }, 'Save')));
      }
      chips.appendChild(h('button', { class: 'chip skip', type: 'button', onclick: () => answer(null) }, existing ? 'Keep' : 'Skip'));
      card.appendChild(chips);
      box.appendChild(card);
    };
    bot('Hi! Just tap an answer. Your answers are saved to your profile on this computer.');
    next();
  }

  /* ---------- step: ready ---------- */
  async function renderReady() {
    const { profile, settings, resume } = await JAA.loadAll();
    const st = await send({ type: 'ollama:status' });
    const line = (ok, t) => h('div', { class: 'status', style: 'margin:6px 0' }, h('span', { class: 'dot ' + (ok ? 'ok' : 'bad') }), h('span', {}, t));
    const s = $('#summary'); s.innerHTML = '';
    s.append(line(st && st.reachable && st.originOk !== false, st && st.reachable ? 'Ollama is running and connected' : 'Ollama is not running: open the Ollama app'),
      line(st && st.hasModel, `AI model: ${settings.model}${st && st.hasModel ? '' : ' (not downloaded yet: go back to step 2)'}`),
      line(!!resume, resume ? `Master resume: ${resume.name}` : 'No resume yet (you can add one in Settings → Resume)'),
      line(!!profile.firstName, profile.firstName ? `Profile: ${profile.firstName} ${profile.lastName || ''}${profile.email ? ' · ' + profile.email : ''}` : 'Profile is empty (Settings → Profile)'));
    chrome.storage.local.set({ onboarding: { step: 'ready', done: true, at: Date.now() } });
  }

  function onEnter(step) {
    if (step === 'ollama') poll();
    if (step === 'model') renderModels();
    if (step === 'resume') mountImporter();
    if (step === 'questions') startQA();
    if (step === 'ready') renderReady();
  }

  /* ---------- illustrations (inline SVG, no external files) ---------- */
  function svgDownload(name) { return `<svg viewBox="0 0 150 100" aria-hidden="true"><rect x="20" y="10" width="110" height="80" rx="10" fill="#eef2ff" stroke="#6366f1" stroke-width="2"/><path d="M75 25v34m-14-14 14 14 14-14" stroke="#4f46e5" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="45" y="66" width="60" height="6" rx="3" fill="#4f46e5"/><text x="75" y="86" font-size="9" text-anchor="middle" fill="#3730a3" font-family="sans-serif">${name}</text></svg>`; }
  function svgDrag() { return '<svg viewBox="0 0 150 100" aria-hidden="true"><rect x="8" y="12" width="134" height="76" rx="10" fill="#fff" stroke="#94a3b8" stroke-width="2"/><circle cx="42" cy="50" r="18" fill="#f1f5f9" stroke="#334155" stroke-width="2"/><text x="42" y="56" font-size="18" text-anchor="middle">🦙</text><path d="M66 50h26" stroke="#4f46e5" stroke-width="4" stroke-linecap="round" marker-end="url(#a)"/><defs><marker id="a" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0 0 8 4 0 8z" fill="#4f46e5"/></marker></defs><rect x="98" y="32" width="34" height="36" rx="6" fill="#dbeafe" stroke="#3b82f6" stroke-width="2"/><text x="115" y="80" font-size="8" text-anchor="middle" fill="#1e3a8a" font-family="sans-serif">Applications</text></svg>'; }
  function svgMenubar() { return '<svg viewBox="0 0 150 100" aria-hidden="true"><rect x="8" y="14" width="134" height="18" rx="4" fill="#1e293b"/><text x="120" y="28" font-size="12" text-anchor="middle">🦙</text><circle cx="120" cy="23" r="10" fill="none" stroke="#facc15" stroke-width="2"/><text x="30" y="27" font-size="9" fill="#e2e8f0" font-family="sans-serif">  File  Edit</text><rect x="8" y="34" width="134" height="56" rx="4" fill="#f8fafc" stroke="#cbd5e1"/></svg>'; }
  function svgInstaller() { return '<svg viewBox="0 0 150 100" aria-hidden="true"><rect x="18" y="10" width="114" height="80" rx="8" fill="#fff" stroke="#94a3b8" stroke-width="2"/><rect x="18" y="10" width="114" height="16" rx="8" fill="#e2e8f0"/><text x="75" y="52" font-size="20" text-anchor="middle">🦙</text><rect x="48" y="64" width="54" height="16" rx="5" fill="#4f46e5"/><text x="75" y="76" font-size="9" fill="#fff" text-anchor="middle" font-family="sans-serif">Install</text></svg>'; }
  function svgTray() { return '<svg viewBox="0 0 150 100" aria-hidden="true"><rect x="8" y="10" width="134" height="62" rx="4" fill="#f8fafc" stroke="#cbd5e1"/><rect x="8" y="74" width="134" height="18" rx="3" fill="#1e293b"/><text x="112" y="88" font-size="12" text-anchor="middle">🦙</text><circle cx="112" cy="83" r="10" fill="none" stroke="#facc15" stroke-width="2"/><text x="132" y="87" font-size="7" fill="#e2e8f0" font-family="sans-serif">9:41</text></svg>'; }

  // start: deep link (#resume etc.) or where the user left off
  const startAt = STEPS.findIndex(s => s[0] === location.hash.slice(1));
  if (startAt >= 0) go(startAt);
  else chrome.storage.local.get('onboarding').then(r => { const o = r.onboarding; const i = o && !o.done ? STEPS.findIndex(s => s[0] === o.step) : -1; go(i > 0 ? i : 0); });
})();
