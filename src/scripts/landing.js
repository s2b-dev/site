/* ---------- plugin physics & geometry (vendored) ----------
   The demo's graphs run the plugin's OWN layout code, not an imitation of it.
   `scripts/vendor/` holds verbatim copies of the plugin's pure modules — the
   d3-force assembly (graphLayout), its density/radius tuning (graphUtils), the
   camera framing (graphAnimation) and the topic-region geometry (convexHull).
   The plugin extracted those from its canvas precisely so the identical
   physics can run headlessly; this is that seam, used for marketing. */
import { applyLayoutForces, createLayoutSimulation, clusterCohesionForce } from './vendor/graphLayout';
import { autoNodeSize, densityForceProfile, nodeDrawRadius, zoomNodeScale } from './vendor/graphUtils';
import { computeCoreNodeBounds, computeNodeBounds, framingTransform } from './vendor/graphAnimation';
import { buildTopicRegion, centroid } from './vendor/convexHull';

/* ---------- intro offset measurement ---------- */
(function () {
  var logo = document.querySelector('.hero .logo-lockup');
  if (!logo || !document.documentElement.classList.contains('intro-on')) return;
  function measure() {
    var r = logo.getBoundingClientRect();
    var docCenter = r.top + window.scrollY + r.height / 2;
    var off = (window.innerHeight / 2) - docCenter;
    logo.style.setProperty('--off', off > 40 ? off + 'px' : '0px');
  }
  measure();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
})();

var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- shared physics harness ----------
   The wiring both graph canvases share around the vendored modules: the
   plugin's default force settings, its transition regimes, and a fitted
   camera. Numbers are the plugin's, with their source noted — change them
   there, not here. */

/* DEFAULT_SMART_GRAPH_SETTINGS (types/graph.ts): the physics a user gets out
   of the box, tuned for the fused wiki+semantic graph.
   `representedCount` sizes the nodes and may exceed the visible count: a
   collapsed topic counts as its members, not as one node, so folding doesn't
   change the sizing regime — the canvas's representedNoteCount. */
function simConfigFor(visibleNodeCount, representedCount) {
  return {
    linkDistance: 60,
    chargeStrength: -120,
    centerStrength: 0.07,
    linkStrength: 1,
    clusterCohesionStrength: 0.45,
    nodeSize: autoNodeSize(representedCount || visibleNodeCount),
    visibleNodeCount: visibleNodeCount
  };
}

/* GraphCanvas.svelte's simulation lifecycle. FRESH is the initial layout
   (setupForceSimulation's isFreshLayout branch); RECLUSTER is the granularity
   transition — same nodes, new topic ids — with its slower decay, higher drag
   and a 3× cohesion boost eased back by smoothstep so freshly split topics
   separate instead of staying interleaved. */
var FRESH = { alphaDecay: 0.04, velocityDecay: 0.5 };
var RECLUSTER = {
  alpha: 0.22, alphaDecay: 0.012, velocityDecay: 0.55,
  boost: 3, rampEnd: 0.02
};
/* GraphCanvas's collapse/expand transition: alpha held at RETARGET_ALPHA for
   RETARGET_HOLD_MS so a distant node has time to travel, then released to
   decay normally. 72 ticks ≈ 1200ms at 60fps. */
var RETARGET = { alpha: 0.3, holdTicks: 72 };

/** GraphCanvas's reclusterBoostFactor: full boost early, easing to 1. */
function reclusterBoostFactor(alpha) {
  if (alpha >= RECLUSTER.alpha) return RECLUSTER.boost;
  if (alpha <= RECLUSTER.rampEnd) return 1;
  var t = (RECLUSTER.alpha - alpha) / (RECLUSTER.alpha - RECLUSTER.rampEnd);
  var s = t * t * (3 - 2 * t);
  return RECLUSTER.boost + (1 - RECLUSTER.boost) * s;
}

/**
 * One simulation with the demo's bookkeeping: which transition regime is
 * active, and the per-tick recluster boost. `retune(count)` re-applies the
 * full force set for a changed node set — what the plugin's rebuild does.
 */
function makeSim(nodes, links, count, represented) {
  var sim = createLayoutSimulation(nodes, links, simConfigFor(count, represented));
  sim.alphaDecay(FRESH.alphaDecay).velocityDecay(FRESH.velocityDecay);
  var state = {
    sim: sim,
    nodes: nodes,
    links: links,
    count: count,
    reclustering: false,
    retargetTicks: 0,
    /** The cohesion the boost multiplies — base × the density profile's. */
    baseCohesion: 0.45 * densityForceProfile(count).cohesion
  };
  return state;
}

function retune(state, nodes, links, count, represented) {
  flattenLerp(state);
  state.nodes = nodes; state.links = links; state.count = count;
  state.baseCohesion = 0.45 * densityForceProfile(count).cohesion;
  state.sim.nodes(nodes);
  applyLayoutForces(state.sim, nodes, links, simConfigFor(count, represented));
}

/** Kick off a fresh-layout settle (initial clustering). */
function startFresh(state, rate) {
  flattenLerp(state);
  state.reclustering = false; state.retargetTicks = 0;
  state.rate = rate || 1; state.tickAcc = 0;
  state.sim.alphaTarget(0);
  state.sim.alphaDecay(FRESH.alphaDecay).velocityDecay(FRESH.velocityDecay);
  state.sim.alpha(1);
}

/** Kick off the plugin's re-cluster transition (new topic ids, same notes). */
function startRecluster(state, rate) {
  flattenLerp(state);
  state.reclustering = true; state.retargetTicks = 0;
  state.rate = rate || 1; state.tickAcc = 0;
  state.sim.alphaTarget(0);
  state.sim
    .alpha(RECLUSTER.alpha)
    .alphaDecay(RECLUSTER.alphaDecay)
    .velocityDecay(RECLUSTER.velocityDecay);
}

/** Kick off the collapse/expand transition: a held alpha, then release. */
function startRetarget(state, rate) {
  flattenLerp(state);
  state.reclustering = false;
  state.rate = rate || 1; state.tickAcc = 0;
  state.retargetTicks = RETARGET.holdTicks;
  /* The recluster's heavier drag, not FRESH's: at velocityDecay 0.5 the nodes
     covered the whole fold in a handful of ticks — so the dots arrived at the
     topic point while the hull and camera were still easing after them, and
     the two halves of one motion looked unrelated. Damped, the nodes travel
     over the same span as everything else. */
  state.sim.alphaDecay(FRESH.alphaDecay).velocityDecay(RECLUSTER.velocityDecay);
  state.sim.alpha(Math.max(state.sim.alpha(), RETARGET.alpha)).alphaTarget(RETARGET.alpha);
}

/* ---- render interpolation between ticks ----
   The simulation advances in whole ticks, but a frame rarely carries exactly
   one: slow-motion playback (`rate` < 1) owes a fraction, and so does any
   display faster than 60Hz once ticks are timed per millisecond (below).
   Drawing the raw positions then holds the nodes still for a frame or two
   and jumps them — the opening beat at rate 0.34 moved them on every third
   frame, 20Hz motion, and on a Firefox pinned to a 60Hz display that read
   as a stutter while a 120Hz Safari looked smooth. So every tick is
   bracketed: the positions before and after it are kept, and between ticks
   the nodes are drawn at the point along that segment the accumulator has
   reached. One tick of latency, and everything that reads n.x/n.y — edges,
   hulls, lassos, pills, the camera — sees one smooth path. The true
   positions are put back before the next tick, so the physics never sees an
   interpolated value; flattenLerp() does the same for any code about to
   write positions or swap the node set. */
function snapshot(state, into) {
  var nodes = state.nodes, buf = state[into];
  if (!buf || buf.length !== nodes.length * 2) buf = state[into] = new Float64Array(nodes.length * 2);
  for (var i = 0; i < nodes.length; i++) { buf[2 * i] = nodes[i].x; buf[2 * i + 1] = nodes[i].y; }
}
function lerpPositions(state, f) {
  var from = state.lerpFrom, to = state.lerpTo, nodes = state.nodes;
  if (!from || !to || to.length !== nodes.length * 2) return;
  for (var i = 0; i < nodes.length; i++) {
    nodes[i].x = from[2 * i] + (to[2 * i] - from[2 * i]) * f;
    nodes[i].y = from[2 * i + 1] + (to[2 * i + 1] - from[2 * i + 1]) * f;
  }
}
/** Land on the true (post-tick) positions and forget the bracket. */
function flattenLerp(state) {
  lerpPositions(state, 1);
  state.lerpFrom = null; state.lerpTo = null;
}

/**
 * Advance the simulation for one frame, mirroring GraphCanvas's tick handler:
 * while reclustering, the cohesion force rides the smoothstep boost, and the
 * base decays come back once the transition has settled; a retarget holds its
 * alpha for its window, then releases the target so the sim can rest.
 *
 * `dtFrames` is the frame's length in 60Hz frames. Ticks are owed per unit
 * TIME, not per frame: the storyline's beats are milliseconds, and a layout
 * that ticked once per frame reached rest 2.4× sooner on a 144Hz display
 * than on a 60Hz one — a different beat on every monitor. Callers clamp it
 * (a tab wake must not dump a backlog of ticks); left undefined it means
 * "one whole tick, no interpolation", which is what settleSim wants.
 */
function tickSim(state, dtFrames) {
  var sim = state.sim;
  var headless = dtFrames === undefined;
  var dt = headless ? 1 : dtFrames;
  if (state.retargetTicks > 0) {
    state.retargetTicks -= dt;
    if (state.retargetTicks <= 0) { state.retargetTicks = 0; sim.alphaTarget(0); }
  } else if (sim.alpha() < sim.alphaMin()) {
    /* At rest: finish on the true positions, not part-way to them. */
    flattenLerp(state);
    return false;
  }
  /* `rate` is playback speed: 1 is the plugin's real time (one tick per
     16.7ms), below 1 is slow motion — same forces, same trajectory, same end
     state, advanced by a fraction of a tick per frame so the eye can follow
     it. The demo's transitions run at 1; the granularity explorer slows its
     regroups (see PLAY there). The FRESH settle from scatter that once needed
     a third speed no longer plays at all — it is run to rest off-screen. */
  state.tickAcc = (state.tickAcc || 0) + (state.rate || 1) * dt;
  if (state.tickAcc < 1) {
    if (!headless) lerpPositions(state, state.tickAcc);
    return true;
  }
  /* Put the true positions back before the physics reads them. */
  if (headless) flattenLerp(state); else { lerpPositions(state, 1); snapshot(state, 'lerpFrom'); }
  while (state.tickAcc >= 1) {
    state.tickAcc -= 1;
    sim.tick();
    if (state.reclustering) {
      var a = sim.alpha();
      var cluster = sim.force('cluster');
      if (cluster) cluster.strength(state.baseCohesion * reclusterBoostFactor(a));
      if (a < RECLUSTER.rampEnd) {
        state.reclustering = false;
        sim.alphaDecay(FRESH.alphaDecay).velocityDecay(FRESH.velocityDecay);
      }
    }
  }
  if (!headless) { snapshot(state, 'lerpTo'); lerpPositions(state, state.tickAcc); }
  return true;
}

/** Run the simulation to rest in one go — phase jumps and reduced motion. */
function settleSim(state) {
  /* Fast-forward: run at real time whatever the playback rate, since this is
     "arrive at the end state now", not something anyone watches. */
  var rate = state.rate;
  state.rate = 1; state.tickAcc = 0;
  var guard = 600;
  while (guard-- > 0 && tickSim(state)) { /* advance */ }
  state.rate = rate;
  var cluster = state.sim.force('cluster');
  if (cluster) cluster.strength(state.baseCohesion);
  state.reclustering = false;
}
/**
 * A camera that keeps the world-space layout framed in the canvas — the
 * plugin's framingTransform over full bounds, centred on the outlier-trimmed
 * core, glided per-frame the way its overlapping 150ms refits read. `pad`
 * scales GRAPH_FIT_PADDING's shape (labels above need the most room) down to
 * the demo's smaller canvases.
 */
function makeCamera() {
  return { x: 0, y: 0, scale: 1, started: false };
}

function cameraTarget(nodes, W, H, filter, opts) {
  var bounds = computeNodeBounds(nodes, filter);
  if (!bounds) return null;
  var o = opts || {};
  /* Fit the HULLS, not the dots. The topic outline extends HULL_PAD world
     units past its nodes and the pill sits above that, so a fit to the dots
     alone ran the lowest topic off the canvas — and under the selection bar,
     which sits over the bottom of the canvas whenever a topic is selected.
     `worldPad` grows the bounds by the hull padding (in world units, so it
     scales with the zoom); `bottom` reserves screen pixels for the bar. The
     reservation is constant rather than toggled with the bar, so the camera
     never refits just because a bar appeared. */
  if (o.worldPad) {
    bounds = { minX: bounds.minX - o.worldPad, maxX: bounds.maxX + o.worldPad,
      minY: bounds.minY - o.worldPad, maxY: bounds.maxY + o.worldPad };
  }
  var pad = { top: 44, right: 30, bottom: 26 + (o.bottom || 0), left: 30 };
  return framingTransform(bounds, { width: W, height: H }, pad, 1.3,
    computeCoreNodeBounds(nodes, filter));
}

function cameraFollow(cam, target, snap, rate) {
  if (!target) return;
  if (snap || !cam.started) {
    cam.x = target.x; cam.y = target.y; cam.scale = target.scale;
    cam.started = true;
    return;
  }
  /* Approximates the canvas's continuous overlapping eases. Scaled by the
     playback rate: a fixed per-frame ease against slowed physics makes the
     camera the fastest thing on screen, so the framing arrives before the
     nodes it is framing — which reads as the region lagging the dots. */
  var k = 0.14 * (rate || 1);
  cam.x += (target.x - cam.x) * k;
  cam.y += (target.y - cam.y) * k;
  cam.scale += (target.scale - cam.scale) * k;
}

/** The padded, smoothed outline drawn around a topic's notes (world space). */
function topicRegion(pts, pad) {
  return buildTopicRegion(pts, pad);
}

/** Rounded-rectangle path. Takes its context, unlike the callers' locals. */
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------- theme toggle ----------
   The initial theme is set pre-paint by an inline script in index.astro.
   This only handles clicks, and writes the same 'starlight-theme' key the
   docs read so the choice survives navigation into Starlight. */
(function () {
  var btn = document.querySelector('.theme-tg');
  if (!btn) return;
  var root = document.documentElement;

  function sync() {
    btn.setAttribute('aria-pressed', root.dataset.theme === 'light' ? 'true' : 'false');
  }
  sync();

  btn.addEventListener('click', function () {
    var next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try {
      localStorage.setItem('starlight-theme', next);
    } catch (e) {
      /* private mode — the theme still applies for this page view */
    }
    sync();
    window.dispatchEvent(new CustomEvent('s2b-theme-change'));
  });

  /* Follow the OS only while the user has made no explicit choice. */
  var mq = window.matchMedia('(prefers-color-scheme: light)');
  var onOS = function (e) {
    var stored = null;
    try {
      stored = localStorage.getItem('starlight-theme');
    } catch (err) {
      /* ignore */
    }
    if (stored === 'light' || stored === 'dark') return;
    root.dataset.theme = e.matches ? 'light' : 'dark';
    sync();
    window.dispatchEvent(new CustomEvent('s2b-theme-change'));
  };
  if (mq.addEventListener) mq.addEventListener('change', onOS);
  else if (mq.addListener) mq.addListener(onOS);
})();

/* ---------- hero graph: Leiden-style community clustering ----------
   Mirrors what the plugin actually does today: communities are detected and
   colour-coded, and the view can collapse to topic level (outline view).
   Colours use the plugin's own formula — evenly spaced hues at 70% sat,
   55% light (see generateClusterColors in src/types/graph.ts). */
