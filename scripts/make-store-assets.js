// Builds store-assets/ (Chrome Web Store promo tile 440x280 + screenshots 1280x800) in the Quiet Chrome look
// (white chrome, thin indigo #4f46e5 -> violet #7c3aed bar, icons/icon128.png) from the real UI screenshots
// made by dev-tests/e2e-v5.js (mock Ollama, fake data only: "Jordan Rivera", "Sam Sample", "Example HQ").
// Run: STORE_SHOTS=1 SHOTS=/tmp/v5-store node dev-tests/e2e-v5.js && SRC=/tmp/v5-store node scripts/make-store-assets.js
// (NODE_PATH must point at a node_modules with playwright; SRC defaults to dev-tests/screenshots/v5)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SRC = process.env.SRC || path.join(ROOT, 'dev-tests/screenshots/v5'), OUT = path.join(ROOT, 'store-assets');
const b64 = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const ICON = b64(path.join(ROOT, 'icons/icon128.png'));
const SHOTS = [
  // [output, source screenshot, y offset in source pixels, address-bar label, title, subtitle]
  ['screenshot-1-fill.png', '04-fill-checklists.png', 0, 'job-boards.greenhouse.io/examplehq/jobs/201', 'Fills job applications for you', 'Live progress and checklists. It asks you what it can’t fill. You always press Submit.'],
  ['screenshot-2-match.png', '03-panel-resume-tab.png', 50, 'jobs.lever.co/examplelabs', 'See how your resume matches the job', 'Matched and missing keywords, worked out on your computer. Then tailor your resume in one click.'],
  ['screenshot-3-cover.png', '09-cover-approved.png', 540, 'AI Job Application Assistant · Cover letter', 'Cover letters that stick to the facts', 'Written by your local AI from your resume. Anything it can’t back up is blocked.'],
  ['screenshot-4-tour.png', '22-tour-5-refine.png', 66, 'AI Job Application Assistant · Practice tour', 'Learn it in 2 minutes, then refine any answer', 'A practice tour with a made-up person. Shorter, more technical or more enthusiastic in one click.'],
  ['screenshot-5-tracker.png', '15-options-tracker.png', 0, 'AI Job Application Assistant · Settings', 'Every application, tracked', 'Stages, notes, follow-up reminders and CSV export. Even when you submit without Fill.']
];
const pngWidth = f => fs.readFileSync(f).readUInt32BE(16);
const css = `*{box-sizing:border-box;margin:0}body{font-family:Inter,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif;color:#0f172a;overflow:hidden;position:relative;
  background:radial-gradient(900px 420px at 88% -10%,#eef2ff 0%,rgba(238,242,255,0) 70%),#f8fafc}
  .bar{position:absolute;top:0;left:0;right:0;background:linear-gradient(90deg,#4f46e5,#7c3aed)}`;
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const br = await chromium.launch({ channel: 'chromium' });
  const p = await br.newPage({ viewport: { width: 1280, height: 800 } });
  for (const [out, src, y, url, title, sub] of SHOTS) {
    const f = path.join(SRC, src);
    await p.setContent(`<style>${css}
      body{width:1280px;height:800px}.bar{height:6px}
      .top{display:flex;align-items:center;gap:20px;padding:36px 60px 0}
      .top img{width:62px;height:62px;border-radius:14px;box-shadow:0 4px 14px rgba(79,70,229,.25)}
      h1{font-size:38px;font-weight:800;letter-spacing:-.6px}p{font-size:19px;color:#64748b;margin-top:6px}
      .frame{position:absolute;left:60px;right:60px;top:156px;height:720px;border-radius:14px;overflow:hidden;background:#fff;
        border:1px solid #e2e8f0;box-shadow:0 24px 60px rgba(15,23,42,.14),0 2px 6px rgba(15,23,42,.06)}
      .chrome{height:38px;display:flex;align-items:center;gap:8px;padding:0 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0}
      .dot{width:11px;height:11px;border-radius:50%;background:#e2e8f0}
      .url{margin-left:14px;flex:0 1 520px;height:24px;border-radius:12px;background:#fff;border:1px solid #e2e8f0;font-size:12.5px;color:#64748b;display:flex;align-items:center;padding:0 12px;gap:8px}
      .url i{width:8px;height:8px;border-radius:50%;background:linear-gradient(135deg,#4f46e5,#7c3aed)}
      .shot{width:1158px;height:682px;background:url(${b64(f)}) no-repeat;background-size:1158px auto;background-position:0 -${Math.round(y * 1158 / pngWidth(f))}px}
    </style><div class="bar"></div><div class="top"><img src="${ICON}"><div><h1>${title}</h1><p>${sub}</p></div></div>
    <div class="frame"><div class="chrome"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="url"><i></i>${url}</span></div><div class="shot"></div></div>`);
    await p.screenshot({ path: path.join(OUT, out) });
    console.log('wrote store-assets/' + out);
  }
  await p.setViewportSize({ width: 440, height: 280 });
  await p.setContent(`<style>${css}body{width:440px;height:280px;padding:30px 32px}.bar{height:5px}
    img{width:64px;height:64px;border-radius:14px;box-shadow:0 4px 12px rgba(79,70,229,.25)}
    h1{font-size:29px;font-weight:800;margin-top:14px;letter-spacing:-.4px;line-height:1.1}p{font-size:15px;margin-top:8px;color:#475569;line-height:1.38}
    .chip{display:inline-block;margin-top:14px;background:#eef2ff;color:#4338ca;border:1px solid #e0e7ff;border-radius:20px;padding:5px 12px;font-size:12.5px;font-weight:600}</style>
    <div class="bar"></div><img src="${ICON}"><h1>AI Job Application Assistant</h1><p>Fills applications, tailors your resume and writes cover letters with a free AI on your computer.</p><span class="chip">Private · Free · Never clicks Submit</span>`);
  await p.screenshot({ path: path.join(OUT, 'promo-tile-440x280.png') });
  console.log('wrote store-assets/promo-tile-440x280.png');
  await br.close();
})();
