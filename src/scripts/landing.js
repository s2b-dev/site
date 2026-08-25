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

  function build() {
    nodes = []; edges = []; centers = [];
    var perCluster = 13;
    /* Size off the geometric mean of the two axes rather than the smaller
       one: the hero is full-viewport, so min(W,H) swings wildly between a
       wide desktop and a tall phone and the layout stretches with it. */
    var unit = Math.sqrt(W * H);
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
          r: 1.7 + Math.random()*2.3,
          hub: j === 0
        });
        var n0 = nodes[nodes.length-1];
        n0.x = centers[c].x + n0.ox;
        n0.y = centers[c].y + n0.oy;
      }
    }
    /* intra-community edges (dense) + a few bridges (sparse) */
    for (var n = 0; n < nodes.length; n++) {
      for (var m = n+1; m < nodes.length; m++) {
        var same = nodes[n].c === nodes[m].c;
        if (same && Math.random() < 0.13) edges.push([n,m,1]);
        else if (!same && Math.random() < 0.004) edges.push([n,m,0]);
      }
    }
  }

  function resize() {
    var r = cv.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = W*DPR; cv.height = H*DPR;
    ctx.setTransform(DPR,0,0,DPR,0,0);
    build();
  }

  var t = 0;
  function step() {
    t += 0.0045;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], ct = centers[n.c];
      /* Cohesion toward the node's own place in the cluster, not the shared
         centre — the same force concept the graph view exposes, but it keeps
         the community spread instead of collapsing it to a point. */
      n.vx += (ct.x + n.ox - n.x) * 0.0016;
      n.vy += (ct.y + n.oy - n.y) * 0.0016;
      /* gentle drift so it never looks frozen */
      n.vx += Math.cos(t*1.7 + i*0.7) * 0.010;
      n.vy += Math.sin(t*1.4 + i*0.9) * 0.010;
      n.vx *= 0.94; n.vy *= 0.94;
      n.x += n.vx; n.y += n.vy;
    }
  }

  function draw() {
    ctx.clearRect(0,0,W,H);
    for (var e = 0; e < edges.length; e++) {
      var a = nodes[edges[e][0]], b = nodes[edges[e][1]], intra = edges[e][2];
      ctx.beginPath();
      ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y);
      ctx.strokeStyle = intra
        ? hsla(a.c, PALETTE.edgeL, PALETTE.edgeA)
        : PALETTE.bridge;
      ctx.lineWidth = intra ? 0.8 : 0.6;
      ctx.stroke();
    }
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.hub ? n.r*1.9 : n.r, 0, Math.PI*2);
      ctx.fillStyle = n.hub
        ? hsla(n.c, PALETTE.hubL, PALETTE.hubA)
        : hsla(n.c, PALETTE.nodeL, PALETTE.nodeA);
      ctx.fill();
    }
  }

  resize();
  window.addEventListener('resize', resize);

  /* Re-read the palette when the theme flips. The animated path picks the new
     colours up on its next frame; the reduced-motion path must redraw itself. */
  window.addEventListener('s2b-theme-change', function () {
    readPalette();
    if (REDUCED) draw();
  });

  if (REDUCED) { draw(); return; }
  (function loop(){ step(); draw(); requestAnimationFrame(loop); })();
})();

/* ---------- integrated workspace demo ----------
   One looping storyline in four phases, each carrying a differentiating
   feature, all mirroring real plugin behaviour:
   1. the graph opens scattered and clusters itself into labelled topics
      (automatic topic detection),
   2. a keyword search finds nothing, Tab flips semantic on, and notes that
      never use those words appear (SearchModal's semantic toggle),
   3. a question typed into the chat composer sends the agent reading notes
      and slide PDFs, and its edit waits for approval (staged edits),
   4. a lasso selects a cluster and Immerse opens it into finer sub-topics
      (lasso selection, immerse, the granularity ladder). */