(function () {
  var cv = document.getElementById('graph');
  if (!cv) return;
  var ctx = cv.getContext('2d');
  var W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);

  var K = 5;
  var HUES = [];
  for (var i = 0; i < K; i++) HUES.push(Math.round(i * 360 / K));

  /* Lightness/alpha come from CSS so the graph tracks the active theme;
     hue and saturation stay fixed to the plugin's cluster formula. */
  var PALETTE = {};
  function readPalette() {
    var cs = getComputedStyle(document.documentElement);
    function tok(name, fallback) {
      var v = cs.getPropertyValue(name).trim();
      return v || fallback;
    }
    PALETTE = {
      nodeL: tok('--g-node-l', '55%'),
      nodeA: tok('--g-node-a', '0.62'),
      hubL: tok('--g-hub-l', '62%'),
      hubA: tok('--g-hub-a', '0.95'),
      edgeL: tok('--g-edge-l', '55%'),
      edgeA: tok('--g-edge-a', '0.16'),
      bridge: tok('--g-bridge', 'rgba(150,145,180,0.07)'),
    };
  }
  readPalette();

  function hsla(c, l, a) {
    return 'hsla(' + HUES[c] + ', 70%, ' + l + ', ' + a + ')';
  }

  var nodes = [], edges = [], centers = [];

  /* The plugin's own degree-driven radius (nodeDrawRadius in graphUtils.ts,
     non-topic branch), at the hero's smaller base size. Sizing off anything
     else — a random roll, or an index — draws big dots with no links behind
     them, which is the one thing a reader can check by eye. */
  var NODE_BASE = 1.4;
  function drawRadius(degree) {
    return NODE_BASE + Math.min(Math.log1p(degree) * 1.6, NODE_BASE * 5);
  }

  function build() {
    nodes = []; edges = []; centers = [];
    var perCluster = 13;
    /* Size off the geometric mean of the two axes rather than the smaller
       one: the hero is full-viewport, so min(W,H) swings wildly between a
       wide desktop and a tall phone and the layout stretches with it. */
    var unit = Math.sqrt(W * H);
    var hubs = [];
    for (var c = 0; c < K; c++) {
      var a = (c / K) * Math.PI * 2 - Math.PI / 2;
      var rad = unit * 0.30;
      centers.push({ x: W/2 + Math.cos(a)*rad, y: H/2 + Math.sin(a)*rad*0.78 });
      for (var j = 0; j < perCluster; j++) {
        var spread = unit * 0.075;
        nodes.push({
          c: c,
          /* Remembered so cohesion pulls toward a spot in the cluster rather
             than its exact centre — without this every node converges on one
             point and the community collapses. */
          ox: (Math.random()-0.5)*spread*2,
          oy: (Math.random()-0.5)*spread*2,
          vx: 0, vy: 0,
          degree: 0
        });
        var n0 = nodes[nodes.length-1];
        n0.x = centers[c].x + n0.ox;
        n0.y = centers[c].y + n0.oy;
        if (j === 0) hubs.push(nodes.length - 1);
      }
    }

    var seen = {};
    function link(n, m, intra) {
      var key = n + ':' + m;
      if (seen[key]) return;
      seen[key] = 1;
      edges.push([n, m, intra]);
      nodes[n].degree++; nodes[m].degree++;
    }

    /* Hub-heavy inside each community, weak ties across — the same structure
       the demo graph builds, and the reason Leiden finds communities here at
       all. An even mesh has no communities to detect, and a coin-flip mesh
       leaves unlinked notes floating. */
    for (var n = 0; n < nodes.length; n++) {
      for (var m = n+1; m < nodes.length; m++) {
        if (nodes[n].c !== nodes[m].c) continue;
        var hub = hubs[nodes[n].c];
        var touchesHub = n === hub || m === hub;
        if (Math.random() < (touchesHub ? 0.82 : 0.055)) link(n, m, 1);
      }
    }
    /* Cross-topic ties are hub-to-hub: that is what a bridging note looks
       like in a real vault, and it keeps the whole graph one connected web. */
    for (var h = 0; h < hubs.length; h++) {
      for (var g = h+1; g < hubs.length; g++) {
        if (Math.random() < 0.45) link(hubs[h], hubs[g], 0);
      }
    }
    /* No orphans. A note with no links is a real thing in a vault, but it is
       not what this graph is illustrating, and an unconnected dot reads as a
       rendering fault rather than a fact. */
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].degree === 0) link(Math.min(i, hubs[nodes[i].c]), Math.max(i, hubs[nodes[i].c]), 1);
    }
    for (var k = 0; k < nodes.length; k++) nodes[k].r = drawRadius(nodes[k].degree);
  }

  /* Rescale an existing layout into a new box instead of rebuilding it.
     `build()` re-rolls every position, offset, radius and edge, so calling it
     on resize throws the settled graph away — and on mobile the URL bar
     collapsing on scroll fires `resize` with an unchanged width, which is
     exactly the "goes crazy on scroll" case. Positions are kept relative to
     the box so a real resize stretches the graph rather than restarting it.
     (The demo's mini graph solves the same problem with a world-space layout
     and a fitted camera; this one is simple enough to just scale.) */
  function rescale(oldW, oldH) {
    var unit0 = Math.sqrt(oldW * oldH), unit1 = Math.sqrt(W * H);
    var us = unit0 ? unit1 / unit0 : 1;
    var sx = oldW ? W / oldW : 1, sy = oldH ? H / oldH : 1;
    for (var c = 0; c < centers.length; c++) {
      centers[c].x = W / 2 + (centers[c].x - oldW / 2) * sx;
      centers[c].y = H / 2 + (centers[c].y - oldH / 2) * sy;
    }
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.x = W / 2 + (n.x - oldW / 2) * sx;
      n.y = H / 2 + (n.y - oldH / 2) * sy;
      /* Offsets and radii are unit-scaled, not axis-scaled, so clusters keep
         their shape when the aspect ratio changes. */
      n.ox *= us; n.oy *= us;
      n.vx = 0; n.vy = 0;
    }
  }

  function resize() {
    var r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var oldW = W, oldH = H;
    W = r.width; H = r.height;
    cv.width = W*DPR; cv.height = H*DPR;
    ctx.setTransform(DPR,0,0,DPR,0,0);
    if (!nodes.length) build();
    else if (W !== oldW || H !== oldH) rescale(oldW, oldH);
    /* Assigning cv.width clears the canvas, so repaint synchronously —
       otherwise the hero blanks until the next frame. */
    draw();
  }

  var t = 0;
  var lastT = 0;
  function step(now) {
    /* Delta-timed, so the graph moves at the same speed on a 60Hz and a 120Hz
       display and a stalled frame (scroll, tab wake, reload) doesn't dump a
       backlog of impulse into the nodes. The frame budget is clamped to 50ms:
       past that we'd rather the graph pause than lurch. */
    var dt = lastT ? Math.min((now - lastT) / 16.667, 3) : 1;
    lastT = now;
    t += 0.0045 * dt;
    /* Per-frame damping raised to dt keeps the decay time constant fixed
       regardless of frame rate. */
    var damp = Math.pow(0.94, dt);
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], ct = centers[n.c];
      /* Cohesion toward the node's own place in the cluster, not the shared
         centre — the same force concept the graph view exposes, but it keeps
         the community spread instead of collapsing it to a point. */
      n.vx += (ct.x + n.ox - n.x) * 0.0016 * dt;
      n.vy += (ct.y + n.oy - n.y) * 0.0016 * dt;
      /* gentle drift so it never looks frozen */
      n.vx += Math.cos(t*1.7 + i*0.7) * 0.010 * dt;
      n.vy += Math.sin(t*1.4 + i*0.9) * 0.010 * dt;
      n.vx *= damp; n.vy *= damp;
      n.x += n.vx * dt; n.y += n.vy * dt;
    }
  }

  function draw() {
    ctx.clearRect(0,0,W,H);
    for (var e = 0; e < edges.length; e++) {
      var a = nodes[edges[e][0]], b = nodes[edges[e][1]], intra = edges[e][2];
      ctx.beginPath();
      ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
      /* Neutral, never cluster-tinted — edges are one colour in the real
         graph (pixiRenderer's c.graphLine), and the backdrop follows suit.
         Hue 0 at 0% saturation is grey; the L/A tokens still tune weight
         per theme. */
      ctx.strokeStyle = intra
        ? 'hsla(0, 0%, ' + PALETTE.edgeL + ', ' + PALETTE.edgeA + ')'
        : PALETTE.bridge;
      ctx.lineWidth = intra ? 0.8 : 0.6;
      ctx.stroke();
    }
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI*2);
      /* Emphasis follows degree too, so the brighter dots are the ones with
         the most links rather than an arbitrary one per cluster. */
      ctx.fillStyle = n.degree >= 6
        ? hsla(n.c, PALETTE.hubL, PALETTE.hubA)
        : hsla(n.c, PALETTE.nodeL, PALETTE.nodeA);
      ctx.fill();
    }
  }

  resize();
  /* A ResizeObserver on the canvas, not a window resize listener: it reports
     the box the graph is actually drawn into, and it does NOT fire for the
     mobile URL-bar show/hide that leaves the canvas box untouched — which a
     window `resize` does, and which used to rebuild the whole graph mid-scroll. */
  if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);
  else window.addEventListener('resize', resize);

  /* Re-read the palette when the theme flips. The animated path picks the new
     colours up on its next frame; the reduced-motion path must redraw itself. */
  window.addEventListener('s2b-theme-change', function () {
    readPalette();
    if (REDUCED) draw();
  });

  if (REDUCED) { draw(); return; }
  /* Reset the clock when the tab comes back: `now` jumps by however long the
     tab was hidden, and without this the first frame back is a huge dt. */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) lastT = 0;
  });
  /* Animate only while on screen. This is a full-viewport canvas cleared
     and redrawn every frame at up to 2× DPR — on a CPU-rasterised canvas
     (Firefox on macOS) the most expensive thing on the page — and it used
     to keep running while the visitor watched the demo below it. `lastT`
     resets on resume so the first frame back is not a 50ms lurch. */
  var running = false;
  function loop(now) { if (!running) return; step(now); draw(); requestAnimationFrame(loop); }
  function start() { if (running) return; running = true; lastT = 0; requestAnimationFrame(loop); }
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) start(); else running = false; });
    }, { threshold: 0 }).observe(cv);
  } else start();
})();

/* ---------- integrated workspace demo ----------
   One looping storyline in five phases, each carrying a differentiating
   feature, all mirroring real plugin behaviour:
   1. the graph opens as the linked-but-ungrouped web the vault already is,
      and pressing the wand (show topics) gathers it into labelled topics
      (automatic topic detection),
   2. a lasso selects the Memory topic and Immerse re-groups its own notes
      into the finer topics inside it (lasso selection, immerse),
   3. a second lasso picks one sub-topic and opens it in the chat, where the
      agent drafts an edit that waits for approval (ambient graph selection,
      staged edits),
   4. the draft is short one fact, so search finds the note that has it —
      by meaning, not by words — and the agent folds it into the SAME staged
      change,
   5. which is then approved hunk by hunk in the note itself, and the
      overview shows the checklist linked to the notes it now cites.

   The phases are one story, not a feature list: each begins from the state
   the last one left. Phase 4 in particular is caused by phase 3 — the agent's
   first answer names the gap it can't fill (see ANSWER), so the search
   resolves a tension the story already has rather than introducing a new
   feature. The gap and the query are the SAME question in plain words
   ("what makes a memory last" / "how to make it last"); an earlier pair
   asked about triggers and then about forgetting, two hops the viewer had
   to make alone. Keep that causal chain intact when editing; it is the difference
   between a storyline and a feature reel. */
