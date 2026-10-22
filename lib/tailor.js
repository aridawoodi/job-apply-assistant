/* Resume tailoring: prompt building, validation of the model's proposals against the
 * master resume (facts only), custom-rule checks, applying accepted changes, file names.
 * Shared by the background worker (prompt) and the tailor page (validate / apply). */
(function (g) {
  'use strict';
  const JAA = g.JAA = g.JAA || {};

  const EDITABLE = b => b && ((b.type === 'bullet' && /experience|projects|volunteer|other/.test(b.section)) || (b.type === 'text' && /summary|skills/.test(b.section)) || (b.type === 'bullet' && /summary|skills/.test(b.section)));
  const kindOf = b => (b.section === 'summary' ? 'summary' : b.section === 'skills' ? 'skills' : 'bullet');

  function groupHeader(blocks, group) {
    const entries = blocks.filter(b => b.group === group && b.type === 'entry').map(b => b.text.replace(/\t/g, '  '));
    return entries.join(' / ');
  }

  /* ---------- prompt ---------- */
  function buildPrompt(master, job, rules, opts) {
    opts = opts || {};
    const lines = [];
    let lastGroup = '';
    for (const b of master.blocks) {
      if (b.type === 'heading') { lines.push('\n## ' + b.text); continue; }
      if (EDITABLE(b)) {
        if (b.type === 'bullet' && b.group !== lastGroup) { lines.push('(' + groupHeader(master.blocks, b.group) + ') group ' + b.group); lastGroup = b.group; }
        lines.push(`[${b.id}] ${b.type === 'bullet' ? '• ' : ''}${b.text}`);
      } else if (b.type === 'entry') { /* shown as group header above */ } else if (b.type !== 'name' && b.type !== 'contact') {
        lines.push('(fixed) ' + b.text.replace(/\t/g, '  '));
      }
    }
    const ruleTxt = (rules || []).filter(Boolean).map((r, i) => `${i + 1}. ${r}`).join('\n');
    const sys = [
      'You tailor a resume to a job posting. You may ONLY:',
      '- rewrite the summary paragraph(s) to emphasise what the job asks for,',
      '- reorder the items inside a skills line (same items, new order),',
      '- reword bullets so the most relevant facts come first (same facts, same tools, same numbers),',
      '- reorder the bullets inside one job or project (group).',
      'NEVER invent anything: no new employers, job titles, dates, degrees, numbers, metrics, percentages, tools, technologies or achievements that are not already in the resume. Do not remove facts. Keep each rewritten text about the same length (at most 20% longer). Never touch job titles, company names, dates or contact details.',
      'Change only what clearly helps for this job: at most ' + (opts.maxBullets || 6) + ' bullet rewrites. Leave good bullets alone.',
      'Each rewrite must describe the SAME work as the line with that id (check the id). Never copy text from the job description into the resume.',
      'Answer with ONLY a JSON object: {"summary":[{"id":"b4","text":"..."}],"skills":[{"id":"b59","text":"..."}],"bullets":[{"id":"b12","text":"...","why":"short reason"}],"order":[{"group":"g5","ids":["b12","b8"]}]}. Use the ids in [brackets]. Use [] when nothing should change.'
    ].join('\n');
    const user = [
      `JOB: ${job.title || ''} at ${job.company || ''}`,
      'JOB DESCRIPTION:', String(job.description || '').slice(0, opts.jdChars || 3500),
      ruleTxt ? '\nTHE CANDIDATE\'S RULES (always follow these):\n' + ruleTxt : '',
      '\nRESUME (editable lines have [ids]):', lines.join('\n').slice(0, opts.resumeChars || 7000)
    ].join('\n');
    return [{ role: 'system', content: sys }, { role: 'user', content: user }];
  }

  /* ---------- validation ---------- */
  const lc = s => String(s || '').toLowerCase();
  const COMMON = new Set('a an and the of to in on for with by at from as or is are was were be been into across using use used via per over under within our your their its it this that these those i we he she they new'.split(' '));
  const BRITISH = { colour: 'color', colours: 'colors', organise: 'organize', organised: 'organized', organising: 'organizing', optimise: 'optimize', optimised: 'optimized', optimising: 'optimizing', analyse: 'analyze', analysed: 'analyzed', analysing: 'analyzing', behaviour: 'behavior', centre: 'center', licence: 'license', modelling: 'modeling', modelled: 'modeled', travelling: 'traveling', programme: 'program', catalogue: 'catalog', prioritise: 'prioritize', prioritised: 'prioritized', utilise: 'utilize', utilised: 'utilized', standardise: 'standardize', standardised: 'standardized', automatise: 'automate', favour: 'favor', labour: 'labor', defence: 'defense', recognise: 'recognize', recognised: 'recognized', minimise: 'minimize', minimised: 'minimized', maximise: 'maximize', maximised: 'maximized', summarise: 'summarize', summarised: 'summarized', visualise: 'visualize', visualisation: 'visualization', organisation: 'organization', organisations: 'organizations', optimisation: 'optimization', customise: 'customize', customised: 'customized' };

  function parseRules(rules) {
    const out = { pages: 0, forbidden: [], protect: [], keep: [], usSpelling: false, notes: [] };
    for (const raw of rules || []) {
      const r = String(raw || '').trim(); if (!r) continue;
      const l = lc(r);
      let m;
      if ((m = l.match(/(?:keep|limit|fit)(?: it| the resume| my resume)? (?:to|on|within|under) (\d+|one|two|three) pages?|(?:max(?:imum)?|at most|no more than) (\d+|one|two|three) pages?|^(\d+|one|two|three)[- ]pages?\b/))) {
        const n = m[1] || m[2] || m[3]; out.pages = { one: 1, two: 2, three: 3 }[n] || +n; out.notes.push({ rule: r, check: 'pages' }); continue;
      }
      if ((m = l.match(/(?:never|don'?t|do not|avoid)(?: ever)? (?:use|say|write|include|mention)(?: the words?| the phrases?)? ["“']?([^"”']+?)["”']?\.?$/))) {
        m[1].split(/,|\bor\b|\band\b/).map(s => s.trim()).filter(Boolean).forEach(w => out.forbidden.push(w));
        out.notes.push({ rule: r, check: 'forbidden' }); continue;
      }
      if ((m = l.match(/(?:never|don'?t|do not)(?: ever)? (remove|delete|drop|cut|change|touch|edit|rewrite|reword|modify)(?: any of)? (?:my |the )?(.+?) (?:bullets?|points?|lines?|section|experience|job)\b/))) {
        const what = m[2].replace(/^(any|all) /, '').trim();
        if (/remove|delete|drop|cut/.test(m[1])) { out.keep.push(what); out.notes.push({ rule: r, check: 'keep' }); } // we never delete lines anyway
        else { out.protect.push(what); out.notes.push({ rule: r, check: 'protect' }); }
        continue;
      }
      if (/\b(us|u\.s\.|american) (english )?spelling\b/.test(l)) { out.usSpelling = true; out.notes.push({ rule: r, check: 'spelling' }); continue; }
      if (/(?:don'?t|do not|never) change (?:my )?(?:job )?titles?/.test(l)) { out.notes.push({ rule: r, check: 'titles' }); continue; }
      out.notes.push({ rule: r, check: 'ai' });
    }
    return out;
  }

  function tokens(s) { return String(s || '').match(/[A-Za-z][A-Za-z0-9+#.&/-]*[A-Za-z0-9+#]|[A-Za-z]/g) || []; }
  function numbersIn(s) { return (String(s || '').match(/\$?\d[\d,.]*\s?(?:%|k|m|x|\+)?/gi) || []).map(n => n.replace(/[,\s]/g, '').replace(/\.$/, '').toLowerCase()); }

  // Terms that would be new facts: numbers, years, capitalised / technical terms not in the resume.
  function newFacts(after, before, masterText) {
    const M = lc(masterText);
    const issues = [];
    for (const n of numbersIn(after)) {
      const bare = n.replace(/[$%kmx+]/g, '');
      if (!bare) continue;
      if (!M.includes(bare)) issues.push('new number “' + n + '”');
    }
    const words = String(after).split(/(?<=[.!?:;])\s+|\s+/);
    let sentenceStart = true;
    for (const w0 of words) {
      const w = w0.replace(/^[("'“‘[]+|[)"'”’\],.;:!?]+$/g, '');
      const start = sentenceStart; sentenceStart = /[.!?:;]$/.test(w0);
      if (!w || /^\d/.test(w)) continue;
      const technical = /[A-Z].*[A-Z]|[0-9+#]|\.[a-z]/.test(w.slice(1)) || /^[A-Z]{2,}/.test(w); // CamelCase, ACRONYM, C#, Node.js
      const proper = /^[A-Z]/.test(w) && !start;
      if (!(technical || proper)) continue;
      if (COMMON.has(lc(w))) continue;
      if (!M.includes(lc(w)) && !M.includes(lc(w).replace(/s$/, ''))) issues.push('“' + w + '” is not in your resume');
    }
    return Array.from(new Set(issues));
  }

  // content words, lightly stemmed ("defined"/"define" -> "defin"), to compare what a line says
  const STOP = new Set('that which while more than also through other each all both such very about after before during including'.split(' '));
  const stem = w => w.replace(/(ing|ed|es|s|e)$/, '');
  function contentWords(s) { return Array.from(new Set(tokens(s).map(lc).filter(w => w.length > 2 && !COMMON.has(w) && !STOP.has(w)).map(stem))); }
  const overlap = (a, b) => { const A = contentWords(a), B = new Set(contentWords(b)); return A.length ? A.filter(w => B.has(w)).length / A.length : 1; };

  // A reworded bullet must still say what the original said, with its own numbers, and not borrow
  // facts (numbers, tools) from other lines or other jobs.
  function bulletProblems(after, b, master) {
    const out = [];
    const nb = numbersIn(b.text).map(n => n.replace(/[$%kmx+]/g, '')), na = numbersIn(after).map(n => n.replace(/[$%kmx+]/g, ''));
    const lost = nb.filter(n => n && !na.includes(n));
    if (lost.length) out.push('drops the number' + (lost.length > 1 ? 's' : '') + ' “' + lost.join('”, “') + '”');
    const borrowed = na.filter(n => n && !nb.includes(n));
    if (borrowed.length) out.push('number “' + borrowed[0] + '” isn’t in this bullet');
    const kept = overlap(b.text, after);
    if (kept < 0.6) {
      const B = new Set(contentWords(after));
      const missing = Array.from(new Set(tokens(b.text).filter(w => w.length > 2 && !COMMON.has(lc(w)) && !STOP.has(lc(w)) && !B.has(stem(lc(w)))))).slice(0, 4);
      out.push('drops facts from the original (' + missing.map(w => '“' + w + '”').join(', ') + ')');
    }
    for (const o of master.blocks) {
      if (o.id === b.id || o.type !== 'bullet') continue;
      if (overlap(after, o.text) >= 0.7 && overlap(after, o.text) > overlap(after, b.text)) { out.push('repeats another bullet (“' + o.text.slice(0, 50) + '…”)'); break; }
    }
    return out;
  }

  function skillItems(text) {
    const body = String(text).includes(':') ? String(text).split(':').slice(1).join(':') : String(text);
    // split on commas/semicolons that are not inside parentheses
    const items = []; let depth = 0, cur = '';
    for (const ch of body) {
      if (ch === '(') depth++; if (ch === ')') depth = Math.max(0, depth - 1);
      if ((ch === ',' || ch === ';') && !depth) { items.push(cur); cur = ''; } else cur += ch;
    }
    items.push(cur);
    return items.map(s => s.trim().toLowerCase().replace(/\.$/, '')).filter(Boolean);
  }
  const labelOf = t => (String(t).includes(':') ? String(t).split(':')[0].trim() : '');

  function britishWords(s) { return tokens(s).filter(w => BRITISH[lc(w)]); }
  function toUS(s) { return String(s).replace(/[A-Za-z]+/g, w => { const r = BRITISH[lc(w)]; if (!r) return w; return w[0] === w[0].toUpperCase() ? r[0].toUpperCase() + r.slice(1) : r; }); }

  /* Turn the raw model JSON into a validated change list. */
  function validate(raw, master, rules) {
    const R = parseRules(rules);
    const byId = new Map(master.blocks.map(b => [b.id, b]));
    const text = master.blocks.map(b => b.text).join('\n');
    const changes = [];
    const arr = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []);
    const push = c => { c.cid = 'c' + (changes.length + 1); c.accepted = c.ok; changes.push(c); };
    const protectedGroup = b => R.protect.find(p => lc(groupHeader(master.blocks, b.group)).includes(lc(p)) || (lc(p) === 'summary' && b.section === 'summary') || (lc(p) === 'skills' && b.section === 'skills'));
    const items = [].concat(arr(raw && raw.summary).map(x => Object.assign({ k: 'summary' }, x)), arr(raw && raw.skills).map(x => Object.assign({ k: 'skills' }, x)), arr(raw && raw.bullets).map(x => Object.assign({ k: 'bullet' }, x)));
    const seen = new Set();
    for (const it of items) {
      let id = String(it.id || '').replace(/[^\w]/g, '');
      let b = byId.get(id);
      let after = String(it.text || it.after || '').replace(/^[•\-–*]\s*/, '').trim();
      if (!b || !after) continue;
      // small models often put a rewrite under the id of the line above/below: re-attach it to the
      // bullet it actually rewrites (same job only)
      let remapped = false;
      if (it.k === 'bullet' && b.type === 'bullet') {
        let best = b, bestScore = overlap(after, b.text);
        for (const o of master.blocks) if (o.type === 'bullet' && o.group === b.group && o.id !== b.id) { const sc = overlap(after, o.text); if (sc > bestScore) { best = o; bestScore = sc; } }
        if (best !== b && bestScore >= 0.6 && bestScore > overlap(after, b.text) + 0.15) { b = best; id = best.id; remapped = true; }
      }
      if (seen.has(id)) continue;
      seen.add(id);
      if (R.usSpelling) after = toUS(after);
      const c = { kind: 'rewrite', id, section: kindOf(b), before: b.text, after, why: String(it.why || it.reason || '').slice(0, 160), ok: true, problems: [] };
      if (!EDITABLE(b)) { c.ok = false; c.problems.push('that line can’t be changed (titles, companies, dates and contact details stay as they are)'); }
      if (lc(after) === lc(b.text) || lc(after).replace(/[^a-z0-9]/g, '') === lc(b.text).replace(/[^a-z0-9]/g, '')) continue;
      if (remapped) c.problems.push('note: the AI gave this under another line’s id; matched to the bullet it rewrites');
      if (/\t/.test(b.text)) { c.ok = false; c.problems.push('line has tab-aligned parts'); }
      if (c.section === 'skills') {
        const A = skillItems(after), B = skillItems(b.text);
        const extra = A.filter(x => !B.includes(x)), missing = B.filter(x => !A.includes(x));
        if (extra.length) { c.ok = false; c.problems.push('adds skills that aren’t in this line: ' + extra.slice(0, 4).join(', ')); }
        if (missing.length) { c.ok = false; c.problems.push('drops skills: ' + missing.slice(0, 4).join(', ')); }
        if (labelOf(after) !== labelOf(b.text)) { c.ok = false; c.problems.push('changes the line label'); }
        c.kind = 'reorder-skills';
      } else {
        // a bullet may only use facts from its own job/project; the summary may use the whole resume
        const scope = c.section === 'summary' || !b.group ? text : master.blocks.filter(x => x.group === b.group).map(x => x.text).join('\n');
        newFacts(after, b.text, scope).filter(p => c.section === 'summary' || !/^new number/.test(p)).forEach(p => { c.ok = false; c.problems.push(c.section === 'summary' || !b.group ? p : p.replace('is not in your resume', 'isn’t part of this job in your resume')); });
        if (c.section !== 'summary') {
          bulletProblems(after, b, master).forEach(p => { c.ok = false; c.problems.push(p); });
          const B = new Set(contentWords(after));
          const left = Array.from(new Set(tokens(b.text).filter(w => w.length > 3 && !COMMON.has(lc(w)) && !STOP.has(lc(w)) && !B.has(stem(lc(w))))));
          if (c.ok && left.length >= 3) c.problems.push('note: leaves out ' + left.slice(0, 5).map(w => '“' + w + '”').join(', ') + (left.length > 5 ? '…' : ''));
        }
        if (after.length > b.text.length * 1.25 + 40) { c.ok = false; c.problems.push('much longer than the original'); }
        if (after.length < b.text.length * 0.45) { c.ok = false; c.problems.push('drops too much of the original'); }
      }
      const fb = R.forbidden.find(w => lc(after).includes(lc(w)));
      if (fb) { c.ok = false; c.problems.push('uses “' + fb + '” (your rule)'); }
      const pg = protectedGroup(b);
      if (pg) { c.ok = false; c.problems.push('your rule protects the ' + pg + ' lines'); }
      if (!R.usSpelling && britishWords(after).length && !britishWords(b.text).length && !britishWords(text).length) c.problems.push('note: British spelling');
      push(c);
    }
    for (const o of arr(raw && raw.order)) {
      const group = String(o.group || '').replace(/[^\w]/g, '');
      const ids = arr(o.ids).map(x => String(x).replace(/[^\w]/g, ''));
      const current = master.blocks.filter(b => b.group === group && b.type === 'bullet').map(b => b.id);
      if (!current.length) continue;
      const c = { kind: 'reorder', group, header: groupHeader(master.blocks, group), beforeIds: current, afterIds: ids, ok: true, problems: [] };
      const same = ids.length === current.length && ids.every(x => current.includes(x)) && new Set(ids).size === ids.length;
      if (!same) {
        // allow "move these to the top" answers: listed ids first, the rest keep their order
        const listed = ids.filter(x => current.includes(x));
        if (!listed.length) continue;
        c.afterIds = Array.from(new Set(listed.concat(current)));
      }
      if (c.afterIds.join() === current.join()) continue;
      const pg = protectedGroup(byId.get(current[0]));
      if (pg) { c.ok = false; c.problems.push('your rule protects the ' + pg + ' lines'); }
      c.before = current.map(x => byId.get(x).text); c.after = c.afterIds.map(x => byId.get(x).text);
      push(c);
    }
    return { changes, rules: R };
  }

  /* Apply accepted changes -> new block list (same ids, same structure). */
  function apply(master, changes) {
    const blocks = master.blocks.map(b => Object.assign({}, b));
    const byId = new Map(blocks.map(b => [b.id, b]));
    for (const c of changes) {
      if (!c.accepted) continue;
      if (c.kind === 'rewrite' || c.kind === 'reorder-skills') { const b = byId.get(c.id); if (b) { b.text = c.after; b.changed = true; } }
    }
    let out = blocks;
    for (const c of changes) {
      if (!c.accepted || c.kind !== 'reorder') continue;
      const idx = out.map((b, i) => (b.group === c.group && b.type === 'bullet' ? i : -1)).filter(i => i >= 0);
      const moved = c.afterIds.map(id => out.find(b => b.id === id)).filter(Boolean);
      if (moved.length !== idx.length) continue;
      out = out.slice();
      idx.forEach((pos, k) => { out[pos] = Object.assign({}, moved[k], { moved: moved[k].id !== out[pos].id || moved[k].moved }); });
    }
    return Object.assign({}, master, { blocks: out, text: out.map(b => (b.type === 'bullet' ? '• ' : '') + b.text).join('\n') });
  }

  /* Rules checkable on the final document. */
  function checkOutput(tailored, rules, pages) {
    const R = parseRules(rules);
    const res = [];
    for (const n of R.notes) {
      if (n.check === 'pages') res.push({ rule: n.rule, ok: pages ? pages <= R.pages : null, detail: pages ? `${pages} page${pages > 1 ? 's' : ''}` : 'page count unknown' });
      else if (n.check === 'forbidden') { const hit = R.forbidden.filter(w => lc(tailored.text).includes(lc(w))); res.push({ rule: n.rule, ok: !hit.length, detail: hit.length ? 'found: ' + hit.join(', ') + ' (also in your master resume?)' : 'not used' }); }
      else if (n.check === 'spelling') { const b = britishWords(tailored.text); res.push({ rule: n.rule, ok: !b.length, detail: b.length ? 'British spelling: ' + Array.from(new Set(b)).join(', ') : 'US spelling' }); }
      else if (n.check === 'protect' || n.check === 'titles') res.push({ rule: n.rule, ok: true, detail: 'enforced (those lines were not changed)' });
      else if (n.check === 'keep') res.push({ rule: n.rule, ok: true, detail: 'enforced (tailoring never deletes lines; rewrites keep their facts)' });
      else res.push({ rule: n.rule, ok: null, detail: 'given to the AI (not automatically checkable)' });
    }
    return res;
  }

  /* ---------- file names: "First Last - Company - Exact Job Title" (no location) ---------- */
  const LOC_WORDS = /\b(remote|hybrid|on-?site|onsite|in-office|usa?|u\.s\.a?\.?|united states|uk|u\.k\.|united kingdom|canada|emea|apac|latam|americas|europe|nyc|sf|bay area|new york|san francisco|seattle|austin|boston|chicago|london|berlin|paris|dublin|toronto|amsterdam|tokyo|singapore|sydney|bangalore|bengaluru|nashville|denver|atlanta|los angeles|washington|anywhere|worldwide|global|north america|[a-z]+,\s?[A-Z]{2})\b/i;
  function stripLocation(title) {
    let t = String(title || '').replace(/\s+/g, ' ').trim();
    for (let k = 0; k < 3; k++) {
      const before = t;
      t = t.replace(/\s*[([]([^)\]]*)[)\]]\s*$/, (m, inner) => (LOC_WORDS.test(inner) ? '' : m));
      t = t.replace(/\s*(?:[-–—|,@]|\bin\b)\s*([^-–—|,@]+(?:,\s*[^-–—|,@]+)?)$/, (m, tail) => (LOC_WORDS.test(tail) && tail.split(' ').length <= 5 ? '' : m));
      if (t === before) break;
    }
    return t.trim();
  }
  function safeName(s) { return String(s || '').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').replace(/[. ]+$/, '').trim().slice(0, 90); }
  function fileBase(profile, company, title) {
    const person = safeName([profile && profile.firstName, profile && profile.lastName].filter(Boolean).join(' ')) || 'Resume';
    const parts = [person, safeName(company), safeName(stripLocation(title))].filter(Boolean);
    return parts.join(' - ');
  }

  const api = { buildPrompt, validate, apply, parseRules, checkOutput, newFacts, bulletProblems, contentWords, skillItems, stripLocation, fileBase, safeName, EDITABLE, toUS, groupHeader };
  JAA.tailor = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : this);
