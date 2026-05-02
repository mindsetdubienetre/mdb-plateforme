import puppeteer from 'puppeteer';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const WIDTH = 1080;
const HEIGHT = 1920;

async function preview(srcFile, frames) {
  const srcPath = path.join(ROOT, 'src', srcFile);
  const outDir = path.join(ROOT, 'output', 'preview_' + srcFile.replace('.html', ''));
  await fs.mkdir(outDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'shell',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none', '--force-device-scale-factor=1'],
    defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 }
  });
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.goto(`file://${srcPath}`, { waitUntil: 'networkidle0' });
  await page.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; });
  await new Promise(r => setTimeout(r, 500));

  for (const f of frames) {
    await page.evaluate((ff) => window.renderFrame(ff), f);
    const fname = String(f).padStart(4, '0') + '.png';
    await page.screenshot({
      path: path.join(outDir, fname),
      type: 'png',
      omitBackground: true,
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT }
    });
    console.log(`  ✓ frame ${f} → ${fname}`);
  }

  await browser.close();
}

const args = process.argv.slice(2);
const argMap = Object.fromEntries(args.map(a => { const [k,v] = a.replace(/^--/,'').split('='); return [k,v]; }));
const src = argMap.src || '03_fil.html';
const frames = (argMap.frames || '60,120,180,240,290').split(',').map(Number);

console.log(`Preview ${src} frames: ${frames.join(', ')}`);
preview(src, frames).catch(e => { console.error(e); process.exit(1); });