(function () {
  var vault = document.getElementById('vault');
  if (!vault) return;

  /* How long a lasso takes to draw. Shared by the STROKE (graph.step advances
     lassoP over this many ms) and the simulated CURSOR that traces it
     (cursorTraceLasso) — they must use one number or the hand and the line it
     is drawing drift apart. */
  var LASSO_MS = 560;

  var QUERY_SEARCH = 'how to make it last';
  /* "Long-term memory", not "Consolidation". Consolidation is the correct
     term for the process and the notes are a psych course — but a first-time
     viewer watching an AGENT work reads "consolidation" as something the
     agent is doing to their notes, not as the subject the notes are about.
     At demo speed there is no time to recover from that misreading. */
  var QUERY_CHAT = 'Draft the long-term memory part of my checklist';
  var QUERY_CHAT2 = 'Fold this in too';

  /* None of these snippets contain the query's words — that gap is the
     entire point of the semantic phase. */
  var RESULTS = [
    { id: 'lec8', n: 'Lecture 8 — Sleep',  p: 'Psych 101', t: 'deep sleep and its role in retaining what you learn' },
    { id: 'slides', n: 'Week 7 slides.pdf', p: 'Psych 101', t: 'slide 18, the hippocampus and storing memories' }
  ];

  /* --- element refs --- */
  var chat = document.getElementById('vChat');
  /* Host for the staged-edit bar, between the messages and the composer. */
  var pending = document.getElementById('vPending');
  var search = document.getElementById('vSearch');
  var vsBox = document.querySelector('.vs-box');
  var typed = document.getElementById('vsTyped');
  var ph = document.getElementById('vsPh');
  var resultsEl = document.getElementById('vsResults');
  var vsEmpty = document.getElementById('vsEmpty');
  /* Mobile-only dismiss layer behind the selection sheet. It tracks the two
     selection bars, since on mobile those render as a bottom sheet and a sheet
     needs something to catch the tap that closes it. */
  var vDismiss = document.getElementById('vDismiss');
  var vPlus = document.getElementById('vPlus');
  /* The note view that opens over the graph for the in-note diff review. */
  var vNote = document.getElementById('vNote');
  var vNoteClose = document.getElementById('vNoteClose');
  /* The same modal serves search and the vault picker; on mobile the story
     reaches it through the + button, so its placeholder switches to the
     picker's — the real one reads exactly this. */
  var PH_SEARCH = 'Search notes with #tag or /folder…';
  var PH_PICKER = 'Search vault files to attach…';
  /* Checked at beat time, not load time — a resize between loops should
     change the gesture, not be ignored. */
  function isMobileDemo() { return window.matchMedia('(max-width: 720px)').matches; }
  function syncDismiss() {
    var open = vSel.classList.contains('on') || vSel2.classList.contains('on');
    vDismiss.classList.toggle('on', open);
  }
  var vsSem = document.getElementById('vsSem');
  /* Rewrite only the label, leaving the `<i>` key glyph intact — mobile hides
     that glyph via CSS, and a textContent write would delete it outright. */
  function setSemLabel(state) {
    var key = vsSem.querySelector('i');
    vsSem.textContent = ' semantic: ' + state;
    if (key) vsSem.insertBefore(key, vsSem.firstChild);
  }
  var vsAtt = document.getElementById('vsAtt');
  var vAttach = document.getElementById('vAttach');
  var vcTyped = document.getElementById('vcTyped');
  var vcPh = document.getElementById('vcPh');
  var vcCaret = document.getElementById('vcCaret');
  var vSend = document.getElementById('vSend');
  var vSel = document.getElementById('vSel');
  var vImm = document.getElementById('vImm');
  var vExit = document.getElementById('vExit');
  var vExitBtn = document.getElementById('vExitBtn');
  var vSel2 = document.getElementById('vSel2');
  var vOpen = document.getElementById('vOpen');
  var vWand = document.getElementById('vWand');
  var vNotice = document.getElementById('vNotice');
  var vGchip = document.getElementById('vGchip');
  var vLchip = document.getElementById('vLchip');
  var vaultBody = document.querySelector('.vault-body');

  /* Mobile shows one pane at a time (see the 720px CSS block); the storyline
     walks graph → chat → graph. No-op on desktop. */
  function setPane(p, instant) {
    if (instant) {
      /* Phase jumps land in a state, they don't animate into it. */
      vaultBody.style.transition = 'none';
      vaultBody.dataset.pane = p;
      void vaultBody.offsetWidth;
      vaultBody.style.transition = '';
      return;
    }
    vaultBody.dataset.pane = p;
  }

  /* --- simulated cursor ---
     Only used for the graph's direct manipulations (lassoing, pressing the
     selection-bar buttons): those are gestures, and showing the hand is what
     makes them read as such. Typing and the search modal deliberately have no
     cursor — a caret already carries those, and a hovering arrow is noise. */
  var cursor = document.getElementById('vCursor');
  var graphPane = document.querySelector('.v-graph');
  var cursorScale = 1;

  function cursorAt(x, y, instant) {
    if (instant) cursor.style.transition = 'opacity .25s ease';
    cursor.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + cursorScale + ')';
    if (instant) {
      /* Force the jump to land before transitions are restored. */
      void cursor.offsetWidth;
      cursor.style.transition = '';
    }
  }
  function cursorShow() { cursor.classList.add('on'); }
  function cursorHide() { cursor.classList.remove('on'); cursorScale = 1; }

  /** Glide to an element's centre, in graph-pane coordinates. */
  function cursorToEl(el) {
    var g = graphPane.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    cursorAt(r.left - g.left + r.width / 2 - 3, r.top - g.top + r.height / 2 - 2);
  }

  /** A quick dip, the cursor's half of a button press. */
  function cursorClick() {
    cursorScale = 0.8;
    cursor.classList.add('click');
    var m = /translate\(([^p]+)px,([^p]+)px\)/.exec(cursor.style.transform);
    if (m) cursorAt(parseFloat(m[1]), parseFloat(m[2]));
    timers.push(setTimeout(function () {
      cursorScale = 1;
      cursor.classList.remove('click');
      if (m) cursorAt(parseFloat(m[1]), parseFloat(m[2]));
    }, 130));
  }

  /** Ride the lasso stroke as it sweeps, so the loop looks drawn. */
  function cursorTraceLasso(getPoint, ms) {
    var t0 = performance.now();
    cursor.style.transition = 'opacity .25s ease';   /* follow exactly, no lag */
    (function frame() {
      var p = Math.min(1, (performance.now() - t0) / ms);
      var pt = getPoint(p);
      if (pt) cursorAt(pt.x - 3, pt.y - 2);
      if (p < 1) requestAnimationFrame(frame);
      else cursor.style.transition = '';
    })();
  }
  var stepEls = document.querySelectorAll('#steps li');

  /* --- search results --- */
  var resEls = RESULTS.map(function (r, i) {
    var d = document.createElement('div');
    d.className = 'vs-res' + (i === 0 ? ' sel' : '');
    d.innerHTML =
      '<div class="vs-res-top"><span class="vs-res-name">' + r.n + '</span>' +
      (r.p ? '<span class="vs-res-path">· ' + r.p + '</span>' : '') + '</div>' +
      '<div class="vs-res-snip">' + r.t + '</div>';
    resultsEl.appendChild(d);
    return d;
  });

  /* --- mini graph: same cluster formula + hull construction as the plugin --- */
  var graph = (function () {
    var cv = document.getElementById('miniGraph');
    var ctx = cv.getContext('2d');
    var W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);

    var K = 5;
    /* Every pill's count is the number of dots actually drawn in that hull —
       a reader who counts them must not catch the demo lying. Memory's 24 is
       load-bearing beyond the pill: the selection bar says "24 notes selected"
       and the three sub-topics below have to sum to it. */
    var LABELS = [['Memory', 24], ['Sleep', 18], ['Perception', 21], ['Statistics', 19], ['Essays', 12]];
    /* The finer topics Immerse reveals inside Memory. These are the real
       group sizes of Memory's own nodes (9 + 8 + 7 = 24), assigned in build(),
       not decorative labels — immersing re-groups the same dots rather than
       conjuring new ones, which is what the plugin's Immerse actually does. */
    var SUBLABELS = [['Long-term memory', 9], ['Recall & testing', 8], ['Sleep & memory', 7]];
    var SUBHUE_OFFSETS = [0, 34, -34];
    /* Index of each cluster's first node, filled by build(). Lets the named
       story notes (and anything else) address a node by cluster + offset now
       that clusters are different sizes. */
    var CLUSTER_AT = [];
    var HUES = [];
    for (var i = 0; i < K; i++) HUES.push(Math.round(i * 360 / K));

    /* The physics is the plugin's own d3-force simulation (see the vendored
       modules at the top of this file); everything below drives VISUALS only.
       organize 0→1 grey→coloured, imm 0→1 overview→immersed fades,
       lassoP 0→1 selection stroke sweep. */
    var organize = 0, organizeT = 0, orgE = 0;
    var imm = 0, immT = 0;
    var lassoP = 0, lassoT = 0;
    /* Previous frame's timestamp — the lasso sweeps by elapsed time. */
    var lastT = performance.now();
    /* Second lasso, drawn inside the immersion around the Long-term memory
       sub-topic — the selection that gets opened in the chat. */
    var lasso2P = 0, lasso2T = 0;

    /* The simulation and its fitted camera. `simState.nodes` is the ACTIVE
       set — all 94 in the overview, Memory's 24 while immersed, exactly like
       the plugin rebuilding its graph on Immerse. The camera frames only the
       active set, so immersing zooms into the expanding sub-topics. */
    var simState = null;
    var cam = makeCamera();
    var NODE_SIZE = 3;              /* autoNodeSize(94), fixed in build() */
    var HULL_PAD = 29;              /* nodeDrawRadius(degree 0) + HULL_PADDING(26) */
    /* The selection bar is 16px up and ~34px tall; 32 on top of the base
       26px inset keeps a hull's bottom edge clear of it. */
    var FIT = { worldPad: HULL_PAD, bottom: 32 };

    /* Per-lasso wobble. Only two harmonics, both low-frequency (2–4 lobes):
       the real selection region is a big lazy blob, so extra harmonics just
       read as jitter. Regenerated per run so no two loops match. */
    function makeJitter() {
      var h = [];
      for (var k = 0; k < 2; k++) {
        h.push({
          freq: 2 + k + Math.round(Math.random()),   /* 2–4 lobes */
          amp: (0.075 - k * 0.03) * (0.7 + Math.random() * 0.6),
          phase: Math.random() * Math.PI * 2
        });
      }
      h.start = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
      return h;
    }
    var lassoJit = makeJitter(), lasso2Jit = makeJitter();

    function jitterAt(jit, a) {
      var w = 0;
      for (var k = 0; k < jit.length; k++) {
        w += Math.sin(a * jit[k].freq + jit[k].phase) * jit[k].amp;
      }
      return w;
    }

    /** The lasso outline: a closed, smoothly-curved dashed loop. */
    function strokeLasso(c, rx, ry, prog, jit, alpha) {
      var sweep = Math.PI * 2 * Math.min(1, prog);
      var steps = Math.max(2, Math.round(sweep / 0.10));
      var pts = [];
      for (var s = 0; s <= steps; s++) {
        var a = jit.start + sweep * (s / steps);
        var w = jitterAt(jit, a);
        pts.push({ x: c.x + Math.cos(a) * rx * (1 + w), y: c.y + Math.sin(a) * ry * (1 + w) });
      }
      /* Trace the outline once; the same path is both filled and stroked. */
      function tracePath() {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        /* Quadratic midpoint smoothing: the curve passes through the midpoints
           with each sample as a control point, so there are no visible corners. */
        for (var i = 1; i < pts.length - 1; i++) {
          var mx = (pts[i].x + pts[i + 1].x) / 2;
          var my = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
        }
        var last = pts[pts.length - 1];
        ctx.lineTo(last.x, last.y);
      }

      /* Faint accent wash over the enclosed area — the region reads as
         selected, not merely outlined. Canvas closes an unclosed fill path
         implicitly, so the area builds up as the loop is drawn. */
      tracePath();
      ctx.closePath();
      ctx.fillStyle = ACCENT;
      ctx.globalAlpha = alpha * 0.1;
      ctx.fill();

      tracePath();
      if (prog >= 0.999) ctx.closePath();
      /* Longer, airier dashes — matching the real selection outline. */
      ctx.setLineDash([9, 7]);
      ctx.strokeStyle = ACCENT;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    var PALETTE = {}, ACCENT = '#7f6df2';
    function readPalette() {
      var cs = getComputedStyle(document.documentElement);
      function tok(name, fallback) {
        var v = cs.getPropertyValue(name).trim();
        return v || fallback;
      }
      /* --gm-* are the mini-graph's own node values: the real in-app graph is
         far more saturated than the hero's backdrop treatment. Edges are one
         neutral token (--gm-edge), never cluster-tinted — see the edge pass. */
      PALETTE = {
        nodeL: tok('--gm-node-l', '62%'),
        nodeA: tok('--gm-node-a', '0.95'),
        hubL: tok('--g-hub-l', '62%'),
        hubA: tok('--g-hub-a', '0.95'),
        edge: tok('--gm-edge', 'rgba(150,150,150,0.45)'),
        hullA: tok('--g-hull-a', '0.13')
      };
      ACCENT = tok('--ob-accent', '#7f6df2');
    }
    readPalette();

    function hslaH(h, s, l, a) {
      return 'hsla(' + h + ', ' + s + '%, ' + l + ', ' + a + ')';
    }
    /* Saturation rides `organize`, so the graph starts grey and colour floods
       in as the topics resolve. */
    function hsla(c, l, a) {
      return hslaH(HUES[c], Math.round(70 * orgE), l, a);
    }

    var TEXT = '#dddddd', FOG = '30, 30, 30';
    function readChrome() {
      var cs = getComputedStyle(document.documentElement);
      TEXT = cs.getPropertyValue('--ob-text').trim() || '#dddddd';
      FOG = cs.getPropertyValue('--ob-fog').trim() || '30, 30, 30';
    }
    readChrome();

    /* World → screen, through the fitted camera. */
    function TX(x) { return x * cam.scale + cam.x; }
    function TY(y) { return y * cam.scale + cam.y; }
    /* Screen radius of a node: the plugin's degree-driven world radius, under
       the camera, with its partial counter-zoom (zoomNodeScale) so a fitted
       overview doesn't shrink dots to dust. */
    function screenR(n) {
      return nodeDrawRadius(n, NODE_SIZE) * cam.scale * zoomNodeScale(cam.scale);
    }

    function roundRect(x, y, w, h, r) { roundRectPath(ctx, x, y, w, h, r); }

    function drawLabelPill(text, x, y, hue, alpha, stroke) {
      if (alpha < 0.03) return;
      ctx.globalAlpha = alpha;
      ctx.font = '500 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var w = ctx.measureText(text).width + 20;
      var h = 19;
      /* Keep the pill inside the canvas. Memory sits at the top of the ring,
         so its label would otherwise be clipped by the top edge; the same
         clamp catches wide pills near the left/right edges. */
      var m = 3;
      x = Math.max(w / 2 + m, Math.min(W - w / 2 - m, x));
      y = Math.max(h / 2 + m, Math.min(H - h / 2 - m, y));
      roundRect(x - w / 2, y - h / 2, w, h, h / 2);
      ctx.fillStyle = 'rgba(' + FOG + ', 0.85)';
      ctx.fill();
      ctx.strokeStyle = stroke || hslaH(hue, Math.round(70 * orgE), PALETTE.nodeL, 0.8);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = TEXT;
      ctx.fillText(text, x, y);
      ctx.globalAlpha = 1;
    }

    var nodes = [], edges = [], storyEdges = [];
    /* Finale only: name the node the new edges come from. */
    var labelOn = false;
    /* Notes the storyline names, as {cluster, offset} — resolved against
       CLUSTER_AT at use time, since clusters are now different sizes. The
       first four sit inside Memory's Long-term memory sub-group (offsets below
       SUBLABELS[0]'s 9), which is the group the chat is handed; lec8 is the
       Sleep cluster's hub. */
    var named = {
      lec7: [0, 0], slides: [0, 2], checklist: [0, 4], sg: [0, 6], lec8: [1, 0]
    };
    /* The notes the approved edit links to, and therefore the edges the graph
       gains at the end. This list must match the [[wikilinks]] in the staged
       diff in index.astro — the graph's wiki edges come from Obsidian's
       resolvedLinks (graphDataBuilder.ts buildWikiEdges), so an edge with no
       corresponding link in the note is an edge that would never exist.
       Two land inside Memory and one crosses to Sleep, which is also what
       stops them reading as a single stroke. */
    var LINKED_NOTES = ['lec7', 'slides', 'lec8'];
    /** Resolve a named note to its live node, or null before the first build. */
    function namedNode(id) {
      var ref = named[id];
      if (!ref || CLUSTER_AT[ref[0]] === undefined) return null;
      return nodes[CLUSTER_AT[ref[0]] + ref[1]] || null;
    }

    /* Scatter in world units: the box the un-clustered vault opens on. The
       camera fits whatever box we pick, so only its aspect matters. */
    function scatterNode(n) {
      n.x = (Math.random() - 0.5) * 560;
      n.y = (Math.random() - 0.5) * 360;
      n.vx = 0; n.vy = 0;
    }

    /** Offset of sub-topic `sc`'s first node within Memory — its hub. */
    function subStart(sc) {
      var at = 0;
      for (var s = 0; s < sc; s++) at += SUBLABELS[s][1];
      return at;
    }

    /** Which of Memory's three sub-topics its j-th node belongs to. */
    function subGroupOf(j) {
      var at = 0;
      for (var s = 0; s < SUBLABELS.length; s++) {
        at += SUBLABELS[s][1];
        if (j < at) return s;
      }
      return SUBLABELS.length - 1;
    }

    /* Links for the ACTIVE node set — the immersion swaps to Memory-internal
       ones, the way the plugin rebuilds with only the selected notes. */
    var memLinks = [];

    function build() {
      nodes = []; edges = []; CLUSTER_AT = []; memLinks = [];
      for (var c = 0; c < K; c++) {
        CLUSTER_AT.push(nodes.length);
        /* As many dots as the pill claims. The clusters differ in size, which
           is also truer to a real vault than five identical blobs. */
        var count = LABELS[c][1];
        for (var j = 0; j < count; j++) {
          var n = {
            /* `home` is the story's topic (colour, hulls, fades). `cluster` is
               what the plugin's cohesion force reads — null until the
               clustering beat assigns it, exactly as an un-partitioned graph
               feels no cohesion. */
            home: c, cluster: null,
            /* Memory's sub-groups are contiguous runs sized by SUBLABELS, so
               each immersed hull holds exactly the count on its own pill. */
            subc: c === 0 ? subGroupOf(j) : 0,
            degree: 0,
            glow: 0, glowT: 0, pop: 0
          };
          scatterNode(n);
          nodes.push(n);
        }
      }

      /* Edges are the structure the physics reads — communities cohere
         because their notes actually link. Probability falls with cluster
         size so every hull is about equally dense. Inside Memory the links
         respect the sub-topics (dense within, sparse across): that structure
         is WHY immersing separates them, rather than a choreographed split.
         Each cluster's first node is its HUB — a well-linked note the topic
         forms around, the way a vault's MOC or index note behaves (and the
         note the plugin's default topic label is named after). */
      for (var a = 0; a < nodes.length; a++) {
        for (var b = a + 1; b < nodes.length; b++) {
          var na = nodes[a], nb = nodes[b];
          /* Which of the pair (if either) is its group's hub. Memory's
             sub-topics each get their own hub — their first node — since
             immersing has to leave three legible groups, not one. */
          var aHub = na.home === 0
            ? a === CLUSTER_AT[0] + subStart(na.subc)
            : a === CLUSTER_AT[na.home];
          var bHub = nb.home === 0
            ? b === CLUSTER_AT[0] + subStart(nb.subc)
            : b === CLUSTER_AT[nb.home];
          var p;
          if (na.home !== nb.home) {
            /* Weak ties across topics. Only hubs make them: in a real vault
               the note that reaches outside its subject is the index note,
               and routing them through hubs keeps the cross-links from
               reading as noise sprayed over the gaps. */
            p = (aHub || bHub) ? 0.010 : 0.0004;
          } else if (na.home === 0 && na.subc !== nb.subc) {
            /* Across Memory's sub-topics: sparse, and hub-led — this is the
               seam Immerse pulls apart, so it must be visibly thinner than
               the links inside each sub-topic. */
            p = (aHub || bHub) ? 0.14 : 0.012;
          } else {
            /* Inside one group. The hub links to nearly everything — that is
               what makes it read AS a hub, and what gives Leiden something
               to find; peripheral pairs link rarely, so the spokes stay the
               dominant shape rather than being lost in a mesh. */
            p = (aHub || bHub) ? 0.82 : 0.055;
          }
          if (Math.random() < p) {
            var link = {
              source: na, target: nb, weight: 1,
              type: na.home === nb.home ? 'wiki' : 'semantic',
              intra: na.home === nb.home
            };
            edges.push(link);
            na.degree++; nb.degree++;
            if (na.home === 0 && nb.home === 0) memLinks.push(link);
          }
        }
      }

      NODE_SIZE = autoNodeSize(nodes.length);
      simState = makeSim(nodes, edges, nodes.length);
      settleWeb();
    }
    /* True while the graph still sits in its opening state — the un-grouped
       web, settled and untouched — so reset() can leave a never-started
       graph alone. Cleared by whatever first assigns topics. */
    var pristine = false;
    /** Lay the un-grouped web out to rest, unwatched: the state the story
        opens on. No clusters are assigned, so the cohesion force is silent
        and the link structure alone shapes it — the plugin's own topics-off
        layout. It used to be animated from a random scatter (a third-speed
        FRESH settle), and that read as THREE stages — scatter, web, groups —
        where the product has two: your notes are already a web, and the wand
        finds the topics in it. So the web is on screen from the first frame
        and the wand press is the first motion the viewer sees. */
    function settleWeb() {
      for (var i = 0; i < nodes.length; i++) { nodes[i].cluster = null; scatterNode(nodes[i]); }
      retune(simState, nodes, edges, nodes.length);
      startFresh(simState);
      settleSim(simState);
      pristine = true;
    }

    /** Memory's nodes — the set the immersion rebuilds the graph around. */
    function memNodes() {
      return nodes.filter(function (n) { return n.home === 0; });
    }

    /** Match the backing store to the CSS box and repaint synchronously —
        setting cv.width wipes the canvas, and during the chat pane's slide
        this runs every frame, so waiting for the next rAF would flicker.
        The layout itself lives in world space and never needs a rebuild; the
        camera simply re-fits to the new box. */
    function resize() {
      var r = cv.getBoundingClientRect();
      if (!r.width || !r.height) return;
      W = r.width; H = r.height;
      cv.width = W * DPR; cv.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      cameraFollow(cam, cameraTarget(simState.nodes, W, H, null, FIT), true);
      draw();
    }

    /* Visual timekeeping only — colour flood, fades, lasso sweeps, glow.
       All node MOTION comes from the plugin's simulation via tickSim. */
    function step() {
      var now = performance.now();
      /* Frame length, clamped at 50ms: a stalled frame (scroll, tab wake)
         pauses the graph rather than lurching it. */
      var dt = Math.min(50, now - lastT);
      tickSim(simState, dt / 16.667);
      cameraFollow(cam, cameraTarget(simState.nodes, W, H, null, FIT), false, simState.rate);

      /* Colour and hulls arrive as the layout firms up, the way topics land
         in the real graph. Slowed to match the settle's playback rate — at
         the old 0.035 the colour was fully in well before the nodes had
         finished gathering, which read as the palette announcing a result
         the graph hadn't reached yet. */
      organize += (organizeT - organize) * 0.016;
      orgE = organize < 0 ? 0 : organize > 1 ? 1 : organize;
      /* The immersion crossfade rides the transition's playback rate, so the
         old topics clear as the new ones arrive rather than well before. */
      imm += (immT - imm) * 0.085 * (simState.rate || 1);
      /* Linear, not eased: an eased sweep never quite reaches 1, so the loop
         would hang open. A person draws a lasso at a fairly even speed
         anyway.

         Advanced by ELAPSED TIME over LASSO_MS, not by a per-frame constant.
         The simulated cursor traces the same loop over the same duration
         (cursorTraceLasso), so a per-frame step desynced the two: the old
         0.032/frame finished in ~520ms at 60fps but ~260ms at 120Hz, while
         the cursor always took 560ms — the stroke ran ahead of the hand
         drawing it, and by a different amount on every display. Sharing the
         clock is what keeps them aligned. */
      if (lassoP < lassoT) lassoP = Math.min(lassoT, lassoP + dt / LASSO_MS);
      else lassoP += (lassoT - lassoP) * 0.2;
      if (lasso2P < lasso2T) lasso2P = Math.min(lasso2T, lasso2P + dt / LASSO_MS);
      else lasso2P += (lasso2T - lasso2P) * 0.2;

      lastT = now;

      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        n.glow += (n.glowT - n.glow) * 0.08;
        n.pop *= 0.95;
      }
      for (var e = 0; e < storyEdges.length; e++) {
        var se = storyEdges[e];
        se.p += (se.t - se.p) * 0.06;
      }
    }

    function clusterPts(c) {
      var pts = [];
      for (var q = 0; q < nodes.length; q++) if (nodes[q].home === c) pts.push(nodes[q]);
      return pts;
    }

    function subPts(sc) {
      var pts = [];
      for (var q = 0; q < nodes.length; q++) if (nodes[q].home === 0 && nodes[q].subc === sc) pts.push(nodes[q]);
      return pts;
    }

    /** A group's centroid in SCREEN coordinates (for lassos and pills). */
    function centroidOf(pts) {
      var c = centroid(pts);
      return { x: TX(c.x), y: TY(c.y) };
    }

    /** Screen-space bounding box of a group — sizes lassos and anchors pills. */
    function screenBox(pts) {
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (var i = 0; i < pts.length; i++) {
        var x = TX(pts[i].x), y = TY(pts[i].y);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      return { minX: minX, minY: minY, maxX: maxX, maxY: maxY,
        cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      /* Hulls and labels only appear once the topics have actually formed. */
      var labelA = Math.max(0, Math.min(1, (orgE - 0.75) / 0.25));
      /* Non-focused clusters recede while immersed. */
      /* Fully hidden, not faded: at a few percent the other topics read as
         noise and compete with the sub-topics you immersed into. The exit
         bar is what communicates "there's more outside this".
         Opacity runs AHEAD of the motion rather than tracking `imm` linearly:
         `imm` is an exponential ease, so a linear `1 - imm` leaves a faint
         residue visible for most of the transition — the "slow fade". Clear
         by imm≈0.75 on a gentle ease-out: ~400ms, brisk enough that the
         sub-topics arrive on a clean canvas, but still a fade rather than the
         cut a steeper curve gives (0.55 squared cleared in 130ms — a cut). */
      var away = Math.max(0, 1 - imm / 0.75);
      away = away * (2 - away);
      /* The focused cluster's own chrome (its hull, ring and lasso) crossfades
         into the immersed view rather than vanishing, so it fades less
         aggressively than `away` — but still ahead of linear, or it hangs
         over the sub-topics as they arrive. */
      var leaving = Math.max(0, 1 - imm / 0.8);

      /* Topic hulls: the plugin's own buildTopicRegion over live positions,
         padded in WORLD units (nodeDrawRadius(degree 0) + HULL_PADDING, as
         GraphCanvas computes it) and projected through the camera. Fill 0.1 /
         stroke 0.35 at 1.5px match pixiRenderer's drawHulls. */
      function paintHull(pts, hue, alpha) {
        if (alpha < 0.02 || pts.length < 3) return;
        var path = topicRegion(pts, HULL_PAD);
        if (!path) return;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(TX(path[0].x), TY(path[0].y));
        for (var s = 1; s < path.length; s++) ctx.lineTo(TX(path[s].x), TY(path[s].y));
        ctx.closePath();
        ctx.fillStyle = hslaH(hue, Math.round(70 * orgE), PALETTE.nodeL, PALETTE.hullA);
        ctx.fill();
        ctx.strokeStyle = hslaH(hue, Math.round(70 * orgE), PALETTE.nodeL, 0.35);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      for (var c = 0; c < K; c++) {
        paintHull(clusterPts(c), HUES[c], labelA * (c === 0 ? leaving : away));
      }
      /* Immersed: Memory resolves into its own finer topic regions. */
      if (imm > 0.02) {
        for (var sc = 0; sc < 3; sc++) {
          paintHull(subPts(sc), HUES[0] + SUBHUE_OFFSETS[sc], imm);
        }
      }

      /* One neutral colour for every edge, as pixiRenderer draws them —
         cluster hue belongs to nodes and hulls, and the accent is reserved
         for hover/story highlights. Authored vs inferred is the DASH, not
         the colour: inferred edges carry the same weight because that
         structure is worth reading, not just hinting at. */
      ctx.strokeStyle = PALETTE.edge;
      ctx.lineWidth = 1;
      for (var e = 0; e < edges.length; e++) {
        var le = edges[e];
        var a = le.source, b = le.target;
        ctx.globalAlpha = (a.home === 0 && b.home === 0) ? 1 : away;
        if (ctx.globalAlpha < 0.02) continue;
        ctx.setLineDash(le.intra ? [] : [5, 4]);
        ctx.beginPath();
        ctx.moveTo(TX(a.x), TY(a.y)); ctx.lineTo(TX(b.x), TY(b.y));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      /* New connections drawn by the accepted edit. */
      for (var s2 = 0; s2 < storyEdges.length; s2++) {
        var se = storyEdges[s2];
        if (se.p < 0.01) continue;
        var nax = TX(se.a.x), nay = TY(se.a.y);
        var nbx = TX(se.b.x), nby = TY(se.b.y);
        ctx.beginPath();
        ctx.moveTo(nax, nay);
        ctx.lineTo(nax + (nbx - nax) * se.p, nay + (nby - nay) * se.p);
        ctx.strokeStyle = ACCENT;
        ctx.globalAlpha = 0.9 * leaving;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      /* Lassos are gestures over the SCREEN, so they size themselves from the
         group's screen footprint rather than a fixed fraction of the canvas. */
      if (lassoP > 0.01 && imm < 0.9) {
        var g1 = lassoGeom(1);
        strokeLasso(g1, g1.rx, g1.ry, lassoP, lassoJit, leaving * 0.9);
      }
      if (lasso2P > 0.01 && imm > 0.5) {
        var g2 = lassoGeom(2);
        strokeLasso(g2, g2.rx, g2.ry, lasso2P, lasso2Jit, imm * 0.9);
      }

      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var r = screenR(n) + n.pop * 5;
        /* Everything outside the focused cluster fades out entirely while
           immersed; Memory's own nodes are the ones being re-grouped. */
        var fade = n.home === 0 ? 1 : away;
        if (fade < 0.02) continue;
        var x = TX(n.x), y = TY(n.y);
        if (n.glow > 0.02) {
          ctx.beginPath();
          ctx.arc(x, y, r + 3.5 + n.glow * 2.5, 0, Math.PI * 2);
          ctx.strokeStyle = ACCENT;
          ctx.globalAlpha = 0.85 * n.glow * fade;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.globalAlpha = fade;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = hsla(n.home, PALETTE.nodeL, PALETTE.nodeA);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      /* Label pills sit just above their group's hull — anchored to the
         group's live screen extent, so however the layout settles the pill
         clears its own dots. */
      function pillFor(pts, text, hue, alpha) {
        if (alpha < 0.03 || !pts.length) return;
        var box = screenBox(pts);
        var gap = HULL_PAD * cam.scale + 13;
        drawLabelPill(text, box.cx, box.minY - gap, hue, alpha);
      }
      for (var c2 = 0; c2 < K; c2++) {
        pillFor(clusterPts(c2), LABELS[c2][0] + ' · ' + LABELS[c2][1],
          HUES[c2], labelA * (c2 === 0 ? leaving : away));
      }
      if (imm > 0.02) {
        for (var sc2 = 0; sc2 < 3; sc2++) {
          pillFor(subPts(sc2), SUBLABELS[sc2][0] + ' · ' + SUBLABELS[sc2][1],
            HUES[0] + SUBHUE_OFFSETS[sc2], imm);
        }
      }
      /* The finale names the node the new edges come from. Without it the
         payoff was a purple line from an unmarked dot: the reader could not
         tell it was their checklist, now linked to the notes it cites. Rides
         the node's glow so it fades in with the edges. */
      if (labelOn) {
        var cl = namedNode('checklist');
        if (cl && cl.glow > 0.02) {
          drawLabelPill('Exam checklist', TX(cl.x), TY(cl.y) - screenR(cl) - 16,
            0, cl.glow * leaving, ACCENT);
        }
      }

    }

    /** Centre and radii (screen px) for a lasso around a group. */
    function lassoGeom(which) {
      var pts = which === 2 ? subPts(0) : clusterPts(0);
      var box = screenBox(pts);
      return {
        x: box.cx, y: box.cy,
        rx: (box.maxX - box.minX) / 2 + 20,
        ry: (box.maxY - box.minY) / 2 + 18
      };
    }

    /* Assign the overview's topics — what Leiden landing feels like. */
    function assignOverviewClusters() {
      pristine = false;
      for (var i = 0; i < nodes.length; i++) nodes[i].cluster = nodes[i].home;
    }
    /* Assign Memory's sub-topics and rebuild the sim around only its notes —
       handleImmerse rebuilds the graph with the selection, then the finer
       partition lands as a re-cluster. */
    function assignImmersion() {
      pristine = false;
      var mem = memNodes();
      for (var i = 0; i < mem.length; i++) mem[i].cluster = 10 + mem[i].subc;
      retune(simState, mem, memLinks, mem.length);
    }
    function assignExit() {
      assignOverviewClusters();
      retune(simState, nodes, edges, nodes.length);
    }

    var api = {
      organize: function () {
        /* The wand press: communities are assigned, so the cohesion force
           starts to feel them. The web is already laid out (settleWeb), so
           this is the plugin's re-cluster transition — the groups tighten
           OUT of the web — rather than a fresh settle from scatter.
           Played at REAL TIME (rate 1), as every transition here now is: a
           recluster starts at alpha 0.22 under heavy drag, so it is a
           watchable 2–3s rather than a snap, and the storyline waits for
           it to be still before the lasso (see the phase-1 beats). */
        assignOverviewClusters();
        startRecluster(simState);
        organizeT = 1;
      },
      immerse: function () {
        /* Same notes, finer topics: the plugin's re-cluster transition, over
           a graph rebuilt to hold only the selection. Real time; phase 3's
           start is timed to when it has gone quiet. */
        assignImmersion();
        startRecluster(simState);
        immT = 1;
      },
      /* Ease back out to the overview — the Exit immersion beat. */
      unimmerse: function () {
        assignExit();
        startRecluster(simState);
        immT = 0; lassoT = 0; lassoP = 0; lasso2T = 0; lasso2P = 0;
      },
      /* Sweep the sub-topic lasso (used while immersed). */
      lasso2: function () { lasso2T = 1; },
      /* The selection was consumed by Open in chat — retire the stroke. */
      clearLasso2: function () { lasso2T = 0; lasso2P = 0; },
      /* Jump straight into the settled immersion (phase-jump catch-up). */
      immerseSnap: function () {
        assignImmersion();
        startRecluster(simState);
        settleSim(simState);
        imm = 1; immT = 1;
        cameraFollow(cam, cameraTarget(simState.nodes, W, H, null, FIT), true);
      },
      lasso: function () { lassoT = 1; },
      /* Point on a lasso's stroke at progress `p` (0–1), in canvas
         coordinates — lets the simulated cursor ride the loop as it draws. */
      lassoPoint: function (which, p) {
        var g = lassoGeom(which);
        var jit = which === 2 ? lasso2Jit : lassoJit;
        var a = jit.start + Math.PI * 2 * p;
        var w = jitterAt(jit, a);
        return { x: g.x + Math.cos(a) * g.rx * (1 + w), y: g.y + Math.sin(a) * g.ry * (1 + w) };
      },
      glow: function (id, amt) {
        var n = namedNode(id);
        if (n) n.glowT = amt;
        if (REDUCED) { if (n) n.glow = amt; draw(); }
      },
      /* Show the checklist's name pill (finale). */
      label: function (on) {
        labelOn = !!on;
        if (REDUCED) draw();
      },
      pop: function (id) {
        var n = namedNode(id);
        if (n) n.pop = 1;
      },
      /* The checklist's new links to the notes it now cites. Held as node
         references rather than indices, so a rebuild can't leave them
         pointing at whatever now sits at an old slot.

         lec7 and lec8 rather than lec7 and slides: lec8 is the note phase 4
         went looking for, so the edge to it is the visible consequence of the
         search AND of the approval. It also crosses from Memory to Sleep,
         which is the only one of these links that reads at a glance — two
         short edges inside one hull looked like a single line. */
      /* The notes the accepted edit links to — so the storyline can light up
         exactly the notes it also draws edges to. */
      linkedNotes: function () { return LINKED_NOTES.slice(); },
      link: function () {
        var from = namedNode('checklist');
        storyEdges = from
          ? LINKED_NOTES
              .map(function (id) { return namedNode(id); })
              .filter(Boolean)
              .map(function (to) { return { a: from, b: to, p: REDUCED ? 1 : 0, t: 1 }; })
          : [];
        if (REDUCED) draw();
      },
      reset: function () {
        storyEdges = [];
        labelOn = false;
        organizeT = 0; organize = 0; orgE = 0;
        immT = 0; imm = 0;
        lassoT = 0; lassoP = 0;
        lasso2T = 0; lasso2P = 0;
        /* A fresh squiggle each cycle — a person wouldn't draw it identically. */
        lassoJit = makeJitter(); lasso2Jit = makeJitter();
        for (var i = 0; i < nodes.length; i++) {
          nodes[i].glowT = 0; nodes[i].glow = 0; nodes[i].pop = 0;
        }
        /* Back to the opening web, settled and still. A graph that never
           left it — the first start, before any wand press — keeps the
           layout it already shows: re-laying it out here would swap one
           settled web for another the moment the demo scrolls into view.
           After a full loop the notes are re-scattered and settled to rest
           in one go (a cut, like the rest of the restart). */
        if (!pristine) settleWeb();
        cameraFollow(cam, cameraTarget(nodes, W, H, null, FIT), true);
        if (REDUCED) draw();
      },
      /* Snap the clustering to done — used when jumping past phase 1. */
      settle: function () {
        assignOverviewClusters();
        startFresh(simState);
        settleSim(simState);
        /* organizeT too, not just the current value — step() eases
           `organize` toward it every frame, so a target left at 0 would
           drain the colour back out over the seconds after a phase jump. */
        organize = 1; organizeT = 1; orgE = 1;
        cameraFollow(cam, cameraTarget(simState.nodes, W, H, null, FIT), true);
      },
      /* Reduced motion: jump straight to the organized end state. */
      final: function () {
        assignOverviewClusters();
        retune(simState, nodes, edges, nodes.length);
        startFresh(simState);
        settleSim(simState);
        organize = 1; organizeT = 1; orgE = 1; imm = 0; immT = 0;
        cameraFollow(cam, cameraTarget(nodes, W, H, null, FIT), true);
        draw();
      }
    };

    build();
    resize();
    /* The layout lives in world space, so EVERY size change — a window
       resize or the chat pane's slide — is the same operation: sync the
       backing store and let the camera re-fit. No rebuild, so the story
       never restarts, and no proportional remapping either. The observer
       covers the pane slide, which fires no window resize. */
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) {
      new ResizeObserver(resize).observe(cv);
    }
    window.addEventListener('s2b-theme-change', function () {
      readPalette();
      readChrome();
      if (REDUCED) draw();
    });
    if (!REDUCED) (function loop() { step(); draw(); requestAnimationFrame(loop); })();
    return api;
  })();

  /* --- chat helpers --- */
  /* Obsidian's toast. The real Notice auto-dismisses on a timeout (the bar
     passes none, so it takes Obsidian's default); here it clears well before
     the loop restarts so a fresh cycle never opens with a stale toast. */
  function showNotice() {
    vNotice.classList.add('on');
    timers.push(setTimeout(function () { vNotice.classList.remove('on'); }, 4000));
  }

  /* The transcript grows from the TOP while it is shorter than the pane, then
     switches to bottom-anchored once it overflows — see .v-chat-body. Without
     the switch a full conversation would pin its oldest message and hide the
     newest behind the composer. scrollHeight vs clientHeight is the test, and
     it has to run after layout, hence the rAF. */
  function syncChatAnchor() {
    /* Measure the CONTENT, not the scroller. `scrollHeight` is a function of
       the current justify-content: once flex-end applies, the overflow is
       resolved by clipping at the top and scrollHeight collapses back to the
       pane height — so testing it flips the class off, which flips it on
       again, and the transcript flaps every frame with the newest message
       jumping out of view. Summing the children is anchor-independent.
       One-way latch: a transcript that has outgrown the pane never fits
       again (nothing is ever removed), and re-measuring during the streaming
       answer's reflow is what produced the flap in the first place. */
    if (chat.classList.contains('overflowing')) return;
    var kids = chat.children, h = 0;
    for (var i = 0; i < kids.length; i++) h += kids[i].offsetHeight;
    /* The 6px flex gap between messages, plus the body's vertical padding. */
    h += Math.max(0, kids.length - 1) * 6;
    var cs = getComputedStyle(chat);
    h += parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    if (h > chat.getBoundingClientRect().height) chat.classList.add('overflowing');
  }
  function addMsg(html, cls) {
    var d = document.createElement('div');
    d.className = 'msg' + (cls ? ' ' + cls : '');
    d.innerHTML = html;
    chat.appendChild(d);
    if (REDUCED) {
      d.classList.add('on');
      syncChatAnchor();
    } else {
      requestAnimationFrame(function () {
        syncChatAnchor();
        requestAnimationFrame(function () { d.classList.add('on'); });
      });
    }
    return d;
  }
  /* Lucide `git-fork` — a graph selection is ambient context, not a file
     attachment, so it carries the tray's icon rather than a file emoji. */
  var GRAPH_ICON =
    '<svg class="msg-att-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9M12 12v3"/></svg>';
  /* The first answer deliberately stops short: it drafts what the selected
     notes support and names what they don't cover. That gap is what sends the
     story to search — without it, phase 4 arrives to solve a problem nobody
     had, and the agent would be "discovering" sleep after already citing it. */
  var ANSWER = 'Your Long-term memory notes cover the three stages and the hippocampus diagram. None say what makes a memory last, so the section stops there.';
  var ANSWER2 = 'That’s what makes it last: deep sleep. I’ve folded it into the same draft.';
  /* The staged edit, shaped like the real PendingChangesBar: a summary row
     ("1 update pending" + Accept All / Reject All) over a collapsible entry
     carrying the change type and the note it touches. The entry shows no
     in-chat diff — the path is a link, and clicking it opens the note with
     the inline diff decorations, the way the real bar's revealAndScroll()
     does. The note is the plugin's primary review surface; the in-chat diff
     is its secondary one, and the demo shows the primary. */
  var SUGG =
    '<div class="pcb">' +
    '<div class="pcb-sum"><div class="pcb-sum-l">' +
    /* Lucide `file-diff`, the icon the real summary row uses. */
    '<svg class="pcb-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/>' +
    '<path d="M12 10v6M9 13h6"/></svg>' +
    '<span class="pcb-count">1 update pending</span></div>' +
    '<div class="pcb-sum-r">' +
    '<button class="pcb-act pcb-accept" type="button">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 13 4 4L19 7"/></svg>' +
    'Accept All</button>' +
    '<button class="pcb-act pcb-reject" type="button">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
    'Reject All</button>' +
    '<span class="pcb-chev" aria-hidden="true">▸</span>' +
    '</div></div>' +
    '<div class="pcb-list">' +
    '<div class="pcb-entry">' +
    /* The real entry's preview-toggle chevron — the in-chat diff exists
       behind it, the demo just routes the review through the note instead. */
    '<span class="pcb-tgl" aria-hidden="true">▸</span>' +
    '<span class="pcb-badge">Update</span>' +
    '<a class="pcb-path" id="vNoteLink">Exam checklist</a>' +
    '</div></div></div>';

  /* Mount the staged edit above the composer — where the real bar lives — and
     open it a beat later. The real bar always arrives collapsed, so the
     expansion is itself a UI gesture rather than a fabricated default. Under
     reduced motion it renders open immediately, with no transition. */
  function showSugg() {
    pending.innerHTML = SUGG;
    var pcb = pending.querySelector('.pcb');
    if (!pcb) return;
    if (REDUCED) {
      pcb.classList.add('on', 'open');
      return;
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { pcb.classList.add('on'); });
    });
    /* rAF is suspended while the tab is hidden, so the two frames above may
       never run — which would leave the bar stuck at opacity 0 even after the
       user comes back. The timer is the backstop; adding `on` twice is a
       no-op, and it fires well before the expand below. */
    timers.push(setTimeout(function () { pcb.classList.add('on'); }, 80));
    timers.push(setTimeout(function () { pcb.classList.add('open'); }, 600));
  }

  /* The second question folds into the SAME staged change, not a new one.
     With the diff living in the note, the bar acknowledges the update with a
     brief accent pulse — the count stays "1 update pending" because it counts
     entries, not lines, exactly as the real summary would. */
  function pulseSugg() {
    var pcb = pending.querySelector('.pcb');
    if (!pcb) return;
    pcb.classList.add('pulse');
    timers.push(setTimeout(function () { pcb.classList.remove('pulse'); }, 1200));
  }

  function setStep(n) {
    stepEls.forEach(function (li) {
      li.classList.toggle('on', n === 'all' || li.dataset.step === String(n));
    });
  }

  /* --- storyline --- */
  var timers = [];

  /* Stream an answer the way a real one arrives: a few words at a time, with a
     cursor that clears on the last chunk. Chunk sizes and delays vary so it
     doesn't read as a mechanical typewriter. */
  function streamAnswer(text, done) {
    var el = addMsg('<div class="msg-ai"><span class="ai-txt"></span><span class="ai-caret"></span></div>');
    var txt = el.querySelector('.ai-txt');
    var caret = el.querySelector('.ai-caret');
    if (REDUCED) {
      txt.textContent = text;
      caret.remove();
      if (done) done();
      return el;
    }
    var words = text.split(' ');
    var i = 0;
    (function chunk() {
      if (i >= words.length) {
        caret.remove();
        if (done) done();
        return;
      }
      /* 1–3 words per tick, the way tokens actually clump. */
      var take = 1 + Math.floor(Math.random() * 3);
      txt.textContent += (txt.textContent ? ' ' : '') + words.slice(i, i + take).join(' ');
      i += take;
      /* A streaming answer grows an EXISTING message, so it can push the
         transcript past the pane without addMsg ever running. */
      syncChatAnchor();
      timers.push(setTimeout(chunk, 55 + Math.random() * 85));
    })();
    return el;
  }

  /* `hidePh` is hidden for the whole run, not just at the first keystroke —
     otherwise a mistimed reset can leave the placeholder sitting under the
     typed text. */
  /* Tracks the in-flight typing run. Submitting bumps this so any keystroke
     still queued is abandoned instead of rewriting the field after it's been
     cleared — which would leave the sent text sitting in the composer. */
  var typeRun = 0;
  function stopTyping() { typeRun++; }

  /* Each keystroke waits speed × (0.65–1.35): the MEAN is `speed`, the worst
     case 1.35×, so a line of n characters is done within n × speed × 1.35.
     Any beat that reacts to the finished line (the send press, the search's
     empty state) has to be scheduled past that bound — the jitter used to be
     one-sided (speed × 1–1.7) and the checklist question was sent while it
     was still being typed. */
  function typeInto(el, text, speed, hidePh) {
    if (hidePh) hidePh.classList.add('off');
    var run = ++typeRun;
    var i = 0;
    (function tick() {
      if (run !== typeRun || i > text.length) return;
      el.textContent = text.slice(0, i);
      if (hidePh) hidePh.classList.add('off');
      i++;
      timers.push(setTimeout(tick, speed * (0.65 + Math.random() * 0.7)));
    })();
  }

  function reset() {
    timers.forEach(clearTimeout); timers = [];
    stopTyping();
    chat.innerHTML = '';
    /* Back to top-anchored — an empty transcript can't be overflowing. */
    chat.classList.remove('overflowing');
    vNotice.classList.remove('on');
    pending.innerHTML = '';
    typed.textContent = '';
    ph.classList.remove('off');
    ph.textContent = PH_SEARCH;
    vPlus.classList.remove('pressed');
    /* Topics start hidden again — phase 1 presses the wand to turn them on,
       so a loop that left it lit would show the grouping arriving with the
       toggle already in its post-press state. */
    vWand.classList.remove('on', 'pressed', 'hint');
    /* Close the note view and re-arm its diff groups for the next pass. */
    vNote.classList.remove('on');
    vNoteClose.classList.remove('pressed');
    vNote.querySelectorAll('.v-diff-group').forEach(function (g) { g.classList.remove('done'); });
    vNote.querySelectorAll('.v-diff-btn').forEach(function (b) { b.classList.remove('pressed'); });
    search.classList.remove('on');
    vsBox.classList.remove('glow');
    vsEmpty.classList.remove('on');
    setSemLabel('off');
    vsSem.classList.remove('pulse', 'on');
    vsAtt.classList.remove('pulse', 'on');
    vAttach.classList.remove('on');
    vGchip.hidden = true;
    vLchip.hidden = true;
    resEls.forEach(function (r) { r.classList.remove('on', 'picked'); });
    vcTyped.textContent = '';
    vcPh.classList.remove('off');
    vcCaret.hidden = true;
    vSend.classList.remove('pressed');
    vSel.classList.remove('on');
    vSel2.classList.remove('on');
    syncDismiss();
    vExit.classList.remove('on');
    vImm.classList.remove('pressed');
    vOpen.classList.remove('pressed');
    vExitBtn.classList.remove('pressed');
    cursorHide();
    setPane('graph', true);
    graph.reset();
    setStep(0);
  }

  /* The graph-notes context chip + question posting to the transcript. */
  function postFirstExchange() {
    addMsg('<div class="msg-atts"><span class="msg-att">' + GRAPH_ICON + '9 Graph Notes</span></div>');
    addMsg('<div class="msg-user">' + QUERY_CHAT + '</div>');
  }

  /* Where each phase begins on the timeline. Jumping to a phase replays from
     that offset, after fast-forwarding whatever earlier phases established. */
  var PHASE_AT = { 1: 0, 2: 5100, 3: 11600, 4: 25300, 5: 36300 };

  /* Put the world into the state phase `n` expects to start from, without
     any of the animation that normally gets it there. */
  function catchUpTo(n) {
    if (n <= 1) return;
    /* the wand was pressed and the topics formed. settle() does the
       assignment and runs the layout to rest in one go — organize()'s
       transition would only be discarded by it. */
    vWand.classList.add('on');
    vWand.classList.remove('hint');
    graph.settle();
    if (n >= 3) {
      /* the lasso + immerse happened */
      graph.immerseSnap();
      vExit.classList.add('on');
    }
    if (n >= 4) {
      /* the first exchange happened: draft pending, still immersed */
      setPane('chat', true);
      postFirstExchange();
      addMsg('<div class="act">Read 9 notes, 512 lines total</div>');
      addMsg('<div class="msg-ai">' + ANSWER + '</div>');
      addMsg('<div class="act">Edited a note, 1 operation across 1 note</div>');
      /* Fast-forward: this beat is already in the past, so the bar lands
         settled and open rather than replaying its arrival. */
      pending.innerHTML = SUGG;
      var pcb = pending.querySelector('.pcb');
      if (pcb) pcb.classList.add('on', 'open');
    }
    if (n >= 5) {
      /* the missing note was found, attached and folded in: the second
         exchange sits in the transcript and the same entry is still pending */
      addMsg('<div class="msg-atts"><span class="msg-att">📝 Lecture 8 — Sleep.md</span></div>');
      addMsg('<div class="msg-user">' + QUERY_CHAT2 + '</div>');
      addMsg('<div class="act">Read <em>Lecture 8 — Sleep</em>, 61 lines</div>');
      addMsg('<div class="msg-ai">' + ANSWER2 + '</div>');
      addMsg('<div class="act">Edited a note, 1 operation across 1 note</div>');
    }
  }

  /** Run the storyline, optionally starting at phase `from` (default 1). */
  function run(from) {
    var start = PHASE_AT[from] || 0;
    reset();
    catchUpTo(from || 1);

    /* Schedule relative to the jump point; anything already past is dropped. */
    function at(t, fn) {
      if (t < start) return;
      timers.push(setTimeout(fn, t - start));
    }

    /* 1 — the vault is already a web; the wand groups it.
       The graph opens un-grouped and ALREADY laid out — every connection
       drawn from the first frame (links you wrote solid, meaning-based ones
       dashed), grey, the plugin's topics-off state — and holds that shape
       until the cursor presses the wand. THAT assigns the topics: the
       grouping arrives as something the plugin did to your web, not a
       reveal that was always scheduled. The layout itself is never watched
       (graph.reset settles it off-screen): scatter → web → groups read as
       three stages where the product has two.

       The press is early so that the re-cluster, at the plugin's real
       speed, is STILL by the time phase 2 lassos it. Measured headlessly
       over this demo's own build() (scripts/demo-settle-timing.mjs): the
       largest per-tick step of any node drops under 0.1 world units by
       ~213 ticks (p90) — 3550ms at 60 ticks/s. The lasso stroke starts at
       5300, so the press lands at 1750. Move one and move the other. */
    at(150, function () { setStep(1); vWand.classList.add('hint'); });
    /* The cursor materialises short of the button and travels the last
       stretch — popping in on top of it would read as a cut. */
    at(600, function () {
      var g = graphPane.getBoundingClientRect();
      var r = vWand.getBoundingClientRect();
      cursorAt(r.left - g.left - 54, r.top - g.top + r.height + 42, true);
      cursorShow();
    });
    at(900, function () { cursorToEl(vWand); });
    at(1550, function () {
      vWand.classList.add('pressed');
      vWand.classList.remove('hint');
      cursorClick();
    });
    at(1750, function () {
      vWand.classList.remove('pressed');
      vWand.classList.add('on');
      graph.organize();
    });
    at(2400, function () { cursorHide(); });

    /* 2 — lasso the Memory topic and immerse into it. The lasso is drawn
       around a still graph: a stroke traced while the notes were still
       gathering deformed with them, and read as the selection chasing the
       layout. */
    at(5100, function () {
      setStep(2);
      cursorAt(graph.lassoPoint(1, 0).x - 3, graph.lassoPoint(1, 0).y - 2, true);
      cursorShow();
    });
    at(5300, function () {
      graph.lasso();
      cursorTraceLasso(function (p) { return graph.lassoPoint(1, p); }, LASSO_MS);
    });
    at(6300, function () { vSel.classList.add('on'); syncDismiss(); });
    at(6800, function () { cursorToEl(vImm); });
    at(7400, function () { vImm.classList.add('pressed'); cursorClick(); });
    at(7900, function () {
      vSel.classList.remove('on');
      syncDismiss();
      graph.immerse();
      cursorHide();
      /* The exit bar arrives WITH the immersion, not after it settles: in the
         plugin `isImmersed` is derived from `immersePaths`, which
         handleImmerse sets on its first line — before it even awaits the
         rebuild. So the way out exists from the first frame of the
         transition, which is exactly when it is most needed. */
      vExit.classList.add('on');
    });

    /* 3 — select a sub-topic inside the immersion and open it in the chat.
       The lassoed notes reach the composer as the ambient graph-selection
       chip, exactly how the real bar's "Open in Chat" works.
       Starts 3700ms after the immersion began (7900) so the sub-topics have
       stopped moving before the lasso traces one: the same headless
       measurement puts the immersion re-cluster's largest per-tick step
       under 0.1 world units by ~234 ticks (p90) = 3900ms, which is when the
       stroke starts (11800). Shifting phase 3 shifts phase 4 with it; the
       budget on the phase-4 beat is relative to phase 3 and still holds. */
    at(11600, function () {
      setStep(3);
      vExit.classList.remove('on');   /* make room for the selection bar */
      cursorAt(graph.lassoPoint(2, 0).x - 3, graph.lassoPoint(2, 0).y - 2, true);
      cursorShow();
    });
    at(11800, function () {
      graph.lasso2();
      cursorTraceLasso(function (p) { return graph.lassoPoint(2, p); }, LASSO_MS);
    });
    at(12700, function () { vSel2.classList.add('on'); syncDismiss(); });
    at(13100, function () { cursorToEl(vOpen); });
    at(13700, function () { vOpen.classList.add('pressed'); cursorClick(); });
    at(14200, function () {
      vOpen.classList.remove('pressed');
      vSel2.classList.remove('on');
      syncDismiss();
      graph.clearLasso2();
      cursorHide();
      vExit.classList.add('on');
      setPane('chat');
      vGchip.hidden = false;
      vAttach.classList.add('on');
    });
    /* Wait out the pane's slide-in (0.55s) before typing, so the question
       isn't being written into a composer that's still moving. The send
       press is a BUDGET: 48 ticks × 32ms × 1.35 = 2074ms worst case from
       15100, so the line is complete by 17174 and the press at 17600 leaves
       ~0.4s of it sitting finished — the way a person pauses before Enter. */
    at(15100, function () {
      vcCaret.hidden = false;
      typeInto(vcTyped, QUERY_CHAT, 32, vcPh);
    });
    at(17600, function () {
      vSend.classList.add('pressed');
      stopTyping();
      vcCaret.hidden = true;
      vcTyped.textContent = '';
      vcPh.classList.remove('off');
      vAttach.classList.remove('on');
      vGchip.hidden = true;
      postFirstExchange();
    });
    at(17900, function () { vSend.classList.remove('pressed'); });
    /* A graph selection hands the agent WIKILINKS, not content
       (formatGraphNotesContext in chatStore) — so it has to read them, and
       nine consecutive read_content calls merge into one row via
       buildMergedToolSummary: "Read 9 notes" (the count branch, since the
       demo names no targets) plus read_content's aggregate, "N lines total".
       It used to read "Read 9 notes in Long-term memory", which no code path
       produces — there is no "in <topic>" phrasing anywhere in the summaries. */
    at(20600, function () { addMsg('<div class="act">Read 9 notes, 512 lines total</div>'); });
    /* The draft card follows the stream rather than racing a fixed delay —
       streaming duration varies with the random chunking.
       ANSWER is 25 words at 1–3 words per 55–140ms tick: ~1240ms typical,
       ~1830ms at p99.9, ~2340ms absolute worst, and the card lands 450ms
       after that. Phase 4 must not open its search modal before all of that
       has landed — see the budget on the phase-4 beat below. */
    at(21500, function () {
      streamAnswer(ANSWER, function () {
        /* The staged edit is a manage_notes call and must show as one — a
           draft that appears with no tool call behind it reads as the pane
           inventing it. Wording is buildToolSummary's manage_notes branch
           (toolSummaryModel.ts): one path → "Edited a note", summary
           "N operations across N notes". It sits between the answer and the
           card inside the same callback, so it inherits the stream's
           duration budget rather than racing a fixed delay. */
        addMsg('<div class="act">Edited a note, 1 operation across 1 note</div>');
        timers.push(setTimeout(showSugg, 450));
      });
    });

    /* 4 — a piece is missing: search by meaning, attach, the agent folds it
       into the pending draft. The approval is phase 5, below.
       On mobile the search is reached the way the real app reaches it: there
       is no ⌥A, so the + button in the composer opens the vault picker (the
       same sheet, in picker mode — its placeholder says so). The press is a
       scale dip like the send button's; deliberately no cursor here, the
       touch dot is scoped to the graph's direct manipulations.

       The start time is a BUDGET, not a guess. The answer starts streaming
       at 21500; the stream + the card's 450ms must both fit before the modal
       opens, which gives the stream 3350ms — against a measured worst case
       of ~2340ms over 200k runs, so it cannot race. A measured live run,
       relative to the stream's start: stream ended at 1401ms, card 1841ms,
       modal 3841ms.
       This was wrong once: the modal opened 1200ms after the stream began,
       WHILE the agent was still writing. The reader has to finish the answer and see the draft
       before the story can say a piece is missing from it — the causal chain
       depends on having read the gap first. If ANSWER gets longer, or the
       chunk timing in streamAnswer changes, re-derive this. */
    at(25300, function () {
      setStep(4);
      if (isMobileDemo()) {
        vPlus.classList.add('pressed');
        ph.textContent = PH_PICKER;
        timers.push(setTimeout(function () {
          vPlus.classList.remove('pressed');
          search.classList.add('on');
        }, 300));
      } else {
        search.classList.add('on');
      }
    });
    /* The causal order here is load-bearing and must not be reshuffled: the
       query is typed → keyword search MISSES ("No notes contain those
       words") → that miss is what motivates reaching for the semantic
       toggle → semantic on, the box glows while the pass runs → the miss
       clears and the results it found arrive. Reordering these (or letting
       the clear land before the add) leaves the empty-state message sitting
       above a full result list, which is exactly the claim the beat is
       supposed to disprove. */
    at(25800, function () { typeInto(typed, QUERY_SEARCH, 38, ph); });
    at(26900, function () { vsEmpty.classList.add('on'); });
    at(27600, function () { vsSem.classList.add('pulse'); });
    at(28300, function () {
      vsSem.classList.remove('pulse');
      vsSem.classList.add('on');
      setSemLabel('on');
      vsBox.classList.add('glow');
    });
    at(28900, function () {
      vsBox.classList.remove('glow');
      vsEmpty.classList.remove('on');
      resEls.forEach(function (r, k) {
        timers.push(setTimeout(function () { r.classList.add('on'); }, k * 150));
      });
    });
    at(29900, function () { resEls[0].classList.add('picked'); });
    /* Attach comes AFTER the pick — the hint highlights because there is now
       a selection to attach. */
    at(30800, function () { vsAtt.classList.add('pulse'); });
    at(31500, function () {
      vsAtt.classList.remove('pulse');
      vsAtt.classList.add('on');
    });
    at(31900, function () {
      search.classList.remove('on');
      vLchip.hidden = false;
      vAttach.classList.add('on');
    });
    /* Typed in the composer, like the first question — not conjured. */
    at(32400, function () {
      vcCaret.hidden = false;
      typeInto(vcTyped, QUERY_CHAT2, 34, vcPh);
    });
    at(33600, function () {
      vSend.classList.add('pressed');
      stopTyping();
      vcCaret.hidden = true;
      vcTyped.textContent = '';
      vcPh.classList.remove('off');
      vAttach.classList.remove('on');
      vLchip.hidden = true;
      addMsg('<div class="msg-atts"><span class="msg-att">📝 Lecture 8 — Sleep.md</span></div>');
      addMsg('<div class="msg-user">' + QUERY_CHAT2 + '</div>');
    });
    at(33900, function () { vSend.classList.remove('pressed'); });
    at(34400, function () { addMsg('<div class="act">Read <em>Lecture 8 — Sleep</em>, 61 lines</div>'); });
    at(35200, function () {
      /* The bar pulses only once the answer has finished streaming, so the
         two acknowledgements don't arrive on top of each other. */
      streamAnswer(ANSWER2, function () {
        /* Folding into the same draft is a second manage_notes call on the
           same note, so it gets its own row — same wording as the first;
           addChanges merges it into the existing entry, which is why the
           bar pulses instead of counting to 2. */
        addMsg('<div class="act">Edited a note, 1 operation across 1 note</div>');
        pulseSugg();
      });
    });

    /* 5 — review in the note itself: clicking the bar's path opens the note
       over the graph, scrolled to the pending change — revealAndScroll(), as
       the real link does. Its own phase because it is the trust moment and
       the last ten seconds of the loop. Each group carries its own Accept, so the two additions
       are approved individually: per-hunk control is the point of this beat. */
    at(36300, function () {
      setStep(5);
      var link = document.getElementById('vNoteLink');
      if (link) link.classList.add('pressed');
    });
    at(36600, function () {
      var link = document.getElementById('vNoteLink');
      if (link) link.classList.remove('pressed');
      /* The note replaces the GRAPH only — the chat stays open beside it, so
         the bar you clicked and the diff you're reviewing are both visible.
         On mobile that means showing the main pane (where the note lives);
         the panes are one-at-a-time there regardless. */
      vNote.classList.add('on');
      if (isMobileDemo()) setPane('graph');
    });
    at(37700, function () {
      var b = vNote.querySelector('#vDiff1 .v-diff-acc');
      if (b) b.classList.add('pressed');
    });
    at(38050, function () {
      var g = document.getElementById('vDiff1');
      if (g) g.classList.add('done');
    });
    at(38800, function () {
      var b = vNote.querySelector('#vDiff2 .v-diff-acc');
      if (b) b.classList.add('pressed');
    });
    at(39150, function () {
      var g = document.getElementById('vDiff2');
      if (g) g.classList.add('done');
      /* Both groups resolved: the entry is settled, so the bar goes. The
         confirmation is an Obsidian NOTICE, not a chat message — the plugin
         posts nothing to the transcript here. Accepting groups one at a time
         is silent (acceptChangeGroup fires no Notice); the toast is what the
         bar's own accept shows once the entry resolves, and with a single
         pending entry its wording is "Applied the change". */
      pending.innerHTML = '';
      showNotice();
    });
    at(39900, function () { vNoteClose.classList.add('pressed'); });
    at(40200, function () {
      vNoteClose.classList.remove('pressed');
      vNote.classList.remove('on');
    });

    /* Finale: exit the immersion, back to the overview — where the approved
       note draws its new connections. Closes the loop where it began.
       This is the payoff for the whole storyline (the edit you approved is
       what changes the map), so it is paced to be READ: the edges land ~1.4s
       after the overview settles, the checklist node is named, and the loop
       then holds for ~4.1s more.
       At the previous timing they appeared 1.2s before the restart, which was
       too brief to connect them to the approval that caused them. */
    at(40600, function () { cursorToEl(vExitBtn); cursorShow(); });
    at(41100, function () { vExitBtn.classList.add('pressed'); cursorClick(); });
    at(41600, function () {
      vExitBtn.classList.remove('pressed');
      vExit.classList.remove('on');
      setPane('graph');
      graph.unimmerse();
      cursorHide();
    });
    at(43000, function () {
      /* The notes the approved edit now cites light up, and the checklist
         pops — the map changing is the consequence of the approval, which is
         why this is the last thing the loop shows. Glow and edges are driven
         by the same list, so a note can never light up without gaining a link
         or vice versa. */
      graph.glow('checklist', 1); graph.pop('checklist');
      graph.label(true);
      graph.linkedNotes().forEach(function (id) { graph.glow(id, 0.6); });
      graph.link();
    });
    at(47100, function () { track('demo-completed', demoOnScreen); run(1); });
  }

  /* Reduced motion: no storyline — show the finished, organized state. */
  function renderFinal() {
    setStep('all');
    setPane('chat', true);
    vWand.classList.add('on');
    graph.final();
    postFirstExchange();
    addMsg('<div class="act">Read 9 notes, 512 lines total</div>');
    addMsg('<div class="msg-ai">' + ANSWER + '</div>');
    addMsg('<div class="act">Edited a note, 1 operation across 1 note</div>');
    addMsg('<div class="msg-atts"><span class="msg-att">📝 Lecture 8 — Sleep.md</span></div>');
    addMsg('<div class="msg-user">' + QUERY_CHAT2 + '</div>');
    addMsg('<div class="act">Read <em>Lecture 8 — Sleep</em>, 61 lines</div>');
    /* The second answer belongs here too: without it the still shows the gap
       being named and then closed with nothing said in between, which reads
       as a dropped turn rather than a finished exchange. */
    addMsg('<div class="msg-ai">' + ANSWER2 + '</div>');
    addMsg('<div class="act">Edited a note, 1 operation across 1 note</div>');
    /* The approval's confirmation is a toast, not a transcript line — and a
       still frame should show it resting, not mid-timeout. */
    vNotice.classList.add('on');
    typed.textContent = QUERY_SEARCH;
    ph.classList.add('off');
    setSemLabel('on');
    vsSem.classList.add('on');
    resEls.forEach(function (r) { r.classList.add('on'); });
    graph.linkedNotes().concat('checklist').forEach(function (id) { graph.glow(id, 1); });
    graph.label(true);
    graph.link();
  }

  var started = false;

  /* ---- engagement events (Umami) ----
     Umami only knows visit duration per page; these say how long the DEMO
     held someone, which is the number the page is built around. Each fires
     at most once per page load, and only if the tracker is actually present
     (it is injected async, and not at all inside the heatmap frame). Names
     are fixed strings on purpose — the dashboard counts by name.
       demo-watched-10s/30s/60s  cumulative seconds with the demo at least
                                 half on screen and the tab visible; one
                                 full loop is 47.1s, so 60s means it looped.
       demo-completed            the storyline reached its end while on
                                 screen — someone saw the whole story.
       demo-jump-N               a timeline card was clicked (a deliberate
                                 act, so counted even if the demo is
                                 partly off screen). */
  var tracked = {};
  function track(name, cond) {
    if (!cond || tracked[name]) return;
    if (!window.umami || typeof window.umami.track !== 'function') return;
    tracked[name] = true;
    window.umami.track(name);
  }

  var demoOnScreen = false;
  var watched = 0;
  new IntersectionObserver(function (en) {
    en.forEach(function (e) { demoOnScreen = e.isIntersecting; });
  }, { threshold: 0.5 }).observe(vault);
  setInterval(function () {
    if (!demoOnScreen || document.visibilityState !== 'visible') return;
    watched += 1;
    track('demo-watched-10s', watched >= 10);
    track('demo-watched-30s', watched >= 30);
    track('demo-watched-60s', watched >= 60);
  }, 1000);

  /* Clicking a card jumps the storyline to that phase. Under reduced motion
     the demo is a still, so the cards do nothing but stay focusable. */
  stepEls.forEach(function (li) {
    var btn = li.querySelector('button');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (REDUCED) return;
      /* Mark started so the IntersectionObserver, if it hasn't fired yet,
         doesn't restart the loop from phase 1 on top of this jump. */
      started = true;
      track('demo-jump-' + li.dataset.step, true);
      run(Number(li.dataset.step));
    });
  });

  var io = new IntersectionObserver(function (en) {
    en.forEach(function (e) {
      if (e.isIntersecting && !started) {
        started = true;
        if (REDUCED) renderFinal();
        else run(1);
      }
    });
  }, { threshold: 0.25 });
  io.observe(vault);
})();