(function () {
  var vault = document.getElementById('vault');
  if (!vault) return;

  var QUERY_SEARCH = 'why do we forget';
  var QUERY_CHAT = 'Draft the consolidation part of my checklist';
  var QUERY_CHAT2 = 'Fold this in too';

  /* None of these snippets contain the query's words — that gap is the
     entire point of the semantic phase. */
  var RESULTS = [
    { id: 'lec8', n: 'Lecture 8 — Sleep',  p: 'Psych 101', t: 'deep sleep and its role in consolidation' },
    { id: 'slides', n: 'Week 7 slides.pdf', p: 'Psych 101', t: 'slide 18 — the hippocampus and consolidation' }
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
  var vsSum = document.getElementById('vsSum');
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
    var LABELS = [['Memory', 24], ['Sleep', 18], ['Perception', 21], ['Statistics', 19], ['Essays', 12]];
    /* The finer topics Immerse reveals inside Memory — counts sum to 24. */
    /* Counts sum to the Memory pill's 24. The cluster only holds PER nodes on
       screen, so immersing spawns extras (see `subExtras`) — otherwise three
       dots per group would contradict these labels. */
    var SUBLABELS = [['Consolidation', 9], ['Recall & testing', 8], ['Sleep & memory', 7]];
    var SUBHUE_OFFSETS = [0, 34, -34];
    var SUBCENTERS = [{ fx: 0.30, fy: 0.34 }, { fx: 0.72, fy: 0.33 }, { fx: 0.50, fy: 0.72 }];
    var PER = 9;
    var HUES = [];
    for (var i = 0; i < K; i++) HUES.push(Math.round(i * 360 / K));

    /* organize 0→1 scatter→clustered, imm 0→1 overview→immersed,
       lassoP 0→1 selection stroke sweep. */
    var organize = 0, organizeT = 0, orgE = 0;
    var imm = 0, immT = 0;
    var lassoP = 0, lassoT = 0;
    /* Second lasso, drawn inside the immersion around the Consolidation
       sub-topic — the selection that gets opened in the chat. */
    var lasso2P = 0, lasso2T = 0;

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
         far more saturated than the hero's backdrop treatment. */
      PALETTE = {
        nodeL: tok('--gm-node-l', '62%'),
        nodeA: tok('--gm-node-a', '0.95'),
        hubL: tok('--g-hub-l', '62%'),
        hubA: tok('--g-hub-a', '0.95'),
        edgeL: tok('--g-edge-l', '55%'),
        edgeA: tok('--g-edge-a', '0.16'),
        hullA: tok('--g-hull-a', '0.13'),
        bridge: tok('--g-bridge', 'rgba(150,145,180,0.07)')
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

    function unitOf() { return Math.sqrt(W * H); }

    /* --- topic regions: ported from the plugin's utils/convexHull.ts --- */

    /** Monotone chain convex hull. */
    function convexHull(pts) {
      if (pts.length < 3) return pts.slice();
      var p = pts.map(function (n) { return { x: n.x, y: n.y }; })
        .sort(function (a, b) { return a.x - b.x || a.y - b.y; });
      var cross = function (o, a, b) {
        return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
      };
      var lower = [];
      for (var i = 0; i < p.length; i++) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p[i]) <= 0) lower.pop();
        lower.push(p[i]);
      }
      var upper = [];
      for (var j = p.length - 1; j >= 0; j--) {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p[j]) <= 0) upper.pop();
        upper.push(p[j]);
      }
      lower.pop(); upper.pop();
      return lower.concat(upper);
    }

    /** Push each hull vertex outward from the centroid by `pad`. */
    function expandHull(hull, pad) {
      var cx = 0, cy = 0;
      hull.forEach(function (p) { cx += p.x; cy += p.y; });
      cx /= hull.length; cy /= hull.length;
      return hull.map(function (p) {
        var dx = p.x - cx, dy = p.y - cy;
        var d = Math.hypot(dx, dy) || 1;
        return { x: p.x + (dx / d) * pad, y: p.y + (dy / d) * pad };
      });
    }

    /** Chaikin corner-cutting — the plugin's smoothClosedPath, 2 iterations. */
    function smoothClosed(points, iterations) {
      if (points.length < 3) return points;
      var cur = points;
      for (var it = 0; it < (iterations || 2); it++) {
        var next = [];
        for (var i = 0; i < cur.length; i++) {
          var a = cur[i], b = cur[(i + 1) % cur.length];
          next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
          next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
        }
        cur = next;
      }
      return cur;
    }

    function topicRegion(pts, pad) {
      if (!pts.length) return null;
      var hull = convexHull(pts);
      if (hull.length < 3) return null;
      return smoothClosed(expandHull(hull, pad), 2);
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function drawLabelPill(text, x, y, hue, alpha) {
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
      ctx.strokeStyle = hslaH(hue, Math.round(70 * orgE), PALETTE.nodeL, 0.8);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = TEXT;
      ctx.fillText(text, x, y);
      ctx.globalAlpha = 1;
    }

    var nodes = [], edges = [], centers = [], storyEdges = [];
    /* Notes the storyline names, mapped to fixed node slots. lec7/slides/
       checklist/sg sit in the Memory cluster; lec8 is the Sleep hub. */
    var named = { lec7: 0, slides: 2, checklist: 4, sg: 6, lec8: PER };

    function scatterNode(n) {
      n.sx = W * (0.06 + Math.random() * 0.88);
      n.sy = H * (0.08 + Math.random() * 0.84);
    }

    function build() {
      nodes = []; edges = []; centers = [];
      /* Geometric mean, so the layout holds its proportions whether the pane
         is wide (desktop, side by side) or tall (mobile, stacked). */
      var unit = unitOf();
      var spacing = W < 560 ? 0.34 : 0.28;
      for (var c = 0; c < K; c++) {
        var a = (c / K) * Math.PI * 2 - Math.PI / 2;
        var rad = unit * spacing;
        var ct = { x: W / 2 + Math.cos(a) * rad, y: H / 2 + Math.sin(a) * rad * 0.82 };
        centers.push(ct);
        for (var j = 0; j < PER; j++) {
          var spread = unit * 0.075;
          /* ox/oy: the node's own spot within the cluster. Cohesion targets
             this, not the bare centre, so communities stay spread. */
          var n = {
            c: c, subc: j % 3,
            ox: (Math.random() - 0.5) * spread * 2,
            oy: (Math.random() - 0.5) * spread * 2,
            iox: (Math.random() - 0.5) * unit * 0.14,
            ioy: (Math.random() - 0.5) * unit * 0.14,
            vx: 0, vy: 0,
            r: 1.8 + Math.random() * 2.3,
            hub: j === 0,
            glow: 0, glowT: 0, pop: 0
          };
          scatterNode(n);
          n.x = n.sx; n.y = n.sy;
          nodes.push(n);
        }
      }
      /* Extra Memory nodes that only exist while immersed, so each sub-topic
         shows roughly as many dots as its label claims. They start at the
         cluster centre (invisible at imm=0) and fan out on immerse. */
      var perSub = [6, 5, 4];
      for (var s = 0; s < 3; s++) {
        for (var e2 = 0; e2 < perSub[s]; e2++) {
          var ex = {
            c: 0, subc: s, extra: true,
            ox: 0, oy: 0,
            iox: (Math.random() - 0.5) * unit * 0.15,
            ioy: (Math.random() - 0.5) * unit * 0.15,
            vx: 0, vy: 0,
            r: 1.8 + Math.random() * 2.0,
            hub: false,
            glow: 0, glowT: 0, pop: 0
          };
          ex.sx = centers[0].x; ex.sy = centers[0].y;
          ex.x = ex.sx; ex.y = ex.sy;
          nodes.push(ex);
        }
      }

      for (var n2 = 0; n2 < nodes.length; n2++) {
        if (nodes[n2].extra) continue;
        for (var m = n2 + 1; m < nodes.length; m++) {
          if (nodes[m].extra) continue;
          var same = nodes[n2].c === nodes[m].c;
          if (same && Math.random() < 0.16) edges.push([n2, m, 1]);
          else if (!same && Math.random() < 0.005) edges.push([n2, m, 0]);
        }
      }
    }

    /** Match the backing store to the CSS box. Returns the previous size. */
    function syncCanvasSize(r) {
      var prev = { w: W, h: H };
      W = r.width; H = r.height;
      cv.width = W * DPR; cv.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      return prev;
    }

    function resize() {
      var r = cv.getBoundingClientRect();
      if (!r.width || !r.height) return;
      syncCanvasSize(r);
      var keep = storyEdges.length > 0;
      build();
      if (keep) api.link();
      if (REDUCED) api.final();
      else draw();   /* the size change cleared the canvas — repaint now */
    }

    /**
     * Re-fit to a new pane size *without* rebuilding — used while the chat
     * pane slides, which changes the canvas box every frame. A full build()
     * there would re-scatter the nodes and restart the story, and leaving the
     * backing store stale stretches the old bitmap into the new box.
     * Node positions are remapped proportionally so the layout keeps its
     * shape as the pane grows or shrinks.
     */
    function refit() {
      var r = cv.getBoundingClientRect();
      if (!r.width || !r.height || !nodes.length) return;
      var prev = syncCanvasSize(r);
      if (!prev.w || !prev.h) return;
      var fx = W / prev.w, fy = H / prev.h;
      if (fx === 1 && fy === 1) return;
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        n.x *= fx; n.y *= fy;
        n.sx *= fx; n.sy *= fy;
      }
      for (var c = 0; c < centers.length; c++) {
        centers[c].x *= fx; centers[c].y *= fy;
      }
      /* Setting cv.width above wipes the canvas. Repaint synchronously — if we
         waited for the next animation frame the pane would show a blank graph
         for that frame, which reads as a flicker across the whole slide. */
      draw();
    }

    /** Where a node wants to be now, blending scatter → home → immersed. */
    function targetOf(n) {
      var ct = centers[n.c];
      var tx = n.sx + (ct.x + n.ox - n.sx) * orgE;
      var ty = n.sy + (ct.y + n.oy - n.sy) * orgE;
      if (imm > 0.001 && n.c === 0) {
        var sc = SUBCENTERS[n.subc];
        tx += (W * sc.fx + n.iox - tx) * imm;
        ty += (H * sc.fy + n.ioy - ty) * imm;
      }
      return { x: tx, y: ty };
    }

    var t = 0;
    /* Simulation heat. The drift force is scaled by this, so the layout
       settles instead of wobbling forever: it's reheated whenever something
       actually moves the nodes (clustering, immersing, exiting) and decays to
       zero once they've arrived — the way a real force sim cools. */
    var heat = 1;
    function reheat() { heat = 1; }

    function step() {
      t += 0.004;
      var prevOrg = organize, prevImm = imm;
      /* 0.06, up from 0.035: the exponential IS the fast-start/slow-settle
         shape, but at the old rate it moved at ~the spring's own tracking
         speed, so the spring low-passed it into a constant crawl. Faster
         target + heat-scaled stiffness below let the surge show. (0.08 read
         as lurching; this is the calmer of the two that still cools.) */
      organize += (organizeT - organize) * 0.06;
      orgE = organize < 0 ? 0 : organize > 1 ? 1 : organize;
      imm += (immT - imm) * 0.085;
      /* Linear, not eased: an eased sweep never quite reaches 1, so the loop
         would hang open. A person draws a lasso at a fairly even speed
         anyway. ~0.9s at 60fps. */
      if (lassoP < lassoT) lassoP = Math.min(lassoT, lassoP + 0.032);
      else lassoP += (lassoT - lassoP) * 0.2;
      if (lasso2P < lasso2T) lasso2P = Math.min(lasso2T, lasso2P + 0.032);
      else lasso2P += (lasso2T - lasso2P) * 0.2;

      /* Still transitioning? Hold full heat. Otherwise cool toward stillness. */
      if (Math.abs(organize - prevOrg) > 0.0004 || Math.abs(imm - prevImm) > 0.0004) heat = 1;
      else heat *= 0.972;
      if (heat < 0.002) heat = 0;

      /* Spring stiffness rides the heat, the way a force sim's alpha scales
         its forces: hot = a stronger pull, cooling = it relaxes toward the
         gentle base value, so arrival reads as deceleration into stillness
         rather than a constant-speed crawl. Damping rises with heat in step —
         a stronger spring under the same damping is underdamped (ζ≈0.3) and
         visibly overshot its cluster; 3× pull with 0.90 damping keeps the
         hot system near critical (ζ≈0.7): fast, but no bounce. */
      var pull = 0.0016 * (1 + 2 * heat);
      var damp = 0.94 - 0.04 * heat;
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var tg = targetOf(n);
        n.vx += (tg.x - n.x) * pull;
        n.vy += (tg.y - n.y) * pull;
        if (heat > 0) {
          n.vx += Math.cos(t * 1.7 + i * 0.7) * 0.008 * heat;
          n.vy += Math.sin(t * 1.4 + i * 0.9) * 0.008 * heat;
        }
        n.vx *= damp; n.vy *= damp;
        n.x += n.vx; n.y += n.vy;
        n.glow += (n.glowT - n.glow) * 0.08;
        n.pop *= 0.95;
      }
      for (var e = 0; e < storyEdges.length; e++) {
        var se = storyEdges[e];
        se.p += (se.t - se.p) * 0.06;
      }
    }

    /* Extras are excluded: they sit at the cluster centre until immersion, so
       including them would distort the overview hull and its label position. */
    function clusterPts(c) {
      var pts = [];
      for (var q = 0; q < nodes.length; q++) if (nodes[q].c === c && !nodes[q].extra) pts.push(nodes[q]);
      return pts;
    }

    function subPts(sc) {
      var pts = [];
      for (var q = 0; q < nodes.length; q++) if (nodes[q].c === 0 && nodes[q].subc === sc) pts.push(nodes[q]);
      return pts;
    }

    function centroidOf(pts) {
      var cx = 0, cy = 0;
      pts.forEach(function (p) { cx += p.x; cy += p.y; });
      return { x: cx / pts.length, y: cy / pts.length };
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      /* Hulls and labels only appear once the topics have actually formed. */
      var labelA = Math.max(0, Math.min(1, (orgE - 0.75) / 0.25));
      var unit = unitOf();
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

      /* Topic hulls: a real padded, smoothed convex hull over each cluster's
         live node positions — the same construction the plugin uses. Fill 0.1
         / stroke 0.35 at 1.5px match pixiRenderer's drawHulls. */
      function paintHull(pts, hue, alpha) {
        if (alpha < 0.02 || pts.length < 3) return;
        var path = topicRegion(pts, unit * 0.055);
        if (!path) return;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (var s = 1; s < path.length; s++) ctx.lineTo(path[s].x, path[s].y);
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

      for (var e = 0; e < edges.length; e++) {
        var a = nodes[edges[e][0]], b = nodes[edges[e][1]], intra = edges[e][2];
        ctx.globalAlpha = (a.c === 0 && b.c === 0) ? 1 : away;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = intra ? hsla(a.c, PALETTE.edgeL, PALETTE.edgeA) : PALETTE.bridge;
        ctx.lineWidth = intra ? 0.8 : 0.6;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      /* New connections drawn by the accepted edit. */
      for (var s2 = 0; s2 < storyEdges.length; s2++) {
        var se = storyEdges[s2];
        if (se.p < 0.01) continue;
        var na = nodes[se.a], nb = nodes[se.b];
        ctx.beginPath();
        ctx.moveTo(na.x, na.y);
        ctx.lineTo(na.x + (nb.x - na.x) * se.p, na.y + (nb.y - na.y) * se.p);
        ctx.strokeStyle = ACCENT;
        ctx.globalAlpha = 0.9 * leaving;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      /* Lasso: a dashed accent loop sweeping around the Memory cluster. */
      if (lassoP > 0.01 && imm < 0.9) {
        var mem = centroidOf(clusterPts(0));
        strokeLasso(mem, unit * 0.16, unit * 0.14, lassoP, lassoJit, leaving * 0.9);
      }

      /* Sub-topic lasso, only meaningful once immersed. */
      if (lasso2P > 0.01 && imm > 0.5) {
        var sub = centroidOf(subPts(0));
        strokeLasso(sub, unit * 0.135, unit * 0.12, lasso2P, lasso2Jit, imm * 0.9);
      }

      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var r = (n.hub ? n.r * 1.9 : n.r) + n.pop * 5;
        /* Extras only exist inside the immersion; everything outside the
           focused cluster fades out entirely. */
        var fade = n.extra ? imm : (n.c === 0 ? 1 : away);
        if (n.glow > 0.02) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 3.5 + n.glow * 2.5, 0, Math.PI * 2);
          ctx.strokeStyle = ACCENT;
          ctx.globalAlpha = 0.85 * n.glow * fade;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.globalAlpha = fade;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = n.hub
          ? hsla(n.c, PALETTE.hubL, PALETTE.hubA)
          : hsla(n.c, PALETTE.nodeL, PALETTE.nodeA);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      /* Labels ride their cluster's live centroid. */
      for (var c2 = 0; c2 < K; c2++) {
        var ce = centroidOf(clusterPts(c2));
        drawLabelPill(LABELS[c2][0] + ' · ' + LABELS[c2][1], ce.x, ce.y - unit * 0.135,
          HUES[c2], labelA * (c2 === 0 ? leaving : away));
      }
      if (imm > 0.02) {
        for (var sc2 = 0; sc2 < 3; sc2++) {
          var ce2 = centroidOf(subPts(sc2));
          drawLabelPill(SUBLABELS[sc2][0] + ' · ' + SUBLABELS[sc2][1], ce2.x, ce2.y - unit * 0.11,
            HUES[0] + SUBHUE_OFFSETS[sc2], imm);
        }
      }
    }

    var api = {
      organize: function () { organizeT = 1; reheat(); },
      immerse: function () { immT = 1; reheat(); },
      /* Ease back out to the overview — the Exit immersion beat. */
      unimmerse: function () {
        immT = 0; lassoT = 0; lassoP = 0; lasso2T = 0; lasso2P = 0;
        reheat();
      },
      /* Sweep the sub-topic lasso (used while immersed). */
      lasso2: function () { lasso2T = 1; },
      /* The selection was consumed by Open in chat — retire the stroke. */
      clearLasso2: function () { lasso2T = 0; lasso2P = 0; },
      /* Jump straight into the settled immersion (phase-jump catch-up).
         Nodes are placed at their targets, so the layout is already at rest. */
      immerseSnap: function () {
        imm = 1; immT = 1;
        for (var i = 0; i < nodes.length; i++) {
          var n = nodes[i], tg = targetOf(n);
          n.x = tg.x; n.y = tg.y; n.vx = 0; n.vy = 0;
        }
        heat = 0;
      },
      lasso: function () { lassoT = 1; },
      /* Point on a lasso's stroke at progress `p` (0–1), in canvas
         coordinates — lets the simulated cursor ride the loop as it draws. */
      lassoPoint: function (which, p) {
        var c, rx, ry, jit;
        /* Radii must match strokeLasso's, or the cursor drifts off the line. */
        if (which === 2) {
          c = centroidOf(subPts(0)); rx = unitOf() * 0.135; ry = unitOf() * 0.12; jit = lasso2Jit;
        } else {
          c = centroidOf(clusterPts(0)); rx = unitOf() * 0.16; ry = unitOf() * 0.14; jit = lassoJit;
        }
        var a = jit.start + Math.PI * 2 * p;
        var w = jitterAt(jit, a);
        return { x: c.x + Math.cos(a) * rx * (1 + w), y: c.y + Math.sin(a) * ry * (1 + w) };
      },
      glow: function (id, amt) {
        var n = nodes[named[id]];
        if (n) n.glowT = amt;
        if (REDUCED) { if (n) n.glow = amt; draw(); }
      },
      pop: function (id) {
        var n = nodes[named[id]];
        if (n) n.pop = 1;
      },
      /* The checklist's new links to the notes it now cites. */
      link: function () {
        storyEdges = ['lec7', 'slides'].map(function (id) {
          return { a: named.checklist, b: named[id], p: REDUCED ? 1 : 0, t: 1 };
        });
        if (REDUCED) draw();
      },
      reset: function () {
        storyEdges = [];
        organizeT = 0; organize = 0; orgE = 0;
        immT = 0; imm = 0;
        lassoT = 0; lassoP = 0;
        lasso2T = 0; lasso2P = 0;
        /* A fresh squiggle each cycle — a person wouldn't draw it identically. */
        lassoJit = makeJitter(); lasso2Jit = makeJitter();
        reheat();
        for (var i = 0; i < nodes.length; i++) {
          nodes[i].glowT = 0; nodes[i].glow = 0;
          /* Extras stay parked at the cluster centre — they're invisible until
             immersion, so scattering them would drag their hull around. */
          if (nodes[i].extra) { nodes[i].sx = centers[0].x; nodes[i].sy = centers[0].y; }
          else scatterNode(nodes[i]);
          nodes[i].x = nodes[i].sx; nodes[i].y = nodes[i].sy;
        }
        if (REDUCED) draw();
      },
      /* Snap the clustering to done — used when jumping past phase 1. */
      settle: function () {
        organize = 1; orgE = 1;
        for (var i = 0; i < nodes.length; i++) {
          var n = nodes[i], tg = targetOf(n);
          n.x = tg.x; n.y = tg.y; n.vx = 0; n.vy = 0;
        }
        heat = 0;
      },
      /* Reduced motion: jump straight to the organized end state. */
      final: function () {
        organize = 1; organizeT = 1; orgE = 1; imm = 0; immT = 0;
        for (var i = 0; i < nodes.length; i++) {
          var n = nodes[i], tg = targetOf(n);
          n.x = tg.x; n.y = tg.y;
        }
        draw();
      }
    };

    resize();
    /* A window resize is a genuine layout change — rebuild for it. The pane
       slide, by contrast, resizes the canvas with no window event, so the
       observer refits (rescales) instead of rebuilding. The flag keeps the
       observer from also firing a refit for the rebuild it just caused. */
    var rebuilding = false;
    window.addEventListener('resize', function () {
      rebuilding = true;
      resize();
      requestAnimationFrame(function () { rebuilding = false; });
    });
    if (window.ResizeObserver) {
      new ResizeObserver(function () { if (!rebuilding) refit(); }).observe(cv);
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
  function addMsg(html, cls) {
    var d = document.createElement('div');
    d.className = 'msg' + (cls ? ' ' + cls : '');
    d.innerHTML = html;
    chat.appendChild(d);
    if (REDUCED) d.classList.add('on');
    else requestAnimationFrame(function () { requestAnimationFrame(function () { d.classList.add('on'); }); });
    return d;
  }
  /* Lucide `git-fork` — a graph selection is ambient context, not a file
     attachment, so it carries the tray's icon rather than a file emoji. */
  var GRAPH_ICON =
    '<svg class="msg-att-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9M12 12v3"/></svg>';
  var ANSWER = 'From your 9 Consolidation notes: it happens in deep sleep, in three stages — here’s your section:';
  var ANSWER2 = 'Good addition — sleep is when consolidation runs. Updated:';
  /* The staged edit, shaped like the real PendingChangesBar: a summary row
     ("1 update pending" + Accept All / Reject All) over a collapsible entry
     carrying the change type and the note it touches. */
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
    '<div class="pcb-entry"><span class="pcb-badge">Update</span>' +
    '<span class="pcb-path">Exam checklist</span></div>' +
    '<div class="pcb-diff">' +
    '<div class="pcb-line pcb-ctx">## Consolidation</div>' +
    '<div class="pcb-line"><span class="pcb-add">Three stages — lecture 7.</span></div>' +
    '<div class="pcb-line"><span class="pcb-add">Hippocampus diagram — slide 18.</span></div>' +
    '</div></div></div>';
  var SUGG_EXTRA = 'Sleep before the exam — recall needs it.';

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

  /* Append the complementary note's line to the pending draft — the second
     question folds into the SAME staged change, not a new one. */
  function extendSugg() {
    var diff = pending.querySelector('.pcb-diff');
    if (!diff) return;
    var line = document.createElement('div');
    line.className = 'pcb-line';
    var add = document.createElement('span');
    add.className = 'pcb-add';
    add.textContent = SUGG_EXTRA;
    line.appendChild(add);
    diff.appendChild(line);
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

  function typeInto(el, text, speed, hidePh) {
    if (hidePh) hidePh.classList.add('off');
    var run = ++typeRun;
    var i = 0;
    (function tick() {
      if (run !== typeRun || i > text.length) return;
      el.textContent = text.slice(0, i);
      if (hidePh) hidePh.classList.add('off');
      i++;
      timers.push(setTimeout(tick, speed + Math.random() * speed * 0.7));
    })();
  }

  function reset() {
    timers.forEach(clearTimeout); timers = [];
    stopTyping();
    chat.innerHTML = '';
    pending.innerHTML = '';
    typed.textContent = '';
    ph.classList.remove('off');
    ph.textContent = PH_SEARCH;
    vPlus.classList.remove('pressed');
    search.classList.remove('on');
    vsBox.classList.remove('glow');
    vsEmpty.classList.remove('on');
    setSemLabel('off');
    vsSem.classList.remove('pulse', 'on');
    vsAtt.classList.remove('pulse', 'on');
    vsSum.classList.remove('on');
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
  var PHASE_AT = { 1: 0, 2: 4200, 3: 10400, 4: 19900 };

  /* Put the world into the state phase `n` expects to start from, without
     any of the animation that normally gets it there. */
  function catchUpTo(n) {
    if (n <= 1) return;
    /* topics already formed */
    graph.organize();
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
      addMsg('<div class="act">Read 9 notes in <em>Consolidation</em></div>');
      addMsg('<div class="msg-ai">' + ANSWER + '</div>');
      /* Fast-forward: this beat is already in the past, so the bar lands
         settled and open rather than replaying its arrival. */
      pending.innerHTML = SUGG;
      var pcb = pending.querySelector('.pcb');
      if (pcb) pcb.classList.add('on', 'open');
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

    /* 1 — the map connects itself */
    at(400, function () { setStep(1); graph.organize(); });

    /* 2 — lasso the Memory topic and immerse into it */
    at(4200, function () {
      setStep(2);
      cursorAt(graph.lassoPoint(1, 0).x - 3, graph.lassoPoint(1, 0).y - 2, true);
      cursorShow();
    });
    at(4400, function () {
      graph.lasso();
      cursorTraceLasso(function (p) { return graph.lassoPoint(1, p); }, 560);
    });
    at(5400, function () { vSel.classList.add('on'); syncDismiss(); });
    at(5900, function () { cursorToEl(vImm); });
    at(6500, function () { vImm.classList.add('pressed'); cursorClick(); });
    at(7000, function () {
      vSel.classList.remove('on');
      syncDismiss();
      graph.immerse();
      cursorHide();
    });
    at(8200, function () { vExit.classList.add('on'); });

    /* 3 — select a sub-topic inside the immersion and open it in the chat.
       The lassoed notes reach the composer as the ambient graph-selection
       chip, exactly how the real bar's "Open in Chat" works. */
    at(10500, function () {
      setStep(3);
      vExit.classList.remove('on');   /* make room for the selection bar */
      cursorAt(graph.lassoPoint(2, 0).x - 3, graph.lassoPoint(2, 0).y - 2, true);
      cursorShow();
    });
    at(10700, function () {
      graph.lasso2();
      cursorTraceLasso(function (p) { return graph.lassoPoint(2, p); }, 560);
    });
    at(11600, function () { vSel2.classList.add('on'); syncDismiss(); });
    at(12000, function () { cursorToEl(vOpen); });
    at(12600, function () { vOpen.classList.add('pressed'); cursorClick(); });
    at(13100, function () {
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
       isn't being written into a composer that's still moving. */
    at(14000, function () {
      vcCaret.hidden = false;
      typeInto(vcTyped, QUERY_CHAT, 32, vcPh);
    });
    at(15800, function () {
      vSend.classList.add('pressed');
      stopTyping();
      vcCaret.hidden = true;
      vcTyped.textContent = '';
      vcPh.classList.remove('off');
      vAttach.classList.remove('on');
      vGchip.hidden = true;
      postFirstExchange();
    });
    at(16100, function () { vSend.classList.remove('pressed'); });
    at(16600, function () { addMsg('<div class="act">Read 9 notes in <em>Consolidation</em></div>'); });
    /* The draft card follows the stream rather than racing a fixed delay —
       streaming duration varies with the random chunking. */
    at(17500, function () {
      streamAnswer(ANSWER, function () {
        timers.push(setTimeout(showSugg, 450));
      });
    });

    /* 4 — a piece is missing: search by meaning, attach, the agent folds it
       into the pending draft. One approval at the very end.
       On mobile the search is reached the way the real app reaches it: there
       is no ⌥A, so the + button in the composer opens the vault picker (the
       same sheet, in picker mode — its placeholder says so). The press is a
       scale dip like the send button's; deliberately no cursor here, the
       touch dot is scoped to the graph's direct manipulations. */
    at(20200, function () {
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
    at(20700, function () { typeInto(typed, QUERY_SEARCH, 42, ph); });
    at(22000, function () { vsEmpty.classList.add('on'); });
    at(22800, function () { vsSem.classList.add('pulse'); });
    at(23600, function () {
      vsSem.classList.remove('pulse');
      vsSem.classList.add('on');
      setSemLabel('on');
      vsBox.classList.add('glow');
    });
    at(24200, function () {
      vsBox.classList.remove('glow');
      vsEmpty.classList.remove('on');
      resEls.forEach(function (r, k) {
        timers.push(setTimeout(function () { r.classList.add('on'); }, k * 150));
      });
    });
    at(25600, function () {
      resEls[0].classList.add('picked');
      timers.push(setTimeout(function () { vsSum.classList.add('on'); }, 380));
    });
    at(26400, function () { vsAtt.classList.add('pulse'); });
    at(27200, function () {
      vsAtt.classList.remove('pulse');
      vsAtt.classList.add('on');
    });
    at(27600, function () {
      search.classList.remove('on');
      vLchip.hidden = false;
      vAttach.classList.add('on');
    });
    /* Typed in the composer, like the first question — not conjured. */
    at(28100, function () {
      vcCaret.hidden = false;
      typeInto(vcTyped, QUERY_CHAT2, 34, vcPh);
    });
    at(29300, function () {
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
    at(29600, function () { vSend.classList.remove('pressed'); });
    at(30100, function () { addMsg('<div class="act">Read <em>Lecture 8 — Sleep</em></div>'); });
    at(30900, function () {
      /* The revised draft line lands only once the answer has finished
         streaming, so the two don't arrive on top of each other. */
      streamAnswer(ANSWER2, extendSugg);
    });
    at(32400, function () {
      var btn = pending.querySelector('.pcb-accept');
      if (btn) btn.classList.add('pressed');
    });
    at(33000, function () {
      /* Accepted: the bar clears, because there is nothing left pending. */
      pending.innerHTML = '';
      addMsg('<div class="act ok">✓ Added to <em>Exam checklist</em> — approved by you</div>');
    });

    /* Finale: exit the immersion, back to the overview — where the approved
       note draws its new connections. Closes the loop where it began. */
    at(33400, function () { cursorToEl(vExitBtn); cursorShow(); });
    at(33900, function () { vExitBtn.classList.add('pressed'); cursorClick(); });
    at(34400, function () {
      vExitBtn.classList.remove('pressed');
      vExit.classList.remove('on');
      setPane('graph');
      graph.unimmerse();
      cursorHide();
    });
    at(35600, function () {
      graph.glow('checklist', 1); graph.pop('checklist');
      graph.glow('lec7', 0.6); graph.glow('lec8', 0.6);
      graph.link();
    });
    at(38700, function () { run(1); });
  }

  /* Reduced motion: no storyline — show the finished, organized state. */
  function renderFinal() {
    setStep('all');
    setPane('chat', true);
    graph.final();
    postFirstExchange();
    addMsg('<div class="act">Read 9 notes in <em>Consolidation</em></div>');
    addMsg('<div class="msg-ai">' + ANSWER + '</div>');
    addMsg('<div class="msg-atts"><span class="msg-att">📝 Lecture 8 — Sleep.md</span></div>');
    addMsg('<div class="msg-user">' + QUERY_CHAT2 + '</div>');
    addMsg('<div class="act">Read <em>Lecture 8 — Sleep</em></div>');
    addMsg('<div class="act ok">✓ Added to <em>Exam checklist</em> — approved by you</div>');
    typed.textContent = QUERY_SEARCH;
    ph.classList.add('off');
    setSemLabel('on');
    vsSem.classList.add('on');
    resEls.forEach(function (r) { r.classList.add('on'); });
    ['lec7', 'lec8', 'checklist'].forEach(function (id) { graph.glow(id, 1); });
    graph.link();
  }

  var started = false;

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
      ['ok', 'No account, no bill.', 'Ollama and oMLX are free and offline — the plugin trusts them from the start.'],
      ['ok', 'Every note, right away.', 'Nothing to allow or configure, because nothing is being sent anywhere.'],
    ],
    cloud: [
      ['ok', 'It starts out reading nothing.', 'Every note is private until you allow it — opt-in, not opt-out.'],
      ['ok', 'You decide what it can read.', 'Allow a folder, everything carrying a tag, or single notes you pick.'],
      ['ok', 'Private means private everywhere.', 'Not just in chat — a private note is left out of search, listings and the graph too.'],
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

  function set(mode) {
    btns.forEach(function (b) { b.classList.toggle('on', b.dataset.mode === mode); });
    if (shield) shield.classList.toggle('trusted', mode === 'local');
    render(mode);
  }

  btns.forEach(function (b) {
    b.addEventListener('click', function () { set(b.dataset.mode); });
  });
})();

