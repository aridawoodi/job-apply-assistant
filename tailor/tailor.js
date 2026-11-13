/* Tailor page: master resume + job description -> local-model suggestions -> validated diff ->
 * you accept per change -> DOCX (edited in place) and/or PDF -> saved library + attach. */
(function () {
  'use strict';
  const { h, send, task, abToDataUrl, dataUrlToAb, download } = JAA.page;
  const $ = s => document.querySelector(s);
  $('#ver').textContent = 'v' + chrome.runtime.getManifest().version;
  const params = new URLSearchParams(location.search);
  const jobId = params.get('job');
  let job = {}, master = null, resume = null, settings = null, profile = null, changes = [], lastEntry = null;

  function setStep(n) {
    document.querySelectorAll('.stepper .st').forEach(el => {
      const s = +el.dataset.step;
      el.classList.toggle('on', s === n);
      el.classList.toggle('done', s < n);
    });
  }
  function resumePlain() {
    return (master && master.blocks ? master.blocks.map(b => b.text).join('\n') : '') || JAA.match.lib.resumeTextOf(profile || {}, null);
  }
  function renderDiff() {
    const jd = ($('#jd').value || '').trim();
    const rt = resumePlain();
    const body = $('#gapBody');
    body.innerHTML = '';
    if (jd.length < 80 || !rt || rt.length < 40) {
      body.appendChild(h('tr', {}, h('td', { colSpan: 3, class: 'muted' }, 'Paste a job description and add a resume to compare.')));
      $('#gaugeVal').textContent = '—';
      $('#bandPill').textContent = '—';
      $('#bandPill').className = 'band warn';
      $('#diffHeadline').textContent = 'See how your resume compares';
      $('#diffAlert').innerHTML = '';
      return null;
    }
    const m = JAA.match.lib.analyze(jd, rt, { company: job.company || '', title: job.title || '' });
    const band = m.band;
    const score10 = m.score10 != null ? m.score10 : Math.round(m.score / 10 * 10) / 10;
    $('#gaugeVal').textContent = String(score10);
    const gauge = $('#gauge');
    gauge.style.setProperty('--p', String(m.score));
    gauge.style.setProperty('--c', m.score >= 70 ? '#16a34a' : m.score >= 45 ? '#d97706' : '#dc2626');
    $('#bandPill').textContent = band.label;
    $('#bandPill').className = 'band ' + band.tone;
    $('#diffHeadline').textContent = band.key === 'strong'
      ? 'Your resume is a strong match for this job'
      : band.key === 'decent'
        ? 'Your resume is a decent match for this job'
        : 'Your resume is a low match for this job';
    $('#diffAlert').innerHTML = '';
    if (band.key === 'low') {
      $('#diffAlert').appendChild(h('div', { class: 'alert' }, 'Scores under 4.5/10 often struggle with ATS keyword filters — we\'ll help you align wording using only facts already in your resume.'));
    } else if (band.key === 'decent') {
      $('#diffAlert').appendChild(h('div', { class: 'alert warn' }, 'A bit of tailoring can lift keyword coverage before you apply.'));
    }
    const icon = s => s === 'ok' ? '✓' : s === 'bad' ? '✕' : '!';
    (m.gaps || []).forEach(row => {
      const tr = h('tr', {});
      tr.appendChild(h('td', { class: 'sticon ' + row.status }, icon(row.status)));
      if (row.id === 'keywords') {
        tr.appendChild(h('td', {}, h('div', {}, h('b', {}, row.label)),
          h('div', { class: 'kw' }, (row.missing || []).slice(0, 10).map(k => h('span', { class: 'miss' }, k)))));
        tr.appendChild(h('td', {}, h('div', { class: 'muted small' }, 'In your resume'),
          h('div', { class: 'kw' }, (row.matched || []).slice(0, 10).map(k => h('span', { class: 'hit' }, k)))));
      } else {
        tr.appendChild(h('td', {}, h('div', {}, h('b', {}, row.label)), h('div', { class: 'muted small' }, row.job || '')));
        tr.appendChild(h('td', {}, h('div', { class: 'muted small' }, row.resume || '')));
      }
      body.appendChild(tr);
    });
    return m;
  }
  async function init() {
    setStep(1);
    const st = await chrome.storage.local.get(['tailorJobs', 'resume', 'resumeMaster']);
    job = (st.tailorJobs || {})[jobId] || {};
    const all = await JAA.loadAll(); settings = all.settings; profile = all.profile;
    $('#jobTitle').textContent = job.title ? job.title + (job.company ? ' · ' + job.company : '') : 'Tailor my resume';
    $('#jobMeta').textContent = !job.url ? 'Paste the job description below.' : /^chrome-extension:/.test(job.url) ? 'Practice application (fake job)' : new URL(job.url).hostname + (job.site ? ' · ' + job.site : '');
    $('#jd').value = job.description || '';
    $('#jdLen').textContent = String($('#jd').value.length);
    $('#jd').addEventListener('input', () => { $('#jdLen').textContent = String($('#jd').value.length); renderDiff(); });
    if (!job.description) $('#jobCard details').open = true;
    $('#format').value = settings.preferredResumeFormat || 'both';
    const rules = settings.tailoringRules || [];
    $('#rules').innerHTML = '';
    if (!rules.length) $('#rules').appendChild(h('li', {}, 'None yet. Add rules in Settings → Tailoring (e.g. "Keep to 2 pages").'));
    rules.forEach(r => $('#rules').appendChild(h('li', {}, r)));
    resume = st.resume || null;
    if (!resume) { $('#masterInfo').innerHTML = ''; $('#masterInfo').append('No resume yet. ', h('a', { href: '../options/options.html#resume', target: '_blank' }, 'Add your resume'), ' (PDF or Word), then reload this page.'); $('#suggest').disabled = true; $('#goAlign').disabled = true; renderDiff(); return; }
    master = st.resumeMaster && st.resumeMaster.name === resume.name ? st.resumeMaster : null;
    if (!master) {
      // resumes saved before v0.4: parse once now
      try {
        const p = await JAA.resume.parseFile({ name: resume.name, type: resume.type, data: await dataUrlToAb(resume.dataUrl) });
        master = { kind: p.kind, name: resume.name, blocks: p.blocks, pages: p.pages || 0, pageWidth: p.pageWidth || 0, pageHeight: p.pageHeight || 0, bodySize: p.bodySize || 0, at: Date.now() };
        await chrome.storage.local.set({ resumeMaster: master });
      } catch (e) { $('#masterInfo').textContent = 'Could not read your resume: ' + e.message; $('#suggest').disabled = true; $('#goAlign').disabled = true; return; }
    }
    const editable = master.blocks.filter(JAA.tailor.EDITABLE).length;
    $('#masterInfo').textContent = `${resume.name} · ${master.kind === 'docx' ? 'Word' : 'PDF'} · ${master.blocks.length} lines, ${editable} can be tailored · scored only on this computer`;
    $('#layoutNote').textContent = master.kind === 'docx'
      ? 'Word: your own file is edited in place, so fonts, spacing and layout stay exactly as you designed them. PDF: made with a clean built-in layout that follows your resume\'s structure (close, but not pixel-identical). For an exact PDF, open the Word file and choose Save as PDF.'
      : 'Your master is a PDF, so both files are rebuilt with a clean layout that follows its structure (sections, dates on the right, bullets). The layout is close to your original, not identical. Upload the Word version as your master to keep your exact design.';
    renderDiff();
  }
  $('#goAlign').addEventListener('click', () => {
    setStep(2);
    $('#masterCard').scrollIntoView({ behavior: 'smooth' });
    $('#suggest').focus();
  });

  /* ---------- suggestions ---------- */
  $('#suggest').addEventListener('click', async () => {
    $('#suggest').disabled = true;
    $('#sugStatus').textContent = 'Your local AI is reading the job and your resume…';
    const extra = $('#extraRule').value.trim();
    const jobIn = { title: job.title || '', company: job.company || '', description: $('#jd').value.trim() };
    if (jobIn.description.length < 80) { $('#sugStatus').textContent = 'Please paste the job description first (open the box above).'; $('#jobCard details').open = true; $('#suggest').disabled = false; return; }
    try {
      const r = await task({ mode: 'tailor', master: { blocks: master.blocks }, job: jobIn, extraRules: extra ? [extra] : [] }, m => { if (m.type === 'progress' && m.chars) $('#sugStatus').textContent = `Writing suggestions… (${m.chars} characters)`; });
      const rules = (settings.tailoringRules || []).concat(extra ? [extra] : []);
      const v = JAA.tailor.validate(r.data, master, rules);
      changes = v.changes;
      renderChanges();
      setStep(2);
      $('#sugStatus').textContent = changes.length ? `${changes.filter(c => c.ok).length} suggestion(s) passed the fact check${changes.some(c => !c.ok) ? `, ${changes.filter(c => !c.ok).length} blocked` : ''}.` : 'No changes suggested: your resume already fits. You can still create files below.';
      $('#changesCard').classList.remove('hidden');
      $('#changesCard').scrollIntoView({ behavior: 'smooth' });
    } catch (e) { $('#sugStatus').textContent = e.message; }
    $('#suggest').disabled = false;
  });

  // Two lines: "Before" with removed words struck through, "After" with new words highlighted.
  function wordDiff(a, b) {
    const A = String(a).split(/(\s+)/), B = String(b).split(/(\s+)/);
    const n = A.length, m = B.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const before = h('div', { class: 'line' }, h('span', { class: 'tag' }, 'Before')), after = h('div', { class: 'line' }, h('span', { class: 'tag' }, 'After'));
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && A[i] === B[j]) { before.appendChild(document.createTextNode(A[i])); after.appendChild(document.createTextNode(B[j])); i++; j++; }
      else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) { after.appendChild(/^\s+$/.test(B[j]) ? document.createTextNode(B[j]) : h('ins', {}, B[j])); j++; }
      else { before.appendChild(/^\s+$/.test(A[i]) ? document.createTextNode(A[i]) : h('del', {}, A[i])); i++; }
    }
    return h('div', { class: 'diff' }, before, after);
  }
  function renderChanges() {
    const box = $('#changes'); box.innerHTML = '';
    if (!changes.length) box.appendChild(h('p', { class: 'muted' }, 'Nothing to change.'));
    for (const c of changes) {
      const cb = h('input', { type: 'checkbox' }); cb.checked = !!c.accepted; cb.disabled = !c.ok;
      cb.addEventListener('change', () => { c.accepted = cb.checked; });
      const title = c.kind === 'reorder' ? 'Reorder bullets · ' + c.header : c.kind === 'reorder-skills' ? 'Reorder skills' : c.section === 'summary' ? 'Summary' : 'Bullet';
      const card = h('div', { class: 'change' + (c.ok ? '' : ' rejected') },
        h('div', { class: 'head' }, cb, h('b', {}, title), c.ok ? h('span', { class: 'pill ok' }, 'fact-checked') : h('span', { class: 'pill bad' }, 'blocked')));
      if (c.kind === 'reorder-skills') {
        card.appendChild(h('div', { class: 'diff' }, h('div', { class: 'line' }, h('span', { class: 'tag' }, 'Before'), c.before), h('div', { class: 'line' }, h('span', { class: 'tag' }, 'After'), h('b', {}, c.after))));
      } else if (c.kind === 'reorder') {
        card.appendChild(h('ol', { class: 'small' }, c.after.map(t => h('li', {}, t.slice(0, 140) + (t.length > 140 ? '…' : '')))));
      } else card.appendChild(wordDiff(c.before, c.after));
      if (c.why) card.appendChild(h('div', { class: 'muted small' }, 'Why: ' + c.why));
      if (c.problems.length) card.appendChild(h('div', { class: c.ok ? 'warn small' : 'bad small' }, (c.ok ? '' : 'Blocked: ') + c.problems.join('; ')));
      box.appendChild(card);
    }
  }
  $('#allOn').addEventListener('click', () => { changes.forEach(c => { c.accepted = c.ok; }); renderChanges(); });
  $('#allOff').addEventListener('click', () => { changes.forEach(c => { c.accepted = false; }); renderChanges(); });

  /* ---------- build files ---------- */
  $('#build').addEventListener('click', async () => {
    $('#build').disabled = true;
    try { await build(); } catch (e) { $('#checks').innerHTML = ''; $('#checks').appendChild(h('p', { class: 'bad' }, 'Could not create the files: ' + e.message)); $('#resultCard').classList.remove('hidden'); }
    $('#build').disabled = false;
  });
  async function build() {
    await JAA.page.need('jspdf');
    const fmt = $('#format').value;
    const tailored = JAA.tailor.apply(master, changes);
    const base = JAA.tailor.fileBase(profile, job.company, job.title);
    const files = [];
    const layout = { pageWidthPt: master.pageWidth || 612, pageHeightPt: master.pageHeight || 792, bodyPt: master.bodySize ? Math.round(master.bodySize * 10) / 10 : 10, title: base, author: [profile.firstName, profile.lastName].filter(Boolean).join(' ') };
    const pdf = JAA.pdfout.build(tailored, layout);
    let pages = pdf.pages, pagesNote = '';
    if (fmt !== 'pdf') {
      let ab;
      if (master.kind === 'docx') {
        const r = await JAA.docx.editInPlace(await dataUrlToAb(resume.dataUrl), master, tailored);
        ab = r.arrayBuffer;
        if (r.report.skipped.length) pagesNote = `${r.report.skipped.length} change(s) could not be placed in the Word file and were left as in your master.`;
        const est = await JAA.docx.estimatePages(await dataUrlToAb(resume.dataUrl), master, tailored);
        if (fmt === 'docx') pages = Math.max(est || 0, pdf.pages);
      } else ab = await JAA.docx.build(tailored, layout);
      files.push({ name: base + '.docx', mime: JAA.docx.DOCX_MIME, size: ab.byteLength, dataUrl: await abToDataUrl(ab, JAA.docx.DOCX_MIME) });
    }
    if (fmt !== 'docx') files.push({ name: base + '.pdf', mime: 'application/pdf', size: pdf.arrayBuffer.byteLength, dataUrl: await abToDataUrl(pdf.arrayBuffer, 'application/pdf'), pages: pdf.pages });
    const rules = (settings.tailoringRules || []).concat($('#extraRule').value.trim() ? [$('#extraRule').value.trim()] : []);
    const checks = JAA.tailor.checkOutput(tailored, rules, pages);
    const entry = { id: 'r' + Date.now().toString(36), jobKey: job.key || '', company: job.company || '', title: job.title || '', url: job.url || '', createdAt: Date.now(), masterName: resume.name, masterKind: master.kind, changes: changes.filter(c => c.accepted).length, files, checks, pages };
    await send({ type: 'tailor:save', entry });
    lastEntry = entry;
    // result
    $('#checks').innerHTML = '';
    $('#checks').appendChild(h('p', {}, `${entry.changes} change(s) applied · ${pages} page${pages > 1 ? 's' : ''}${master.kind === 'docx' && fmt === 'docx' ? ' (estimated)' : ''}`));
    if (pagesNote) $('#checks').appendChild(h('p', { class: 'warn small' }, pagesNote));
    checks.forEach(c => $('#checks').appendChild(h('div', { class: 'row small' }, h('span', { class: 'pill ' + (c.ok === true ? 'ok' : c.ok === false ? 'bad' : '') }, c.ok === true ? '✓' : c.ok === false ? '✗' : 'AI'), h('span', {}, c.rule + ' · '), h('span', { class: 'muted' }, c.detail))));
    $('#files').innerHTML = '';
    files.forEach(f => $('#files').appendChild(h('a', { class: 'btn secondary', href: f.dataUrl, download: f.name }, (f.mime === 'application/pdf' ? '⬇ PDF · ' : '⬇ Word · ') + f.name)));
    $('#attach').disabled = !job.tabId;
    if (!job.tabId) $('#attachOut').textContent = 'Open this from the chat on an application page to attach it there.';
    setStep(3);
    $('#resultCard').classList.remove('hidden');
    $('#resultCard').scrollIntoView({ behavior: 'smooth' });
  }
  $('#attach').addEventListener('click', async () => {
    if (!lastEntry) return;
    $('#attachOut').textContent = 'Attaching…';
    const r = await send({ type: 'tailor:attach', jobId, entryId: lastEntry.id });
    $('#attachOut').textContent = r && r.ok ? '✓ Attached ' + r.name + ' to the application. Check it there.' : (r && r.error) || 'Could not attach.';
    $('#attachOut').className = r && r.ok ? 'ok' : 'bad';
  });
  JAA.tailorPage = { download };
  init();
})();