/* ---------- granularity explorer ----------
   The one control on this page the visitor drives themselves. It mirrors the
   graph's Granularity slider (GraphControls.svelte, `name="Granularity"`):
   dragging it re-groups the SAME notes into fewer, bigger topics or more,
   smaller ones — the plugin re-runs community detection per step and serves
   every level from cache, so it re-groups under the knob rather than after
   release (SmartGraphView.svelte handleGranularityChange).

   Faithful in the ways that matter and simplified in the ways that don't: the
   levels here are a fixed hierarchy rather than a live Leiden run, but they
   MERGE — every split group's notes stay together inside one parent as you
   move up, which is the property that makes the control legible. Random
   re-partitioning per level would read as a shuffle, not a zoom.
   The MOTION between levels is not simplified at all: it is the plugin's own
   re-cluster transition over its own force simulation (see the vendored
   modules and the shared harness at the top of this file). */
(function () {
  var cv = document.getElementById('granGraph');
  if (!cv) return;
  var slider = document.getElementById('granRange');
  var nameEl = document.getElementById('granLevelName');
  /* The wand (show/hide topics) and chevrons (collapse/expand) — the same
     two controls the plugin's toolbar carries next to its lasso. */
  var btnTopics = document.getElementById('granTopics');
  var btnCollapse = document.getElementById('granCollapse');
  var ctx = cv.getContext('2d');
  var W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);

  /* The eight finest groups, in the demo's Psych-101 vault. Where each sits
     on screen is no longer scripted — the layout is the plugin's own force
     simulation, and sibling groups end up near each other because they share
     links (see the edge generation in build), not because a grid says so. */
  var LEAVES = [
    { name: 'Long-term memory', n: 9 },
    { name: 'Recall & testing', n: 8 },
    { name: 'Sleep & memory',   n: 7 },
    { name: 'Attention',        n: 11 },
    { name: 'Illusions',        n: 10 },
    { name: 'Distributions',    n: 10 },
    { name: 'Significance',     n: 9 },
    { name: 'Essays',           n: 12 }
  ];

  /* Each level maps leaf index → group index, plus that level's group names.
     Level 4 is the leaves themselves; every step down merges whole groups, so
     nothing is ever split across two parents. */
  var LEVELS = [
    {
      label: 'Broadest',
      of: [0, 0, 0, 0, 0, 1, 1, 1],
      names: ['Psychology', 'Coursework']
    },
    {
      label: 'Broad',
      of: [0, 0, 0, 1, 1, 2, 2, 3],
      names: ['Memory', 'Perception', 'Statistics', 'Essays']
    },
    {
      label: 'Fine',
      of: [0, 0, 1, 2, 3, 4, 4, 5],
      /* Leaves 0+1 (Long-term memory + Recall & testing) merge here, so the
         parent's name has to cover both — "Long-term memory" does; a narrower
         mechanism name would not. */
      names: ['Long-term memory', 'Sleep & memory', 'Attention', 'Illusions', 'Statistics', 'Essays']
    },
    {
      label: 'Finest',
      of: [0, 1, 2, 3, 4, 5, 6, 7],
      names: LEAVES.map(function (l) { return l.name; })
    }
  ];

  var level = 1;                 /* index into LEVELS; matches the slider */

  /* Eight labelled topics need room the phone layout doesn't have — at 290px
     tall the pills overlap each other and the point of the control is lost. So
     a narrow canvas stops at the 6-topic level and the slider's range shrinks
     to match: fewer stops, all of them legible, rather than a stop that draws
     a mess. The levels themselves are unchanged; this only limits how far the
     control goes. */
  function maxLevel() {
    return W && W < 520 ? LEVELS.length - 2 : LEVELS.length - 1;
  }
  function syncSliderRange() {
    if (!slider) return;
    var max = maxLevel();
    slider.max = String(max);
    if (Number(slider.value) > max) {
      slider.value = String(max);
      setLevel(max);
    }
  }
  var PALETTE = {}, ACCENT = '#7f6df2', TEXT = '#ddd', FOG = '30, 30, 30';

  function readTokens() {
    var cs = getComputedStyle(document.documentElement);
    function tok(name, fallback) {
      var v = cs.getPropertyValue(name).trim();
      return v || fallback;
    }
    /* Same tokens as the demo's mini graph, so the two canvases agree. */
    PALETTE = {
      nodeL: tok('--gm-node-l', '62%'),
      nodeA: tok('--gm-node-a', '0.95'),
      hubL: tok('--g-hub-l', '62%'),
      hubA: tok('--g-hub-a', '0.95'),
      edge: tok('--gm-edge', 'rgba(150,150,150,0.45)'),
      hullA: tok('--g-hull-a', '0.13')
    };
    ACCENT = tok('--ob-accent', '#7f6df2');
    TEXT = tok('--ob-text', '#dddddd');
    FOG = tok('--ob-fog', '30, 30, 30');
  }
  readTokens();

  /* The plugin's cluster colours: evenly spaced hues at 70% saturation
     (generateClusterColors in src/types/graph.ts).

     Hue follows the CURRENT GROUP, not the leaf. Colouring by leaf was tried
     first — it preserves a note's identity across levels — but it makes a
     merged topic a bag of four colours, which contradicts the outline saying
     "this is one topic". In the plugin a colour IS a topic, so the colour has
     to change when the topics do. */
  /* Spread the level's groups over the wheel, so adjacent topics stay
     distinguishable however many there are. */
  function hueOfGroup(g, total) { return Math.round((g * 360) / Math.max(1, total)); }
  /* Saturation rides the wand toggle's fade: at 0 every colour collapses to
     the same grey — the raw graph, with the clustering's colour taken away. */
  function hsla(hue, l, a) {
    return 'hsla(' + hue + ', ' + Math.round(70 * topicsVis) + '%, ' + l + ', ' + a + ')';
  }

  /* Playback rate for this canvas's transitions — slow motion (see tickSim;
     the fractional ticks are interpolated, so this does not stutter). Every
     regroup here is a re-cluster, which already starts gentler than a fresh
     settle: enough slowing to watch groups migrate, not so much that a
     control you are dragging feels laggy. */
  var PLAY = 0.5;
  /* Slightly quicker for slider moves: that transition answers a control the
     visitor is actively dragging, so it has to keep up with them. */
  var DRAG_PLAY = 0.65;

  var nodes = [], edges = [];
  /* Collapsed-view state: when `collapsed`, the sim runs over one synthetic
     node per topic (kind 'topic', as mergeNodes' buildCollapsedGraph makes
     them) instead of the notes. `topicsOn` mirrors the plugin's wand toggle,
     and it is physical: topics off strips every node's cluster (segments
     resolve to "none"), the cohesion force skips unclustered nodes, and the
     layout relaxes — see setTopics. */
  var topicNodes = [], topicLinks = [];
  var collapsed = false;
  var topicsOn = true, topicsVis = 1;
  var simState = null;
  var cam = makeCamera();
  var NODE_SIZE = 3;
  var HULL_PAD = 29;   /* nodeDrawRadius(degree 0) + HULL_PADDING, as the canvas */
  /* Spawn-grow for nodes born in a change (expand's notes, collapse's topic
     nodes): NODE_SPAWN_MS 320 ≈ 19 frames from 25% of final radius. */
  /* The plugin's NODE_SPAWN_MS is 320ms (≈19 frames), which is right in an
     app where the fold is instant feedback on a click. Here it IS the fold:
     a topic node is born at its members' centroid, so it has nowhere to
     travel and the grow-in is the whole animation. At 19 the discs finished
     while the camera was still re-framing, which read as the dots snapping
     and the region drifting after them. Stretched to cover the camera's
     ease, so the two land together. */
  var SPAWN_TICKS = 46;
  /* How far a topic's notes are seeded from its collapsed position when
     expanding — the visible outward travel IS the expand animation. */
  var EXPAND_SCATTER = 18;

  /* World → screen, through the fitted camera. */
  function TX(x) { return x * cam.scale + cam.x; }
  function TY(y) { return y * cam.scale + cam.y; }

  /** The node set the simulation currently runs over. */
  function activeNodes() { return collapsed ? topicNodes : nodes; }

  function build() {
    nodes = []; edges = [];
    for (var l = 0; l < LEAVES.length; l++) {
      for (var j = 0; j < LEAVES[l].n; j++) {
        nodes.push({
          leaf: l, cluster: LEVELS[level].of[l], degree: 0, spawn: 0,
          hub: j === 0,
          x: (Math.random() - 0.5) * 520,
          y: (Math.random() - 0.5) * 340,
          vx: 0, vy: 0
        });
      }
    }
    /* The link structure IS the hierarchy: densest inside a leaf (and denser
       still around each leaf's HUB note — the MOC-like note a topic forms
       around, which is also what gives topics their size gradient), sparser
       between leaves sharing a Broad parent, sparser again across the
       Broadest split, and a whisper of links between everything — a vault is
       one loosely connected web, not disjoint islands. Those weak ties are
       also what gives the collapsed view real weighted edges to draw. */
    for (var a = 0; a < nodes.length; a++) {
      for (var b = a + 1; b < nodes.length; b++) {
        var na = nodes[a], nb = nodes[b];
        var p, wiki = false;
        if (na.leaf === nb.leaf) {
          p = (na.hub || nb.hub) ? 0.4 : 1.0 / LEAVES[na.leaf].n;
          wiki = true;
        }
        else if (LEVELS[1].of[na.leaf] === LEVELS[1].of[nb.leaf]) p = 0.03;
        else if (LEVELS[0].of[na.leaf] === LEVELS[0].of[nb.leaf]) p = 0.008;
        else p = 0.003;
        if (p && Math.random() < p) {
          edges.push({ source: na, target: nb, weight: 1, type: wiki ? 'wiki' : 'semantic', intra: wiki });
          na.degree++; nb.degree++;
        }
      }
    }
    NODE_SIZE = autoNodeSize(nodes.length);
    simState = makeSim(nodes, edges, nodes.length);
    /* First paint is a settled layout, not the opening explosion — the same
       reason the plugin briefly hides a fresh canvas while it settles. */
    startFresh(simState);
    settleSim(simState);
  }

  /**
   * One synthetic node per topic at the current level, the way
   * buildCollapsedGraph makes them: kind 'topic', degree = how many
   * note-links cross its boundary, and one merged edge per topic pair whose
   * weight sums the crossings. Each is seeded at the mean position of
   * whatever currently represents its leaves, so folding reads as gathering.
   */
  function buildTopicNodes() {
    var map = LEVELS[level].of;
    var ids = [];
    for (var l = 0; l < LEAVES.length; l++) if (ids.indexOf(map[l]) < 0) ids.push(map[l]);

    var prev = activeNodes();
    var made = ids.map(function (g) {
      var sx = 0, sy = 0, c = 0;
      for (var i = 0; i < prev.length; i++) {
        var covers = prev[i].leaves
          ? prev[i].leaves.some(function (lf) { return map[lf] === g; })
          : map[prev[i].leaf] === g;
        if (covers) { sx += prev[i].x; sy += prev[i].y; c++; }
      }
      var leaves = [];
      for (var l2 = 0; l2 < LEAVES.length; l2++) if (map[l2] === g) leaves.push(l2);
      var members = leaves.reduce(function (s, lf) { return s + LEAVES[lf].n; }, 0);
      return {
        kind: 'topic', g: g, cluster: g, leaves: leaves, members: members,
        degree: 0, spawn: SPAWN_TICKS,
        x: c ? sx / c : 0, y: c ? sy / c : 0, vx: 0, vy: 0
      };
    });
    var byGroup = {};
    made.forEach(function (t) { byGroup[t.g] = t; });

    var links = {};
    for (var e = 0; e < edges.length; e++) {
      var ga = map[edges[e].source.leaf], gb = map[edges[e].target.leaf];
      if (ga === gb) continue;
      byGroup[ga].degree++; byGroup[gb].degree++;
      var key = ga < gb ? ga + ':' + gb : gb + ':' + ga;
      if (links[key]) links[key].weight++;
      else links[key] = { source: byGroup[ga], target: byGroup[gb], weight: 1, type: 'wiki', intra: true };
    }
    topicNodes = made;
    topicLinks = Object.keys(links).map(function (k) { return links[k]; });
  }

  function setCollapsed(next) {
    if (next === collapsed || !topicsOn) return;
    collapsed = next;
    if (collapsed) {
      buildTopicNodes();
      retune(simState, topicNodes, topicLinks, topicNodes.length, nodes.length);
    } else {
      /* Members burst outward from their topic's point — seeded just off it
         so the force sim has a gradient, with the travel as the animation. */
      var map = LEVELS[level].of;
      var byGroup = {};
      topicNodes.forEach(function (t) { byGroup[t.g] = t; });
      for (var i = 0; i < nodes.length; i++) {
        var t = byGroup[map[nodes[i].leaf]];
        var a = Math.random() * Math.PI * 2, r = Math.random() * EXPAND_SCATTER;
        nodes[i].x = t.x + Math.cos(a) * r;
        nodes[i].y = t.y + Math.sin(a) * r;
        nodes[i].vx = 0; nodes[i].vy = 0;
        nodes[i].cluster = map[nodes[i].leaf];
        nodes[i].spawn = SPAWN_TICKS;
      }
      retune(simState, nodes, edges, nodes.length);
    }
    startRetarget(simState, PLAY);
    if (btnCollapse) {
      btnCollapse.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
      btnCollapse.classList.toggle('on', collapsed);
      btnCollapse.title = collapsed
        ? 'Expand all topics back into notes'
        : 'Collapse all topics into single nodes';
    }
    if (REDUCED) {
      settleSim(simState);
      cameraFollow(cam, cameraTarget(activeNodes(), W, H, null, { worldPad: HULL_PAD }), true);
      draw();
    }
  }

  function setTopics(on) {
    if (on === topicsOn) return;
    /* Collapsed topic nodes ARE the clustering — hiding it folds them back
       out first, exactly as the plugin's handleSettingsChange clears the
       folds when topics are switched off. */
    if (!on && collapsed) setCollapsed(false);
    topicsOn = on;
    /* The toggle is PHYSICAL, not just visual: hiding topics resolves the
       plugin's segments to "none", which strips every node's cluster — and
       the cohesion force skips unclustered nodes, so with topics off the
       layout relaxes to what links, charge and centering alone want. A
       cluster change triggers the re-cluster transition in the canvas, both
       directions. (GraphControls' "display-only" comment refers to Leiden
       not being recomputed — the communities stay cached — not to the
       layout, which visibly loosens and regathers.) */
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].cluster = on ? LEVELS[level].of[nodes[i].leaf] : null;
    }
    startRecluster(simState, PLAY);
    if (btnTopics) {
      btnTopics.setAttribute('aria-pressed', on ? 'true' : 'false');
      btnTopics.classList.toggle('on', on);
      btnTopics.title = on
        ? 'Hide topics: show the raw graph without clustering'
        : 'Show topics: colour notes by their detected topic';
    }
    if (btnCollapse) {
      btnCollapse.disabled = !on;
      if (!on) btnCollapse.title = 'Turn topics on to collapse them';
      else btnCollapse.title = collapsed
        ? 'Expand all topics back into notes'
        : 'Collapse all topics into single nodes';
    }
    /* Granularity decides which topics exist — with topics off it has
       nothing to act on. (The plugin leaves its slider enabled but inert:
       segment resolution stays "none", so dragging changes only the cached
       communities. Inert-looking controls read as broken on a demo, so here
       the dependency is shown instead.) */
    if (slider) {
      slider.disabled = !on;
      slider.title = on ? '' : 'Turn topics on to change their granularity';
    }
    var row = slider && slider.closest('.g-ctl');
    if (row) row.classList.toggle('topics-off', !on);
    if (REDUCED) {
      topicsVis = on ? 1 : 0;
      settleSim(simState);
      cameraFollow(cam, cameraTarget(activeNodes(), W, H, null, { worldPad: HULL_PAD }), true);
      draw();
    }
  }

  var lastStep = 0;
  function step() {
    var now = performance.now();
    var dt = lastStep ? Math.min(3, (now - lastStep) / 16.667) : 1;
    lastStep = now;
    tickSim(simState, dt);
    cameraFollow(cam, cameraTarget(activeNodes(), W, H, null, { worldPad: HULL_PAD }), false, simState.rate);
    /* Colour fades with the motion rather than ahead of it — at the old 0.25
       the grey/colour swap finished long before the layout had relaxed or
       regathered, so the two halves of the wand toggle read as separate
       events. The LAYOUT change rides the simulation. */
    topicsVis += ((topicsOn ? 1 : 0) - topicsVis) * 0.25 * (simState.rate || 1);
    /* Spawn-grow counts down with the playback too, so a node born in a fold
       finishes growing as its group finishes moving. */
    var act = activeNodes();
    var d = simState.rate || 1;
    for (var i = 0; i < act.length; i++) if (act[i].spawn > 0) act[i].spawn = Math.max(0, act[i].spawn - d);
  }

  function groupsAtLevel() {
    var map = LEVELS[level].of;
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var g = map[nodes[i].leaf];
      (out[g] || (out[g] = [])).push(nodes[i]);
    }
    return out;
  }

  /** The hue for a group at the current level. */
  function groupHue(g) {
    return hueOfGroup(g, LEVELS[level].names.length);
  }

  /** The hue a node currently wears — its group's. */
  function nodeHue(n) {
    return groupHue(LEVELS[level].of[n.leaf]);
  }

  function drawPill(text, x, y, hue) {
    ctx.font = '500 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var w = ctx.measureText(text).width + 18;
    var h = 19, m = 3;
    x = Math.max(w / 2 + m, Math.min(W - w / 2 - m, x));
    y = Math.max(h / 2 + m, Math.min(H - h / 2 - m, y));
    roundRectPath(ctx, x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fillStyle = 'rgba(' + FOG + ', 0.85)';
    ctx.fill();
    ctx.strokeStyle = hsla(hue, PALETTE.nodeL, 0.8);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = TEXT;
    ctx.fillText(text, x, y);
  }

  /** Spawn-grow scale for a node born in a change (25% → full, eased out).
      The countdown ticks in step(), which reduced motion never runs — there
      a born node must simply be full-size. */
  function spawnScale(n) {
    if (REDUCED || !n.spawn) return 1;
    var t = 1 - n.spawn / SPAWN_TICKS;
    return 0.25 + 0.75 * (1 - (1 - t) * (1 - t));
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    var nodeScale = cam.scale * zoomNodeScale(cam.scale);

    if (collapsed) {
      /* The folded view: one disc per topic, sized by how many links cross
         its boundary (the topic radius curve in nodeDrawRadius), joined by
         merged edges whose thickness carries the crossing count — "these two
         areas are tightly related" as geometry. No hulls: the disc IS the
         region. */
      ctx.strokeStyle = PALETTE.edge;
      for (var te = 0; te < topicLinks.length; te++) {
        var tl = topicLinks[te];
        ctx.beginPath();
        ctx.moveTo(TX(tl.source.x), TY(tl.source.y));
        ctx.lineTo(TX(tl.target.x), TY(tl.target.y));
        /* pixiRenderer's topic-edge weight scale (log2, capped at 4×) over
           its 1.2px base width — but the renderer divides that base by the
           camera scale, and this camera sits near 1 on a 560px canvas, so
           applying the multiplier to a full 1.2px read heavy at only a
           handful of topics. 0.75px base keeps the coupling gradient legible
           without the folded view turning into a web of cables. */
        ctx.lineWidth = Math.min(4, 1 + Math.log2(Math.max(1, tl.weight)) * 0.45) * 0.75;
        ctx.stroke();
      }
      for (var ti = 0; ti < topicNodes.length; ti++) {
        var tn = topicNodes[ti];
        var hue = groupHue(tn.g);
        var r = nodeDrawRadius(tn, NODE_SIZE) * nodeScale * spawnScale(tn);
        ctx.beginPath();
        ctx.arc(TX(tn.x), TY(tn.y), r, 0, Math.PI * 2);
        ctx.fillStyle = hsla(hue, PALETTE.nodeL, PALETTE.nodeA);
        ctx.fill();
        drawPill(LEVELS[level].names[tn.g] + ' · ' + tn.members,
          TX(tn.x), TY(tn.y) - r - 15, hue);
      }
      return;
    }

    var groups = groupsAtLevel();

    /* Hulls and labels are what the clustering ADDS — they ride the wand
       toggle's fade, while the notes and their links stay. */
    if (topicsVis > 0.03) {
      ctx.globalAlpha = topicsVis;
      for (var g = 0; g < groups.length; g++) {
        if (!groups[g] || groups[g].length < 3) continue;
        /* The plugin's own region construction, in world units, projected. */
        var path = topicRegion(groups[g], HULL_PAD);
        if (!path) continue;
        var ghue = groupHue(g);
        ctx.beginPath();
        ctx.moveTo(TX(path[0].x), TY(path[0].y));
        for (var s = 1; s < path.length; s++) ctx.lineTo(TX(path[s].x), TY(path[s].y));
        ctx.closePath();
        ctx.fillStyle = hsla(ghue, PALETTE.nodeL, PALETTE.hullA);
        ctx.fill();
        ctx.strokeStyle = hsla(ghue, PALETTE.nodeL, 0.35);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    /* One neutral colour, hue-free — as pixiRenderer draws every edge. The
       dash marks inferred links; colour never does. */
    ctx.strokeStyle = PALETTE.edge;
    ctx.lineWidth = 1;
    for (var e = 0; e < edges.length; e++) {
      var le = edges[e];
      ctx.setLineDash(le.intra ? [] : [5, 4]);
      ctx.beginPath();
      ctx.moveTo(TX(le.source.x), TY(le.source.y));
      ctx.lineTo(TX(le.target.x), TY(le.target.y));
      ctx.stroke();
    }
    ctx.setLineDash([]);

    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], nh = nodeHue(n);
      ctx.beginPath();
      /* Size encodes degree, exactly as the plugin draws it. */
      ctx.arc(TX(n.x), TY(n.y), nodeDrawRadius(n, NODE_SIZE) * nodeScale * spawnScale(n), 0, Math.PI * 2);
      ctx.fillStyle = hsla(nh, PALETTE.nodeL, PALETTE.nodeA);
      ctx.fill();
    }

    /* Labels last so they sit above the dots, and each carries its group's
       note count — the same "name · count" shape the graph's pills use.
       Anchored to the group's live screen extent, so a pill never lands on
       its own dots; if there is no room above, it flips below. */
    if (topicsVis > 0.03) {
      ctx.globalAlpha = topicsVis;
      for (var g2 = 0; g2 < groups.length; g2++) {
        if (!groups[g2] || !groups[g2].length) continue;
        var members = groups[g2];
        var minY = Infinity, maxY = -Infinity, sx = 0;
        for (var m = 0; m < members.length; m++) {
          var y = TY(members[m].y);
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          sx += TX(members[m].x);
        }
        var gap = HULL_PAD * cam.scale + 13;
        var above = minY - gap;
        drawPill(LEVELS[level].names[g2] + ' · ' + members.length,
          sx / members.length, above > 14 ? above : maxY + gap, groupHue(g2));
      }
      ctx.globalAlpha = 1;
    }
  }

  function resize() {
    var r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    W = r.width; H = r.height;
    cv.width = W * DPR; cv.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    /* W is now known, so the level cap for this width can be applied — a
       rotation from landscape to portrait has to pull the slider back in. */
    syncSliderRange();
    /* The layout is world-space; a resize only re-fits the camera. Repaint
       synchronously — assigning cv.width wiped the canvas. */
    cameraFollow(cam, cameraTarget(activeNodes(), W, H, null, { worldPad: HULL_PAD }), true);
    draw();
  }

  function setLevel(next) {
    level = Math.max(0, Math.min(maxLevel(), next));
    if (nameEl) nameEl.textContent = LEVELS[level].label;
    if (!nodes.length) return;
    /* No topics, nothing to regroup — without this, a level change would
       write cluster ids back onto the nodes and silently re-arm the
       cohesion force while everything still looks grey. The disabled
       slider makes this unreachable from the UI; the guard makes it
       unreachable, full stop. */
    if (!topicsOn) return;
    if (collapsed) {
      /* Granularity and collapse are independent, exactly as in the plugin:
         changing the level while folded re-derives the topic nodes at the
         new level, seeded from the ones they merge from or split out of. */
      buildTopicNodes();
      retune(simState, topicNodes, topicLinks, topicNodes.length, nodes.length);
      startRecluster(simState, DRAG_PLAY);
    } else {
      /* Reassign every note's topic and run the plugin's re-cluster
         transition — the exact move handleGranularityChange makes. */
      for (var i = 0; i < nodes.length; i++) nodes[i].cluster = LEVELS[level].of[nodes[i].leaf];
      startRecluster(simState, DRAG_PLAY);
    }
    if (REDUCED) {
      settleSim(simState);
      cameraFollow(cam, cameraTarget(activeNodes(), W, H, null, { worldPad: HULL_PAD }), true);
      draw();
    }
  }

  if (slider) {
    slider.addEventListener('input', function () {
      setLevel(Number(slider.value));
    });
  }
  if (btnTopics) {
    btnTopics.addEventListener('click', function () { setTopics(!topicsOn); });
  }
  if (btnCollapse) {
    btnCollapse.addEventListener('click', function () { setCollapsed(!collapsed); });
  }

  /* Adopt the slider's own value before the first build, so the opening frame
     matches the control rather than this file's default — a browser restoring
     a previous value on reload would otherwise draw one level and label
     another. (Runs before build: it only records the level and label.) */
  if (slider) setLevel(Number(slider.value));
  build();
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('s2b-theme-change', function () {
    readTokens();
    draw();
  });

  /* Animate only while on screen: this canvas sits well below the fold, and a
     rAF loop running against an unseen canvas is pure battery. */
  if (!REDUCED) {
    var running = false;
    var loop = function () {
      if (!running) return;
      step(); draw();
      requestAnimationFrame(loop);
    };
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && !running) { running = true; lastStep = 0; requestAnimationFrame(loop); }
        else if (!en.isIntersecting) running = false;
      });
    }, { threshold: 0.15 }).observe(cv);
  }
})();

