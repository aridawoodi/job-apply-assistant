/* Cover letters (v0.5): prompt, fact check and document blocks. Shared by the background (prompt)
 * and the Cover letter page (check + files). Runs in Node for tests. */
(function (g) {
  'use strict';
  const JAA = g.JAA = g.JAA || {};
  const LENGTHS = { short: 'about 180 words, 3 short paragraphs', standard: 'about 280 words, 4 paragraphs', long: 'about 380 words, 4-5 paragraphs' };

  // resumeText: the master resume as plain text (copied lines, never model output)
  function buildPrompt(ctx) {
    const len = LENGTHS[ctx.length] || LENGTHS.standard;
    const system =
      'You write a cover letter for the candidate, in first person, in their own voice. Length: ' + len + '. ' +
      'Use ONLY facts from the resume text: employers, titles, dates, numbers, tools and skills must appear in it. Never invent experience, numbers, degrees or tools. ' +
      'If the job asks for something the resume does not show, do not claim it; focus on related things the candidate has really done. ' +
      'Connect 2-3 concrete resume achievements to the job\'s needs and say briefly why this company. Plain, specific and warm; no clichés like "I am writing to express my interest", no flattery, no exclamation marks. ' +
      'Do not include addresses, the date, phone, email or a signature block. ' +
      'Return JSON only: {"greeting":"Dear … ,","paragraphs":["…","…"],"closing":"Sincerely,"}.';
    const user =
      `Job: ${ctx.title || '?'} at ${ctx.company || '?'}\n` +
      (ctx.description ? `Job description:\n${String(ctx.description).slice(0, 5000)}\n` : '') +
      `Resume text:\n${String(ctx.resumeText || '').slice(0, 7000)}\n` +
      (ctx.tone ? `Tone notes from the candidate: ${String(ctx.tone).slice(0, 400)}\n` : '') +
      (ctx.samples ? `Writing samples by the candidate (copy the voice only, not the content):\n---\n${String(ctx.samples).slice(0, 1500)}\n---\n` : '') +
      (ctx.extra ? `Extra instruction from the candidate: ${String(ctx.extra).slice(0, 400)}\n` : '') +
      (ctx.previous ? `Previous version (write a clearly different, better one): ${String(ctx.previous).slice(0, 2500)}\n` : '');
    return [{ role: 'system', content: system }, { role: 'user', content: user }];
  }

  function toText(data, name) {
    if (!data) return '';
    if (typeof data === 'string') return data.trim();
    const paras = (Array.isArray(data.paragraphs) ? data.paragraphs : []).map(p => String(p || '').trim()).filter(Boolean);
    const greeting = String(data.greeting || 'Dear Hiring Team,').trim();
    const closing = String(data.closing || 'Sincerely,').trim();
    return [greeting, ...paras, closing + (name ? '\n' + name : '')].join('\n\n');
  }
  const PHRASES = /\b(dear|hiring|team|manager|sincerely|regards|best|thank|thanks|you|your|i|i'm|i've|my|we|our)\b/i;
  // Same idea as tailoring: anything technical or proper-noun-like must come from the resume. Terms that
  // only appear in the job description are warnings (you may mention the job's needs, not claim them).
  function check(text, resumeText, jd, extraAllowed) {
    const T = JAA.tailor;
    const allowed = [resumeText, (extraAllowed || []).join('\n')].join('\n');
    const issues = T.newFacts(text, '', allowed);
    const JD = String(jd || '').toLowerCase();
    const blocked = [], warnings = [];
    for (const m of issues) {
      const term = (m.match(/“([^”]+)”/) || [])[1] || '';
      const isNum = /^new number/.test(m);
      if (!term || PHRASES.test(term)) continue;
      const inJd = JD.includes(term.toLowerCase());
      if (isNum) blocked.push(`number “${term}” isn't in your resume`);
      else if (inJd) warnings.push(`“${term}” comes from the job description: make sure you don't claim experience you don't have`);
      else blocked.push(`“${term}” isn't in your resume or the job`);
    }
    const words = String(text).split(/\s+/).filter(Boolean).length;
    return { ok: !blocked.length, blocked: Array.from(new Set(blocked)), warnings: Array.from(new Set(warnings)), words };
  }
  // blocks for lib/docx.js / lib/pdfout.js build(blocks, opts)
  function blocks(text, profile) {
    const p = profile || {};
    const name = [p.firstName, p.lastName].filter(Boolean).join(' ');
    const contact = [p.email, p.phone, p.location || [p.city, p.state].filter(Boolean).join(', '), p.linkedin].filter(Boolean).join(' · ');
    const out = [];
    if (name) out.push({ type: 'name', text: name });
    if (contact) out.push({ type: 'contact', text: contact });
    out.push({ type: 'text', text: '' });
    String(text || '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean).forEach((par, i, all) => {
      // the sign-off keeps its line break ("Sincerely,\nName")
      par.split('\n').forEach(line => out.push({ type: 'text', text: line.trim() }));
      if (i < all.length - 1) out.push({ type: 'text', text: '' });
    });
    return out;
  }
  function fileBase(profile, company, title) { return JAA.tailor.fileBase(profile, company, title) + ' - Cover Letter'; }
  const api = { buildPrompt, toText, check, blocks, fileBase, LENGTHS };
  JAA.cover = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : this);
