#!/usr/bin/env python3
"""Builds the static homepage in site/ (GitHub Pages). Standard library only.
Usage: python3 scripts/site.py
The site has no JavaScript, no trackers and no external requests. Edit text here, then rerun."""
import json, os, html, datetime

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'site')
BASE = 'https://aridawoodi.github.io/job-apply-assistant/'
STORE = 'https://chromewebstore.google.com/detail/ai-job-application-assist/ianfkblcpiejjcjammkdloflpjhodaen'
REPO = 'https://github.com/aridawoodi/job-apply-assistant'
PRIVACY = REPO + '/blob/main/PRIVACY.md'
VERSION = json.load(open(os.path.join(ROOT, 'manifest.json'), encoding='utf-8'))['version']
CHECKED = 'October 31, 2026'
TODAY = '2026-10-31'
NAME = 'AI Job Application Assistant'

def store(medium, campaign='evergreen'):
    return f'{STORE}?utm_source=website&utm_medium={medium}&utm_campaign={campaign}'

CHROME_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 8h9M8.5 14 4 6.2M15.5 14 11 21.8" stroke="currentColor" stroke-width="2" fill="none"/></svg>'
GH_ICON = '<svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.34c-2.23.49-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.66 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0Z"/></svg>'

def add_btn(medium, label='Add to Chrome, it\u2019s free', small=False):
    cls = 'btn btn-primary' + (' btn-sm' if small else '')
    return f'<a class="{cls}" href="{store(medium)}">{CHROME_ICON if not small else ""}{label}</a>'

# ---------------------------------------------------------------- comparison data
# Every competitor fact below was read on the vendor's own site on CHECKED. Classes: y = good for the user, p = partial / limited, n = no / paid.
COMPETITORS = [
    dict(name=NAME, us=True, src=REPO,
         autofill=('y', 'Yes, unlimited'), ai=('y', 'Yes, unlimited', 'Runs on your computer'),
         account=('y', 'No'), data=('y', 'No', 'Stored in your browser'), submit=('y', 'Never')),
    dict(name='Simplify Copilot', src='https://help.simplify.jobs/articles/5623502-whats-included-in-simplify-features-and-pricing',
         autofill=('y', 'Yes'), ai=('n', 'No, needs Simplify+', '$19.99/week, $39.99/month or $89.99/3 months'),
         account=('n', 'Yes'), data=('n', 'Yes', 'Profile kept in your Simplify account'), submit=('p', 'Only Autopilot', 'Simplify+, no review step')),
    dict(name='DonutApply', src='https://donutapply.com/',
         autofill=('y', 'Yes, unlimited', 'One application at a time'), ai=('p', 'Limited', 'Free AI allowance; tailoring trial on 2 jobs, then Pro'),
         account=('n', 'Yes', 'US only'), data=('n', 'Yes', 'US cloud AI providers, zero retention (their claim)'), submit=('y', 'Never')),
    dict(name='VeloApply', src='https://veloapply.com/pricing',
         autofill=('y', 'Yes, unlimited', 'On supported forms'), ai=('p', 'Limited', 'Allowance shown in your account; paid plans $19\u2013$99/month'),
         account=('n', 'Yes'), data=('n', 'Yes', 'AI writing uses a paid cloud model'), submit=('y', 'Never')),
    dict(name='Jobply', src='https://jobply.ai/',
         autofill=('y', 'Yes, says unlimited'), ai=('y', 'Yes, says no limits'),
         account=('p', 'Check their site', 'Not stated on the homepage'), data=('n', 'Processed by their service', 'See their privacy policy'), submit=('p', 'Optional', 'Auto-submit toggle')),
    dict(name='ApplyBtn', src='https://applybtn.app/',
         autofill=('y', 'Yes'), ai=('p', 'Credits', '1,000 welcome credits (about 100 forms), then paid'),
         account=('n', 'Yes'), data=('n', 'Yes', 'AI providers listed in their privacy policy'), submit=('y', 'Never')),
    dict(name='Resumly', src='https://www.resumly.ai/pricing',
         autofill=('p', 'No browser autofill', 'Cloud auto-apply: 10 jobs on the free plan'), ai=('p', 'Within free-plan limits'),
         account=('n', 'Yes'), data=('n', 'Yes', 'Cloud service'), submit=('n', 'Yes', 'Auto-applies for you')),
]

def cell(v):
    cls, txt = v[0], v[1]
    sub = f'<small>{html.escape(v[2])}</small>' if len(v) > 2 else ''
    return f'<td><span class="{cls}">{html.escape(txt)}</span>{sub}</td>'