/* ---------- privacy toggle ---------- */
/* The two cases make genuinely different promises, so the toggle swaps the
   claims rather than animating a diagram. Grounded in the plugin's real model
   (dataStore.isFilePrivate / trustedForPrivateData): local providers
   (ollama/omlx) are seeded trusted; everything else starts untrusted, and
   under the default private-by-default mode that means it can read nothing
   until you list something — by folder, by tag, or by picking files.

   Rows carry their own marker kind ('ok' = green tick, 'note' = neutral) so a
   caveat never gets a tick that reads as if a limitation were a feature.

   Private notes are filtered out of every vault-facing tool, not just chat:
   search (searchNotes.ts:442), grep (grepNotes.ts:141), listings
   (listDirectory.ts:251), reads (readContent.ts:376), tags/properties,
   indexing (VectorStoreService.ts:1636) and graph titles
   (SmartGraphView.svelte:1907). Note the plugin's own PrivacyListModal copy
   claims names stay visible — the enforcement code says otherwise.

   The local copy is also in index.astro so the section survives without JS. */
(function () {
  var btns = document.querySelectorAll('.tg');
  var list = document.getElementById('privacyList');
  if (!list) return;

  var COPY = {
    local: [
      ['ok', 'Nothing leaves your computer.', 'The AI runs on it too, so your notes have nowhere to travel.'],
      ['ok', 'No account, no bill.', 'Ollama and oMLX are free and offline, so the plugin trusts them from the start.'],
      ['ok', 'Every note, right away.', 'Nothing to allow or configure, because nothing is being sent anywhere.'],
    ],
    cloud: [
      ['ok', 'It starts out reading nothing.', 'Every note is private until you allow it: opt-in, not opt-out.'],
      ['ok', 'You decide what it can read.', 'Allow a folder, everything carrying a tag, or single notes you pick.'],
      ['ok', 'Private means private everywhere.', 'Not just in chat: a private note is left out of search, listings and the graph too.'],
    ],
  };

  var MARK = { ok: '✓', note: '–' };

  function render(mode) {
    list.innerHTML = COPY[mode]
      .map(function (row) {
        return (
          '<li><span class="ck ck-' +
          row[0] +
          '">' +
          MARK[row[0]] +
          '</span><span><strong>' +
          row[1] +
          '</strong> ' +
          row[2] +
          '</span></li>'
        );
      })
      .join('');
  }

  // shield-check for the trusted (local) case, plain shield otherwise —
  // the same distinction the plugin's onboarding draws.
  var shield = document.getElementById('shieldMark');
  // Provider chips are all in the markup; landing.css shows the group that
  // matches this attribute.
  var provs = document.getElementById('provList');

  function set(mode) {
    btns.forEach(function (b) { b.classList.toggle('on', b.dataset.mode === mode); });
    if (shield) shield.classList.toggle('trusted', mode === 'local');
    if (provs) provs.dataset.mode = mode;
    render(mode);
  }

  btns.forEach(function (b) {
    b.addEventListener('click', function () { set(b.dataset.mode); });
  });
})();

