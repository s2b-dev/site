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
  var COLORS = [];
  for (var i = 0; i < K; i++) COLORS.push('hsl(' + Math.round(i * 360 / K) + ', 70%, 55%)');

  var nodes = [], edges = [], centers = [];

  function build() {
    nodes = []; edges = []; centers = [];
    var perCluster = 13;
    for (var c = 0; c < K; c++) {
      var a = (c / K) * Math.PI * 2 - Math.PI / 2;
      var rad = Math.min(W, H) * 0.26;
      centers.push({ x: W/2 + Math.cos(a)*rad, y: H/2 + Math.sin(a)*rad*0.78 });
      for (var j = 0; j < perCluster; j++) {
        var spread = Math.min(W,H) * 0.10;
        nodes.push({
          c: c,
          x: centers[c].x + (Math.random()-0.5)*spread*2,
          y: centers[c].y + (Math.random()-0.5)*spread*2,
          vx: 0, vy: 0,
          r: 1.7 + Math.random()*2.3,
          hub: j === 0
        });
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
      /* cluster cohesion — the same force concept the graph view exposes */
      n.vx += (ct.x - n.x) * 0.0016;
      n.vy += (ct.y - n.y) * 0.0016;
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
        ? COLORS[a.c].replace('55%)', '55%, 0.16)').replace('hsl(','hsla(')
        : 'rgba(150,145,180,0.07)';
      ctx.lineWidth = intra ? 0.8 : 0.6;
      ctx.stroke();
    }
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.hub ? n.r*1.9 : n.r, 0, Math.PI*2);
      ctx.fillStyle = COLORS[n.c].replace('55%)', n.hub ? '62%, 0.95)' : '55%, 0.62)').replace('hsl(','hsla(');
      ctx.fill();
    }
  }

  resize();
  window.addEventListener('resize', resize);

  if (REDUCED) { draw(); return; }
  (function loop(){ step(); draw(); requestAnimationFrame(loop); })();
})();

/* ---------- vault search demo ---------- */
(function () {
  var QUERY = 'how does retrieval work';
  var FILES = [
    { n: 'RAG pipeline.md',        hit: 1, s: '0.94', t: 'chunking, embedding and <mark>retrieval</mark> over the vault' },
    { n: 'Vector stores.md',       hit: 1, s: '0.88', t: 'HNSW index, nearest-neighbour <mark>retrieval</mark>' },
    { n: 'Hybrid ranking.md',      hit: 1, s: '0.81', t: 'fusing lexical and semantic <mark>retrieval</mark> results' },
    { n: 'Meeting 2026-03-11.md',  hit: 0 },
    { n: 'Reading list.md',        hit: 0 },
    { n: 'Obsidian setup.md',      hit: 0 },
    { n: 'Trip planning.md',       hit: 0 }
  ];
  var tree = document.getElementById('tree');
  var typed = document.getElementById('typed');
  var results = document.getElementById('results');
  if (!tree || !typed || !results) return;

  FILES.forEach(function (f) {
    var d = document.createElement('div');
    d.className = 'tree-item';
    d.dataset.name = f.n;
    d.innerHTML = '<span class="ic">▪</span>' + f.n.replace('.md','');
    tree.appendChild(d);
  });
  FILES.filter(function(f){return f.hit;}).forEach(function (f) {
    var d = document.createElement('div');
    d.className = 'res';
    d.innerHTML = '<div class="res-top"><span class="res-name">'+f.n+'</span><span class="res-score">'+f.s+'</span></div><div class="res-snip">'+f.t+'</div>';
    results.appendChild(d);
  });

  var resEls = results.querySelectorAll('.res');
  var treeEls = tree.querySelectorAll('.tree-item');

  function reset() {
    typed.textContent = '';
    resEls.forEach(function(r){ r.classList.remove('on'); });
    treeEls.forEach(function(t){ t.classList.remove('hit'); });
  }

  function run() {
    reset();
    if (REDUCED) {
      typed.textContent = QUERY;
      resEls.forEach(function(r){ r.classList.add('on'); });
      treeEls.forEach(function(t){ if (FILES.find(function(f){return f.n===t.dataset.name && f.hit;})) t.classList.add('hit'); });
      return;
    }
    var i = 0;
    (function type() {
      if (i <= QUERY.length) {
        typed.textContent = QUERY.slice(0, i);
        i++;
        setTimeout(type, 55 + Math.random()*45);
      } else {
        resEls.forEach(function (r, k) {
          setTimeout(function(){ r.classList.add('on'); }, 160 + k*130);
        });
        treeEls.forEach(function (t) {
          var f = FILES.find(function(x){ return x.n === t.dataset.name; });
          if (f && f.hit) setTimeout(function(){ t.classList.add('hit'); }, 300 + Math.random()*400);
        });
        setTimeout(run, 6200);
      }
    })();
  }

  var started = false;
  var io = new IntersectionObserver(function (en) {
    en.forEach(function (e) { if (e.isIntersecting && !started) { started = true; run(); } });
  }, { threshold: 0.35 });
  io.observe(document.getElementById('search'));
})();

