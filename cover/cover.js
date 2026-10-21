/* Cover letter page: resume + job description + your writing style -> local model -> fact check ->
 * you edit and approve -> fill the text box, or make a PDF/DOCX named "First Last - Company - Job Title - Cover Letter" and attach it. */
(function () {
  'use strict';
  const { h, send, task, abToDataUrl, need } = JAA.page;
  const $ = s => document.querySelector(s);
  $('#ver').textContent = 'v' + chrome.runtime.getManifest().version;
  const jobId = new URLSearchParams(location.search).get('job');
  let job = {}, profile = {}, settings = {}, resumeText = '', entry = null, lastCheck = null, demo = false;

  function allowedExtra() {
    const p = profile;
    return [job.company, job.title, [p.firstName, p.lastName].join(' '), p.location, p.city, p.state,
      (p.workHistory || []).map(j => [j.title, j.company, j.location].join(' ')).join('\n'),
      (p.educationList || []).map(e => [e.school, e.degree, e.field].join(' ')).join('\n'),
      (p.skills || []).join(', '), (p.certifications || []).join(', ')].filter(Boolean);
  }
  async function init() {
    const st = await chrome.storage.local.get(['tailorJobs', 'resume', 'resumeMaster']);
    job = (st.tailorJobs || {})[jobId] || {};
    demo = !!job.demo;
    const all = await JAA.loadAll(); settings = all.settings; profile = all.profile;
    if (demo && job.demoProfile) profile = job.demoProfile;
    $('#jobTitle').textContent = job.title ? job.title + (job.company ? ' · ' + job.company : '') : 'Cover letter';
    $('#jobMeta').textContent = !job.url ? 'Paste the job description below.' : /^chrome-extension:/.test(job.url) ? 'Practice application (fake job)' : new URL(job.url).hostname + (job.site ? ' · ' + job.site : '');
    const f = job.field;
    $('#fieldInfo').innerHTML = '';
    $('#fieldInfo').append(f ? h('span', { class: 'field', text: (f.kind === 'file' ? '📎 Cover letter upload' : '✏️ Cover letter text box') + (f.required ? ' · required' : ' · optional') }) : h('span', { class: 'muted small', text: 'No cover letter field was found on the application: you can still copy or download the letter.' }));
    $('#jd').value = job.description || '';
    $('#jdLen').textContent = String($('#jd').value.length);
    $('#jd').addEventListener('input', () => { $('#jdLen').textContent = String($('#jd').value.length); });
    if (!job.description) $('#jobCard details').open = true;
    resumeText = demo && job.demoResume ? job.demoResume : (st.resumeMaster && st.resumeMaster.blocks ? st.resumeMaster.blocks.map(b => b.text).join('\n') : '') || JAA.match.lib.resumeTextOf(profile, null);
    if (!resumeText || resumeText.trim().length < 60) {
      $('#resumeInfo').innerHTML = '';
      $('#resumeInfo').append('No resume yet. ', h('a', { href: '../options/options.html#resume', target: '_blank' }, 'Add your resume'), ', then reload this page.');
      $('#write').disabled = true;
    } else $('#resumeInfo').textContent = `Using your resume${st.resume && !demo ? ' (' + st.resume.name + ')' : ''}: ${resumeText.split('\n').filter(Boolean).length} lines.`;
    const hasStyle = (profile.writingSamples || '').trim() || (profile.toneNotes || '').trim();
    $('#styleInfo').textContent = hasStyle ? '✓ Uses your writing samples and tone notes for the voice.' : 'Tip: add a writing sample in Options → Writing style so it sounds like you.';
    const fmt = settings.preferredResumeFormat; if (fmt === 'docx' || fmt === 'pdf') $('#format').value = fmt;
    $('#fillText').disabled = !(f && f.kind !== 'file') || !job.tabId;
    const { coverLetters = [] } = await chrome.storage.local.get('coverLetters');
    const prev = coverLetters.filter(c => c.jobKey && c.jobKey === job.key).sort((a, b) => b.createdAt - a.createdAt)[0];
    if (prev && !demo) { entry = prev; showDraft(prev.text); $('#status').textContent = 'Your saved letter for this job is below.'; showUse(); }
  }
  function name() { return [profile.firstName, profile.lastName].filter(Boolean).join(' '); }
  function renderChecks() {
    const text = $('#letter').value;
    lastCheck = JAA.cover.check(text, resumeText, $('#jd').value, allowedExtra());
    const box = $('#checks'); box.innerHTML = '';
    $('#words').textContent = lastCheck.words + ' words';
    if (lastCheck.ok && !lastCheck.warnings.length) box.appendChild(h('div', { class: 'chk ok' }, h('span', { class: 'pill ok' }, '✓'), 'Fact check passed: every name, tool and number is from your resume.'));
    lastCheck.blocked.forEach(m => box.appendChild(h('div', { class: 'chk' }, h('span', { class: 'pill bad' }, 'blocked'), h('span', { class: 'bad' }, m + '. Edit or remove it, then "Check again".'))));
    lastCheck.warnings.forEach(m => box.appendChild(h('div', { class: 'chk' }, h('span', { class: 'pill' }, 'check'), h('span', { class: 'warn' }, m))));
    $('#approve').disabled = !lastCheck.ok || lastCheck.words < 40;
    if (lastCheck.words < 40) box.appendChild(h('div', { class: 'chk muted' }, 'Too short to approve (under 40 words).'));
    return lastCheck;
  }
  function showDraft(text) {
    $('#letter').value = text;
    $('#draftCard').classList.remove('hidden');
    renderChecks();
  }
  async function write(previous) {
    $('#write').disabled = true; $('#regen').disabled = true;
    $('#status').textContent = 'Your local AI is writing (this can take a minute)…';
    const description = $('#jd').value.trim();
    if (description.length < 80) { $('#status').textContent = 'Please paste the job description first (open the box above).'; $('#jobCard details').open = true; $('#write').disabled = false; $('#regen').disabled = false; return; }
    try {
      const r = await task({ mode: 'cover', job: { title: job.title || '', company: job.company || '', description }, resumeText, length: $('#length').value, extra: $('#extra').value.trim(), previous: previous || '' },
        m => { if (m.type === 'progress' && m.chars) $('#status').textContent = `Writing… (${m.chars} characters)`; });
      const text = JAA.cover.toText(r.data, name());
      if (!text || text.length < 80) throw new Error('The local AI returned an empty letter. Try again.');
      entry = null; $('#useCard').classList.add('hidden');
      showDraft(text);
      $('#status').textContent = lastCheck.ok ? 'Done. Read it, edit anything, then approve.' : 'Done, but the fact check blocked something: see below.';
      $('#draftCard').scrollIntoView({ behavior: 'smooth' });
    } catch (e) { $('#status').textContent = e.message; }
    $('#write').disabled = false; $('#regen').disabled = false;
  }
  $('#write').addEventListener('click', () => write(''));
  $('#regen').addEventListener('click', () => write($('#letter').value));
  $('#recheck').addEventListener('click', renderChecks);
  $('#letter').addEventListener('input', () => { $('#approve').disabled = true; $('#words').textContent = 'edited: press Check again'; });
  $('#approve').addEventListener('click', async () => {
    const c = renderChecks();
    if (!c.ok) return;
    entry = { id: 'c' + Date.now().toString(36), jobKey: job.key || '', company: job.company || '', title: job.title || '', url: job.url || '', createdAt: Date.now(), text: $('#letter').value.trim(), words: c.words, warnings: c.warnings, files: [] };
    if (!demo) await send({ type: 'cover:save', entry });
    showUse();
    $('#useCard').scrollIntoView({ behavior: 'smooth' });
  });
  function showUse() {
    $('#useCard').classList.remove('hidden');
    $('#attach').disabled = !(job.field && job.field.kind === 'file' && job.tabId && entry && entry.files.length);
    if (job.field && job.field.kind === 'file' && !(entry && entry.files.length)) $('#attachOut').textContent = 'Create the file first.';
    renderFiles();
  }
  function renderFiles() {
    $('#files').innerHTML = '';
    (entry && entry.files || []).forEach(f => $('#files').appendChild(h('a', { class: 'btn secondary', href: f.dataUrl, download: f.name }, (f.mime === 'application/pdf' ? '⬇ PDF · ' : '⬇ Word · ') + f.name)));
  }
  $('#makeFiles').addEventListener('click', async () => {
    if (!entry) return;
    $('#makeFiles').disabled = true;
    try {
      const fmt = $('#format').value;
      const base = JAA.cover.fileBase(profile, job.company, job.title);
      const blocks = { blocks: JAA.cover.blocks(entry.text, profile) };
      const layout = { pageWidthPt: 612, pageHeightPt: 792, bodyPt: 11, title: base, author: name() };
      const files = [];
      if (fmt !== 'pdf') {
        await need('zip'); if (!JAA.docx) await JAA.page.loadScript('../lib/docx.js');
        const ab = await JAA.docx.build(blocks, layout);
        files.push({ name: base + '.docx', mime: JAA.docx.DOCX_MIME, size: ab.byteLength, dataUrl: await abToDataUrl(ab, JAA.docx.DOCX_MIME) });
      }
      if (fmt !== 'docx') {
        await need('jspdf'); if (!JAA.pdfout) await JAA.page.loadScript('../lib/pdfout.js');
        const pdf = JAA.pdfout.build(blocks, layout);
        files.push({ name: base + '.pdf', mime: 'application/pdf', size: pdf.arrayBuffer.byteLength, dataUrl: await abToDataUrl(pdf.arrayBuffer, 'application/pdf'), pages: pdf.pages });
      }
      entry.files = files;
      if (!demo) await send({ type: 'cover:save', entry });
      renderFiles();
      $('#attach').disabled = !(job.field && job.field.kind === 'file' && job.tabId);
      $('#attachOut').textContent = job.field && job.field.kind === 'file' ? '' : 'This application has no cover letter upload: download the file or paste the text.';
    } catch (e) { $('#attachOut').textContent = 'Could not create the file: ' + e.message; }
    $('#makeFiles').disabled = false;
  });
  async function deliver(mode, out) {
    $(out).textContent = 'Working…';
    const r = demo ? await chrome.runtime.sendMessage({ type: 'cover:fill', practice: true, entryId: entry.id, mode, demoEntry: entry }) : await send({ type: 'cover:fill', jobId, entryId: entry.id, mode });
    $(out).textContent = r && r.ok ? (mode === 'file' ? '✓ Attached ' + r.name + '. Check it on the application.' : '✓ Added to the cover letter box. Check it on the application.') : (r && r.error) || 'Could not reach the application.';
    $(out).className = r && r.ok ? 'ok' : 'bad';
  }
  $('#fillText').addEventListener('click', () => entry && deliver('text', '#fillOut'));
  $('#attach').addEventListener('click', () => entry && deliver('file', '#attachOut'));
  $('#copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#letter').value); $('#fillOut').textContent = 'Copied ✓'; } catch (_) { $('#letter').select(); document.execCommand('copy'); $('#fillOut').textContent = 'Copied ✓'; } });
  init();
})();
