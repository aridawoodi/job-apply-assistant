// Builds store-assets/ (Chrome Web Store promo tile 440x280 + screenshots 1280x800) from the
// real UI screenshots made by dev-tests/e2e-v5.js (fake data only: "Jordan Rivera", "Sam Sample", "Example HQ").
// Run: node dev-tests/e2e-v5.js && NODE_PATH=... node scripts/make-store-assets.js
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SRC = path.join(ROOT, 'dev-tests/screenshots/v5'), OUT = path.join(ROOT, 'store-assets');
const b64 = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const ICON = b64(path.join(ROOT, 'icons/icon128.png'));
const SHOTS = [
  // [output, source screenshot, y offset in source pixels, title, subtitle]
  ['screenshot-1-fill.png', '04-fill-checklists.png', 0, 'Fills job applications for you', 'Live progress and checklists. It asks you what it can’t fill. You always press Submit.'],
  ['screenshot-2-match.png', '03-panel-resume-tab.png', 0, 'See how your resume matches the job', 'Matched and missing keywords, worked out on your computer. Then tailor your resume in one click.'],
  ['screenshot-3-cover.png', '09-cover-approved.png', 540, 'Cover letters that stick to the facts', 'Written by your local AI from your resume. Anything it can’t back up is blocked.'],
  ['screenshot-4-tour.png', '22-tour-5-refine.png', 0, 'Learn it in 2 minutes, then refine any answer', 'A practice tour with a made-up person. Shorter, more technical or more enthusiastic in one click.'],
  ['screenshot-5-tracker.png', '15-options-tracker.png', 150, 'Every application, tracked', 'Stages, notes, follow-up reminders and CSV export. Even when you submit without Fill.']
];
const pngWidth = f => fs.readFileSync(f).readUInt32BE(16);
const css = `*{box-sizing:border-box;margin:0}body{font-family:Inter,"Segoe UI",Roboto,"Noto Sans",Arial,sans-serif}`;
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const br = await chromium.launch({ channel: 'chromium' });
  const p = await br.newPage({ viewport: { width: 1280, height: 800 } });
  for (const [out, src, y, title, sub] of SHOTS) {
    await p.setContent(`<style>${css}
      body{width:1280px;height:800px;overflow:hidden;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff}
      .top{display:flex;align-items:center;gap:18px;padding:34px 60px 0}
      .top img{width:60px;height:60px}h1{font-size:38px;font-weight:800;letter-spacing:-.5px}p{font-size:19px;opacity:.92;margin-top:6px}
      .frame{position:absolute;left:60px;right:60px;top:160px;height:700px;border-radius:14px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.35);background:#f5f6fb}
      .frame div{width:1160px;height:700px;background:url(${b64(path.join(SRC, src))}) no-repeat;background-size:1160px auto;background-position:0 -${Math.round(y * 1160 / pngWidth(path.join(SRC, src)))}px}
    </style><div class="top"><img src="${ICON}"><div><h1>${title}</h1><p>${sub}</p></div></div><div class="frame"><div></div></div>`);
    await p.screenshot({ path: path.join(OUT, out) });
    console.log('wrote store-assets/' + out);
  }
  await p.setViewportSize({ width: 440, height: 280 });
  await p.setContent(`<style>${css}body{width:440px;height:280px;overflow:hidden;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;padding:30px 32px}
    img{width:64px;height:64px}h1{font-size:30px;font-weight:800;margin-top:14px;letter-spacing:-.3px}p{font-size:15.5px;margin-top:8px;opacity:.94;line-height:1.35}
    .chip{display:inline-block;margin-top:14px;background:rgba(255,255,255,.18);border-radius:20px;padding:5px 12px;font-size:12.5px;font-weight:600}</style>
    <img src="${ICON}"><h1>Job Apply Assistant</h1><p>Fills applications, tailors your resume and writes cover letters with a free AI on your computer.</p><span class="chip">Private · Free · Never clicks Submit</span>`);
  await p.screenshot({ path: path.join(OUT, 'promo-tile-440x280.png') });
  console.log('wrote store-assets/promo-tile-440x280.png');
  await br.close();
})();
