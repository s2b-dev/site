/* Records the landing page's demo as shareable videos — one loop of the
   storyline, as a transparent-background WebM with a rounded card and a soft
   shadow, in both themes at desktop and phone widths.

     bun run dev                       # in another terminal
     bun scripts/demo-video.mjs        # all four
     bun scripts/demo-video.mjs --only desktop:dark
     bun scripts/demo-video.mjs --out ~/Desktop/s2b

   Output is written OUTSIDE the repo by default (../s2b-demo-video, next to
   the checkout): the four files are ~9MB and a re-record replaces all of
   them, so committing them would grow history by that much every time.

   Needs: a dev server on :4321, ffmpeg, playwright (`bunx playwright install
   chromium` once), and Pillow for the mask/shadow (`pip install pillow`).

   ── Why this is not just "screen-record the page" ──────────────────────────
   Four things here are load-bearing and were each arrived at the hard way.

   1. CDP screencast, not Playwright's recordVideo. The built-in recorder
      pads the frame with flat grey past a certain scroll offset in headless
      Chromium (playwright#36032), which silently ate the bottom of every
      capture. The screencast also runs ~100fps where per-frame screenshots
      manage ~29, which matters because the demo's motion is the point.

   2. Capture at 1:1 — no zoom, no deviceScaleFactor. Raising the resolution
      with `html { zoom: N }` works on the pixels but rescales the layout
      coordinates landing.js reads from getBoundingClientRect(), which is how
      it positions the simulated cursor: the cursor drifts off the buttons it
      is pressing and the card's top edge stops matching the crop. CDP's
      screencast ignores deviceScaleFactor, and the screenshot path that
      honours it is too slow. So: correct beats sharp.

   3. The crop is VERIFIED against a real frame before encoding. The DOM box
      and the screencast have disagreed by ~10px in one theme and not the
      other, and a few pixels either clips the window's title bar or drags the
      page's step timeline in underneath the card. checkCropEdges looks for
      the card's own border on all four edges and refuses to continue without
      it. Do not remove this: every bad video this pipeline ever produced
      would have been caught by it.

   4. The clip is one loop, start to finish. The demo runs continuously, so
      the capture clicks the timeline's first step to restart the storyline
      before recording, and stops when the timeline returns to step 1. A fixed
      47.1s wait overshoots — the real cycle is ~46.4s and drifts — and the
      overshoot wraps the next loop's opening onto the end.

   And one ffmpeg trap: do NOT put `-r` on the concat input. It overrides the
   per-frame `duration` lines rather than reading them, so every frame plays
   at that fixed rate — 4600 frames at 120fps is 38s of storyline inside a
   46s file, with the last frame frozen for the remainder. The trim duration
   likewise comes from the concat list's own sum, not the capture's wall
   clock: the two differ, and trimming to the longer one leaves the tail with
   no source frames, which ffmpeg fills from the looping shadow input. */

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const URL = process.env.DEMO_URL || 'http://localhost:4321/';
/* Wide enough that the card is never the constraint, tall enough that the
   screencast frame (which comes back shorter than the viewport) still
   contains it. The WIDTH is what selects the layout: the mock window goes
   one-pane-at-a-time below 720px. */
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 900 },
};
/* Clears the sticky nav (58px) with a little room to spare. */
const TOP_OFFSET = 68;
/* Nominal loop length; only an upper bound for the restart watcher. */
const LOOP_MS = 47100;

/* Geometry of the frame around the card, in CSS px. The shadow is a
   SYMMETRIC halo rather than the site's own downward-cast --window-shadow:
   these clips sit on someone else's background, where an offset shadow reads
   as the card being off-centre in its own frame. PAD is 1.5x the blur —
   past that the Gaussian is a percent or two of peak and only adds margin. */
const RADIUS = 16;
const SHADOW_BLUR = 16;
const PAD = Math.round(SHADOW_BLUR * 1.5);
/* --window-shadow, per theme. */
const SHADOW = {
  dark: { rgb: [0, 0, 0], alpha: 150 },
  light: { rgb: [22, 21, 28], alpha: 90 },
};

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const OUT = resolve(argOf('--out', resolve(REPO, '..', 's2b-demo-video')));
const WORK = resolve(OUT, '.work');
const only = argOf('--only', null);

const TARGETS = [];
for (const mode of ['desktop', 'mobile']) {
  for (const theme of ['dark', 'light']) {
    if (!only || only === `${mode}:${theme}` || only === mode || only === theme) {
      TARGETS.push({ mode, theme });
    }
  }
}
if (!TARGETS.length) {
  console.error(`nothing matches --only ${only}; use e.g. desktop:dark, mobile, light`);
  process.exit(1);
}

const sh = (cmd, cmdArgs) =>
  execFileSync(cmd, cmdArgs, { encoding: 'utf8', maxBuffer: 1 << 28 });

function have(cmd) {
  try { sh('which', [cmd]); return true; } catch { return false; }
}