def comparison(caption_extra=''):
    rows = []
    for c in COMPETITORS:
        name = html.escape(c['name'])
        label = f'{name}<small>This extension</small>' if c.get('us') else f'{name}<small><a href="{c["src"]}" rel="nofollow noopener">Source</a></small>'
        rows.append(f'<tr{' class="us"' if c.get("us") else ""}><th scope="row">{label}</th>' + ''.join(cell(c[k]) for k in ('autofill', 'ai', 'account', 'data', 'submit')) + '</tr>')
    return f'''<figure class="table-wrap" aria-label="Comparison of free job application tools" tabindex="0">
<table class="cmp">
<caption>Free tiers only. Checked on each tool\u2019s own website on {CHECKED}.{caption_extra} Prices and limits change, so check their sites before you decide.</caption>
<thead><tr><th scope="col">Tool</th><th scope="col">Free autofill?</th><th scope="col">Free AI answers, tailoring &amp; cover letters?</th><th scope="col">Account required?</th><th scope="col">Data leaves your computer?</th><th scope="col">Submits for you?</th></tr></thead>
<tbody>
{chr(10).join(rows)}
</tbody></table></figure>'''

# ---------------------------------------------------------------- FAQ
FAQ = [
    ('Is it really free?',
     ['Yes. There is no paid plan, no credits, no trial and no in-app purchase. Every feature is free.',
      'It can stay free because the AI runs on your own computer, so there is no server bill to pass on to you. The code is open source under the MIT license.']),
    ('Does my resume leave my computer?',
     ['No. Your profile, resume, answers and application tracker are stored only in your browser on your computer. The AI runs on your device: Chrome\u2019s built-in AI or the free Ollama app.',
      'The extension has no account, no server, no analytics and no remote code. Equal-opportunity (EEO) answers and salary are never sent to the AI, not even the local one. <a href="' + PRIVACY + '">Read the privacy policy</a>.']),
    ('Which job sites does it work on?',
     ['It fills applications best on Greenhouse, Lever and Ashby, with basic support for Workday and LinkedIn Easy Apply. On any other site you can copy any part of your profile with one click from the side panel.',
      'A built-in practice application lets you try it safely before you apply for real.']),
    ('Do I need Ollama?',
     ['Not necessarily. You need one local AI for the writing features, and the setup page picks for you. If your Chrome (138 or newer) supports its built-in AI, there is nothing to install; that usually needs about 16 GB of memory or a strong graphics card.',
      'Otherwise it walks you through the free Ollama app, with no terminal. 8 GB of memory is enough, plus about 3 GB of disk space for the small model.']),
    ('Does it submit applications for me?',
     ['No. It never presses Submit, Next or Apply. It fills the form, colour-codes every field so you can see what came from your profile and what the AI drafted, and you review and submit.']),
    ('Will the AI make things up?',
     ['Tailored resumes and cover letters are fact-checked against your own resume. Invented employers, job titles, dates, numbers and tools are blocked, and you approve every change before anything is used.']),
    ('Is it open source?',
     [f'Yes, MIT licensed. The code is plain JavaScript with no build step, so you can read exactly what it does: <a href="{REPO}">github.com/aridawoodi/job-apply-assistant</a>.']),
    ('Is it the same as other extensions with similar names?',
     ['No. There are other Chrome extensions with similar names, and some of them sell paid features. This one is made by Ari Dawoodi, is 100% free, MIT open source and has no in-app purchases.',
      'Its Chrome Web Store ID is <code>ianfkblcpiejjcjammkdloflpjhodaen</code>. Use the Add to Chrome links on this page to be sure you get it.']),
]

def strip_tags(s):
    import re
    return re.sub(r'<[^>]+>', '', s)

def faq_html(items):
    out = ['<div class="faq">']
    for q, a in items:
        out.append(f'<details><summary>{html.escape(q)}</summary><div class="a">' + ''.join(f'<p>{p}</p>' for p in a) + '</div></details>')
    out.append('</div>')
    return '\n'.join(out)

