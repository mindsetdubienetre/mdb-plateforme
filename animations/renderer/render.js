import puppeteer from 'puppeteer';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const WIDTH = 1080;
const HEIGHT = 1920;

async function renderAnimation(srcFile, outDirName) {
  const srcPath = path.join(ROOT, 'src', srcFile);
  const outDir = path.join(ROOT, 'output', outDirName);
  await fs.mkdir(outDir, { recursive: true });

  console.log(`\n→ Rendering ${srcFile} → output/${outDirName}/`);

  const browser = await puppeteer.launch({
    headless: 'shell',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--font-render-hinting=none',
      '--enable-font-antialiasing',
      '--force-device-scale-factor=1'
    ],
    defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 }
  });

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });

  // Transparent background
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);

  await page.goto(`file://${srcPath}`, { waitUntil: 'networkidle0' });

  // Wait for fonts
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  });
  await new Promise(r => setTimeout(r, 500));

  const totalFrames = await page.evaluate(() => window.TOTAL_FRAMES);
  console.log(`  Total frames: ${totalFrames}`);

  const startTime = Date.now();
  for (let i = 0; i < totalFrames; i++) {
    await page.evaluate((f) => window.renderFrame(f), i);

    const fname = String(i).padStart(4, '0') + '.png';
    await page.screenshot({
      path: path.join(outDir, fname),
      type: 'png',
      omitBackground: true,
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT }
    });

    if (i % 30 === 0 || i === totalFrames - 1) {
      const pct = Math.round((i + 1) / totalFrames * 100);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r  Frame ${i + 1}/${totalFrames} (${pct}%) — ${elapsed}s`);
    }
  }
  console.log('');

  await browser.close();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✓ Done in ${elapsed}s`);
}

// Args: --src=03_fil.html --out=03_fil
const args = process.argv.slice(2);
const argMap = Object.fromEntries(args.map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v];
}));

const src = argMap.src || '03_fil.html';
const out = argMap.out || src.replace('.html', '');

renderAnimation(src, out).catch(err => {
  console.error(err);
  process.exit(1);
});