/* ---------- framed: fit the hero to Umami's heatmap frame ---------- */
/* Only runs when index.astro's gate has set `framed` (self !== top), which
   in practice means Umami's heatmap viewer: it iframes the LIVE page at the
   recorded full-page height and draws the recorded clicks over it. The hero
   is the page's only viewport-sized element, so the frame's height is
   exactly `realHero + rest`, and `rest` (everything else) is measurable
   here. Solving for the hero reproduces the recorded layout for whatever
   viewport the data came from, so the markers land on what was clicked —
   a fixed height (landing.css's 840px, which is what the page has until
   this runs) would draw them offset by the difference. Two passes: the
   first changes the document height that the second measures. Re-fit on
   load, since web fonts can shift `rest` by a few pixels. */
(function () {
  if (!document.documentElement.classList.contains('framed')) return;
  var hero = document.querySelector('.hero');
  if (!hero) return;

  function fit() {
    // Content height from the body's own box, NOT scrollHeight: scrollHeight
    // is floored at the viewport, so whenever the content is shorter than
    // the frame it reports the frame height, `rest` absorbs the gap and the
    // hero never grows — the exact case (a tall recorded viewport) this
    // exists for. The nav is sticky, so it is in flow and counted.
    var rest = document.body.getBoundingClientRect().height - hero.getBoundingClientRect().height;
    var target = window.innerHeight - rest;
    if (target > 0) hero.style.minHeight = target + 'px';
  }

  fit(); fit();
  window.addEventListener('load', function () { requestAnimationFrame(fit); });
})();

