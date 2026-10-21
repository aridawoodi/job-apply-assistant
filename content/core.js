/* Core form logic shared by every site adapter:
 *   collect()  - find fillable fields + their question labels
 *   resolve()  - deterministic answer from profile rules / answer bank
 *   fill()     - write a value into a field the way a person would (React-safe events)
 * Nothing in here ever clicks a submit button. */
(function () {
  'use strict';
  if (window.__JAA_CORE__) return;
  window.__JAA_CORE__ = true;
  const JAA = window.JAA = window.JAA || {};

  /* ---------------- text helpers ---------------- */
  const STOP = new Set('a an the of to in on for and or is are you your do does did be been have has with at by this that as from we our us please any if will would can could which what'.split(' '));
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[\u2018\u2019']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function tokens(s) { return norm(s).split(' ').filter(t => t.length > 1 && !STOP.has(t)); }
  function similarity(a, b) {
    const A = new Set(tokens(a)), B = new Set(tokens(b));
    if (!A.size || !B.size) return 0;
    let inter = 0;
    A.forEach(t => { if (B.has(t)) inter++; });
    const jacc = inter / (A.size + B.size - inter);
    // containment only counts when at least two meaningful words overlap
    const contain = inter >= 2 ? inter / Math.min(A.size, B.size) : 0;
    return Math.max(jacc, contain * 0.85);
  }
  function cleanLabel(s) {
    return String(s || '').replace(/\s+/g, ' ').replace(/[\u2731\u2217*]+/g, ' ').replace(/\s+/g, ' ').replace(/\(required\)/ig, '').replace(/\s*\*\s*/g, ' ').trim().slice(0, 400);
  }
  const textOf = el => (el ? (el.innerText || el.textContent || '') : '').replace(/\s+/g, ' ').trim();
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---------------- DOM helpers ---------------- */
  function isVisible(el) {
    if (!el || !el.getClientRects || !el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }
  const CONTROL_SEL = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]), textarea, select';
  function esc(id) { return (window.CSS && CSS.escape) ? CSS.escape(id) : id.replace(/"/g, '\\"'); }
  function ownerDoc(el) { return el.ownerDocument || document; }

  function labelById(el) {
    const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    const t = ids.map(id => textOf(ownerDoc(el).getElementById(id))).filter(Boolean).join(' ');
    if (t) return t;
    if (el.id) {
      const l = ownerDoc(el).querySelector(`label[for="${esc(el.id)}"]`);
      if (l && textOf(l)) return textOf(l);
    }
    return '';
  }

  // Text of a <label> that wraps its control, without the control's own option/value text.
  function labelTextWithoutControls(label) {
    const c = label.cloneNode(true);
    c.querySelectorAll('select, textarea, input, [role="listbox"], option').forEach(x => x.remove());
    return (c.textContent || '').replace(/\s+/g, ' ').trim();
  }

  // Climb ancestors until we reach a container whose text (minus option text) names the question.
  function climbLabel(startEl, ownControls, excludeTexts) {
    let node = startEl.parentElement;
    for (let depth = 0; node && depth < 7; depth++, node = node.parentElement) {
      const controls = Array.from(node.querySelectorAll(CONTROL_SEL));
      if (controls.some(c => !ownControls.includes(c))) break; // container now holds other questions
      const legend = node.querySelector(':scope > legend, :scope > label, :scope > [class*="label" i], :scope > [class*="question" i], :scope > [class*="title" i]');
      let t = legend && !ownControls.some(c => legend.contains(c)) ? textOf(legend) : textOf(node);
      for (const x of excludeTexts) {
        if (!x) continue;
        t = t.replace(new RegExp('(^|\\s)' + x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=\\s|$)', 'g'), ' ');
      }
      t = t.replace(/\s+/g, ' ').trim();
      if (t.length > 1) return { text: t.slice(0, 400), container: node };
    }
    return { text: '', container: startEl.parentElement };
  }

  // Containers that hold exactly one question on the supported ATSs, and the element
  // inside them that carries the question text.
  const QUESTION_BOX = '.application-question, [class*="field-entry" i], [data-automation-id^="formField"], .field-wrapper, .field, fieldset, [class*="question" i], [class*="form-group" i], [class*="form-field" i], [data-test-form-element], .fb-dash-form-element, .jobs-easy-apply-form-section__grouping';
  const QUESTION_TITLE = ':scope legend, :scope .application-label, :scope [class*="question-title" i], :scope [class*="questionTitle" i], :scope [data-automation-id="formLabel"], :scope label, :scope [class*="label" i], :scope [class*="title" i]';
  function boxLabel(el, ownControls) {
    let box = el.parentElement;
    for (let d = 0; box && d < 6; d++, box = box.parentElement) {
      if (!box.matches || !box.matches(QUESTION_BOX)) continue;
      const controls = Array.from(box.querySelectorAll(CONTROL_SEL)).filter(c => c.type !== 'hidden' && c.getAttribute('aria-hidden') !== 'true');
      if (controls.some(c => !ownControls.includes(c))) return '';  // box holds other questions too
      const titles = Array.from(box.querySelectorAll(QUESTION_TITLE)).filter(x => !ownControls.some(c => x.contains(c)) && !x.closest('[role="listbox"]'));
      const tt = titles.map(textOf).find(x => x && x.length > 1);
      if (tt) return tt;
    }
    return '';
  }
  // aria-describedby / helper text: extra context for the AI and the chat (not part of the label)
  function describe(el) {
    const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    const t = ids.map(id => textOf(ownerDoc(el).getElementById(id))).filter(Boolean).join(' ');
    return t.replace(/\s+/g, ' ').trim().slice(0, 240);
  }

  function labelForControl(el, adapter) {
    if (adapter && adapter.labelFor) {
      const t = adapter.labelFor(el);
      if (t) return cleanLabel(t);
    }
    let t = labelById(el);
    if (!t) {
      const wrap = el.closest('label');
      if (wrap) t = labelTextWithoutControls(wrap);
    }
    if (!t) t = el.getAttribute('aria-label') || '';
    if (!t) t = boxLabel(el, [el]);
    if (!t) t = climbLabel(el, [el], []).text;
    if (!t) t = el.getAttribute('placeholder') || el.name || el.id || '';
    return cleanLabel(t);
  }

  function groupLabel(els) {
    const first = els[0];
    const fs = first.closest('fieldset');
    if (fs) {
      const lg = fs.querySelector('legend');
      if (lg && textOf(lg)) return { text: cleanLabel(textOf(lg)), container: fs };
    }
    const rg = first.closest('[role="radiogroup"], [role="group"]');
    if (rg) {
      const t = labelById(rg) || rg.getAttribute('aria-label');
      if (t) return { text: cleanLabel(t), container: rg };
    }
    const bt = boxLabel(first, els);
    const optSet = new Set(els.map(e => norm(optionText(e))));
    if (bt && !optSet.has(norm(bt))) {
      const box = first.closest(QUESTION_BOX) || first.parentElement;
      return { text: cleanLabel(bt), container: box };
    }
    const optTexts = els.map(optionText);
    const r = climbLabel(first, els, optTexts);
    return { text: cleanLabel(r.text), container: r.container };
  }

  function optionText(el) {
    let t = labelById(el);
    if (!t) { const wrap = el.closest('label'); if (wrap) t = labelTextWithoutControls(wrap); }
    if (!t) t = el.getAttribute('aria-label') || '';
    if (!t) {
      const sib = el.nextElementSibling || (el.parentElement && el.parentElement.nextElementSibling);
      if (sib) t = textOf(sib);
    }
    if (!t) t = el.value || '';
    return t.replace(/\s+/g, ' ').trim();
  }

  function isCombobox(el) {
    if (el.tagName !== 'INPUT') return false;
    return el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete') === 'list' ||
      /select__input|react-select/.test(el.className + ' ' + (el.id || ''));
  }

  /* ---------------- collect ---------------- */
  function collect(root, adapter) {
    root = root || document;
    const fields = [];
    const seen = new Set();
    let n = 0;
    const push = f => { f.id = 'f' + (n++); if (f.el && !f.desc) f.desc = describe(f.el); fields.push(f); };
    const controls = Array.from(root.querySelectorAll(CONTROL_SEL));
    for (const el of controls) {
      if (seen.has(el) || el.disabled) continue;
      // react-select & co. render aria-hidden "requiredInput" helpers: not real questions
      if (el.getAttribute('aria-hidden') === 'true' && el.type !== 'file') { seen.add(el); continue; }
      if (adapter && adapter.ignore && adapter.ignore(el)) continue;
      const tag = el.tagName;
      const type = (el.getAttribute('type') || (tag === 'INPUT' ? 'text' : tag.toLowerCase())).toLowerCase();
      const base = { name: el.name || '', idAttr: el.id || '', required: el.required || el.getAttribute('aria-required') === 'true' };
      if (type === 'file') {
        seen.add(el);
        push(Object.assign(base, { kind: 'file', el, label: labelForControl(el, adapter), accept: el.accept || '' }));
        continue;
      }
      if (type === 'radio' || type === 'checkbox') {
        const form = el.form || root;
        let group = el.name ? Array.from(form.querySelectorAll(`input[type="${type}"][name="${esc(el.name)}"]`)) : [el];
        group = group.filter(g => !g.disabled);
        group.forEach(g => seen.add(g));
        const vis = group.some(g => isVisible(g) || isVisible(g.closest('label')) || (g.id && isVisible(ownerDoc(g).querySelector(`label[for="${esc(g.id)}"]`))));
        if (!vis) continue;
        if (type === 'checkbox' && group.length === 1) {
          const lbl = labelForControl(el, adapter);
          const gl = groupLabel(group);
          push(Object.assign(base, { kind: 'checkbox', el, label: lbl, question: gl.text && gl.text !== lbl ? gl.text : '', container: gl.container }));
        } else {
          const gl = groupLabel(group);
          push(Object.assign(base, {
            kind: type === 'radio' ? 'radio' : 'checkboxGroup', el, els: group, label: gl.text, container: gl.container,
            options: group.map(g => ({ text: optionText(g), value: g.value, el: g }))
          }));
        }
        continue;
      }
      if (!isVisible(el)) { seen.add(el); continue; }
      seen.add(el);
      if (tag === 'SELECT') {
        const options = Array.from(el.options)
          .filter(o => !o.disabled && o.value !== '' && o.text.trim() && !/^(select|choose|please select|--)/i.test(o.text.trim()))
          .map(o => ({ text: o.text.trim(), value: o.value, el: o }));
        push(Object.assign(base, { kind: 'select', el, label: labelForControl(el, adapter), options, multiple: el.multiple }));
        continue;
      }
      if (isCombobox(el)) {
        push(Object.assign(base, { kind: 'combobox', el, label: labelForControl(el, adapter) }));
        continue;
      }
      if (tag === 'TEXTAREA' || /^(text|email|tel|url|number|date|month|search)$/.test(type)) {
        if (type === 'search') continue;
        push(Object.assign(base, { kind: tag === 'TEXTAREA' ? 'textarea' : 'text', inputType: type, el, label: labelForControl(el, adapter) }));
      }
    }
    if (adapter && adapter.extraFields) adapter.extraFields(root, { push, seen, groupLabel, textOf, cleanLabel, climbLabel });
    return fields;
  }

  /* ---------------- current state ---------------- */
  function hasValue(f) {
    switch (f.kind) {
      case 'text': case 'textarea': return !!f.el.value.trim();
      case 'select': return f.el.selectedIndex > 0 || (!!f.el.value && f.options.some(o => o.value === f.el.value));
      case 'radio': case 'checkboxGroup': return f.els.some(e => e.checked);
      case 'checkbox': return f.el.checked;
      case 'file': return !!(f.el.files && f.el.files.length);
      case 'combobox': {
        const c = comboControl(f.el);
        return !!(c && c.querySelector('[class*="single-value" i], [class*="singleValue"], [class*="multi-value" i], [class*="multiValue"]')) || !!f.el.value.trim();
      }
      case 'buttons': return f.options.some(o => o.el.getAttribute('aria-pressed') === 'true' || /active|selected/i.test(o.el.className));
      case 'listbutton': return !!readValue(f);
      default: return false;
    }
  }

  function comboValue(input) {
    const c = comboControl(input);
    const sv = c && c.querySelector('[class*="single-value" i], [class*="singleValue"]');
    if (sv) return textOf(sv);
    const mv = c ? Array.from(c.querySelectorAll('[class*="multi-value__label" i], [class*="multiValue"] > div:first-child')).map(textOf) : [];
    if (mv.length) return mv.join('; ');
    if (input.dataset && input.dataset.selected) return input.dataset.selected;
    // plain ARIA comboboxes keep the chosen text in the input (react-select clears it)
    return /select__input|react-select/.test(input.className + ' ' + (input.id || '')) ? '' : (input.value || '').trim();
  }
  // Current value of a field as text (what the user would see).
  function readValue(f) {
    switch (f.kind) {
      case 'text': case 'textarea': return f.el.type === 'password' ? '' : f.el.value.trim();
      case 'select': { const o = f.el.selectedOptions && f.el.selectedOptions[0]; return o && o.value !== '' && !/^(select|choose|please select|--)/i.test(o.text.trim()) ? o.text.trim() : ''; }
      case 'radio': { const o = f.options.find(x => x.el.checked); return o ? o.text : ''; }
      case 'checkboxGroup': return f.options.filter(x => x.el.checked).map(x => x.text).join('; ');
      case 'checkbox': return f.el.checked ? 'Yes' : (f.question ? 'No' : '');
      case 'combobox': return comboValue(f.el);
      case 'buttons': { const o = f.options.find(x => x.el.getAttribute('aria-pressed') === 'true' || /active|selected|checked/i.test(x.el.className)); return o ? o.text : ''; }
      case 'listbutton': { const t = textOf(f.el); return /^(select one|select|choose|--)$/i.test(t) ? '' : t; }
      case 'file': return f.el.files && f.el.files.length ? f.el.files[0].name : '';
      default: return '';
    }
  }
  // Did the value we set actually stick? (React re-renders, masks and async lists can undo it.)
  function verify(f, shown) {
    const actual = readValue(f);
    if (f.kind === 'checkbox') return (shown === 'checked') === !!f.el.checked;
    if (!actual) return false;
    if (shown == null || shown === '') return true;
    const a = norm(actual), e = norm(shown);
    if (a === e || a.includes(e) || e.includes(a)) return true;
    const digits = x => String(x).replace(/\D/g, '');
    if (digits(shown).length >= 7 && digits(actual).endsWith(digits(shown).slice(-7))) return true;
    return similarity(actual, shown) >= 0.6;
  }

  /* ---------------- option choosing ---------------- */
  const DECLINE = /\b(don t wish|do not wish|not wish|prefer not|decline|choose not|rather not|not to (answer|say|disclose|self identify|identify)|wish to answer)\b/;
  function chooseOption(value, options, alts) {
    if (value == null || !options || !options.length) return null;
    const v = norm(value);
    const texts = options.map(o => norm(o.text));
    let i = texts.indexOf(v);
    if (i >= 0) return options[i];
    for (const re of (alts || [])) {
      i = texts.findIndex(t => re.test(t));
      if (i >= 0) return options[i];
    }
    if (v === 'yes' || v === 'true') { i = texts.findIndex(t => /^yes\b/.test(t)); if (i >= 0) return options[i]; }
    if (v === 'no' || v === 'false') { i = texts.findIndex(t => /^no\b/.test(t)); if (i >= 0) return options[i]; }
    if (DECLINE.test(v)) { i = texts.findIndex(t => DECLINE.test(t)); if (i >= 0) return options[i]; }
    if (v.length >= 3) {
      i = texts.findIndex(t => t.length >= 3 && (t.startsWith(v) || v.startsWith(t)));
      if (i >= 0) return options[i];
      i = texts.findIndex(t => t.length >= 3 && new RegExp('\\b' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(t));
      if (i >= 0) return options[i];
    }
    let best = null, bestS = 0;
    options.forEach((o, k) => { const s = similarity(value, o.text); if (s > bestS) { bestS = s; best = options[k]; } });
    return bestS >= 0.6 ? best : null;
  }

  /* ---------------- profile rules ---------------- */
  // Site wording for each race / ethnicity category. Used only to find the option for the value the user
  // saved; it never picks a category for someone who hasn't chosen one.
  const ETHNICITY_ALTS = [
    [/american indian|alaska/, /american indian|alaska native|indigenous|native american/],
    [/^asian/, /^asian\b/],
    [/black|african american/, /black|african american/],
    [/hispanic|latin/, /hispanic|latin[oax]/],
    [/middle eastern|north african|mena|swana/, /middle eastern|north african|\bmena\b|\bswana\b/],
    [/hawaiian|pacific islander/, /hawaiian|pacific islander/],
    [/^white/, /^white\b/],
    [/two or more|multiracial|mixed/, /two or more|multiracial|multi racial|mixed/]
  ];
  const yesAlt = [/^yes\b/], noAlt = [/^no\b/];
  const NON_US = /\b(canada|canadian|uk|united kingdom|britain|british|england|scotland|europe|european|eu|germany|german|india|indian|australia|australian|ireland|irish|mexico|mexican|brazil|france|french|spain|netherlands|dutch|singapore|singaporean|japan|japanese|israel|poland|philippines|ontario|quebec|london|china|chinese|hong kong|taiwan|korea|korean|switzerland|swiss|sweden|norway|denmark|finland|italy|portugal|belgium|austria|new zealand|uae|emirates|dubai|saudi|qatar|iraq|iraqi|turkey|egypt|nigeria|kenya|south africa|argentina|chile|colombia|peru|vietnam|thailand|malaysia|indonesia|pakistan|bangladesh|romania|czech|hungary|greece|ukraine|russia|costa rica|puerto rico|apac|emea|latam)\b/;
  const foreign = L => NON_US.test(L) && !US.test(L);
  const US = /\b(united states|us|u s|usa|america|american)\b/;
  const today = (f) => {
    const d = new Date();
    const p = x => String(x).padStart(2, '0');
    return f && f.inputType === 'date' ? `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` : `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`;
  };
  const hasYesNo = f => (f.options || []).some(o => /^(yes|no)\b/.test(norm(o.text)));

  // [key, label regex, value(profile, field), flags]. Order matters: specific before general.
  // flags.short: only when the label is short (avoids "...please share your email" in long custom questions)
  // flags.noLLM: if the profile value is empty, leave it for the user instead of asking the model.
  const RULES = [
    ['consent', /\b(consent|i agree|agree to|acknowledge|terms (and|&) conditions|privacy (policy|notice)|arbitrat\w*|text messages?|sms|ai policy|attest\w*|certif(y|ication))\b/, () => null, { never: true, why: 'Consent / agreement: read it and answer yourself.' }],
    ['botCheck', /\b(not a bot|auto ?apply|auto ?applying|encoded|decode|secret)\b/, () => null, { never: true, why: 'Anti-bot / skills check: answer this one yourself.' }],
    ['personal', /\b(pet|pets|dog s|cat s|spouse|wife|husband|children|kids|religio\w*|political)\b/, () => null, { never: true, why: 'Personal question unrelated to the job: answer it yourself (never stored).' }],
    ['ssn/dob', /\b(social security|ssn|date of birth|birth ?date|dob)\b/, () => null, { noLLM: true, never: true }],
    ['salary', /\b(salary|compensation|pay (expectation|range|requirement)|desired pay|expected pay|rate expectation)\b/, p => p.salaryExpectation, { noLLM: true }],
    ['preferredName', /\b(preferred (first )?name|nick ?name|goes by|like us to call you)\b/, p => p.preferredName || p.firstName],
    ['namePronunciation', /\bpronounc/, () => '', { noLLM: true }],
    ['firstName', /\b(first name|given name|legal first|firstname|first_name)\b/, p => p.firstName, { short: true }],
    ['lastName', /\b(last name|surname|family name|legal last|lastname|last_name)\b/, p => p.lastName, { short: true }],
    ['fullName', /^(full |legal |your )?name( full)?$|^(full|legal) name\b/, p => [p.firstName, p.lastName].filter(Boolean).join(' '), { short: true }],
    ['email', /\be ?mail\b|\bemail address\b/, p => p.email, { short: true }],
    ['phone', /\b(phone|mobile|cell|telephone)\b/, p => p.phone, { short: true, noLLM: true }],
    ['linkedin', /\blinked ?in\b/, p => p.linkedin, { short: true, noLLM: true }],
    ['github', /\bgit ?hub\b/, p => p.github, { short: true, noLLM: true }],
    ['portfolio', /\b(portfolio|personal (web ?site|site)|web ?site|blog)\b/, p => p.portfolio || p.website, { short: true, noLLM: true }],
    ['twitter', /\b(twitter|x com)\b/, () => '', { short: true, noLLM: true }],
    ['pronouns', /\bpronoun/, p => p.pronouns, { short: true, noLLM: true, eeo: true }],
    ['zip', /\b(zip|postal)( code)?\b/, p => p.zip, { short: true, noLLM: true }],
    ['city', /^(current )?city\b/, p => p.city, { short: true, noLLM: true }],
    ['state', /^(state|province|state province|region)\b/, p => p.state, { short: true, noLLM: true }],
    ['country', /^(country|country of residence|current country)\b/, p => p.country, { short: true, noLLM: true }],
    ['location', /^(location|current location|your location|city state|where are you (located|based)|address|home address)\b|\bcandidate location\b/, p => p.location || [p.city, p.state].filter(Boolean).join(', '), { short: true, noLLM: true }],
    ['over18', /\b(18 years|over the age of 18|at least 18|age of majority|legal age)\b/, p => p.over18],
    ['sponsorship', /\b(sponsor|sponsorship|h ?1 ?b|visa (status|support|transfer))\b/, (p, f, L) => foreign(L) ? null : p.needsSponsorship],
    ['workAuth', /\b(authori[sz]ed to work|legally (authori[sz]ed|eligible|permitted|able)|right to work|eligible to work|work authori[sz]ation|employment eligibility|permitted to work)\b/,
      (p, f, L) => foreign(L) ? null : p.workAuthorizedUS],
    ['citizenship', /\b(citizen|citizenship|permanent resident)\b/, (p, f, L) => foreign(L) ? '' : (hasYesNo(f) || /^(are|is) you\b/.test(norm(f.label)))
      ? (/\bu\.?s\.?\b|united states|america/i.test(p.citizenship) ? 'Yes' : null) : p.citizenship],
    ['currentTitle', /\b(current (job )?title|current (role|position)|job title|^title$|most recent (job )?title)\b/, p => p.currentTitle, { short: true, noLLM: true }],
    ['currentEmployer', /\b(current (company|employer)|most recent (company|employer)|^company( name)?$|^employer$|^org(anization)?$)\b/, p => p.currentEmployer, { short: true }],
    ['eduMonth', /\b(start|end)( date)? month\b/, () => '', { short: true, noLLM: true }],
    ['eduStartYear', /\bstart( date)? year\b|\bstart year\b/, p => p.education.startYear, { short: true }],
    ['eduEndYear', /\b(end( date)? year|graduation (year|date)|year of graduation|grad year)\b/, p => p.education.endYear, { short: true }],
    ['school', /\b(school|university|college|institution)( name)?\b/, p => p.education.school],
    ['degree', /^(degree|highest (level of )?(education|degree)|education level|level of education)\b/, p => p.education.degree, { short: true }],
    ['discipline', /\b(discipline|field of study|major|area of study)\b/, p => p.education.field, { short: true }],
    ['yearsExperience', /\byears of (relevant |professional |work )?experience\b/, p => p.yearsExperience],
    ['availability', /\b(when can you start|earliest (possible )?(start|available)|available (start|to start)|start date|availability|notice period|how soon)\b/, p => p.availability || p.noticePeriod],
    ['relocate', /\brelocat/, p => p.willingToRelocate],
    ['hearAbout', /\b(how did you (hear|find|learn)|how you (heard|found|learned)|hear(d)? about|where did you (hear|find|see)|referral source|source of application)\b/, p => p.howDidYouHear],
    ['signature', /\b(signature|e ?sign|electronically sign|sign (your )?(full )?name|type your (full )?name)\b/, p => p.signature || [p.firstName, p.lastName].filter(Boolean).join(' ')],
    ['date', /^(date|today s date|todays date|signature date|date signed)$/, (p, f) => today(f)],
    // EEO (never sent to the model: if the option isn't there, the user picks it)
    ['transgender', /\btransgender\b|\btrans\b/, p => p.eeo.transgender, { eeo: true, alts: v => /^no/i.test(v) ? [/^no\b/, /\bnot transgender\b|\bcisgender\b/] : [] }],
    ['sexualOrientation', /\bsexual orientation\b/, p => p.eeo.sexualOrientation, { eeo: true }],
    ['gender', /\b(gender|sex)\b/, p => p.eeo.gender, { eeo: true, alts: v => /^male$/i.test(v) ? [/^(male|man)\b/, /\bman\b/] : (/^female$/i.test(v) ? [/^(female|woman)\b/] : []) }],
    ['hispanic', /^(?!.*\b(race|racial)\b).*(\bhispanic|latin[oax]\b)/, p => p.eeo.hispanicLatino, { eeo: true, alts: v => /^no/i.test(v) ? [/^no\b/, /\bnot hispanic\b/] : [/^yes\b/] }],
    ['ethnicity', /\b(race|ethnicity|ethnic|racial)\b/, p => p.eeo.ethnicity, { eeo: true, alts: v => ETHNICITY_ALTS.filter(([re]) => re.test(norm(v))).map(([, alt]) => alt) }],
    ['veteran', /\b(veteran|military|armed forces|protected veteran)\b/, p => p.eeo.veteran, { eeo: true, alts: v => /no|not/i.test(v) ? [/\bnot a (protected )?veteran\b/, /\bno military\b/, /\b(never|have not|did not|not) served\b/, /^no\b/, /^i am not\b/] : [] }],
    ['disability', /\bdisabilit/, p => p.eeo.disability, { eeo: true, alts: v => /^no/i.test(v) ? [/^no\b/, /\b(do not|don t) have a disability\b/] : (/^yes/i.test(v) ? [/^yes\b/] : []) }]
  ];

  function ruleFor(f) {
    const L = norm(f.label);
    const meta = norm((f.name || '') + ' ' + (f.idAttr || ''))
      .replace(/\b(job application|answers attributes|text value|question|systemfield|cards|field\d*|\d+)\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
    const short = L.split(' ').length <= 8;
    for (const [key, re, fn, flags = {}] of RULES) {
      if (L && re.test(L) && (!flags.short || short)) return { key, fn, flags, L };
    }
    if (meta) {
      for (const [key, re, fn, flags = {}] of RULES) {
        if (re.test(meta)) return { key, fn, flags, L: L || meta };
      }
    }
    return null;
  }

  // a field is voluntary self-ID if its question, description or option set says so
  function isEeoField(f) {
    if (!f) return false;
    const q = [f.label, f.question, f.desc, f.section].filter(Boolean).join(' ');
    return JAA.isEeoText(q, f.options);
  }

  function bankMatch(label, bank, min) {
    let best = null, bestS = 0;
    const lf = foreign(norm(label));
    for (const e of bank || []) {
      if (!e || !e.q || e.a == null || e.a === '') continue;
      if (lf !== foreign(norm(e.q))) continue; // "Singapore citizen?" must not reuse the "U.S. citizen?" answer
      const s = norm(e.q) === norm(label) ? 1 : similarity(label, e.q);
      if (s > bestS) { bestS = s; best = e; }
    }
    return bestS >= min ? { answer: best.a, score: bestS, q: best.q } : null;
  }

  // Tailored resume for this job, in a format the upload field accepts (PDF if it only takes PDF).
  function pickTailored(f, data, force) {
    const t = data.tailored;
    if (!t || !Array.isArray(t.files) || (!force && data.settings && data.settings.attachTailored === false)) return null;
    const pdf = t.files.find(x => /pdf/.test(x.mime)), docx = t.files.find(x => /word|officedocument/.test(x.mime));
    const accept = String((f.el && f.el.accept) || '').toLowerCase();
    const okPdf = !accept || /pdf|\*/.test(accept), okDocx = !accept || /docx|word|officedocument|\*/.test(accept);
    const pref = (data.settings && data.settings.preferredResumeFormat) || 'both';
    const order = pref === 'docx' ? [okDocx && docx, okPdf && pdf] : [okPdf && pdf, okDocx && docx];
    const pick = order.find(Boolean);
    return pick ? { name: pick.name, type: pick.mime, dataUrl: pick.dataUrl } : null;
  }

  // -> {value, source, key, alts} | {missing:key, noLLM} | {skip:reason} | null (ask model)
  function resolve(f, data) {
    const p = data.profile;
    const on = k => !JAA.fieldOn || JAA.fieldOn(data.settings, k);
    const OFF = { skip: 'Turned off in Options → Fields to fill', off: true };
    if (f.kind === 'file') {
      const L = norm(f.label + ' ' + f.name + ' ' + f.idAttr);
      if (/cover/.test(L)) return on('coverLetter') ? { skip: 'Cover letter upload: write one with the assistant (Resume tab) or attach your own.', cover: true } : OFF;
      if (/resume|cv|curriculum/.test(L) || f.isOnlyFile) {
        if (!on('resume')) return OFF;
        const t = pickTailored(f, data);
        if (t) return { value: t, source: 'rule', key: 'resume', tailored: true };
        return data.resume ? { value: data.resume, source: 'rule', key: 'resume' } : { missing: 'resume', noLLM: true };
      }
      return { skip: 'File upload: not sure what this one is for.' };
    }
    const label = f.label || '';
    if ((f.kind === 'textarea' || f.kind === 'text') && /\bcover (letter|note)\b/i.test(label) && !f.options) {
      return on('coverLetter') ? { skip: 'Cover letter: I can write one from your resume (fact-checked) — Resume tab, or the button below.', cover: true } : OFF;
    }
    const bankOn = on('bank');
    const r0 = ruleFor(f.kind === 'checkbox' && f.question ? Object.assign({}, f, { label: f.question }) : f);
    if (r0 && !r0.flags.never && !on(r0.key)) return OFF;
    // Voluntary self-ID (EEO, pronouns): only the value the user saved in their profile is used.
    // Empty = "Not set": the field stays yellow for the user. Never the answer bank, never the model,
    // never a default such as "decline".
    if ((r0 && r0.flags.eeo) || isEeoField(f)) {
      const v = r0 && r0.flags.eeo ? r0.fn(p, f, r0.L) : '';
      if (v === '' || v == null) return { missing: r0 && r0.flags.eeo ? r0.key : 'eeo', noLLM: true, eeo: true, why: 'Voluntary self-identification: not set in your profile, so it\'s yours to answer (or set it in Settings → Profile).' };
      return { value: v, source: 'rule', key: r0.key, alts: r0.flags.alts ? r0.flags.alts(String(v)) : [], eeo: true };
    }
    const strong = bankOn && bankMatch(label, data.answerBank, 0.85);
    if (strong) return { value: strong.answer, source: 'bank', key: 'bank: ' + strong.q };
    if (f.kind === 'checkbox' && !f.question) {
      // a lone checkbox is usually a consent/terms box: leave it for the user to read
      return { skip: 'Checkbox (consent/terms?): review and tick it yourself.' };
    }
    const r = r0;
    if (r) {
      if (r.flags.never) return { skip: r.flags.why || 'Sensitive (SSN / date of birth): fill this yourself.' };
      const v = r.fn(p, f, r.L);
      if (v === '' || v === undefined) return { missing: r.key, noLLM: true }; // not in profile: the user fills it
      if (v !== null) {
        return { value: v, source: 'rule', key: r.key, alts: r.flags.alts ? r.flags.alts(String(v)) : [], eeo: !!r.flags.eeo };
      }
      // v === null: the rule chose not to answer (e.g. non-US work authorization); fall through
    }
    const weak = bankOn && bankMatch(label, data.answerBank, 0.6);
    if (weak) return { value: weak.answer, source: 'bank', key: 'bank: ' + weak.q };
    return null;
  }

  /* ---------------- fill ---------------- */
  function fire(el, type, init) {
    const Ev = /^(focus|blur|focusin|focusout)$/.test(type) ? FocusEvent : (/^key/.test(type) ? KeyboardEvent : (/^mouse|click/.test(type) ? MouseEvent : Event));
    el.dispatchEvent(new Ev(type, Object.assign({ bubbles: true, cancelable: true }, init || {})));
  }
  function setNativeValue(el, v) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    desc.set.call(el, v);
  }
  function typeInto(el, v) {
    try { el.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
    fire(el, 'focusin');
    setNativeValue(el, v);
    fire(el, 'input');
    fire(el, 'change');
  }
  function leave(el) { fire(el, 'focusout'); fire(el, 'blur', { bubbles: false }); try { el.blur(); } catch (_) { /* ignore */ } }

  const SUBMITTY = /\b(submit|apply|send|finish|complete application|review application|next|continue)\b/i;
  // Only ever used on answer options (Yes/No buttons, dropdown options, radios, checkboxes).
  function safeClick(el) {
    const txt = textOf(el) || el.value || '';
    const isBtn = el.tagName === 'BUTTON' || (el.tagName === 'INPUT' && /submit|button|image/.test(el.type));
    if (isBtn && SUBMITTY.test(txt)) throw new Error('Refusing to click "' + txt + '"');
    el.click();
  }
  // While filling, swallow any form submit that our clicks could trigger by accident.
  // The guard is only armed while an autofill run is in progress, and is disarmed
  // synchronously when it ends, so the user's own Submit afterwards is never blocked.
  let filling = false;
  // the user's own input on the page (not in our panel): a submit right after it is theirs, never ours.
  let lastUserInput = 0;
  const noteUser = e => { if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return; if (e.isTrusted && !(e.target && e.target.closest && e.target.closest('#jaa-host'))) lastUserInput = Date.now(); };
  ['pointerdown', 'mousedown', 'keydown', 'touchstart'].forEach(t => window.addEventListener(t, noteUser, true));
  const blocker = e => {
    if (!filling) return;
    if (Date.now() - lastUserInput < 1500) return; // the user pressed Submit: let it through
    e.preventDefault(); e.stopImmediatePropagation();
    console.warn('[Job Apply Assistant] blocked a form submit during autofill');
  };
  function blockSubmits(on) {
    filling = !!on;
    if (on) window.addEventListener('submit', blocker, true);
    else window.removeEventListener('submit', blocker, true);
  }
  const isFilling = () => filling;

  function comboControl(input) {
    return input.closest('[class*="select__control"], [class*="-control"], [class*="control" i]') || input.closest('[role="combobox"]') || input.parentElement;
  }
  function listOptions(input) {
    const doc = ownerDoc(input);
    const ids = ((input.getAttribute('aria-controls') || '') + ' ' + (input.getAttribute('aria-owns') || '')).split(/\s+/).filter(Boolean);
    let opts = [];
    for (const id of ids) {
      const lb = doc.getElementById(id);
      if (lb) opts = opts.concat(Array.from(lb.querySelectorAll('[role="option"]')));
    }
    if (!opts.length) {
      const scope = input.closest('[class*="select__container"], [class*="select-container"], .select, [class*="container"]') || doc;
      opts = Array.from(scope.querySelectorAll('[role="option"], [class*="select__option"], [class*="-option"]'));
      if (!opts.length) opts = Array.from(doc.querySelectorAll('[role="listbox"] [role="option"]'));
    }
    return opts.filter(isVisible).filter(o => !/no options|loading/i.test(textOf(o))).map(o => ({ text: textOf(o), el: o }));
  }
  async function waitOptions(input, ms) {
    const t0 = Date.now();
    let opts = [];
    while (Date.now() - t0 < ms) {
      opts = listOptions(input);
      if (opts.length) return opts;
      await sleep(120);
    }
    return opts;
  }
  async function fillCombobox(f, value, alts) {
    const input = f.el;
    const ctl = comboControl(input);
    // 1) open the full menu and pick from all options
    try { input.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
    // Greenhouse's react-select only opens after the matching *up* event, so send pairs.
    if (ctl) { fire(ctl, 'mousedown', { button: 0 }); fire(ctl, 'mouseup', { button: 0 }); }
    let opts = await waitOptions(input, 500);
    if (!opts.length) {
      fire(input, 'keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 });
      fire(input, 'keyup', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 });
      opts = await waitOptions(input, 600);
    }
    let pick = chooseOption(value, opts, alts);
    if (!pick) {
      // 2) type to search (async lists like school / location)
      typeInto(input, String(value).slice(0, 60));
      fire(input, 'keyup', { key: 'a', code: 'KeyA', keyCode: 65 });
      opts = await waitOptions(input, 2500);
      await sleep(250);
      opts = listOptions(input).length ? listOptions(input) : opts;
      pick = chooseOption(value, opts, alts);
      if (!pick && opts.length && similarity(value, opts[0].text) >= 0.4) pick = opts[0];
    }
    if (!pick) {
      typeInto(input, '');
      fire(input, 'keydown', { key: 'Escape', code: 'Escape', keyCode: 27 });
      leave(input);
      return { ok: false, why: opts.length ? 'No matching option for "' + value + '"' : 'No options appeared' };
    }
    fire(pick.el, 'mousedown', { button: 0 });
    fire(pick.el, 'mouseup', { button: 0 });
    safeClick(pick.el);
    await sleep(150);
    if (!comboValue(input) || !verify({ kind: 'combobox', el: input }, pick.text)) {
      // some comboboxes only commit on Enter: type the option text and press Enter on it
      typeInto(input, pick.text.slice(0, 60));
      await waitOptions(input, 1200);
      fire(input, 'keydown', { key: 'Enter', code: 'Enter', keyCode: 13 });
      fire(input, 'keyup', { key: 'Enter', code: 'Enter', keyCode: 13 });
      await sleep(150);
    }
    leave(input);
    return { ok: true, shown: pick.text };
  }

  // Workday-style dropdowns: a <button aria-haspopup="listbox"> that opens a popup list.
  function popupOptions(doc) {
    return Array.from(doc.querySelectorAll('[role="listbox"] [role="option"], [data-automation-id="promptOption"], [data-automation-id="menuItem"]'))
      .filter(isVisible).map(o => ({ text: textOf(o), el: o })).filter(o => o.text);
  }
  async function fillListButton(f, value, alts) {
    const doc = ownerDoc(f.el);
    safeClick(f.el);
    let opts = [];
    for (let t = 0; t < 12 && !opts.length; t++) { await sleep(120); opts = popupOptions(doc); }
    const pick = chooseOption(value, opts, alts);
    if (!pick) { fire(f.el, 'keydown', { key: 'Escape', code: 'Escape', keyCode: 27 }); try { f.el.click(); } catch (_) { /* ignore */ } return { ok: false, why: opts.length ? 'No matching option for "' + value + '"' : 'No options appeared' }; }
    fire(pick.el, 'mousedown', { button: 0 }); fire(pick.el, 'mouseup', { button: 0 });
    safeClick(pick.el);
    await sleep(200);
    return { ok: true, shown: pick.text };
  }

  // Open a dropdown just to read its options (for chat quick-replies), then close it.
  async function peekOptions(f) {
    if (f.options && f.options.length) return f.options.map(o => o.text);
    if (f.kind !== 'combobox' && f.kind !== 'listbutton') return [];
    let opts = [];
    try {
      if (f.kind === 'listbutton') {
        safeClick(f.el);
        for (let t = 0; t < 10 && !opts.length; t++) { await sleep(120); opts = popupOptions(ownerDoc(f.el)); }
        fire(f.el, 'keydown', { key: 'Escape', code: 'Escape', keyCode: 27 });
        if (popupOptions(ownerDoc(f.el)).length) try { f.el.click(); } catch (_) { /* ignore */ }
      } else {
        const ctl = comboControl(f.el);
        try { f.el.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
        if (ctl) { fire(ctl, 'mousedown', { button: 0 }); fire(ctl, 'mouseup', { button: 0 }); }
        opts = await waitOptions(f.el, 600);
        if (!opts.length) { fire(f.el, 'keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 }); fire(f.el, 'keyup', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 }); opts = await waitOptions(f.el, 600); }
        fire(f.el, 'keydown', { key: 'Escape', code: 'Escape', keyCode: 27 });
        leave(f.el);
      }
    } catch (_) { /* ignore */ }
    return Array.from(new Set(opts.map(o => o.text))).slice(0, 60);
  }

  function dataUrlToFile(r) {
    const [meta, b64] = r.dataUrl.split(',');
    const mime = (meta.match(/data:([^;]+)/) || [])[1] || r.type || 'application/octet-stream';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], r.name || 'resume.pdf', { type: mime, lastModified: Date.now() });
  }

  async function fill(f, value, alts) {
    switch (f.kind) {
      case 'text': case 'textarea': {
        let v = Array.isArray(value) ? value.join(', ') : String(value);
        if (f.inputType === 'number') { const m = v.match(/-?\d+(\.\d+)?/); if (!m) return { ok: false, why: 'Not a number' }; v = m[0]; }
        if (f.inputType === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, why: 'Needs a date (YYYY-MM-DD)' };
        if (f.el.maxLength > 0 && v.length > f.el.maxLength) v = v.slice(0, f.el.maxLength);
        typeInto(f.el, v); leave(f.el);
        return { ok: true, shown: v };
      }
      case 'select': {
        const o = chooseOption(Array.isArray(value) ? value[0] : value, f.options, alts);
        if (!o) return { ok: false, why: 'No matching option for "' + value + '"' };
        setNativeValue(f.el, o.value);
        o.el.selected = true;
        fire(f.el, 'input'); fire(f.el, 'change'); leave(f.el);
        return { ok: true, shown: o.text };
      }
      case 'radio': case 'buttons': {
        const o = chooseOption(Array.isArray(value) ? value[0] : value, f.options, alts);
        if (!o) return { ok: false, why: 'No matching option for "' + value + '"' };
        if (f.kind === 'radio') {
          if (!o.el.checked) safeClick(o.el);
          if (!o.el.checked) { o.el.checked = true; fire(o.el, 'input'); fire(o.el, 'change'); }
        } else {
          safeClick(o.el);
        }
        return { ok: true, shown: o.text };
      }
      case 'checkboxGroup': {
        const vals = Array.isArray(value) ? value : String(value).split(/\s*[;|]\s*/);
        const picked = [];
        for (const v of vals) {
          const o = chooseOption(v, f.options, alts);
          if (o && !picked.includes(o)) picked.push(o);
        }
        if (!picked.length) return { ok: false, why: 'No matching option for "' + vals.join(', ') + '"' };
        for (const o of picked) if (!o.el.checked) safeClick(o.el);
        return { ok: true, shown: picked.map(o => o.text).join(', ') };
      }
      case 'checkbox': {
        const yes = /^(yes|true|y|1|checked|agree|i agree)$/i.test(String(value).trim());
        if (yes !== f.el.checked) safeClick(f.el);
        return { ok: true, shown: yes ? 'checked' : 'unchecked' };
      }
      case 'combobox':
        return fillCombobox(f, Array.isArray(value) ? value[0] : String(value), alts);
      case 'listbutton':
        return fillListButton(f, Array.isArray(value) ? value[0] : String(value), alts);
      case 'file': {
        const file = dataUrlToFile(value);
        const dt = new DataTransfer();
        dt.items.add(file);
        f.el.files = dt.files;
        fire(f.el, 'input'); fire(f.el, 'change');
        return { ok: true, shown: file.name };
      }
      default:
        return { ok: false, why: 'Unsupported field' };
    }
  }

  /* ---------------- highlight ---------------- */
  function ensureStyle(doc) {
    if (doc.getElementById('jaa-style')) return;
    const s = doc.createElement('style');
    s.id = 'jaa-style';
    s.textContent =
      '.jaa-ok{outline:2px solid #16a34a!important;outline-offset:2px!important;background-color:rgba(22,163,74,.07)!important}' +
      '.jaa-ai{outline:2px solid #2563eb!important;outline-offset:2px!important;background-color:rgba(37,99,235,.07)!important}' +
      '.jaa-todo{outline:2px dashed #eab308!important;outline-offset:2px!important;background-color:rgba(234,179,8,.12)!important}' +
      '.jaa-you{outline:2px solid #0d9488!important;outline-offset:2px!important;background-color:rgba(13,148,136,.08)!important}' +
      '@keyframes jaaflash{0%,100%{box-shadow:0 0 0 0 rgba(99,102,241,0)}50%{box-shadow:0 0 0 6px rgba(99,102,241,.45)}}' +
      '.jaa-flash{animation:jaaflash .6s ease-in-out 3!important}' +
      '@media (prefers-reduced-motion: reduce){.jaa-flash{animation:none!important;box-shadow:0 0 0 4px rgba(99,102,241,.45)!important}}';
    (doc.head || doc.documentElement).appendChild(s);
  }
  function highlightTarget(f) {
    if (f.kind === 'combobox') return comboControl(f.el) || f.el;
    if (f.kind === 'listbutton') return f.el;
    if (f.kind === 'radio' || f.kind === 'checkboxGroup' || f.kind === 'buttons') return f.container || f.el.parentElement;
    if (f.kind === 'checkbox') return f.el.closest('label') || f.el.parentElement;
    if (f.kind === 'file') return f.el.closest('[class*="upload" i], [class*="file" i], [class*="attach" i], .field, [class*="field" i]') || f.el.parentElement;
    return f.el;
  }
  function mark(f, cls) {
    const t = highlightTarget(f);
    if (!t) return;
    ensureStyle(ownerDoc(t));
    t.classList.remove('jaa-ok', 'jaa-ai', 'jaa-todo', 'jaa-you');
    if (cls) t.classList.add(cls);
    f.hl = t;
  }
  function clearMarks(doc) {
    (doc || document).querySelectorAll('.jaa-ok, .jaa-ai, .jaa-todo, .jaa-you').forEach(e => e.classList.remove('jaa-ok', 'jaa-ai', 'jaa-todo', 'jaa-you'));
  }
  function flash(f) {
    const t = f.hl || highlightTarget(f);
    if (!t) return;
    ensureStyle(ownerDoc(t));
    try { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) { t.scrollIntoView(); }
    t.classList.remove('jaa-flash'); void t.offsetWidth; t.classList.add('jaa-flash');
    setTimeout(() => t.classList.remove('jaa-flash'), 2200);
  }

  JAA.core = { isEeoField, pickTailored, readValue, verify, peekOptions, flash, describe, highlightTarget, comboControl, norm, similarity, cleanLabel, textOf, sleep, isVisible, collect, hasValue, chooseOption, resolve, ruleFor, bankMatch, fill, mark, clearMarks, blockSubmits, isFilling, safeClick, RULES };
})();
