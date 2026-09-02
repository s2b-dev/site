/* How long the demo's graph transitions actually move.
   Runs the vendored plugin physics headlessly over the SAME build() model the
   demo's mini graph uses (cluster sizes, hub/peripheral link probabilities
   from src/scripts/landing.js), and reports — per transition — how many
   ticks until the largest per-tick node step falls under a threshold. The
   storyline's beats are timed off these numbers (the wand press vs the
   topic lasso; phase 3's start vs the sub-topic lasso), so re-run this if
   the vendored modules, the build() probabilities or the cluster sizes
   change, and re-derive the two gaps noted in the phase-1 and phase-3 beat
   comments. At rate 1 a tick is 16.67ms.

     bun scripts/demo-settle-timing.mjs

   Keep the build() model here in step with landing.js by hand — it is a
   copy, not an import, because the demo's build() lives inside a closure. */
import { applyLayoutForces, createLayoutSimulation } from '../src/scripts/vendor/graphLayout.ts';
import { autoNodeSize, densityForceProfile } from '../src/scripts/vendor/graphUtils.ts';

const FRESH = { alphaDecay: 0.04, velocityDecay: 0.5 };
const RECLUSTER = { alpha: 0.22, alphaDecay: 0.012, velocityDecay: 0.55, boost: 3, rampEnd: 0.02 };
function boost(a) {
  if (a >= RECLUSTER.alpha) return RECLUSTER.boost;
  if (a <= RECLUSTER.rampEnd) return 1;
  const t = (RECLUSTER.alpha - a) / (RECLUSTER.alpha - RECLUSTER.rampEnd);
  const s = t * t * (3 - 2 * t);
  return RECLUSTER.boost + (1 - RECLUSTER.boost) * s;
}
function cfg(n) {
  return { linkDistance: 60, chargeStrength: -120, centerStrength: 0.07, linkStrength: 1,
    clusterCohesionStrength: 0.45, nodeSize: autoNodeSize(n), visibleNodeCount: n };
}
function makeSim(nodes, links, n) {
  const sim = createLayoutSimulation(nodes, links, cfg(n));
  sim.alphaDecay(FRESH.alphaDecay).velocityDecay(FRESH.velocityDecay);
  return { sim, nodes, reclustering: false, baseCohesion: 0.45 * densityForceProfile(n).cohesion };
}
function retune(st, nodes, links, n) {
  st.nodes = nodes; st.baseCohesion = 0.45 * densityForceProfile(n).cohesion;
  st.sim.nodes(nodes); applyLayoutForces(st.sim, nodes, links, cfg(n));
}
function startFresh(st) {
  st.reclustering = false; st.sim.alphaTarget(0);
  st.sim.alphaDecay(FRESH.alphaDecay).velocityDecay(FRESH.velocityDecay); st.sim.alpha(1);
}
function startRecluster(st) {
  st.reclustering = true; st.sim.alphaTarget(0);
  st.sim.alpha(RECLUSTER.alpha).alphaDecay(RECLUSTER.alphaDecay).velocityDecay(RECLUSTER.velocityDecay);
}
function tick(st) {
  const sim = st.sim;
  if (sim.alpha() < sim.alphaMin()) return false;
  sim.tick();
  if (st.reclustering) {
    const a = sim.alpha(); const c = sim.force('cluster');
    if (c) c.strength(st.baseCohesion * boost(a));
    if (a < RECLUSTER.rampEnd) { st.reclustering = false; sim.alphaDecay(FRESH.alphaDecay).velocityDecay(FRESH.velocityDecay); }
  }
  return true;
}

/* --- the demo's build(), as in landing.js --- */
const LABELS = [24, 18, 21, 19, 12], SUB = [9, 8, 7];
function subGroupOf(j) { let at = 0; for (let s = 0; s < SUB.length; s++) { at += SUB[s]; if (j < at) return s; } return 2; }
function subStart(sc) { let at = 0; for (let s = 0; s < sc; s++) at += SUB[s]; return at; }
function build() {
  const nodes = [], edges = [], AT = [], mem = [];
  for (let c = 0; c < 5; c++) {
    AT.push(nodes.length);
    for (let j = 0; j < LABELS[c]; j++) nodes.push({ home: c, cluster: null, subc: c === 0 ? subGroupOf(j) : 0, degree: 0,
      x: (Math.random() - 0.5) * 560, y: (Math.random() - 0.5) * 360, vx: 0, vy: 0 });
  }
  for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) {
    const na = nodes[a], nb = nodes[b];
    const aHub = na.home === 0 ? a === AT[0] + subStart(na.subc) : a === AT[na.home];
    const bHub = nb.home === 0 ? b === AT[0] + subStart(nb.subc) : b === AT[nb.home];
    let p;
    if (na.home !== nb.home) p = (aHub || bHub) ? 0.010 : 0.0004;
    else if (na.home === 0 && na.subc !== nb.subc) p = (aHub || bHub) ? 0.14 : 0.012;
    else p = (aHub || bHub) ? 0.82 : 0.055;
    if (Math.random() < p) {
      const l = { source: na, target: nb, weight: 1, type: 'wiki' };
      edges.push(l); na.degree++; nb.degree++;
      if (na.home === 0 && nb.home === 0) mem.push(l);
    }
  }
  return { nodes, edges, mem };
}

/* Per-tick [max step, mean step] over the active nodes until rest. */
function series(st, maxTicks) {
  const nodes = st.nodes, out = [];
  for (let t = 0; t < maxTicks; t++) {
    const px = nodes.map(n => n.x), py = nodes.map(n => n.y);
    if (!tick(st)) break;
    let mx = 0, sum = 0;
    for (let i = 0; i < nodes.length; i++) { const d = Math.hypot(nodes[i].x - px[i], nodes[i].y - py[i]); if (d > mx) mx = d; sum += d; }
    out.push([mx, sum / nodes.length]);
  }
  return out;
}
function ticksToRest(S) {
  const v = S.map(s => s.length).sort((a, b) => a - b);
  return `${v[Math.floor(v.length * 0.5)]} (p90 ${v[Math.floor(v.length * 0.9)]})`;
}
function quietTick(S, th) {
  const v = S.map(s => { for (let i = 0; i < s.length; i++) if (s.slice(i).every(x => x[0] < th)) return i + 1; return s.length; }).sort((a, b) => a - b);
  return `${v[Math.floor(v.length * 0.5)]} (p90 ${v[Math.floor(v.length * 0.9)]})`;
}

const T = 40, settle = [], organize = [], immerse = [];
for (let r = 0; r < T; r++) {
  const { nodes, edges, mem } = build();
  const st = makeSim(nodes, edges, nodes.length);
  startFresh(st); settle.push(series(st, 600));                       // settleWeb(): off-screen
  nodes.forEach(n => n.cluster = n.home); startRecluster(st); organize.push(series(st, 400));   // wand press
  const m = nodes.filter(n => n.home === 0); m.forEach(n => n.cluster = 10 + n.subc);
  retune(st, m, mem, m.length); startRecluster(st); immerse.push(series(st, 400));               // immerse
}
for (const [name, S] of [['settle (off-screen)', settle], ['organize (wand press)', organize], ['immerse', immerse]]) {
  console.log(name, { ticksToRest: ticksToRest(S), maxStepUnder_0_5: quietTick(S, 0.5), under_0_2: quietTick(S, 0.2), under_0_1: quietTick(S, 0.1) });
}
console.log('ms at rate 1 = ticks × 16.67');
