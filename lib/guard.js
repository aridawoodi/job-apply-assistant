/* v0.6.8 answer guard: before an AI-written answer goes into a form, every number, percentage, year,
 * employer, school, tool or other proper noun in it must appear in the candidate's own data (profile,
 * resume text, saved answers) or in the question / job being applied to. Unsupported sentences are removed
 * from long answers; what can't be removed cleanly is retried once with a stricter prompt and, if still
 * there, flagged "Check this" with the exact claim. Pure functions: runs in the background and in Node. */
(function (g) {
  'use strict';
  const JAA = g.JAA = g.JAA || {};
  const lc = s => String(s || '').toLowerCase();
  // capitalised words that are ordinary in an answer and say nothing about the candidate
  const ORDINARY = new Set(('i im ive id ill me my mine we our us you your they their he she it its the a an and or but if so as at by for from in into of on to with ' +
    'dear hello hi thanks thank sincerely regards best yes no not none n/a na ok okay ' +
    'monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december ' +
    'jan feb mar apr jun jul aug sep sept oct nov dec spring summer fall autumn winter ' +
    'english us usa u.s. america american remote hybrid onsite on-site').split(/\s+/));
  // words that often start a sentence in an answer (only matters for short list-like answers, see claims())
  const STARTERS = new Set(('about above absolutely across after again all also although always am an any anything are around as at because been before being both but by can could currently daily definitely did do does during each early either every everything excellent extensive few first for from full generally good great happy have having he her here his how however i if in including into is it its just last least less like many may me mid more most mostly much my myself never no none not nothing now of often on once one only or other our over part past per perhaps plenty primarily probably professional quite rarely recently regularly several she should since so some sometimes strong sure that the their them then there these they this those through throughout to today under until up usually very was we well were what when where which while who why will with within would yes yet you your').split(' '));
  const SENT_SPLIT = /(?<=[.!?])\s+(?=[A-Z0-9“"(])|\n+/;
  const NUM_RE = /(?:[$£€]\s?)?\d[\d,]*(?:\.\d+)?\s?(?:%|percent\b|k\b|m\b|x\b|\+)?/gi;
  const normNum = n => lc(n).replace(/[$£€,\s]/g, '').replace(/percent$/, '%').replace(/\.$/, '');
  const bareNum = n => normNum(n).replace(/[%kmx+]+$/g, '');

  // every number in the candidate's own text, as whole numbers (so "5" is not "in" "2015")
  function numberSet(text) {
    const out = new Set();
    for (const m of String(text || '').match(NUM_RE) || []) { const b = bareNum(m); if (b) { out.add(b); out.add(b.replace(/\.0+$/, '')); } }
    return out;
  }
  // Years of experience and similar spans the model may compute from dates (2016 → 2024 = 8 years).
  function derivedNumbers(text) {
    const years = (String(text || '').match(/\b(19[6-9]\d|20[0-4]\d)\b/g) || []).map(Number);
    const out = new Set();
    if (years.length) {
      const now = new Date().getFullYear();
      const lo = Math.min(...years), hi = Math.max(now, ...years);
      for (let n = 1; n <= hi - lo + 1; n++) out.add(String(n));
    }
    return out;
  }
  // Text the answer may draw on: the candidate's own data, the question's options, the job's company and
  // title. Not the question itself: "Do you have Salesforce experience?" doesn't make "3 years of Salesforce" true.
  function corpus(profile, extra) {
    const p = Object.assign({}, profile || {});
    delete p.eeo; delete p.pronouns; delete p.resumeMaster;
    const e = extra || {};
    const bank = (e.answerBank || []).map(x => (x && x.a) || '').join('\n');
    const now = new Date(), y = now.getFullYear(); // today's date is in the prompt ("start date: 2 weeks from today")
    return [JSON.stringify(p), p.resumeText || '', bank, (e.options || []).join('\n'), e.company || '', e.title || '', now.toISOString().slice(0, 10), y, y + 1].join('\n');
  }
  function sentences(text) { return String(text || '').split(SENT_SPLIT).map(s => s.trim()).filter(Boolean); }

  // -> [{ term, kind: 'number'|'name', jd }]  claims the candidate's data doesn't support
  function claims(text, allowed, opts) {
    opts = opts || {};
    const A = lc(allowed);
    const nums = numberSet(allowed), derived = derivedNumbers(allowed);
    const JD = lc(opts.jobDescription || '');
    const out = [], seen = new Set();
    const add = (term, kind) => { const k = lc(term); if (seen.has(k)) return; seen.add(k); out.push({ term, kind, jd: !!JD && JD.includes(k) }); };
    for (const m of String(text || '').match(NUM_RE) || []) {
      const raw = m.trim().replace(/[.,]$/, '');
      const b = bareNum(raw);
      if (!b || nums.has(b) || nums.has(b.replace(/\.0+$/, ''))) continue;
      const isPct = /%|percent/i.test(raw), isMoney = /^[$£€]/.test(raw);
      // a small whole number of years computed from the candidate's dates is fine ("8 years of experience")
      if (!isPct && !isMoney && /^\d{1,2}$/.test(b) && derived.has(b)) continue;
      add(raw, 'number');
    }
    // proper nouns, acronyms and technical terms (CamelCase, C#, Node.js) — same idea as the tailoring check
    const words = String(text || '').split(/(?<=[.!?:;])\s+|\s+/);
    const shortAnswer = words.length <= 8;
    const capNext = k => k + 1 < words.length && !/[.!?:;,]$/.test(words[k]) && /^[A-Z]/.test(words[k + 1]);
    let start = true;
    for (let i = 0; i < words.length; i++) {
      const w0 = words[i];
      const w = w0.replace(/^[("'“‘[]+|[)"'”’\],.;:!?]+$/g, '').replace(/['’]s$/, '');
      const atStart = start; start = /[.!?:;]$/.test(w0) || /\n/.test(w0);
      if (!w || /^\d/.test(w) || w.length < 2) continue;
      const technical = /[A-Z].*[A-Z]|[0-9+#]|\.[a-z]/.test(w.slice(1)) || /^[A-Z]{2,}/.test(w);
      // a capitalised first word counts when it starts a name ("Salesforce Service Cloud …") or the answer is a
      // short list ("Kubernetes on Azure"); otherwise it's just the start of a sentence
      const proper = /^[A-Z]/.test(w) && (!atStart || technical || capNext(i) || (shortAnswer && !STARTERS.has(lc(w)) && !/(ing|ly|ed)$/.test(lc(w))));
      if (!(technical || proper)) continue;
      if (ORDINARY.has(lc(w))) continue;
      // join a run of capitalised words into one name ("Harbor Cloud", "Lakeview State University")
      let name = w, j = i;
      while (j + 1 < words.length && !/[.!?:;,]$/.test(words[j]) && /^[A-Z][\w&.+#-]*$/.test(words[j + 1].replace(/[)"'”’\],.;:!?]+$/g, '').replace(/['’]s$/, ''))) {
        j++; name += ' ' + words[j].replace(/[)"'”’\],.;:!?]+$/g, '').replace(/['’]s$/, '');
      }
      const parts = name.split(' ').filter(x => !ORDINARY.has(lc(x)));
      const known = x => A.includes(lc(x)) || A.includes(lc(x).replace(/s$/, ''));
      if (known(name) || (parts.length && parts.every(known))) { i = j; start = /[.!?:;]$/.test(words[j]); continue; }
      add(parts.filter(x => !known(x)).join(' ') || name, 'name');
      i = j; start = /[.!?:;]$/.test(words[j]);
    }
    return out;
  }

  // the candidate's own lines (resume text + job bullets) that an answer draws on, best first
  function sources(text, profile, max) {
    const T = JAA.tailor;
    if (!T || !T.contentWords) return [];
    const p = profile || {};
    const lines = String(p.resumeText || '').split(/\n+/).map(s => s.replace(/^[•\-–*]\s*/, '').trim()).filter(s => s.length > 12);
    for (const j of p.workHistory || []) for (const b of j.bullets || []) lines.push(String(b).replace(/^[•\-–*]\s*/, '').trim());
    const A = new Set(T.contentWords(text));
    const seen = new Set();
    return lines.map(l => ({ l, s: T.contentWords(l).filter(w => A.has(w)).length }))
      .filter(x => x.s >= 2 && !seen.has(lc(x.l)) && seen.add(lc(x.l)))
      .sort((a, b) => b.s - a.s).slice(0, max || 2).map(x => x.l.slice(0, 200));
  }

  // Remove the sentences that carry unsupported claims; only if enough of the answer is left.
  function strip(text, bad) {
    const ss = sentences(text);
    if (ss.length < 2) return null;
    const hit = s => bad.some(c => lc(s).includes(lc(c.term)));
    const keep = ss.filter(s => !hit(s));
    const kept = keep.join(' ').length, all = ss.join(' ').length;
    if (!keep.length || keep.length === ss.length || kept < all * 0.5 || kept < 60) return null;
    return { text: keep.join(' '), removed: ss.filter(hit) };
  }

  // -> { text, removed:[terms], flagged:[{term,why}], retry:bool, sources:[lines] }
  // essay: long free text (sentences can be removed). Terms that only come from the job description are
  // flagged (fine to mention the job's needs, not to claim them), never removed.
  function review(answer, ctx) {
    ctx = ctx || {};
    const text = String(answer == null ? '' : answer).trim();
    const out = { text, removed: [], removedSentences: [], flagged: [], retry: false, sources: [] };
    if (!text) return out;
    const allowed = ctx.allowed != null ? ctx.allowed : corpus(ctx.profile, ctx);
    const why = c => c.kind === 'number' ? `“${c.term}” isn't in your resume or profile` : (c.jd ? `“${c.term}” is from the job description, not your resume` : `“${c.term}” isn't in your resume or profile`);
    let cs = claims(text, allowed, ctx);
    const hard = cs.filter(c => !c.jd || c.kind === 'number');
    if (hard.length && ctx.essay) {
      const s = strip(text, hard);
      if (s) {
        out.text = s.text; out.removed = hard.map(c => c.term); out.removedSentences = s.removed;
        cs = claims(out.text, allowed, ctx);
      } else if (!ctx.final) {
        out.retry = true;
      }
    } else if (hard.length && !ctx.final) {
      out.retry = true;
    }
    out.flagged = cs.map(c => ({ term: c.term, why: why(c) }));
    out.sources = sources(out.text, ctx.profile);
    return out;
  }
  // extra instruction for the one stricter retry
  function strictNote(terms) {
    const list = (terms || []).slice(0, 8).map(t => `"${t}"`).join(', ');
    return 'STRICT: a previous draft claimed ' + list + ', which are NOT in the candidate\'s resume or profile. ' +
      'Do not mention them, and do not add any other number, percentage, employer, school, tool or date that is not written in the facts. ' +
      'If the facts are thin, write less rather than invent.';
  }
  const api = { claims, review, sources, strip, corpus, strictNote, sentences, numberSet };
  JAA.guard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