def faq_ld(items):
    return {'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
        {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': ' '.join(strip_tags(p) for p in a)}} for q, a in items]}

APP_LD = {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', 'name': NAME,
    'alternateName': 'AI Job Application Assistant by Ari Dawoodi',
    'description': 'Free, open-source Chrome extension that autofills job applications from your resume, drafts answers, tailors your resume and writes cover letters with AI that runs on your own computer. No account, no subscription, never clicks Submit.',
    'applicationCategory': 'BusinessApplication', 'applicationSubCategory': 'Job application autofill',
    'operatingSystem': 'Chrome', 'browserRequirements': 'Google Chrome 110 or newer',
    'softwareVersion': VERSION, 'url': BASE, 'downloadUrl': STORE, 'installUrl': STORE,
    'image': BASE + 'assets/og-image.png', 'screenshot': BASE + 'assets/shot-fill.webp',
    'license': 'https://opensource.org/licenses/MIT', 'isAccessibleForFree': True,
    'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'USD'},
    'author': {'@type': 'Person', 'name': 'Ari Dawoodi', 'url': 'https://github.com/aridawoodi'},
    'sameAs': [STORE, REPO],
    'featureList': ['Autofill job applications from your resume', 'Import PDF or Word resume', 'AI answers to open questions',
                    'Resume tailoring with fact checks', 'Cover letters', 'Resume match score and keywords', 'Application tracker',
                    'Never clicks Submit', 'AI runs locally (Chrome built-in AI or Ollama)', 'No account, no analytics'],
}

def ld(obj):
    return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/') + '</script>'

def crumbs_ld(title, path):
    return {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': BASE},
        {'@type': 'ListItem', 'position': 2, 'name': title, 'item': BASE + path}]}

# ---------------------------------------------------------------- page shell
def page(path, title, desc, body, lds=(), current=''):
    depth = path.count('/')
    up = '../' * depth
    url = BASE + path
    nav = [('#how', 'How it works'), ('#features', 'Features'), ('#privacy', 'Privacy'), ('#compare', 'Compare'), ('#faq', 'FAQ')]
    navhtml = ''.join(f'<a href="{(up + h) if depth else h}">{t}</a>' for h, t in nav)
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<link rel="canonical" href="{url}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta name="author" content="Ari Dawoodi">
<meta name="theme-color" content="#4f46e5">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{NAME}">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{BASE}assets/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="AI Job Application Assistant: free AI job application autofill. Your resume stays on your computer.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{html.escape(title)}">
<meta name="twitter:description" content="{html.escape(desc)}">
<meta name="twitter:image" content="{BASE}assets/og-image.png">
<link rel="icon" type="image/png" sizes="32x32" href="{up}favicon-32.png">
<link rel="apple-touch-icon" href="{up}apple-touch-icon.png">
<link rel="preload" href="{up}assets/inter-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="{up}assets/site.css">
<link rel="alternate" type="text/plain" title="LLM summary" href="{up}llms.txt">
{chr(10).join(ld(x) for x in lds)}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top"><div class="wrap">
<a class="brand" href="{up or './'}"><img src="{up}assets/icon-64.png" width="30" height="30" alt="">{NAME}</a>
<nav class="nav" aria-label="Main">{navhtml}</nav>
{add_btn('nav', 'Add to Chrome', small=True)}
</div></header>
<main id="main">
{body}
</main>
<footer><div class="wrap">
<div class="cols">
<div>
<a class="brand" href="{up or './'}"><img src="{up}assets/icon-64.png" width="30" height="30" alt="">{NAME}</a>
<p class="blurb">Free, open-source Chrome extension that fills job applications with AI that runs on your own computer. Made by Ari Dawoodi, a solo developer.</p>
<p class="id">Chrome Web Store ID: <code>ianfkblcpiejjcjammkdloflpjhodaen</code> \u00b7 v{VERSION} \u00b7 No in-app purchases</p>
</div>
<div><h2>Product</h2><ul>
<li><a href="{store('footer')}">Chrome Web Store</a></li>
<li><a href="{REPO}">Source code on GitHub</a></li>
<li><a href="{PRIVACY}">Privacy policy</a></li>
<li><a href="{REPO}/blob/main/CHANGELOG.md">Changelog</a></li>
<li><a href="{REPO}/issues">Report a problem</a></li>
</ul></div>
<div><h2>Guides</h2><ul>
<li><a href="{up}free-job-application-autofill/">Free job application autofill</a></li>
<li><a href="{up}simplify-alternative/">A free alternative to Simplify+</a></li>
<li><a href="{up}local-ai-job-applications/">Job applications with local AI</a></li>
<li><a href="{REPO}/blob/main/docs/USER-GUIDE.md">User guide</a></li>
</ul></div>
</div>
<p class="legal">MIT license. Not affiliated with Google, Ollama, or any job site or tool named on this site. Product names belong to their owners and are used only to describe compatibility and for comparison. This site uses no cookies, analytics or trackers.</p>
</div></footer>
</body>
</html>
'''

def write(path, content):
    p = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(content)

def shot(name, alt, eager=False, w=1200, h=650):
    return (f'<img src="assets/shot-{name}.webp" srcset="assets/shot-{name}-600.webp 600w, assets/shot-{name}.webp 1200w" '
            f'sizes="(max-width: 820px) 100vw, 560px" width="{w}" height="{h}" alt="{html.escape(alt)}" '
            + ('fetchpriority="high"' if eager else 'loading="lazy" decoding="async"') + '>')

# ---------------------------------------------------------------- home
HOME = f'''
<section class="hero"><div class="wrap">
<div>
<p class="eyebrow"><span class="dot" aria-hidden="true"></span>Free &amp; open source \u00b7 Chrome extension</p>
<h1>Free AI job application autofill that keeps your resume on your computer</h1>
<p class="lede">Import your resume once. It fills application forms, drafts answers to open questions, tailors your resume and writes cover letters, using AI that runs on your own computer. No account, no subscription, and it never clicks Submit.</p>
<div class="cta-row">{add_btn('hero')}<a class="btn btn-ghost" href="{REPO}">{GH_ICON}View the code</a></div>
<ul class="facts"><li>No account</li><li>No paid plan</li><li>No analytics</li><li>MIT license</li></ul>
</div>
<div class="hero-media">
<div class="shot"><img src="assets/shot-hero.webp" srcset="assets/shot-hero-330.webp 330w, assets/shot-hero.webp 660w" sizes="(max-width: 900px) 100vw, 600px" width="660" height="470" alt="The extension\u2019s side panel filling a practice job application: 7 fields filled from the profile, 1 drafted by local AI, 3 that need you. Filled fields are outlined in green." fetchpriority="high"></div>
<div class="datacard">
<b>Where your data goes</b>
<ol><li><span>Profile &amp; resume</span><span>Your browser</span></li><li><span>AI processing</span><span>Your computer</span></li><li><span>Sent to the developer</span><span>Nothing</span></li><li><span>Analytics &amp; trackers</span><span>None</span></li></ol>
</div>
</div>
</div></section>

<section id="how"><div class="wrap">
<div class="head"><p class="kicker">How it works</p><h2>Three steps, about thirty seconds to understand</h2>
<p>It does the retyping. You keep the judgment calls and the Submit button.</p></div>
<ol class="steps">
<li><span class="t">Once</span><h3>Import your resume</h3><p>Drop in a PDF or Word file. It builds your profile on your computer: contact details, work history, education and skills. You check it and answer a few things resumes don\u2019t say, like work authorization.</p></li>
<li><span class="t">Each job</span><h3>Open an application, click Fill</h3><p>It fills what it knows from your profile, drafts the open questions with local AI, and asks you, one at a time, about anything it can\u2019t answer.</p></li>
<li><span class="t">Always you</span><h3>Review the colours, then submit</h3><p>Every field is colour-coded so you see where each answer came from. You make the edits and you press Submit. It never does.</p></li>
</ol>
<ul class="legend">
<li><span class="sw p" aria-hidden="true"></span>From your profile</li>
<li><span class="sw a" aria-hidden="true"></span>Drafted by local AI</li>
<li><span class="sw y" aria-hidden="true"></span>Typed by you</li>
<li><span class="sw n" aria-hidden="true"></span>Needs you</li>
</ul>
</div></section>

<section id="features" class="tint"><div class="wrap">
<div class="head"><p class="kicker">Features</p><h2>Everything between \u201cfound a job\u201d and \u201cpressed Submit\u201d</h2>
<p>Real screenshots of the extension, with made-up practice data.</p></div>
<div class="features">
<article class="feature wide"><figure>{shot('fill', 'A job application with filled fields and the assistant panel showing required and optional progress.')}</figure>
<div class="body"><h3>Fills the application for you</h3><p>Name, contact details, links, work history, education, work authorization and your resume file. Live progress shows what\u2019s required and what\u2019s optional, and the panel asks you about anything it couldn\u2019t fill.</p></div></article>
<article class="feature"><figure>{shot('match', 'Resume match card listing covered and missing keywords for a job posting.')}</figure>
<div class="body"><h3>See how your resume matches the job</h3><p>Which keywords from the posting you already cover and which are missing, worked out on your computer. Then tailor your resume in one click.</p></div></article>
<article class="feature"><figure>{shot('cover', 'Cover letter editor with fact checks and export to PDF or Word.')}</figure>
<div class="body"><h3>Cover letters that stick to the facts</h3><p>Drafted from your resume and the job. Anything it can\u2019t back up from your resume is blocked. Paste it in, or export PDF or Word.</p></div></article>
<article class="feature"><figure>{shot('tour', 'The practice tour with the Refine toolbar suggesting shorter or more technical wording.')}</figure>
<div class="body"><h3>Learn it in two minutes, refine any answer</h3><p>A practice tour with a made-up person shows everything first. Then make any long answer shorter, more technical or more enthusiastic in one click.</p></div></article>
<article class="feature"><figure>{shot('tracker', 'Application tracker table with stages, notes and follow-up dates.')}</figure>
<div class="body"><h3>Every application, tracked</h3><p>Stages from Saved to Offer, notes, follow-up reminders and CSV export. It tracks when you press Submit, even if you filled the form yourself.</p></div></article>
</div>
<ul class="more">
<li><b>Tailored resumes</b> that reword and reorder only what\u2019s already true, exported as Word or PDF.</li>
<li><b>Your own rules</b> for tailoring, like \u201cKeep to 2 pages\u201d or \u201cDon\u2019t change job titles\u201d.</li>
<li><b>One-click copy</b> of any profile detail on any website.</li>
<li><b>EEO questions</b> are never filled by AI and are always optional.</li>
<li><b>Backups</b> to a file you keep, restored in one click.</li>
<li><b>Mac, Windows and Linux</b>, in Chrome 110 or newer.</li>
</ul>
</div></section>

<section id="privacy"><div class="wrap privacy">
<div>
<div class="head tight"><p class="kicker">Privacy</p><h2>Your job search is nobody else\u2019s business</h2>
<p>Job applications hold your address, phone number, work history and sometimes your salary. So this extension was built to never need a server.</p></div>
<ul class="points">
<li><h3>Stored in your browser</h3><p>Profile, resume, answers, cover letters and tracker live in Chrome\u2019s extension storage on your computer.</p></li>
<li><h3>AI on your device</h3><p>Chrome\u2019s built-in AI or the free Ollama app. Your resume is never sent to a cloud AI.</p></li>
<li><h3>Nothing to sign up for</h3><p>No account, no email, no analytics, no ads, no remote code.</p></li>
<li><h3>Check it yourself</h3><p>The code is open source. <a href="{PRIVACY}">Privacy policy</a> \u00b7 <a href="{REPO}">Source code</a></p></li>
</ul>
</div>
<dl class="flow">
<div class="flow-row"><dt>Your resume and profile</dt><dd>Your browser only</dd></div>
<div class="flow-row"><dt>Text sent to the AI</dt><dd>Your computer only</dd></div>
<div class="flow-row"><dt>EEO answers and salary</dt><dd class="no">Never sent to any AI</dd></div>
<div class="flow-row"><dt>Data sent to the developer</dt><dd class="no">None</dd></div>
<div class="flow-row"><dt>Analytics, cookies, trackers</dt><dd class="no">None</dd></div>
<div class="flow-row"><dt>Accounts or sign-in</dt><dd class="no">None</dd></div>
</dl>
<p class="flow-foot">The same is true of this website: no cookies, no scripts, no analytics.</p>
</div></section>

<section id="compare" class="tint"><div class="wrap">
<div class="head"><p class="kicker">Compare</p><h2>How the free tiers compare</h2>
<p>Most tools give autofill away and charge for the AI writing, because cloud AI costs them money every time you use it. Running the AI on your computer is what lets this one keep everything free.</p></div>
{comparison()}
<div class="fair">
<div><h3>Where others are stronger</h3><ul>
<li>Larger tools support many more application systems and career sites.</li>
<li>Some include job search, a job board or a mobile app.</li>
<li>Cloud AI needs no capable computer, and big cloud models write more fluently than small local ones.</li>
</ul></div>
<div><h3>Where this one is different</h3><ul>
<li>Every feature is free, with no credits or limits.</li>
<li>No account, and your resume never leaves your computer.</li>
<li>Open source, so anyone can check what it does.</li>
</ul></div>
</div>
<p class="note">More detail: <a href="free-job-application-autofill/">what\u2019s actually free in job application autofill</a> \u00b7 <a href="simplify-alternative/">compared with Simplify Copilot</a>.</p>
</div></section>

<section id="faq"><div class="wrap">
<div class="head"><p class="kicker">FAQ</p><h2>Questions people ask first</h2></div>
{faq_html(FAQ)}
</div></section>

<section class="closing flush"><div class="wrap"><div class="box">
<h2>Stop retyping your resume</h2>
<p>Install it, import your resume and try it on the built-in practice application. It\u2019s free, and nothing is ever submitted without you.</p>
<div class="cta-row">{add_btn('closing')}<a class="btn btn-ghost" href="{REPO}">{GH_ICON}Star it on GitHub</a></div>
</div></div></section>
'''

# ---------------------------------------------------------------- article pages
def article(path, crumb, h1, intro, sections_html, cta_medium, faq=None):
    faq_block = f'<h2>Questions</h2>{faq_html(faq)}' if faq else ''
    return f'''
<div class="article-hero"><div class="wrap"><div class="prose">
<p class="crumbs"><a href="../">Home</a> / {html.escape(crumb)}</p>
<h1>{h1}</h1>
<p class="lede">{intro}</p>
<div class="cta-row">{add_btn(cta_medium)}<a class="btn btn-ghost" href="../">See how it works</a></div>
<p class="updated">Updated {CHECKED} \u00b7 by Ari Dawoodi, the developer of {NAME}</p>
</div></div></div>
<div class="article"><div class="wrap"><div class="prose">
{sections_html}
{faq_block}
</div></div></div>
<section class="closing near"><div class="wrap"><div class="box">
<h2>Try it on a practice application</h2>
<p>Free, no account, and your resume stays on your computer.</p>
<div class="cta-row">{add_btn(cta_medium + '-bottom')}</div>
</div></div></section>
'''

FREE_FAQ = [
    ('What\u2019s the difference between autofill and auto-apply?', ['Autofill fills the form and stops, so you review and press Submit. Auto-apply submits applications for you, often in the cloud and without a review step. This extension only autofills.']),
    ('Why do most tools charge for AI but not autofill?', ['Autofill copies your saved details into fields, which costs the company almost nothing. AI writing calls a cloud language model that they pay for each time. A tool that runs the AI on your computer doesn\u2019t have that cost.']),
    ('Is free autofill safe?', ['Read the privacy policy before you upload a resume anywhere. Check where your profile is stored, whether an account is needed and which AI providers see your data.']),
]
FREE_BODY = f'''
<div class="callout"><b>Short answer:</b> form autofill is free in most tools. AI writing (answers to open questions, tailored resumes and cover letters) is where you meet credits, allowances and subscriptions. If you want the AI writing free as well, use a tool whose AI runs on your own computer.</div>
<h2>Three different things are called \u201cfree\u201d</h2>
<h3>1. Autofill from your profile</h3>
<p>Your name, contact details, work history and education are copied into the form. This is cheap to provide, so almost every tool offers it free, sometimes \u201cunlimited\u201d and sometimes limited to certain sites or one application at a time.</p>
<h3>2. AI writing</h3>
<p>\u201cWhy do you want to work here?\u201d answers, tailored resumes and cover letters. Cloud tools pay for every AI request, so this is usually a trial, a credit balance or a subscription.</p>
<h3>3. Auto-apply</h3>
<p>The tool submits applications for you. That\u2019s a different product with different risks: you don\u2019t see each application before it goes. Free plans usually allow only a handful.</p>
<h2>What the popular tools offer for free</h2>
<p>I checked each tool\u2019s own pricing or home page on {CHECKED}. I make one of the tools in this table, so I\u2019ve kept to what each site says and linked the source.</p>
{comparison()}
<h2>How to choose</h2>
<ol>
<li><b>Count how many applications you send.</b> A few a week? Most free autofill plans are enough. Dozens a day with AI answers? That\u2019s where limits bite.</li>
<li><b>Decide where your resume may go.</b> Cloud tools keep your profile in an account and send text to AI providers. Local tools keep it on your computer.</li>
<li><b>Check the sites you apply on.</b> Coverage varies a lot. Try each tool on a real application before you commit.</li>
<li><b>Keep the Submit button.</b> Tools that fill and stop let you catch mistakes before an employer sees them.</li>
<li><b>Check your computer if you want local AI.</b> 8 GB of memory runs a small model; 16 GB runs a better one.</li>
</ol>
<h2>How {NAME} stays free</h2>
<p>I built it as a solo developer, and it has no servers. The AI runs on your computer, either Chrome\u2019s built-in AI or the free Ollama app, so there is no per-use cost for me to pass on. It\u2019s MIT open source. Every feature, including AI answers, tailoring and cover letters, is free with no limits.</p>
<p>The trade-offs are real: you need a reasonably capable computer for the AI, small local models write less fluently than the biggest cloud models (so it fact-checks drafts and you approve every change), and it works best on Greenhouse, Lever and Ashby, with basic support for Workday and LinkedIn Easy Apply.</p>
'''

SIMPLIFY_FAQ = [
    ('Can I use both?', ['Yes, but two autofill extensions on the same form can fight over the same fields. Pause one of them on sites where you use the other.']),
    ('Do I need to export anything from Simplify?', ['No. Import your resume (PDF or Word) and the extension builds your profile from it. You check it once.']),
    ('Is Simplify Copilot free?', ['Its autofill is free. AI resume tailoring, cover letters and AI answers need Simplify+, according to Simplify\u2019s help center (checked ' + CHECKED + ').']),
]
SIMP_ROWS = [
    ('Autofill', ('y', 'Free'), ('y', 'Free')),
    ('AI answers to open questions', ('n', 'Simplify+'), ('y', 'Free, unlimited')),
    ('AI resume tailoring', ('n', 'Simplify+'), ('y', 'Free, fact-checked')),
    ('AI cover letters', ('n', 'Simplify+', 'Writing them yourself is free'), ('y', 'Free, fact-checked')),
    ('Price of the AI features', ('p', '$19.99/week, $39.99/month or $89.99/3 months'), ('y', '$0')),
    ('Account', ('n', 'Required'), ('y', 'None')),
    ('Where your profile lives', ('p', 'Your Simplify account'), ('y', 'Your browser')),
    ('Where AI runs', ('p', 'Simplify\u2019s service'), ('y', 'Your computer')),
    ('Sites', ('y', 'Greenhouse, Workday, Lever, Ashby, iCIMS, Jobvite, Taleo and 20+ more'), ('p', 'Best on Greenhouse, Lever, Ashby; basic Workday and LinkedIn Easy Apply')),
    ('Submits for you', ('p', 'Autopilot (Simplify+) submits without a review step'), ('y', 'Never')),
    ('Job search, tracker, mobile app', ('y', 'Job board, tracker, iOS app'), ('p', 'Tracker only')),
    ('Open source', ('p', 'Job lists are; the extension isn\u2019t'), ('y', 'MIT')),
]
def simp_table():
    rows = ''.join(f'<tr><th scope="row">{html.escape(r[0])}</th>{cell(r[1])}{cell(r[2])}</tr>' for r in SIMP_ROWS)
    return f'''<figure class="table-wrap" aria-label="Simplify Copilot compared with AI Job Application Assistant" tabindex="0"><table class="cmp two">
<caption>Simplify facts from <a href="https://help.simplify.jobs/articles/5623502-whats-included-in-simplify-features-and-pricing" rel="nofollow noopener">Simplify\u2019s help center</a> and <a href="https://simplify.jobs/llms.txt" rel="nofollow noopener">simplify.jobs</a>, checked {CHECKED}.</caption>
<thead><tr><th scope="col"></th><th scope="col">Simplify Copilot</th><th scope="col">{NAME}</th></tr></thead><tbody>{rows}</tbody></table></figure>'''
SIMPLIFY_BODY = f'''
<p>Simplify Copilot is a popular, well-made autofill extension, and its basic autofill is free. Its AI features (tailored resumes, cover letters and AI answers) are part of the paid Simplify+ plan. If those AI features are what you want, and you\u2019d rather not create an account or send your resume to a cloud service, this page is for you.</p>
<h2>Side by side</h2>
{simp_table()}
<h2>When Simplify is the better choice</h2>
<ul>
<li>You apply on many different application systems and want the widest coverage.</li>
<li>You want a job board, recruiter features and an iPhone app in the same account.</li>
<li>Your computer is older or has little memory, so local AI would be slow.</li>
</ul>
<h2>When {NAME} is the better choice</h2>
<ul>
<li>You want AI answers, tailored resumes and cover letters without paying or counting credits.</li>
<li>You don\u2019t want an account, and you want your resume to stay on your computer.</li>
<li>You apply mostly through Greenhouse, Lever or Ashby forms, which are common at tech companies and startups.</li>
<li>You want to read the code of the tool that handles your personal data.</li>
</ul>
<h2>Switching takes about a minute</h2>
<ol><li>Add the extension to Chrome. A welcome page opens.</li><li>Import your resume (PDF or Word) and check what it found.</li><li>Try it on the built-in practice application, then on a real one.</li><li>Set up the local AI when you want help with open questions, tailoring and cover letters. The setup page guides you with no terminal.</li></ol>
'''

LOCAL_FAQ = [
    ('Which model does it use with Ollama?', ['It suggests qwen2.5:3b for 8 GB computers and qwen2.5:7b when you have 16 GB or more. The setup page downloads it for you with a progress bar.']),
    ('Can websites talk to my Ollama through the extension?', ['No. The extension removes the Origin header only on its own requests to your local Ollama address. Web pages are unaffected, so Ollama still blocks them.']),
    ('Does it work offline?', ['The AI runs locally, so drafting works without a cloud service. You still need the internet to load job pages.']),
]
LOCAL_BODY = f'''
<p>Job applications are full of personal data. Running the AI on your own computer means your resume isn\u2019t sent to a cloud model, and nobody pays per request, which is why every AI feature in {NAME} is free.</p>
<h2>Two local engines, picked for you</h2>
<h3>Chrome\u2019s built-in AI</h3>
<p>Chrome 138 or newer can run a small built-in model on your device. There\u2019s nothing to install. It usually needs about 16 GB of memory or a strong graphics card, and Chrome decides whether your device qualifies.</p>
<h3>Ollama</h3>
<p>The free Ollama app runs open models on Mac, Windows and Linux. 8 GB of memory is enough for the small model (about 3 GB of disk). With 16 GB or more, the setup suggests a larger model that writes better. If both engines are available, the extension falls back automatically.</p>
<h2>What the AI is asked to do</h2>
<ul>
<li><b>Draft open answers</b> like \u201cWhy do you want to work here?\u201d from your resume, in your voice.</li>
<li><b>Tailor your resume</b> by rewording and reordering what\u2019s already there. Invented employers, titles, dates, numbers and tools are blocked.</li>
<li><b>Write cover letters</b> with the same fact checks.</li>
<li><b>Never</b> answer equal-opportunity questions or see your salary. Those are never sent to the AI.</li>
</ul>
<h2>No terminal needed for Ollama</h2>
<p>Ollama normally rejects requests from browser extensions unless you set <code>OLLAMA_ORIGINS</code> in a terminal. Instead, the extension adds a narrow declarativeNetRequest rule that removes the <code>Origin</code> header only on requests the extension itself makes to your local Ollama address. Web pages are not affected. The details are in the <a href="{REPO}#how-the-no-terminal-ollama-connection-works">README</a>.</p>
<h2>Common fixes</h2>
<ul>
<li><b>\u201cWaiting for Ollama\u2026\u201d</b>: install Ollama with the button on the setup page and open it.</li>
<li><b>Ollama refused the connection</b>: click \u201cTry the automatic fix\u201d. If that fails, follow the manual steps shown below it.</li>
<li><b>Slow first answer</b>: the first request loads the model, which can take up to a minute. Close heavy tabs and use the recommended model.</li>
</ul>
'''

PAGES = [
    ('index.html', '', f'Free AI Job Application Autofill, Private & Local | {NAME}',
     'Free Chrome extension that autofills job applications from your resume and writes answers, tailored resumes and cover letters with AI that runs on your computer. No account. Open source.',
     HOME, [APP_LD, faq_ld(FAQ)]),
    ('free-job-application-autofill/index.html', 'free-job-application-autofill/', 'Free Job Application Autofill in 2026: What\u2019s Actually Free',
     'Which job application autofill tools are free, and where credits and subscriptions start. A sourced comparison of free tiers, and how to get free AI writing with local AI.',
     article('free-job-application-autofill/', 'Free job application autofill', 'Free job application autofill: what\u2019s actually free',
             'Almost every tool says \u201cfree\u201d. Here\u2019s what that covers in each one, and how to get the AI writing free too.', FREE_BODY, 'free-autofill-page', FREE_FAQ),
     [faq_ld(FREE_FAQ), crumbs_ld('Free job application autofill', 'free-job-application-autofill/')]),
    ('simplify-alternative/index.html', 'simplify-alternative/', 'Free Alternative to Simplify+ AI Features, No Account',
     'Simplify Copilot autofill is free, but AI tailoring, cover letters and answers need Simplify+. Compare it with a free, open-source extension whose AI runs on your computer.',
     article('simplify-alternative/', 'Simplify alternative', 'A free, private alternative to Simplify+ AI features',
             'Keep free autofill, and get AI answers, tailored resumes and cover letters without a subscription or an account.', SIMPLIFY_BODY, 'simplify-page', SIMPLIFY_FAQ),
     [faq_ld(SIMPLIFY_FAQ), crumbs_ld('Simplify alternative', 'simplify-alternative/')]),
    ('local-ai-job-applications/index.html', 'local-ai-job-applications/', 'Job Applications with Local AI (Ollama, Chrome Built-in AI)',
     'Fill job applications and write cover letters with AI that runs on your computer, using Ollama or Chrome\u2019s built-in AI. Hardware needs, models, privacy and setup.',
     article('local-ai-job-applications/', 'Local AI', 'Job applications with local AI: Ollama or Chrome\u2019s built-in AI',
             'Your resume stays on your computer, and the AI writing costs nothing to run. Here\u2019s how it works and what you need.', LOCAL_BODY, 'local-ai-page', LOCAL_FAQ),
     [faq_ld(LOCAL_FAQ), crumbs_ld('Local AI', 'local-ai-job-applications/')]),
]

LLMS = f'''# {NAME}

> Free, open-source (MIT) Chrome extension by Ari Dawoodi that autofills job applications from your resume and uses AI that runs on your own computer (Chrome's built-in AI or the free Ollama app) to draft answers, tailor resumes and write cover letters. No account, no subscription, no in-app purchases, no analytics. It never clicks Submit.

Important: other Chrome extensions have similar names, and some sell paid features. This one is by Ari Dawoodi, Chrome Web Store ID ianfkblcpiejjcjammkdloflpjhodaen, 100% free, MIT licensed, current version {VERSION}.

## Links
- Chrome Web Store: {STORE}
- Website: {BASE}
- Source code (MIT): {REPO}
- Privacy policy: {PRIVACY}
- User guide: {REPO}/blob/main/docs/USER-GUIDE.md
- Changelog: {REPO}/blob/main/CHANGELOG.md

## What it does
- Autofills job application forms from a profile built from your PDF or Word resume (contact details, links, work history, education, work authorization, resume file).
- Drafts answers to open questions ("Why do you want to work here?") with local AI, in your voice; one-click refine (shorter, more technical, more enthusiastic).
- Tailors your resume to a job by rewording and reordering existing content; invented employers, titles, dates, numbers or tools are blocked; the user approves each change; exports Word or PDF.
- Writes fact-checked cover letters (text, PDF or Word).
- Shows a resume-to-job keyword match.
- Tracks applications (stages, notes, follow-up reminders, CSV export).
- Colour-codes every filled field (from profile, AI draft, typed by you, needs you).
- Never presses Submit, Next or Apply. Equal-opportunity (EEO) questions are never filled by AI.

## Where it works
- Best: Greenhouse, Lever and Ashby application forms. Basic: Workday and LinkedIn Easy Apply.
- Any site: one-click copy of profile details from the side panel.
- Chrome 110+ (or Edge/Brave) on macOS, Windows and Linux.

## Privacy
- All data is stored in the browser's extension storage on the user's computer.
- AI runs locally: Chrome built-in AI (Chrome 138+, roughly 16 GB RAM or a strong GPU) or Ollama (8 GB RAM is enough; about 3 GB disk for qwen2.5:3b; qwen2.5:7b suggested with 16 GB+).
- No servers, no account, no analytics, no remote code. EEO answers and salary are never sent to the AI.

## Pricing
- Free. Price: $0. No paid plan, no credits, no trial, no in-app purchases.

## Who it is for
- Job seekers who want free autofill plus free AI writing, people who don't want to upload their resume to a cloud service, and users of local LLMs (Ollama).

## Guides
- Free job application autofill, compared: {BASE}free-job-application-autofill/
- Free alternative to Simplify+ AI features: {BASE}simplify-alternative/
- Job applications with local AI (Ollama, Chrome built-in AI): {BASE}local-ai-job-applications/
'''

def main():
    for fname, path, title, desc, body, lds in PAGES:
        write(fname, page(path, title, desc, body, lds))
    urls = ''.join(f'<url><loc>{BASE}{p[1]}</loc><lastmod>{TODAY}</lastmod></url>\n' for p in PAGES)
    write('sitemap.xml', f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}</urlset>\n')
    write('robots.txt', f'User-agent: *\nAllow: /\n\nSitemap: {BASE}sitemap.xml\n')
    write('llms.txt', LLMS)
    write('.nojekyll', '')
    write('404.html', page('404.html', f'Page not found | {NAME}', 'This page does not exist.',
        f'<section class="closing"><div class="wrap"><div class="box"><h1>Page not found</h1><p>That page doesn\u2019t exist. Try the homepage.</p><div class="cta-row"><a class="btn btn-ghost" href="{BASE}">Go to the homepage</a>{add_btn("404")}</div></div></div></section>').replace('href="assets/', f'href="{BASE}assets/').replace('src="assets/', f'src="{BASE}assets/').replace('href="favicon', f'href="{BASE}favicon').replace('href="apple', f'href="{BASE}apple').replace('href="llms', f'href="{BASE}llms').replace('href="free-', f'href="{BASE}free-').replace('href="simplify-', f'href="{BASE}simplify-').replace('href="local-', f'href="{BASE}local-'))
    print('site built:', ', '.join(p[0] for p in PAGES))

if __name__ == '__main__':
    main()
