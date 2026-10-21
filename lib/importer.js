/* Resume -> profile import UI (used by the setup wizard and Options).
 * 1) parse the PDF/DOCX locally, 2) regex facts (email, phone, links), 3) the local model reads
 * names / jobs / education / skills, 4) everything is checked against the resume text,
 * 5) you confirm or edit each item, 6) it's saved to the profile (and the file becomes your master resume). */
(function (g) {
  'use strict';
  const JAA = g.JAA = g.JAA || {};
  const { h, task, abToDataUrl } = JAA.page;

  const FIELDS = [
    ['firstName', 'First name'], ['lastName', 'Last name'], ['email', 'Email'], ['phone', 'Phone'], ['location', 'Location'],
    ['linkedin', 'LinkedIn'], ['github', 'GitHub'], ['portfolio', 'Website'], ['currentEmployer', 'Current employer'], ['currentTitle', 'Current title'],
    ['yearsExperience', 'Years of experience'], ['summary', 'Summary']
  ];

  function mount(root, opts) {
    opts = opts || {};
    root.innerHTML = '';
    const input = h('input', { type: 'file', accept: '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document', hidden: true });
    const drop = h('div', { class: 'drop', tabindex: '0', role: 'button' },
      h('div', { style: 'font-size:34px' }, '📄'),
      h('div', { style: 'font-weight:700;font-size:16px' }, 'Drop your resume here, or click to choose'),
      h('div', { class: 'muted small' }, 'PDF or Word (.docx). It is read on this computer; nothing is uploaded anywhere.'));
    const status = h('div', { class: 'status hidden' }, h('span', { class: 'dot wait' }), h('span', { class: 'txt' }, ''));
    const out = h('div');
    root.append(input, drop, h('div', { style: 'height:10px' }), status, out);
    const say = (t, kind) => { status.classList.remove('hidden'); status.querySelector('.dot').className = 'dot ' + (kind || 'wait'); status.querySelector('.txt').textContent = t; };
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) handle(e.dataTransfer.files[0]); });
    input.addEventListener('change', () => { if (input.files[0]) handle(input.files[0]); });

    async function handle(file) {
      out.innerHTML = '';
      let parsed, ab;
      try {
        say('Reading ' + file.name + '…');
        ab = await file.arrayBuffer();
        parsed = await JAA.resume.parseFile({ name: file.name, type: file.type, data: ab });
      } catch (e) { say(e.message || String(e), 'bad'); return; }
      let model = null, note = '';
      if (opts.useAI !== false) {
        say(`Found ${parsed.blocks.length} lines. Your local AI is reading the details (this can take a minute)…`);
        try {
          const r = await task({ mode: 'extract', master: { blocks: parsed.blocks } }, m => { if (m.type === 'progress' && m.chars) say(`Your local AI is reading the details… (${m.chars} characters so far)`); });
          model = r.data;
        } catch (e) { note = 'The local AI could not help this time (' + e.message + '). The basics were read without it; please fill in the rest.'; }
      }
      const facts = JAA.resume.validateExtraction(model || {}, parsed);
      say(note || 'Done. Check each item below, untick anything wrong, then save.', note ? 'bad' : 'ok');
      showChecklist(file, ab, parsed, facts);
    }

    function showChecklist(file, ab, parsed, facts) {
      out.innerHTML = '';
      const rows = [];
      const list = h('div', { class: 'card', style: 'padding:14px 18px' });
      list.appendChild(h('h3', { style: 'margin-top:0' }, 'What I found in your resume'));
      for (const [k, label] of FIELDS) {
        const v = facts[k] || '';
        const cb = h('input', { type: 'checkbox', 'data-k': k }); cb.checked = !!v;
        const inp = k === 'summary' ? h('textarea', { rows: '3' }) : h('input', { type: 'text' });
        inp.value = v; inp.addEventListener('input', () => { cb.checked = !!inp.value.trim(); });
        rows.push({ k, cb, inp });
        list.appendChild(h('div', { class: 'check' }, cb, h('div', { class: 'lbl' }, label), h('div', { class: 'val' }, inp, v ? null : h('div', { class: 'muted small' }, 'Not found: type it if you like'))));
      }
      // jobs
      const jobsBox = h('div');
      const jobRows = facts.workHistory.map(j => {
        const cb = h('input', { type: 'checkbox' }); cb.checked = true;
        const f = {};
        const fld = (key, label) => { f[key] = h('input', { type: 'text' }); f[key].value = j[key] || ''; return h('label', { class: 'f' }, label, f[key]); };
        jobsBox.appendChild(h('div', { class: 'job' }, h('div', { class: 'row' }, cb, h('b', {}, (j.title || '?') + ' · ' + j.company), h('span', { class: 'muted small' }, j.bullets.length + ' bullets')),
          h('div', { class: 'grid', style: 'margin-top:6px' }, fld('title', 'Title'), fld('company', 'Company'), fld('start', 'Start'), fld('end', 'End'), fld('location', 'Location'))));
        return { cb, f, j };
      });
      list.appendChild(h('h3', {}, `Work history (${jobRows.length})`));
      list.appendChild(jobRows.length ? jobsBox : h('div', { class: 'muted' }, 'No jobs found. You can add them later in Options → Profile.'));
      const eduBox = h('div');
      const eduRows = facts.education.map(e => {
        const cb = h('input', { type: 'checkbox' }); cb.checked = true;
        eduBox.appendChild(h('div', { class: 'job row' }, cb, h('span', {}, [e.degree, e.field].filter(Boolean).join(', ') + (e.school ? ' · ' + e.school : '') + (e.end ? ' · ' + e.end : ''))));
        return { cb, e };
      });
      list.appendChild(h('h3', {}, `Education (${eduRows.length})`));
      list.appendChild(eduRows.length ? eduBox : h('div', { class: 'muted' }, 'None found.'));
      const listField = (label, arr) => { const ta = h('textarea', { rows: '2' }); ta.value = arr.join(', '); list.appendChild(h('h3', {}, label)); list.appendChild(ta); return ta; };
      const skills = listField(`Skills (${facts.skills.length})`, facts.skills);
      const certs = listField(`Certifications (${facts.certifications.length})`, facts.certifications);
      const langs = listField(`Languages (${facts.languages.length})`, facts.languages);
      if (facts.dropped.length) list.appendChild(h('p', { class: 'muted small' }, 'Left out because they are not in your resume text: ' + facts.dropped.slice(0, 8).join('; ')));
      const save = h('button', { class: 'primary big', type: 'button' }, '✓ Save to my profile');
      const msg = h('span', { class: 'muted' });
      list.appendChild(h('div', { class: 'row', style: 'margin-top:14px' }, save, msg));
      out.appendChild(list);
      save.addEventListener('click', async () => {
        save.disabled = true;
        const patch = {};
        const chosen = [];
        rows.forEach(r => { if (r.cb.checked && r.inp.value.trim()) { patch[r.k] = r.inp.value.trim(); chosen.push(r.k); } });
        patch.workHistory = jobRows.filter(r => r.cb.checked).map(r => Object.assign({}, r.j, Object.fromEntries(Object.entries(r.f).map(([k, el]) => [k, el.value.trim()]))));
        patch.education = eduRows.filter(r => r.cb.checked).map(r => r.e);
        const split = ta => ta.value.split(',').map(s => s.trim()).filter(Boolean);
        patch.skills = split(skills); patch.certifications = split(certs); patch.languages = split(langs);
        chosen.push('workHistory', 'education', 'skills', 'certifications', 'languages');
        const st = await chrome.storage.local.get('profile');
        const profile = JAA.resume.applyToProfile(JAA.merge(JAA.EMPTY_PROFILE, st.profile), patch, chosen);
        profile.resumeText = parsed.text.slice(0, 20000);
        const mime = parsed.kind === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        const resume = { name: file.name, type: mime, size: ab.byteLength, dataUrl: await abToDataUrl(ab, mime), savedAt: new Date().toISOString() };
        const resumeMaster = { kind: parsed.kind, name: file.name, blocks: parsed.blocks, pages: parsed.pages || 0, pageWidth: parsed.pageWidth || 0, pageHeight: parsed.pageHeight || 0, bodySize: parsed.bodySize || 0, at: Date.now() };
        await chrome.storage.local.set({ profile, resume, resumeMaster });
        msg.textContent = 'Saved. ' + file.name + ' is now your master resume.';
        msg.className = 'ok';
        if (opts.onSaved) opts.onSaved(profile);
      });
    }
    return { handle };
  }
  JAA.importer = { mount };
})(self);