/* Use whichever Chromium Playwright has already downloaded, rather than
   insisting on the exact revision this version expects. Bumping the package
   otherwise means a fresh ~150MB download for a script that only needs a
   browser that renders the page — and the cache usually already has one.
   Returns undefined (Playwright's own default) if nothing is cached. */
function chromiumPath() {
  if (process.env.DEMO_CHROMIUM) return process.env.DEMO_CHROMIUM;
  const root = resolve(process.env.HOME, 'Library/Caches/ms-playwright');
  if (!existsSync(root)) return undefined;
  const builds = readdirSync(root)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const b of builds) {
    const exe = resolve(root, b,
      'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (existsSync(exe)) return exe;
  }
  return undefined;
}
for (const bin of ['ffmpeg', 'ffprobe', 'python3']) {
  if (!have(bin)) { console.error(`missing \`${bin}\` on PATH`); process.exit(1); }
}

/* ── capture ─────────────────────────────────────────────────────────────── */

async function capture({ mode, theme }) {
  const dir = resolve(WORK, `${mode}_${theme}`);
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  mkdirSync(dir, { recursive: true });

  const viewport = VIEWPORTS[mode];
  const browser = await chromium.launch({
    executablePath: chromiumPath(),
    args: ['--disable-frame-rate-limit', '--disable-gpu-vsync'],
  });
  const context = await browser.newContext({ viewport, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  await page.addInitScript((t) => localStorage.setItem('starlight-theme', t), theme);
  await page.goto(URL, { waitUntil: 'networkidle' });

  await page.locator('.vault').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.evaluate((offset) => {
    const r = document.querySelector('.vault').getBoundingClientRect();
    window.scrollBy(0, r.top - offset);
  }, TOP_OFFSET);
  await page.waitForTimeout(1200);

  const box = await page.evaluate(() => {
    const r = document.querySelector('.vault').getBoundingClientRect();
    return {
      x: Math.round(r.left), y: Math.round(r.top),
      w: Math.round(r.width), h: Math.round(r.height),
      innerW: window.innerWidth,
    };
  });

  const client = await context.newCDPSession(page);

  /* Restart the storyline so the recording and the story share an origin. */
  await page.evaluate(() => {
    document.querySelector('#steps li[data-step="1"] button')?.click();
  });
  await page.waitForTimeout(250);

  const frames = [];
  let started = null;
  client.on('Page.screencastFrame', ({ data, sessionId, metadata }) => {
    client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    const t = metadata.timestamp * 1000;
    if (started === null) started = t;
    const rel = t - started;
    if (rel > LOOP_MS + 4000) return;
    const name = resolve(dir, `f_${String(frames.length).padStart(5, '0')}.jpg`);
    frames.push({ name, t: rel });
    createWriteStream(name).end(Buffer.from(data, 'base64'));
  });

  /* No maxWidth/maxHeight: passing them makes CDP letterbox-scale the page
     into that box and hand back a frame of exactly that size, which looks
     right while every coordinate inside it is off by the scale factor. */
  await client.send('Page.startScreencast', { format: 'jpeg', quality: 95, everyNthFrame: 1 });

  const ranFor = await page.evaluate((budget) => new Promise((res) => {
    const t0 = performance.now();
    const steps = [...document.querySelectorAll('#steps li[data-step]')];
    const active = () => steps.findIndex((li) =>
      li.classList.contains('on') || li.querySelector('button').classList.contains('on')) + 1;
    let last = active();
    const iv = setInterval(() => {
      const a = active();
      if (a === 1 && last !== 1) { clearInterval(iv); res(performance.now() - t0); }
      last = a;
    }, 16);
    setTimeout(() => { clearInterval(iv); res(-1); }, budget);
  }), LOOP_MS + 4000);

  await client.send('Page.stopScreencast');
  await page.waitForTimeout(400);

  const cut = ranFor > 0 ? ranFor : LOOP_MS;
  let kept = frames.filter((f) => f.t < cut);

  /* The screencast can be WIDER than the viewport — headless Chromium will
     not render a window below a minimum width, and the page is drawn 1:1 in
     the top-left with the rest dead space. That padding is harmless; a
     NARROWER frame would mean real scaling, and every coordinate would be
     wrong. */
  const [fw, fh] = sh('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0', kept[0].name])
    .trim().split(',').map(Number);
  if (fw < box.innerW) {
    throw new Error(`screencast is ${fw}px wide for a ${box.innerW}px viewport — scaled, not padded`);
  }

  const crop = { x: box.x, y: box.y, w: box.w & ~1, h: box.h & ~1 };
  if (crop.y + crop.h > fh) {
    throw new Error(`card runs to y=${crop.y + crop.h} in a ${fw}x${fh} frame — use a taller viewport`);
  }

  /* Drop trailing frames from the loop's reset: the timeline flips a beat
     after the window has begun collapsing, and on mobile the card loses
     ~28px, so the fixed crop starts exposing the page underneath. */
  const bottomOf = (file) => Number(sh('python3', [resolve(HERE, 'lib', 'card-bottom.py'),
    file, String(crop.x), String(crop.y), String(crop.w), String(crop.h)]).trim());
  const ref = bottomOf(kept[Math.floor(kept.length / 2)].name);
  for (let i = kept.length - 1; i > kept.length - 400 && i > 0; i--) {
    if (bottomOf(kept[i].name) >= ref - 2) { kept = kept.slice(0, i + 1); break; }
  }

  /* THE guard: prove the crop is on the card before spending an encode. */
  const probe = kept[Math.floor(kept.length / 2)].name;
  const verdict = sh('python3', [resolve(HERE, 'lib', 'check-crop-edges.py'),
    probe, String(crop.x), String(crop.y), String(crop.w), String(crop.h)]).trim();
  if (!verdict.startsWith('OK')) {
    throw new Error(`crop does not line up with the card: ${verdict}\n  probe frame: ${probe}`);
  }

  await context.close();
  await browser.close();

  const span = kept[kept.length - 1].t - kept[0].t;
  console.log(`  ${mode} ${theme}: ${kept.length} frames, ${(span / 1000).toFixed(1)}s, ` +
    `${(1000 * (kept.length - 1) / span).toFixed(0)}fps source — ${verdict.toLowerCase()}`);

  writeFileSync(resolve(dir, 'crop.json'), JSON.stringify(crop));
  return { dir, crop, frames: kept };
}

/* ── encode ──────────────────────────────────────────────────────────────── */

function encode({ mode, theme }, { dir, crop, frames }) {
  /* Hold each frame until the next one's timestamp, so the storyline keeps
     wall-clock timing however irregularly the screencast delivered. */
  const lines = [];
  let total = 0;
  frames.forEach((f, i) => {
    const next = frames[i + 1];
    const d = Math.min(Math.max(next ? (next.t - f.t) / 1000 : 1 / 60, 0.0005), 0.5);
    total += d;
    lines.push(`file '${f.name}'`, `duration ${d.toFixed(5)}`);
  });
  lines.push(`file '${frames[frames.length - 1].name}'`);
  const listFile = resolve(dir, 'concat.txt');
  writeFileSync(listFile, lines.join('\n') + '\n');

  const shadow = resolve(dir, 'shadow.png');
  const mask = resolve(dir, 'mask.png');
  sh('python3', [resolve(HERE, 'lib', 'card-frame.py'),
    String(crop.w), String(crop.h), String(RADIUS), String(PAD), String(SHADOW_BLUR),
    SHADOW[theme].rgb.join(','), String(SHADOW[theme].alpha), mask, shadow]);

  const canvW = (crop.w + PAD * 2 + 1) & ~1;
  const canvH = (crop.h + PAD * 2 + 1) & ~1;
  const out = resolve(OUT, `demo-${mode}-${theme}.webm`);

  sh('ffmpeg', ['-y',
    '-f', 'concat', '-safe', '0', '-i', listFile,
    '-loop', '1', '-i', shadow,
    '-loop', '1', '-i', mask,
    '-filter_complex',
    `color=c=black@0:s=${canvW}x${canvH}:r=60,format=rgba[canvas];` +
    `[0:v]fps=60,crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},format=rgba[card];` +
    `[2:v]format=gray[mk];[card][mk]alphamerge[rcard];` +
    `[canvas][1:v]overlay=0:0:shortest=0[ws];` +
    `[ws][rcard]overlay=${PAD}:${PAD}[ov];` +
    `[ov]trim=duration=${total.toFixed(3)},setpts=PTS-STARTPTS,format=yuva420p[out]`,
    '-map', '[out]',
    '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0',
    '-b:v', '0', '-crf', '30', '-row-mt', '1', '-threads', '8',
    '-deadline', 'good', '-cpu-used', '2',
    out, '-loglevel', 'error']);

  const dur = Number(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'csv=p=0', out]).trim());
  console.log(`  wrote ${out}  (${canvW}x${canvH}, ${dur.toFixed(1)}s)`);
  return out;
}

/* ── run ─────────────────────────────────────────────────────────────────── */

mkdirSync(OUT, { recursive: true });
mkdirSync(WORK, { recursive: true });

try {
  sh('curl', ['-sfI', URL]);
} catch {
  console.error(`no dev server at ${URL} — run \`bun run dev\` first`);
  process.exit(1);
}

console.log(`recording ${TARGETS.length} clip(s) from ${URL}`);
for (const target of TARGETS) {
  console.log(`${target.mode} ${target.theme}:`);
  /* Sequentially, deliberately. Run in parallel and the browsers contend for
     the GPU: four at once dropped each capture from ~100fps to ~20. */
  const cap = await capture(target);
  encode(target, cap);
}
rmSync(WORK, { recursive: true, force: true });
console.log(`\ndone — ${TARGETS.length} clip(s) in ${OUT}`);