/* ---------- privacy toggle ---------- */
(function () {
  var btns = document.querySelectorAll('.tg');
  var barrier = document.getElementById('barrier');
  var cloud = document.getElementById('cloudNode');
  var local = document.getElementById('localModel');
  if (!barrier) return;

  function set(mode) {
    btns.forEach(function(b){ b.classList.toggle('on', b.dataset.mode === mode); });
    if (mode === 'local') {
      barrier.className = 'barrier blocked';
      barrier.textContent = '✕ nothing crosses this line';
      cloud.style.opacity = '.4';
      cloud.textContent = '☁ cloud provider — idle';
      local.style.borderColor = 'var(--accent)';
      local.style.background = 'var(--accent-soft)';
    } else {
      barrier.className = 'barrier allowed';
      barrier.textContent = '→ only notes you allow cross';
      cloud.style.opacity = '1';
      cloud.textContent = '☁ cloud provider — 12 of 1,284 notes allowed';
      local.style.borderColor = 'var(--border-2)';
      local.style.background = 'var(--surface)';
    }
  }
  btns.forEach(function(b){ b.addEventListener('click', function(){ set(b.dataset.mode); }); });
  set('local');
})();

/* ---------- agent loop ---------- */
(function () {
  var body = document.getElementById('agentBody');
  if (!body) return;
  var STEPS = [
    { html: '<div class="msg-user">add a note summarising how retrieval works here</div>' },
    { html: '<div class="tool"><span class="tk">memory</span> Agent/Memories <span class="ok">prefers concise notes</span></div>' },
    { html: '<div class="tool"><span class="tk">search_notes</span> "retrieval pipeline" <span class="ok">3 hits</span></div>' },
    { html: '<div class="tool"><span class="tk">read_content</span> RAG pipeline.md <span class="ok">read</span></div>' },
    { html: '<div class="msg-ai">Found three related notes. Drafting a summary and staging it for review.</div>' },
    { html: '<div class="diff"><div class="diff-head"><span>Retrieval overview.md</span><span style="color:var(--green)">+4</span></div>'
          + '<div class="diff-line ctx">## How retrieval works</div>'
          + '<div class="diff-line add">+ Queries run through lexical and vector search in parallel.</div>'
          + '<div class="diff-line add">+ Results are fused with reciprocal rank fusion.</div>'
          + '<div class="diff-line add">+ Recently opened notes get a small boost.</div>'
          + '<div class="diff-acts"><button class="diff-btn acc">✓ Accept</button><button class="diff-btn">Reject</button></div></div>' }
  ];

  function render(instant) {
    body.innerHTML = '';
    STEPS.forEach(function (s, i) {
      var d = document.createElement('div');
      d.className = 'msg';
      d.innerHTML = s.html;
      body.appendChild(d);
      if (instant) { d.classList.add('on'); return; }
      setTimeout(function(){ d.classList.add('on'); }, 500 + i * 1050);
    });
    if (!instant) setTimeout(function(){ render(false); }, 500 + STEPS.length*1050 + 4200);
  }

  var started = false;
  var io = new IntersectionObserver(function (en) {
    en.forEach(function (e) {
      if (e.isIntersecting && !started) { started = true; render(REDUCED); }
    });
  }, { threshold: 0.3 });
  io.observe(document.getElementById('agent'));
})();
