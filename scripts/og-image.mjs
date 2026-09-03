/* Renders public/og.png (1200×630), the image behind og:image / twitter:image
   on every page. Hand-built rather than templated per page: one image, drawn
   in the landing page's own tokens, so a share on Reddit, Discord or the
   Obsidian forum carries the brand instead of a bare link.

     bun scripts/og-image.mjs

   Re-run and commit the PNG when the tokens, the wordmark or the tagline
   change. It is a build input, not a build step: sharp is already a
   dependency (Astro's image service), and rasterising at build would make
   every deploy depend on the CI runner's fonts. The text is Inter, which
   must be installed on the machine that runs this — librsvg resolves it via
   fontconfig and silently falls back to a serif otherwise, so eyeball the
   output once.

   The graph on the right follows the hero canvas's rules (see CLAUDE.md):
   hues are the plugin's cluster formula (evenly spaced, 70% sat), every node
   is linked to its topic's hub so no large dot floats unattached, and radius
   is derived from degree via the plugin's nodeDrawRadius curve. Seeded, so
   the PNG is reproducible. */
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'public', 'og.png');
const W = 1200, H = 630;

/* Tokens from landing.css :root (dark — the brand surface). */
const BG = '#0f0e13', TEXT = '#e8e6f0', TEXT_2 = '#a5a1b8', TEXT_3 = '#6f6b85';
const ACCENT = '#a882ff', GRAD_2 = '#5eead4';

/* Wordmark: the three glyph paths from src/assets/logo-dark.svg (39×11). */
const wordmark = readFileSync(join(here, '..', 'src', 'assets', 'logo-dark.svg'), 'utf8')
  .match(/<path[^>]*\/>/g).join('');

/* ---- decorative graph -------------------------------------------------- */
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const K = 4;
const HUES = Array.from({ length: K }, (_, i) => Math.round(i * 360 / K));
const hsla = (c, l, a) => `hsla(${HUES[c]}, 70%, ${l}%, ${a})`;
/* nodeDrawRadius's shape (base + min(log1p(degree)*k, base*5)) at a base
   sized for a 1200px image. */
const radius = d => 3.2 + Math.min(Math.log1p(d) * 3.4, 3.2 * 5);

const centers = [[890, 150], [1090, 235], [910, 395], [1090, 505]];
const sizes = [9, 8, 10, 7];
const nodes = [], edges = [];
centers.forEach(([cx, cy], c) => {
  const hub = nodes.length;
  nodes.push({ x: cx, y: cy, c, deg: 0 });
  for (let j = 1; j < sizes[c]; j++) {
    const a = rnd() * Math.PI * 2, r = 42 + rnd() * 55;
    nodes.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, c, deg: 0 });
    edges.push([hub, nodes.length - 1, c]);                 // hub spoke
    if (j > 1 && rnd() < 0.18) edges.push([nodes.length - 2, nodes.length - 1, c]);
  }
});
/* Cross-topic ties, hub to hub, drawn neutral like the hero's bridges. */
const hubs = centers.map((_, c) => nodes.findIndex(n => n.c === c));
[[0, 1], [0, 2], [1, 3], [2, 3]].forEach(([a, b]) => edges.push([hubs[a], hubs[b], -1]));
edges.forEach(([a, b]) => { nodes[a].deg++; nodes[b].deg++; });

const edgeSvg = edges.map(([a, b, c]) => {
  const s = nodes[a], t = nodes[b];
  const stroke = c < 0 ? 'rgba(150,145,180,0.22)' : hsla(c, 55, 0.32);
  return `<line x1="${s.x.toFixed(1)}" y1="${s.y.toFixed(1)}" x2="${t.x.toFixed(1)}" y2="${t.y.toFixed(1)}" stroke="${stroke}" stroke-width="1.4"/>`;
}).join('');
const nodeSvg = nodes.map(n => {
  const hub = n.deg >= 6;
  return `<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${radius(n.deg).toFixed(1)}" fill="${hub ? hsla(n.c, 66, 0.98) : hsla(n.c, 58, 0.78)}"/>`;
}).join('');

/* ---- composition --------------------------------------------------------- */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="grad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="10%" stop-color="${ACCENT}"/><stop offset="90%" stop-color="${GRAD_2}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.16"/><stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <ellipse cx="990" cy="330" rx="330" ry="340" fill="url(#glow)"/>
  <g>${edgeSvg}${nodeSvg}</g>

  <g transform="translate(72 72) scale(3.6)">${wordmark}</g>

  <g font-family="Inter" fill="${TEXT}">
    <text x="72" y="300" font-size="78" font-weight="700" letter-spacing="-2.2">Your vault,</text>
    <text x="72" y="388" font-size="78" font-weight="700" letter-spacing="-2.2">but <tspan fill="url(#grad)">smarter</tspan></text>
    <text x="72" y="456" font-size="24" font-weight="500" fill="${TEXT_2}">A free, open-source Obsidian plugin.</text>
    <text x="72" y="492" font-size="24" font-weight="500" fill="${TEXT_2}">Chat with your notes, see them grouped by topic, search by meaning.</text>
    <text x="72" y="562" font-size="22" font-weight="500" fill="${TEXT_3}">smartsecondbrain.dev</text>
  </g>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(OUT);
const isolated = nodes.filter(n => n.deg === 0).length;
console.log(`wrote ${OUT} (${nodes.length} nodes, ${edges.length} edges, ${isolated} isolated)`);
