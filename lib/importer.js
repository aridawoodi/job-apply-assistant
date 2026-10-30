/* Resume -> profile import UI (used by the setup wizard and Options).
 * 1) parse the PDF/DOCX locally and split it into sections and entries, 2) read every entry with rules
 * (contact details, links, skills, certifications and languages never need the model), 3) the local
 * model reads only the jobs / schools / projects the rules aren't sure about (one small request per
 * section), 4) everything is checked against the resume text, 5) you edit, untick or re-read anything
 * on the review screen, 6) it's saved to the profile (and the file becomes your master resume).
 * Saved lists are only replaced when the resume has entries for them, and the screen says what stays. */
(function (g) {
  'use strict';
  const JAA = g.JAA = g.JAA || {};
  const { h, task, abToDataUrl } = JAA.page;

  const FIELDS = [
    ['firstName', 'First name'], ['lastName', 'Last name'], ['email', 'Email'], ['phone', 'Phone'], ['location', 'Location'],
    ['city', 'City'], ['state', 'State'], ['country', 'Country'],
    ['linkedin', 'LinkedIn'], ['github', 'GitHub'], ['portfolio', 'Website'],
    ['yearsExperience', 'Years of experience'], ['summary', 'Summary']
  ];
  const LISTS = [['workHistory', 'work history', 'jobs'], ['education', 'education', 'schools'], ['projects', 'projects', 'projects'], ['skills', 'skills', 'skills'], ['certifications', 'certifications', 'certifications'], ['languages', 'languages', 'languages']];
  const split = v => JAA.splitList(v);
  const lines = v => String(v || '').split('\n').map(s => s.trim()).filter(Boolean);
  const secs = n => (n < 1 ? '<1' : Math.round(n)) + ' s';

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
    input.addEventListener('change', () => { if (input.files[0]) handle(input.files[0]); input.value = ''; });
    // read at import time (Options can switch the AI on or off at any moment)
    const aiOn = () => (typeof opts.useAI === 'function' ? opts.useAI() : opts.useAI !== false);

    let cur = null; // { file, ab, parsed }
    async function handle(file) {
      out.innerHTML = '';
      let parsed, ab;
      try {
        say('Reading ' + file.name + '…');
        ab = await file.arrayBuffer();
        parsed = await JAA.resume.parseFile({ name: file.name, type: file.type, data: ab });
      } catch (e) { say(e.message || String(e), 'bad'); return; }
      cur = { file, ab, parsed };
      await read(false);
    }
    async function read(all) {
      const { file, ab, parsed } = cur;
      const sec = JAA.extract.sectionize(parsed);
      const t0 = Date.now();
      let ai = {}, note = '', timings = null;
      const asked = aiOn() || all;
      if (asked) {
        const n = JAA.extract.prompts(sec, { all }).length + (sec.hasSections ? 0 : 1);
        if (n) {
          say(`Found ${parsed.blocks.length} lines. Your local AI is checking ${n} section${n > 1 ? 's' : ''}…`);
          try {
            const r = await task({ mode: 'extract', all: !!all, master: { blocks: parsed.blocks } }, m => {
              if (m.type === 'progress' && m.text) say(m.text);
              else if (m.type === 'progress' && m.chars) say(`Your local AI is reading (${m.step} of ${m.steps})… ${m.chars} characters`);
            });
            ai = (r.data && r.data.ai) || {}; timings = r.data && r.data.timings;
          } catch (e) { note = 'The local AI could not help this time (' + e.message + '). Everything below was read with simple rules instead; please check it.'; }
        }
      }
      const facts = JAA.extract.combine(sec, ai, parsed);
      const failed = Object.entries(facts.sources).filter(([, v]) => /AI failed/.test(v)).map(([k]) => k);
      if (!note && failed.length) note = `The local AI could not help with your ${failed.join(' and ')} this time, so I used simple rules for ${failed.length > 1 ? 'them' : 'it'}. Please check.`;
      const took = (Date.now() - t0) / 1000;
      const timeTxt = `Read in ${secs(took)}${timings && Object.keys(timings).length ? ' (AI: ' + Object.entries(timings).map(([k, v]) => k + ' ' + secs(v)).join(', ') + ')' : (asked ? ' (the AI wasn\'t needed)' : ' (without the AI)')}.`;
      say(note ? note + ' ' + timeTxt : 'Done. Check each item below, untick anything wrong, then save. ' + timeTxt, note ? 'bad' : 'ok');
      const st = await chrome.storage.local.get('profile');
      showReview(file, ab, parsed, facts, JAA.migrateProfile(JAA.merge(JAA.EMPTY_PROFILE, st.profile)));
    }

    function showReview(file, ab, parsed, facts, saved) {
      out.innerHTML = '';
      const list = h('div', { class: 'card', style: 'padding:14px 18px' });
      list.appendChild(h('div', { class: 'row', style: 'justify-content:space-between;flex-wrap:wrap;gap:8px' },
        h('h3', { style: 'margin:0' }, 'What I found in your resume'),
        h('button', { class: 'secondary', type: 'button', 'data-act': 'retry', title: 'Ask the local AI to read every job, school and project (slower)', onclick: () => read(true) }, '↻ Read again with AI')));
      // basics
      const rows = [];
      for (const [k, label] of FIELDS) {
        const v = facts[k] || '';
        const cb = h('input', { type: 'checkbox', 'data-k': k }); cb.checked = !!v;
        const inp = k === 'summary' ? h('textarea', { rows: '3' }) : h('input', { type: 'text' });
        inp.value = v; inp.addEventListener('input', () => { cb.checked = !!inp.value.trim(); });
        const old = saved[k] && String(saved[k]) !== String(v) ? String(saved[k]) : '';
        const hint = !v ? 'Not found: type it if you like' + (old ? ` (saved: ${old.slice(0, 80)} stays)` : '')
          : (k === 'location' && facts.locationSource === 'current job' ? 'From your current job (no address in the resume header): check it' : (old ? `Replaces your saved: ${old.slice(0, 80)}` : ''));
        rows.push({ k, cb, inp });
        list.appendChild(h('div', { class: 'check' }, cb, h('div', { class: 'lbl' }, label), h('div', { class: 'val' }, inp, hint ? h('div', { class: 'muted small' }, hint) : null)));
      }
      const savedCount = k => (k === 'education' ? JAA.educationListOf(saved) : (saved[k] || [])).length;
      const replaceBox = (k, n, word) => {
        const m = savedCount(k);
        if (!n) return { el: h('p', { class: 'muted small', 'data-keep': k }, m ? `None found in this resume, so your saved ${word} (${m}) stay as they are.` : 'None found. You can add them later in Settings → Profile.'), cb: null };
        if (!m) return { el: null, cb: null };
        const cb = h('input', { type: 'checkbox', 'data-replace': k }); cb.checked = true;
        return { el: h('label', { class: 'replace small', style: 'display:flex;gap:8px;align-items:center;margin:4px 0' }, cb, `Replace my saved ${word} (${m}) with these ${n}`), cb };
      };
      const cardList = (title, k, items, word, render) => {
        list.appendChild(h('h3', {}, `${title} (${items.length})`));
        const box = h('div'); list.appendChild(box);
        const rs = items.map((it, i) => render(it, i, box));
        const rb = replaceBox(k, items.length, word); if (rb.el) list.appendChild(rb.el);
        return { rows: rs, replace: rb.cb };
      };
      const fld = (f, key, label, val, wide) => { f[key] = h('input', { type: 'text' }); f[key].value = val || ''; return h('label', { class: 'f', style: wide ? 'grid-column:1/-1' : null }, label, f[key]); };
      const sel = (f, key, label, options, val) => {
        const s = h('select'); options.forEach(([v, t]) => s.appendChild(h('option', { value: v }, t)));
        if (val && !options.some(([v]) => v === val)) s.appendChild(h('option', { value: val }, val));
        s.value = val || ''; f[key] = s; return h('label', { class: 'f' }, label, s);
      };
      // jobs: editable cards (current = "I currently work here"); what is shown is exactly what is saved
      const jobs = { ed: null, replace: null };
      const savedJobs = savedCount('workHistory');
      if (!facts.workHistory.length && savedJobs) {
        list.appendChild(h('h3', {}, 'Work history'));
        list.appendChild(h('p', { class: 'muted small', 'data-keep': 'workHistory' }, `None found in this resume, so your saved jobs (${savedJobs}) stay as they are.`));
      } else {
        const box = h('div', { 'data-exp-review': '' }); list.appendChild(box);
        const rb = h('input', { type: 'checkbox', 'data-replace': 'workHistory' }); rb.checked = true;
        const rbText = h('span');
        const rbLabel = savedJobs ? h('label', { class: 'replace small', style: 'display:flex;gap:8px;align-items:center;margin:4px 0' }, rb, rbText) : null;
        const setRb = n => { rbText.textContent = `Replace my saved jobs (${savedJobs}) with these ${n}`; };
        jobs.ed = JAA.expEditor.mount(box, facts.workHistory, { mode: 'review', debounceMs: 150, onChange: v => setRb(v.length) });
        setRb(facts.workHistory.length);
        if (rbLabel) { list.appendChild(rbLabel); jobs.replace = rb; }
      }
      // education (main record; one is the highest degree)
      const degOpts = [['', '—']].concat(JAA.DEGREES.map(d => [d, d]));
      const stOpts = JAA.EDU_STATUS;
      const radioName = 'hi' + Math.random().toString(36).slice(2, 7);
      const edu = cardList('Education', 'education', facts.education, 'schools', (e, i, box) => {
        const cb = h('input', { type: 'checkbox' }); cb.checked = true; const f = {};
        const hi = h('input', { type: 'radio', name: radioName }); hi.checked = !!e.highest;
        const el = h('div', { class: 'job' }, h('div', { class: 'row' }, cb, h('b', {}, [e.degree, e.field].filter(Boolean).join(', ') + (e.school ? ' · ' + e.school : '')),
          h('label', { class: 'muted small', title: 'Used for single "Degree" / "School" questions' }, hi, ' Highest degree')),
          h('div', { class: 'grid', style: 'margin-top:6px' }, fld(f, 'school', 'School', e.school), sel(f, 'degree', 'Degree', degOpts, e.degree), fld(f, 'field', 'Field of study', e.field),
            fld(f, 'start', 'Start', e.start), fld(f, 'end', 'End', e.end), fld(f, 'location', 'Location', e.location), sel(f, 'status', 'Status', stOpts, e.status || 'completed')));
        box.appendChild(el);
        return { cb, f, hi, e };
      });
      // projects (never added as jobs)
      const proj = cardList('Projects', 'projects', facts.projects, 'projects', (p, i, box) => {
        const cb = h('input', { type: 'checkbox' }); cb.checked = true; const f = {};
        const bl = h('textarea', { rows: '3' }); bl.value = (p.bullets || []).join('\n');
        const el = h('div', { class: 'job' }, h('div', { class: 'row' }, cb, h('b', {}, p.name || '?'), h('span', { class: 'muted small' }, (p.bullets || []).length + ' bullets')),
          h('div', { class: 'grid', style: 'margin-top:6px' }, fld(f, 'name', 'Name', p.name), fld(f, 'link', 'Link', p.link), fld(f, 'start', 'Start', p.start), fld(f, 'end', 'End', p.end),
            fld(f, 'role', 'Role / type', p.role), fld(f, 'description', 'Description', p.description), fld(f, 'tech', 'Tech (comma-separated)', (p.tech || []).join(', '), true)),
          h('details', {}, h('summary', { class: 'muted small' }, 'Bullets'), bl));
        box.appendChild(el);
        return { cb, f, bl };
      });
      const listField = (label, k, arr, word) => {
        const ta = h('textarea', { rows: '3', 'data-list': k }); ta.value = arr.join(k === 'certifications' ? '\n' : ', ');
        list.appendChild(h('h3', {}, `${label} (${arr.length})`)); list.appendChild(ta);
        const rb = replaceBox(k, arr.length, word); if (rb.el) list.appendChild(rb.el);
        return { ta, replace: rb.cb };
      };
      const skills = listField('Skills', 'skills', facts.skills, 'skills');
      const certs = listField('Certifications', 'certifications', facts.certifications, 'certifications');
      const langs = listField('Languages', 'languages', facts.languages, 'languages');
      if (facts.dropped.length) list.appendChild(h('p', { class: 'muted small' }, 'Left out because they are not in your resume text: ' + facts.dropped.slice(0, 8).join('; ')));
      list.appendChild(h('p', { class: 'muted small' }, 'Voluntary self-identification (EEO) answers are never read from a resume; set them yourself in Settings.'));
      const save = h('button', { class: 'primary big', type: 'button' }, '✓ Save to my profile');
      const msg = h('span', { class: 'muted' });
      list.appendChild(h('div', { class: 'row', style: 'margin-top:14px' }, save, msg));
      out.appendChild(list);
      save.addEventListener('click', async () => {
        save.disabled = true;
        const patch = {};
        const chosen = [];
        rows.forEach(r => { if (r.cb.checked && r.inp.value.trim()) { patch[r.k] = r.inp.value.trim(); chosen.push(r.k); } });
        const val = f => Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value.trim()]));
        patch.workHistory = jobs.ed ? jobs.ed.value() : [];
        patch.education = edu.rows.filter(r => r.cb.checked).map(r => Object.assign({ degreeText: r.e.degreeText || '' }, val(r.f), { highest: r.hi.checked }));
        patch.projects = proj.rows.filter(r => r.cb.checked).map(r => { const v = val(r.f); return Object.assign(v, { tech: split(v.tech), bullets: lines(r.bl.value) }); });
        patch.skills = split(skills.ta.value); patch.certifications = JAA.splitLines(certs.ta.value); patch.languages = split(langs.ta.value);
        const wants = { workHistory: jobs.replace, education: edu.replace, projects: proj.replace, skills: skills.replace, certifications: certs.replace, languages: langs.replace };
        for (const [k, cb] of Object.entries(wants)) if (!cb || cb.checked) chosen.push(k);
        const st = await chrome.storage.local.get('profile');
        const profile = JAA.resume.applyToProfile(JAA.migrateProfile(JAA.merge(JAA.EMPTY_PROFILE, st.profile)), patch, chosen);
        profile.resumeText = parsed.text.slice(0, 20000);
        const mime = parsed.kind === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        const resume = { name: file.name, type: mime, size: ab.byteLength, dataUrl: await abToDataUrl(ab, mime), savedAt: new Date().toISOString() };
        const resumeMaster = { kind: parsed.kind, name: file.name, blocks: parsed.blocks, pages: parsed.pages || 0, pageWidth: parsed.pageWidth || 0, pageHeight: parsed.pageHeight || 0, bodySize: parsed.bodySize || 0, at: Date.now() };
        await chrome.storage.local.set({ profile, resume, resumeMaster });
        const kept = LISTS.filter(([k]) => !chosen.includes(k) || !(patch[k] || []).length).map(([k, , w]) => savedCount(k) ? w : '').filter(Boolean);
        msg.textContent = 'Saved. ' + file.name + ' is now your master resume.' + (kept.length ? ' Kept your saved ' + kept.join(', ') + '.' : '');
        msg.className = 'ok';
        save.disabled = false;
        if (opts.onSaved) opts.onSaved(profile);
      });
    }
    return { handle };
  }
  JAA.importer = { mount };
})(self);
