/* v0.6.6 work-experience editor, shared by the resume review screen and Options → Profile.
 * Each job is a card (title, company, location, start and end month/year, "I currently work here").
 * Cards can be added, removed (with undo) and reordered with the ↑ ↓ buttons, Alt+↑ / Alt+↓, or by dragging
 * the handle. Hints are gentle (missing title or company, end before start) and never block saving.
 * "Check this" marks fields the resume reader was unsure about; it goes away once you edit the field.
 * The editor keeps its own list: typing updates one object, moving a card moves one DOM node, nothing is
 * parsed again on render, and onChange is debounced. */
(function (g) {
  'use strict';
  const JAA = g.JAA = g.JAA || {};
  const { h } = JAA.page;
  let uid = 0;
  const MONTH_OPTS = [['', 'Month']].concat(JAA.MONTHS.map((m, i) => [String(i + 1), m]));
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

  function mount(root, jobs, opts) {
    opts = opts || {};
    const review = opts.mode === 'review';
    const found = (jobs || []).length;
    const items = [];
    let timer = null, undo = null;
    root.innerHTML = '';
    root.classList.add('exp');
    root.setAttribute('data-exp', opts.mode || 'profile');

    const count = h('span', { class: 'exp-count', 'data-exp-count': '' });
    const nowLine = h('p', { class: 'exp-now small', 'data-exp-current': '' });
    const live = h('div', { class: 'exp-sr', 'aria-live': 'polite', role: 'status' });
    const list = h('ol', { class: 'exp-list', 'aria-label': 'Work history, newest first' });
    const undoBar = h('div', { class: 'exp-undo hidden', role: 'status' });
    const addBtn = h('button', { type: 'button', class: 'secondary', 'data-exp-add': '', onclick: () => { const it = add({}, 0, true); it.refs.title.focus(); announce('Added a new job at the top.'); changed(); } }, '+ Add a job');
    const sortBtn = review ? null : h('button', { type: 'button', class: 'ghost-btn', 'data-exp-sort': '', title: 'Put your jobs in date order, newest first', onclick: sortNewest }, 'Sort newest first');
    root.append(
      h('div', { class: 'exp-head' }, h('h3', { class: 'exp-title' }, opts.title || 'Work history'), count),
      h('p', { class: 'muted small exp-help' }, review
        ? 'Newest first. Fix anything that looks wrong, remove what you don\u2019t want, and drag or use \u2191 \u2193 to change the order. What you see here is exactly what gets saved.'
        : 'Newest first. Forms that ask for several jobs get them in this order. Changes save automatically.'),
      nowLine, list, undoBar, h('div', { class: 'row exp-actions' }, addBtn, sortBtn), live);

    function announce(t) { live.textContent = ''; setTimeout(() => { live.textContent = t; }, 30); }
    function changed(immediate) {
      refreshMeta();
      if (!opts.onChange) return;
      clearTimeout(timer);
      timer = setTimeout(() => { timer = null; opts.onChange(value()); }, immediate ? 0 : (opts.debounceMs == null ? 500 : opts.debounceMs));
    }
    function flush() { if (timer) { clearTimeout(timer); timer = null; if (opts.onChange) opts.onChange(value()); } }
    function cancel() { clearTimeout(timer); timer = null; }

    /* ---------- one card ---------- */
    function dateField(it, key, label) {
      const id = 'exp' + (++uid);
      const raw = it.job[key];
      const w = JAA.parseWhen(raw);
      const mSel = h('select', { id: id + 'm', 'data-f': key + 'Month', 'aria-label': label + ' month' });
      MONTH_OPTS.forEach(([v, t]) => mSel.appendChild(h('option', { value: v }, t)));
      const yIn = h('input', { type: 'text', inputmode: 'numeric', maxlength: '4', placeholder: 'Year', id: id + 'y', 'data-f': key + 'Year', 'aria-label': label + ' year', autocomplete: 'off' });
      if (w && !w.present) { mSel.value = w.m ? String(w.m) : ''; yIn.value = w.y ? String(w.y) : ''; }
      // text we can't turn into month/year ("Summer 2019") is kept as written until you change it
      it.raw[key] = w && w.fuzzy ? raw : (!w && raw && !JAA.isPresentEnd(raw) ? raw : '');
      if (it.raw[key]) it.job.check = Object.assign({}, it.job.check, { [key]: 'Your resume says "' + it.raw[key] + '". Pick a month and year.' });
      const onEdit = () => { it.raw[key] = ''; it.touched[key] = true; clearCheck(it, key); sync(it); };
      mSel.addEventListener('change', onEdit); yIn.addEventListener('input', onEdit);
      it.refs[key + 'M'] = mSel; it.refs[key + 'Y'] = yIn;
      const wrap = h('div', { class: 'exp-field', 'data-field': key },
        h('label', { class: 'exp-lbl', for: id + 'm' }, label, h('span', { class: 'exp-check hidden', 'data-check': key, tabindex: '0' }, 'Check this')),
        h('div', { class: 'exp-date' }, mSel, yIn), h('div', { class: 'exp-msg', id: id + 'msg', 'aria-live': 'polite' }));
      mSel.setAttribute('aria-describedby', id + 'msg'); yIn.setAttribute('aria-describedby', id + 'msg');
      return wrap;
    }
    function textField(it, key, label, req) {
      const id = 'exp' + (++uid);
      const inp = h('input', { type: 'text', id, 'data-f': key, value: it.job[key] || '', autocomplete: 'off', 'aria-describedby': id + 'msg' });
      inp.value = it.job[key] || '';
      inp.addEventListener('input', () => { it.job[key] = inp.value; it.touched[key] = true; clearCheck(it, key); sync(it); });
      inp.addEventListener('blur', () => { it.touched[key] = true; paintIssues(it); });
      it.refs[key] = inp;
      return h('div', { class: 'exp-field', 'data-field': key },
        h('label', { class: 'exp-lbl', for: id }, label, req ? h('span', { class: 'exp-req', 'aria-hidden': 'true' }, ' *') : null, h('span', { class: 'exp-check hidden', 'data-check': key, tabindex: '0' }, 'Check this')),
        inp, h('div', { class: 'exp-msg', id: id + 'msg', 'aria-live': 'polite' }));
    }
    function build(it) {
      const j = it.job;
      const cur = h('input', { type: 'checkbox', 'data-f': 'current' }); cur.checked = !!j.current;
      cur.addEventListener('change', () => toggleCurrent(it, cur.checked));
      it.refs.current = cur;
      const bl = h('textarea', { rows: '3', 'data-f': 'bullets', 'aria-label': 'Bullets, one per line' }); bl.value = (j.bullets || []).join('\n');
      bl.addEventListener('input', () => { it.job.bullets = bl.value.split('\n').map(s => s.trim()).filter(Boolean); sync(it, true); });
      const handle = h('button', { type: 'button', class: 'exp-handle', draggable: 'true', 'aria-label': 'Reorder (drag, or Alt+Up / Alt+Down)', title: 'Drag to reorder' }, '\u22ee\u22ee');
      const up = h('button', { type: 'button', class: 'exp-icon', 'data-move': 'up', onclick: () => move(it, -1) }, '\u2191');
      const down = h('button', { type: 'button', class: 'exp-icon', 'data-move': 'down', onclick: () => move(it, 1) }, '\u2193');
      const del = h('button', { type: 'button', class: 'exp-icon exp-del', 'data-exp-remove': '', onclick: () => remove(it) }, '\u00d7');
      it.refs.summary = h('span', { class: 'exp-sum' });
      it.refs.pill = h('span', { class: 'exp-pill hidden' }, 'Current');
      it.refs.bcount = h('span', { class: 'muted small' });
      it.refs.up = up; it.refs.down = down; it.refs.del = del;
      const li = h('li', { class: 'exp-card', 'data-exp-card': '' },
        h('div', { class: 'exp-card-head' }, handle, h('div', { class: 'exp-sumwrap' }, it.refs.summary, it.refs.pill), h('div', { class: 'exp-tools' }, up, down, del)),
        h('div', { class: 'exp-grid' },
          textField(it, 'title', 'Job title', true), textField(it, 'company', 'Company', true), textField(it, 'location', 'Location'),
          dateField(it, 'start', 'Start'), dateField(it, 'end', 'End'),
          h('div', { class: 'exp-field exp-curwrap' }, h('label', { class: 'exp-toggle' }, cur, h('span', {}, 'I currently work here')))),
        h('details', { class: 'exp-bullets' }, h('summary', { class: 'muted small' }, 'Bullets ', it.refs.bcount), bl));
      li.addEventListener('keydown', e => { if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); move(it, e.key === 'ArrowUp' ? -1 : 1, e.target); } });
      // drag and drop (the handle starts it; the whole card is the drop target)
      handle.addEventListener('dragstart', e => { it.node.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'job'); e.dataTransfer.setDragImage(it.node, 20, 20); } catch (_) { /* old browsers */ } root._drag = it; });
      handle.addEventListener('dragend', () => { it.node.classList.remove('dragging'); list.querySelectorAll('.drop-before,.drop-after').forEach(n => n.classList.remove('drop-before', 'drop-after')); root._drag = null; });
      li.addEventListener('dragover', e => { const d = root._drag; if (!d || d === it) return; e.preventDefault(); const r = li.getBoundingClientRect(); const after = e.clientY > r.top + r.height / 2; li.classList.toggle('drop-after', after); li.classList.toggle('drop-before', !after); });
      li.addEventListener('dragleave', () => li.classList.remove('drop-before', 'drop-after'));
      li.addEventListener('drop', e => { const d = root._drag; if (!d || d === it) return; e.preventDefault(); const after = li.classList.contains('drop-after'); li.classList.remove('drop-before', 'drop-after'); const from = items.indexOf(d); items.splice(from, 1); items.splice(items.indexOf(it) + (after ? 1 : 0), 0, d); list.insertBefore(d.node, after ? li.nextSibling : li); afterMove(d); });
      it.node = li;
      if (j.current) setEndDisabled(it, true);
      return li;
    }
    function add(job, at, isNew) {
      const it = { job: Object.assign({ title: '', company: '', location: '', start: '', end: '', bullets: [] }, JAA.normalizeJob(job)), raw: {}, touched: {}, refs: {}, isNew: !!isNew, prevEnd: '' };
      if (!it.job.check) delete it.job.check;
      const li = build(it);
      at = at == null ? items.length : at;
      items.splice(at, 0, it);
      list.insertBefore(li, list.children[at] || null);
      paint(it); paintIssues(it); refreshMoves();
      return it;
    }

    /* ---------- state ---------- */
    function dateOf(it, key) {
      if (key === 'end' && it.refs.current.checked) return 'Present';
      return typedDate(it, key);
    }
    function typedDate(it, key) { // what the month/year boxes say (ignores the current toggle)
      if (it.raw[key]) return it.raw[key];
      const y = it.refs[key + 'Y'].value.trim(), m = +it.refs[key + 'M'].value || 0;
      if (!y) return m ? JAA.MONTHS[m - 1] : '';
      return /^(19|20)\d\d$/.test(y) ? JAA.fmtWhen({ y: +y, m }) : y;
    }
    function sync(it, quiet) {
      it.job.start = dateOf(it, 'start'); it.job.end = dateOf(it, 'end'); it.job.current = it.refs.current.checked;
      if (!quiet) { paint(it); paintIssues(it); }
      else it.refs.bcount.textContent = '(' + (it.job.bullets || []).length + ')';
      changed();
    }
    function toggleCurrent(it, on) {
      clearCheck(it, 'end');
      if (on) { it.prevEnd = typedDate(it, 'end'); it.raw.end = ''; setEndDisabled(it, true); it.refs.endM.value = ''; it.refs.endY.value = ''; announce('Marked as a current job. End date set to Present.'); }
      else {
        setEndDisabled(it, false);
        const w = JAA.parseWhen(it.prevEnd);
        it.refs.endM.value = w && w.m ? String(w.m) : ''; it.refs.endY.value = w && w.y ? String(w.y) : '';
        it.raw.end = w && w.fuzzy ? it.prevEnd : '';
        announce(it.prevEnd ? 'No longer current. End date restored to ' + it.prevEnd + '.' : 'No longer current. Add the end date.');
        it.refs.endM.focus();
      }
      it.touched.end = true;
      sync(it);
    }
    function setEndDisabled(it, off) { it.refs.endM.disabled = off; it.refs.endY.disabled = off; it.node && it.node.classList.toggle('is-current', off); }
    function clearCheck(it, key) { if (it.job.check && it.job.check[key]) { delete it.job.check[key]; if (!Object.keys(it.job.check).length) delete it.job.check; paintChecks(it); } }
    function paint(it) {
      const j = it.job;
      const dates = [j.start, j.end].filter(Boolean).join(' \u2013 ');
      it.refs.summary.textContent = [j.title || 'New job', j.company].filter(Boolean).join(' \u00b7 ') + (dates ? '  \u00b7  ' + dates : '');
      it.refs.pill.classList.toggle('hidden', !it.refs.current.checked);
      it.refs.bcount.textContent = '(' + (j.bullets || []).length + ')';
      const name = (j.title || 'job') + (j.company ? ' at ' + j.company : '');
      it.refs.up.setAttribute('aria-label', 'Move ' + name + ' up'); it.refs.down.setAttribute('aria-label', 'Move ' + name + ' down'); it.refs.del.setAttribute('aria-label', 'Remove ' + name);
      it.refs.up.title = 'Move up (Alt+\u2191)'; it.refs.down.title = 'Move down (Alt+\u2193)'; it.refs.del.title = 'Remove this job';
      paintChecks(it);
    }
    function paintChecks(it) {
      it.node.querySelectorAll('[data-check]').forEach(b => {
        const why = it.job.check && it.job.check[b.dataset.check];
        b.classList.toggle('hidden', !why); if (why) { b.title = why; b.setAttribute('aria-label', 'Check this: ' + why); }
        const f = b.closest('.exp-field'); f.classList.toggle('needs-check', !!why);
        const msg = f.querySelector('.exp-msg'); if (msg && !msg.dataset.err) msg.textContent = why || '';
      });
    }
    function issues(it) {
      const j = it.job, out = {};
      const started = !!(j.title || j.company || j.start || j.end || j.location || (j.bullets || []).length);
      if (!started) return out;
      if (!j.title.trim() && (!it.isNew || it.touched.title)) out.title = 'Add the job title.';
      if (!j.company.trim() && (!it.isNew || it.touched.company)) out.company = 'Add the company.';
      ['start', 'end'].forEach(k => { const y = it.refs[k + 'Y'].value.trim(); if (y && !/^(19|20)\d\d$/.test(y)) out[k] = 'Use a 4-digit year, e.g. 2021.'; });
      if (!out.end && JAA.endBeforeStart(j)) out.end = 'The end date is before the start date.';
      return out;
    }
    function paintIssues(it) {
      const is = issues(it);
      it.node.querySelectorAll('.exp-field[data-field]').forEach(f => {
        const k = f.dataset.field, msg = f.querySelector('.exp-msg'), bad = is[k];
        f.classList.toggle('has-issue', !!bad);
        f.querySelectorAll('input,select').forEach(el => { if (bad) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid'); });
        if (!msg) return;
        if (bad) { msg.textContent = bad; msg.dataset.err = '1'; } else { delete msg.dataset.err; msg.textContent = (it.job.check && it.job.check[k]) || ''; }
      });
      it.node.classList.toggle('has-issue', Object.keys(is).length > 0);
    }
    function refreshMoves() { items.forEach((it, i) => { it.refs.up.disabled = i === 0; it.refs.down.disabled = i === items.length - 1; }); }
    function refreshMeta() {
      const n = items.length;
      count.textContent = review ? plural(found, 'job') + ' found' + (n !== found ? ' \u00b7 ' + n + ' to save' : '') : plural(n, 'job');
      const cur = items.filter(it => it.refs.current.checked);
      nowLine.textContent = '';
      if (!n) nowLine.append(review ? 'No jobs to save.' : 'No jobs yet. Add one, or import your resume.');
      else if (!cur.length) nowLine.append('No job is marked current, so forms that ask for your current employer are left for you.');
      else {
        const c = cur[0].job;
        nowLine.append('Forms that ask for your current employer use ', h('b', {}, [c.title, c.company].filter(Boolean).join(' at ') || 'the first current job'), cur.length > 1 ? ' (the first of your ' + cur.length + ' current jobs; reorder to change it).' : '.');
      }
    }
    function afterMove(it, focusEl) {
      refreshMoves(); const i = items.indexOf(it);
      announce('Moved ' + (it.job.title || 'job') + ' to position ' + (i + 1) + ' of ' + items.length + '.');
      if (focusEl) { (focusEl.disabled ? (focusEl === it.refs.up ? it.refs.down : it.refs.up) : focusEl).focus(); }
      changed();
    }
    function move(it, d, focusEl) {
      const i = items.indexOf(it), k = i + d;
      if (k < 0 || k >= items.length) return;
      items.splice(i, 1); items.splice(k, 0, it);
      list.insertBefore(it.node, items[k + 1] ? items[k + 1].node : null);
      afterMove(it, focusEl || (d < 0 ? it.refs.up : it.refs.down));
    }
    function remove(it) {
      const i = items.indexOf(it); if (i < 0) return;
      items.splice(i, 1); it.node.remove(); refreshMoves();
      const name = [it.job.title, it.job.company].filter(Boolean).join(' at ') || 'the empty job';
      undo = { it, i };
      undoBar.innerHTML = '';
      undoBar.append(h('span', {}, 'Removed ' + name + '. '), h('button', { type: 'button', class: 'ghost-btn', 'data-exp-undo': '', onclick: () => { if (!undo) return; const u = undo; undo = null; items.splice(u.i, 0, u.it); list.insertBefore(u.it.node, list.children[u.i] || null); refreshMoves(); undoBar.classList.add('hidden'); u.it.refs.del.focus(); announce('Restored ' + name + '.'); changed(); } }, 'Undo'));
      undoBar.classList.remove('hidden');
      const next = items[i] || items[i - 1]; (next ? next.refs.del : addBtn).focus();
      announce('Removed ' + name + '. Undo is available.');
      changed();
    }
    function sortNewest() {
      const sorted = JAA.sortJobs(items.map(it => it.job)); const order = sorted.map(j => items.find(it => it.job === j));
      items.splice(0, items.length, ...order); order.forEach(it => list.appendChild(it.node)); refreshMoves();
      announce('Sorted newest first.'); changed();
    }
    // the list as shown (blank new cards are left out); `check` notes stay until you edit the field
    function value() {
      return items.map(it => it.job).filter(j => j.title || j.company || j.start || j.end || j.location || (j.bullets || []).length)
        .map(j => JAA.normalizeJob(Object.assign({}, j, { end: j.current ? 'Present' : (JAA.isPresentEnd(j.end) ? '' : j.end) })));
    }
    (jobs || []).forEach(j => add(j));
    refreshMeta();
    return { value, flush, cancel, pending: () => !!timer, count: () => items.length, problems: () => items.reduce((n, it) => n + Object.keys(issues(it)).length, 0), el: root };
  }
  JAA.expEditor = { mount };
})(self);
