// Renders icons/icon.svg (48/128) and icons/icon-small.svg (16/32) to PNG with Chromium.
const { chromium } = require('playwright');
const fs = require('fs');
const DIR = '/workspace/job-apply-extension/icons';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const [size, file] of [[16, 'icon-small.svg'], [32, 'icon-small.svg'], [48, 'icon.svg'], [128, 'icon.svg']]) {
    const svg = fs.readFileSync(DIR + '/' + file, 'utf8');
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)}</body></html>`);
    await p.screenshot({ path: `${DIR}/icon${size}.png`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  }
  // preview sheet for the report
  await p.setViewportSize({ width: 360, height: 170 });
  const img = n => `<img src="data:image/png;base64,${fs.readFileSync(`${DIR}/icon${n}.png`).toString('base64')}" width="${n}" height="${n}" style="image-rendering:auto">`;
  await p.setContent(`<body style="margin:0;font:12px -apple-system,sans-serif;background:#f8fafc;display:flex;gap:22px;align-items:flex-end;padding:18px">${[16, 32, 48, 128].map(n => `<div style="text-align:center">${img(n)}<div style="color:#64748b;margin-top:6px">${n}px</div></div>`).join('')}</body>`);
  fs.mkdirSync('/workspace/job-apply-extension/dev-tests/screenshots', { recursive: true });
  await p.screenshot({ path: '/workspace/job-apply-extension/dev-tests/screenshots/icon.png' });
  await b.close();
})();
