# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Landing page and documentation for **Smart Second Brain**, an Obsidian plugin
(chat-with-your-notes, smart graph, hybrid search). This repo is the website
only — the plugin itself lives in `s2b-dev/smart-second-brain`.

Stack: [Astro](https://astro.build/) + [Starlight](https://starlight.astro.build/),
with the Svelte integration available for interactive demos. Bun is the package
manager. Deployed to GitHub Pages at `smartsecondbrain.dev`.

## Commands

Use `bun` (not npm/yarn). The lockfile is `bun.lock`.

- `bun run dev` — dev server at `localhost:4321`.
- `bun run build` — production build to `dist/`. **Run after each change** — it
  is the only check that catches broken frontmatter, bad sidebar slugs, and
  missing links.
- `bun run preview` — serve the production build locally.
- `bun run check` — `astro check` (type-checks `.astro` files).

There is no separate lint/format step configured.

## Structure

```
src/
├── pages/index.astro        landing page — a standalone route, NOT Starlight
├── content/docs/            documentation, one folder per sidebar section
├── content.config.ts        Starlight docs collection definition
├── styles/landing.css       landing-page styles (extracted from a mockup)
├── styles/theme.css         Starlight theme tokens
├── scripts/landing.js       landing-page animations
└── assets/                  logos
public/CNAME                 custom domain for GitHub Pages
```

### The landing page is not a Starlight page

`src/pages/index.astro` is a full standalone HTML document with its own
`<head>`, fonts, and styles. It deliberately bypasses Starlight's layout. It
was ported from a hand-written mockup, so:

- Styles live in `src/styles/landing.css` and are **not** scoped or
  Tailwind-based — plain CSS with custom properties defined in `:root`, plus a
  `:root[data-theme='light']` override. **Every colour must be a token**: both
  blocks have to define the same names, or one theme silently breaks.
- Light/dark is shared with the docs through Starlight's own `starlight-theme`
  localStorage key, so the choice survives navigation in both directions. The
  default follows `prefers-color-scheme` until the user picks explicitly. The
  theme is applied pre-paint by a second `is:inline` script in `index.astro`.
- The hero canvas and the demo's mini graph read their lightness/alpha from
  the `--g-*` CSS tokens and repaint on the `s2b-theme-change` event — keep
  hue/saturation matching the plugin's cluster formula, and adjust only
  lightness/alpha per theme.
- **In the hero graph, a node's size and emphasis are derived from its degree**
  — never rolled at random and never keyed off an index. Radius is the
  plugin's own `nodeDrawRadius` curve (`base + min(log1p(degree) * k, base*5)`,
  at the hero's smaller base), and the brighter fill is `degree >= 6` rather
  than one flagged node per cluster. It used to be `r = 1.7 + random()*2.3`
  with `hub: j === 0`, over coin-flip edges (13% intra), which drew **large
  nodes with no links at all** — the size said "important", the canvas showed
  nothing attached, and that is checkable by eye in a full-viewport hero.
  So `build()` links first and sizes after: each cluster's hub links ~82% of
  its members, peripheral pairs at 5.5%, cross-topic ties hub-to-hub at 45%,
  and any node still at degree 0 is linked to its hub. That yields ~8.5×
  hub-to-ordinary degree and radii of ~2.5–5.9px. Verify with a Monte-Carlo
  over `build()`'s logic (300 trials: zero isolated nodes) rather than by
  squinting at the canvas — orphans were ~5.8 per graph and easy to miss.
- The nav's GitHub star count is fetched **at build time** in the `index.astro`
  frontmatter. A failed fetch is non-fatal: it logs a warning and renders the
  button without a count, so builds still pass offline or when rate-limited.
- Install CTAs use `obsidian://show-plugin?id=…`, which is a **no-op when
  Obsidian is not installed** — so every one is paired with a visible
  `community.obsidian.md` fallback link. Keep that pairing when editing them.
  The `.ob-mark` glyph is Obsidian's own faceted icon (`obsidian.md/favicon.svg`);
  the flat silhouette from their gradient logo turns to mush below ~24px.
- Animations live in `src/scripts/landing.js` — an animated hero canvas
  (force-directed graph), a privacy toggle, the integrated workspace demo, and
  the granularity explorer. All vanilla JS driven by `IntersectionObserver`.
  The hero and explorer canvases only animate while on screen; the demo's
  loop runs regardless because its storyline is on wall-clock timers.
- **The demo's graph physics ARE the plugin's**, not an imitation.
  `src/scripts/vendor/` holds verbatim copies of four pure plugin modules
  (`graphLayout.ts`, `graphUtils.ts`, `graphAnimation.ts`, `convexHull.ts`,
  provenance headers name the commit) plus `d3-force`; the plugin extracted
  its force assembly from the canvas precisely so identical physics can run
  headlessly, and the demo uses that seam. The mini graph and the granularity
  explorer run a real simulation with the plugin's default settings
  (`DEFAULT_SMART_GRAPH_SETTINGS`) and its transition regimes: a fresh-layout
  settle for the opening web (run to rest **off-screen**, never watched), and
  the `RECLUSTER_*` transition (slow decay, high drag, 3× cohesion boost
  eased out by smoothstep — from `GraphCanvas.svelte`) for the wand press,
  immerse, exit and slider moves. **Do not tune motion constants here** — if
  the demo moves wrong, either the vendored copies are stale or the harness
  misuses them.
  Two things sit between the physics and the pixels, both in `tickSim`:
  ticks are owed **per millisecond, not per frame** (`dtFrames`), so the
  layout reaches rest at the same storyline beat on a 60Hz and a 144Hz
  display; and positions are **interpolated between ticks**, so a frame
  that carries a fraction of a tick (slow-motion `rate`, or a 120Hz display)
  does not hold the nodes still and then jump them. That stutter was real:
  the opening beat once ran at rate 0.34, moving the dots on every third
  frame — 20Hz motion — and Firefox pinned to a 60Hz display showed it
  while Safari on a 120Hz panel did not. Firefox on macOS can lock to the
  *primary* display's refresh rate (Mozilla bug 1749168), so "smooth in
  Safari, not in Firefox" on one machine is a refresh-rate symptom first.
  The demo's transitions all play at rate 1 (the plugin's real speed); only
  the explorer slows its regroups. Cluster *assignments* stay
  authored (the demo does not run Leiden); physics mirrors, membership is
  script. Layouts live in world space with a fitted camera
  (`framingTransform` over full bounds, centred on the outlier-trimmed core),
  which is also why resizes never rebuild — see the gotchas below.
  **The camera fits the hulls, not the dots**: `cameraTarget` takes a
  `worldPad` (the hull padding, in world units so it scales with the zoom)
  and, for the demo, a constant `bottom` reservation for the selection bar.
  A fit to the dots alone ran the lowest topic under the bar and off the
  canvas whenever a topic was selected. The reservation is constant rather
  than toggled with the bar so the camera never refits because a bar
  appeared.
- **The demo** (`#demo`) is one looping storyline across a mock Obsidian
  window, in five phases the progress timeline below it can jump to. The
  timeline's dots and rail derive done/active/upcoming purely in CSS from
  the one `.on` class landing.js sets; the fill is deliberately discrete —
  a continuous per-frame fill was tried and pulled the eye off the demo
  window. The graph opens as the linked-but-ungrouped web the vault already
  is, and **pressing the wand** groups it → a lasso immerses into a topic →
  a sub-topic is opened in the chat and the agent drafts a staged edit →
  semantic search finds a missing note, which the agent folds into the same
  draft → the additions are approved one by one in the note itself.
  The approval is its own phase on purpose: it is the trust moment, and it
  fills the last ten seconds of the loop with a note and Accept buttons on
  screen — under a caption about search, the timeline was describing the
  wrong picture for a quarter of the demo.
  That first beat is deliberately a *press*, not a reveal: the notes are
  already connected (by the links you wrote and by meaning), so what the
  plugin contributes is finding the **topics** in that web — hence "It
  groups itself", never "connects itself". The demo's one liberty is
  starting with the wand off; the plugin ships it on.
  **The opening web is already settled when it first paints.** `settleWeb()`
  scatters and runs the topics-off layout to rest in one go at build and at
  each loop restart; a never-started graph is left alone (`pristine`) so
  scrolling the demo into view does not swap one web for another. It used to
  animate from a random scatter at a third speed, and that read as **three**
  stages — scatter, web, groups — where the product has two.
  **Lassos are drawn around a still graph.** The two re-clusters run at real
  speed and the beats that trace a lasso are timed to when the layout has
  gone quiet, measured rather than eyeballed: `scripts/demo-settle-timing.mjs`
  runs the vendored physics over the demo's own `build()` model and reports
  the tick at which the largest per-tick node step drops under 0.1 world
  units (p90 ≈ 213 ticks for the wand press, ≈ 234 for the immersion, at
  16.67ms a tick). The wand press sits 3550ms before the topic lasso and the
  immersion 3900ms before the sub-topic lasso. If the physics, cluster sizes
  or link probabilities change, re-run the script and re-derive both gaps;
  the phase-1 and phase-3 beat comments carry the numbers.
  The phases are **one causal story, not a feature list**: the agent's first
  answer names the gap it cannot fill, which is what sends the story to
  search. Preserve that chain when editing — the header comment in
  `landing.js` says so too. **The gap and the search must be the same
  question.** The answer names it as a plain noun ("what makes a memory
  last") and the query repeats it ("how to make it last"); an earlier pair
  — "what triggers it" against "why do we forget" — asked two different
  things and left the viewer to bridge them at demo speed.
- **Never bulk-shift the storyline's `at()` times.** The beats are a causal
  chain, not a playlist: a script that adds an offset "to everything after
  N" splits linked pairs and silently inverts them. Doing exactly that has
  produced a button released before it was pressed, a composer typed into
  before its pane opened, and an empty-state message cleared 600ms *before*
  it was set (so "No notes contain those words" sat permanently above a full
  result list). Renumber a phase explicitly, then verify monotonicity:

  ```bash
  grep -n "^    at([0-9]" src/scripts/landing.js | sed 's/:.*at(\([0-9]*\).*/:\1/' | awk -F: 'NR>1 && $2<p {print "OUT OF ORDER line " $1 ": " $2 " after " p} {p=$2}'
  ```

  Ordering is necessary but not sufficient: beats that *wait on streamed
  content* also need a duration budget. `streamAnswer` chunks 1–3 words per
  55–140ms tick, so `ANSWER` takes ~1240ms typically but ~2340ms worst case,
  and `showSugg` lands 450ms after it. Phase 4's start carries that budget in
  a comment — it once opened the search modal while the agent was still
  writing. Re-derive it if `ANSWER` or the chunk timing changes.
  The demo deliberately mirrors real plugin behaviour (ambient graph
  selection, `⌥A` attach, semantic toggle, staged edits, topic hulls built
  with the plugin's own convex-hull construction) — keep it truthful to the
  plugin when editing; verify against the live vault rather than guessing.
- **Demo topic names must not read as things the agent is doing.** The
  sub-topic the agent drafts from was once "Consolidation" — the correct
  psychology term, but a first-time viewer watching an agent work parses it
  as the agent *consolidating* their notes, and at demo speed there is no
  time to recover from that. It is now "Long-term memory", which also has to
  subsume "Recall & testing" (they merge at the explorer's Fine level, so the
  parent name must cover both children). The name appears in seven places
  that must agree: the sub-topic pill, `QUERY_CHAT`, `ANSWER`, the three
  "Read 9 notes in …" activity lines, the note's `<h2>`, the cited wikilink,
  and both `LEAVES`/`LEVELS` in the granularity explorer.
  Watch the same trap for verbs generally — "indexing", "syncing",
  "summarising" would all misread as plugin activity.
- **The search snippets must share no words with the query.** "how to
  make it last" against "deep sleep and its role in retaining what you
  learn" is what makes the keyword miss honest and the semantic hit
  meaningful ("what" is in that snippet, which rules out "what makes it
  stick"; "memories" is in the other, which rules out anything naming
  memory). They are duplicated in two places that must stay identical:
  `RESULTS` in `landing.js` (the live modal) and `.search-still` in
  `index.astro`, and the query is likewise in both `QUERY_SEARCH` and the
  still.
- Node counts on the demo's topic pills are the number of dots actually drawn
  in each hull. They were once inflated (five 9-node clusters labelled 12–24)
  and a reader who counts catches that instantly. If you change a count,
  change the cluster.
- **Every group in the demo graph has a visible hub**, because the first
  beat now shows the graph *before* clustering and a reader looks straight
  at the link structure. Leiden would not find communities in an even mesh,
  so `build()` links each group's first node to ~82% of its members while
  peripheral pairs link at ~5.5%; cross-topic ties are hub-to-hub. That
  yields roughly a 6× degree ratio (hubs ~12 links, ordinary notes ~2), and
  since node radius is degree-driven the hubs also draw larger. Memory's
  three sub-topics each get **their own** hub — immersing has to leave three
  legible groups, not one. Flatten these probabilities and the opening beat
  goes back to looking like a random graph.
- **The approval's confirmation is an Obsidian NOTICE, not a chat message.**
  The plugin posts nothing to the transcript when changes are applied; it
  shows a toast top-right of the window. The demo once invented a
  `✓ Added to Exam checklist — approved by you` line, which no code path
  produces. The wording is verbatim from `PendingChangesBar.svelte`
  (`handleAcceptAll`): one pending entry means `count === 1`, so it reads
  **"Applied the change"** (the plural branch is "Applied all N changes"; the
  per-row accept is `Applied: <path>`). Note that accepting hunks one at a
  time in the note — which is what the demo shows — is **silent**:
  `acceptChangeGroup` fires no Notice at all, so the toast stands in for the
  moment the entry resolves. `.v-notice`'s styling is measured off the
  running plugin, not guessed (`rgba(0,0,0,.9)`, `#fafafa`, 8px radius, 13px
  text, `9.75px 13px` padding, 300px max, `0 2px 8px rgba(0,0,0,.3)`, 9px
  from the right edge).
- **The closing graph edges must have wikilinks behind them.** The finale
  draws a new link from *Exam checklist* to each note the approved edit cites,
  and the graph builds wiki edges from Obsidian's `resolvedLinks`
  (`graphDataBuilder.ts` → `buildWikiEdges`) — so prose that merely mentions
  "lecture 7" would draw **nothing**. The staged diff in `index.astro`
  therefore cites its sources as links, and `LINKED_NOTES` in `landing.js`
  lists exactly those notes; it drives both the edges and the glow, so the two
  can't disagree. Reword the diff lines and you must keep the links (or drop
  the edges).
  They are shown **rendered — no `[[ ]]`**: added text lives in the diff's
  widget card rather than the document (`inlineDiffExtension.ts`), and that
  card renders markdown through `MarkdownRenderer.render`, so the reader sees
  a link and never the source. The `.v-wl` span is that rendered link.
  The finale also **names the node the edges come from** (an accent-stroked
  "Exam checklist" pill, `graph.label`) and holds ~4s: unlabelled, the
  payoff was a purple line from an unmarked dot that a viewer could not
  place as their checklist.
- The hull geometry comes from the vendored `convexHull.ts`
  (`buildTopicRegion`); the shared physics harness (`simConfigFor`,
  `makeSim`/`retune`, `startFresh`/`startRecluster`/`tickSim`/`settleSim`,
  the camera) lives at **module scope** in `landing.js` and is shared by both
  graph canvases. Keep the harness free of story state.
- **The mock window is deliberately narrower than the page's content column**
  (`max-width: 920px` on `.vault`, against `--max: 1120px`), and 600px tall.
  At full width it was 1072×552 — a **1.94:1** letterbox against a real
  Obsidian window's **~1.21:1** (measured live: 1053×866), which reads as
  "way wider than it is tall". 920×642 is 1.43:1, and the graph pane with the
  chat open is ~1:1 instead of 2.1:1 — the camera's 1.3× zoom cap means a
  wide pane turns into horizontal dead space rather than a bigger graph.
  600px was chosen as the tallest that fits a 1366×768 laptop with the
  timeline below — but measured, only the timeline's dot row fits: window
  (642 with its bar) + 30px gap + timeline (139) is 811px against 709px
  under the nav, so the step titles and captions sit ~100px below the fold
  on such a laptop. The section head is kept to a two-line heading and a
  two-line blurb so the reader loses as little as possible scrolling to
  the window; a shorter window at small viewport heights would fix it
  fully but changes the aspect ratio argued for above, so it has not been
  done. The chat column is 320px in the base rule; there is
  no longer a 980px override narrowing it, so `--chat-w` is the single place
  the pinned content width is set.
- The demo's mock UI uses its own `--ob-*` palette (both themes) matched to
  Obsidian's real values, not the site palette. One canvas gotcha: assigning
  `canvas.width` **clears** it, so any resize path must repaint synchronously
  or the graph blanks — and the chat pane's slide-in resizes the canvas
  without firing a window `resize`, so a `ResizeObserver` covers it. Resizes
  only re-fit the camera (layouts are world-space), so the story never
  restarts on resize.
- **The chat pane's children are pinned to a fixed width** (`--chat-w` on
  `.v-chat`) so the column can slide closed without reflowing live text —
  unpinned, a full transcript rewraps to one word per line for the whole
  0.55s slide. Two of those children (`.v-composer`, `.v-pending`) carry
  `margin: 0 12px`, and **margins sit outside a border-box width**, so they
  subtract 24px from the pinned value. Pinning them to the full pane width
  pushed both 13px past the right edge and shaved the send button. If the
  pane's width changes, change `--chat-w` — it is a variable precisely so
  the two can't disagree.
  Below 720px the pane goes full-width and the pinning is dropped. That
  reset must name `.v-composer` and `.v-pending` **explicitly**: their
  desktop rule is a more specific selector than `.v-chat > *`, so resetting
  only the latter left them stranded at 296px inside a 650px pane — a
  full-width transcript above two narrow boxes hugging the left edge.
- **An empty transcript shows the real pane's greeting** ("Start a new
  conversation" / "Ask me anything about your notes.", from
  `ChatRecommendations.svelte`, which `MessageContainer` renders for zero
  messages), as `:empty` pseudo-elements on `.v-chat-body`. Without it the
  pane's slide-in showed 2.7s of blank column — the whole window on a
  phone — which read as something failing to load.
- **The transcript grows from the top, then flips to bottom-anchored.** It
  starts empty and fills over ~20s, so bottom-anchoring (a real chat's
  behaviour) left 76% of the pane blank when the first message landed, which
  reads as a rendering fault. `.v-chat-body` is `flex-start` until the
  content outgrows the pane, then `.overflowing` switches it to `flex-end`
  so the newest message stays visible and old ones scroll off the top.
  The overflow test must measure the **children's summed height**, not
  `scrollHeight`: `scrollHeight` depends on the current `justify-content`,
  so testing it flips the class off, which flips it on again — the
  transcript flaps every frame and the newest message jumps out of view.
  The latch is one-way (nothing is ever removed) and `streamAnswer` re-checks
  it as text arrives, since a streaming answer grows an existing message
  without `addMsg` ever running.
- **The lasso stroke and the cursor tracing it share one clock** (`LASSO_MS`).
  The stroke used to advance by a per-frame constant while the cursor ran on
  a fixed duration, so the line finished in ~520ms at 60Hz but ~260ms at
  120Hz against the cursor's 560ms — the stroke outran the hand drawing it,
  by a different amount per display. `graph.step` now advances `lassoP` by
  elapsed time over `LASSO_MS`, and `cursorTraceLasso` takes the same
  constant. Don't reintroduce a per-frame step here.
- The page is written for non-technical readers (students, writers,
  researchers): no mono-font "dev" styling, no jargon in demo content or copy.
  Inter throughout — clean and minimal is the brief; display faces have been
  tried and rejected.
- **Facts over pitch, and the plugin's own feature names.** The pillar
  points name the feature as the plugin does (Memory, Skills, Chats,
  Integrations) and state what it does, in the register of a tool
  description. Earlier leads like "Teach it by writing a note" and "It
  remembers in notes" were pulled for reading as marketing and for hiding
  the feature's real name — a reader deciding whether to install wants to
  know there is a thing called Skills and what it consists of. Plain words
  for the explanation, real names for the things.
- Three scripts are **inlined** in `index.astro` with `is:inline` and must stay
  in `<head>`, all because they run before first paint: the theme script (sets
  `data-theme`, so the wrong palette never flashes), the analytics gate (sets
  `framed` and injects the trackers — see below), and the intro gate (sets a
  class, so the intro animation does not flash on repeat visits; it bails when
  `framed`). The analytics gate must run **before** the intro gate, which
  reads its class.
- **Analytics.** Two cookieless trackers on both surfaces: Cloudflare Web
  Analytics (beacon) and self-hosted Umami at `analytics.leonardheininger.de`
  (tracker; plus its rrweb recorder for heatmaps on the landing page only —
  ~190KB, and the docs have no layout question worth it). The docs get theirs
  via `starlight.head` in `astro.config.mjs`; the landing page has its own
  copy because it bypasses Starlight. Both are **injected by an inline gate,
  never static tags**, because of one Umami behaviour: its heatmap viewer
  does not show a snapshot, it **iframes the live page** at the recorded
  full-page height. Two things follow, and the gate handles both:
  - `100dvh` inside that frame is the frame height, so the hero would swallow
    the whole frame and clip every later section (umami#4373, unfixed). The
    gate sets `framed` when `self !== top`; `landing.css` gives the hero a
    fixed pre-JS `min-height`, and the last IIFE in `landing.js` then solves
    for the hero height that makes the page exactly the frame's height —
    the frame *is* the recorded page height and the hero is the only
    viewport-sized element, so that reproduces the recorded layout and the
    click markers align. Add another `vh`-sized element and that arithmetic
    breaks. Nothing legitimately embeds this site.
  - The framed copy would load the trackers and write a pageview plus
    scroll rows with `viewport_h ≈ 6700` into the very dataset on display,
    so when framed the gate loads nothing.
  The footer disclosure is one sentence and two parts of it are load-bearing:
  "click and scroll" (the gap between "cookieless" and what rrweb captures)
  and the plugin contrast. Session replay is a separate Umami flag from
  heatmaps and stays off. The CTA events (`data-umami-event`) are named by
  placement and say `-intent` for `obsidian://` links, which no-op without
  Obsidian, so a click is intent, not a hand-off. The demo's engagement
  events (`demo-watched-10s/30s/60s`, `demo-completed`, `demo-jump-N`) live
  in `landing.js` next to the storyline's observer; they fire once per page
  load via a `track()` guard that is a no-op without the tracker. Event
  names are what the dashboard counts by — renaming one orphans its history.
- **Privacy and providers are one section** (`#privacy`). They used to be
  two consecutive centred sections saying the same thing twice — the toggle
  is "On my computer" vs "Cloud AI", and the providers lede restated that
  two run locally and are trusted. Now the toggle swaps the provider line
  as well as the claims: the providers are evidence for the claims beneath,
  not a roll call. All six are in the markup and CSS shows the group
  matching `.provs[data-mode]`, so the local state renders without JS and
  the brand SVGs never pass through `innerHTML`. The lede carries the "six
  providers" count, since the default state shows only two. The line is
  **unboxed text with inline marks** ("Runs with · Ollama · oMLX"), not
  pills: as pills it was a second row of buttons under the toggle, and a
  reader tried to click it. The nav's
  Install link targets the final CTA (`#start`), which is the only section
  with an install button.
- Everything respects `prefers-reduced-motion`.

Do not "modernize" this into Starlight components or Tailwind without being
asked — the visual design is the point.

### The landing page's three pillar sections

After the demo come `#graph-section`, `#search-section` and `#agents-section`.
The division of labour is deliberate:

- **The demo is the integration story** — how the three features work
  *together*. It is the only animated storyline on the page.
- **The pillar sections are the per-feature depth** — the niceties the demo
  has no room for. They exist because the page's old single feature grid
  described agent features exclusively, leaving graph and search unrepresented
  outside the demo.

**The pillar sections avoid the card-grid monotony on purpose.** They used to
be three card grids in a row, and with the step cards, privacy rows and
provider chips the page ran to ~28 bordered boxes and five card grids — every
section after the demo was "centred heading → visual → grid of cards", and
the eye starts skimming by the second one. Now all three pillars use the
**side-by-side** `.split` shape (the camera's zoom cap means a full-width
canvas mostly holds dead space), differentiated by content and direction:
graph = unboxed captions (`.fnotes`) + interactive framed canvas on the
right; search = static modal left + marked list (`.plist`); agents = marked
list + static chat still on the right (`.split.rev.narrow`, 400px column).
Visuals go right, left, right: `.split.rev` puts the visual second (text
first in the markup) and keeps the 560px column the graph explorer needs.
Two visual-left splits followed by one visual-right was tried and read as a
slip rather than a rhythm.
There are no card grids left on the page. Before adding a card anywhere,
check whether the section it lands in already has a form.
**The graph split's visual column must stay ≥520px** (it is 560): below that
the explorer caps the granularity slider's range — the phone rule — and
desktop silently loses the Finest level.

One visual per pillar at most, and only one of them moves:

- Graph gets the **granularity explorer** (`#granGraph` + `#granRange`), the
  page's only visitor-driven surface. It mirrors the plugin's own Granularity
  slider: the same notes regrouped coarser or finer. The levels are a fixed
  hierarchy rather than a live Leiden run, but they **merge** — a group at one
  level is always a subset of one group at the level below. Break that and the
  slider reads as a shuffle instead of a zoom, which misrepresents the
  feature. On a narrow canvas the slider's range is capped (`maxLevel`),
  because eight labelled topics cannot be read on a phone.
  Two more controls flank the slider, both mirrors of `GraphControls.svelte`:
  the **wand** (`wand-sparkles`) shows/hides the detected topics — and it is
  **physical**, not cosmetic: topics off resolves segments to `"none"`, which
  strips every node's `cluster`, and the cohesion force skips unclustered
  nodes, so the layout visibly relaxes and regathers (the toolbar's own
  "display-only" comment refers to Leiden staying cached, not the layout —
  trust `resolveAndApplySegments`, not that comment) — and the **chevrons**
  collapse every topic into a single `kind:'topic'` node sized by its
  crossing-link count,
  with merged edges whose thickness is the crossing count
  (`buildCollapsedGraph`'s semantics). Collapse requires topics on, as in the
  real toolbar; the demo additionally auto-expands if the wand is switched
  off while folded. The explorer's link generation is deliberately one
  connected web — hub-heavy inside each leaf, weak ties across everything —
  because that structure is *why* coarser topics exist, and it is what gives
  the collapsed view real weighted edges to draw.
- Search gets a **static mock** (`.search-still`) that runs no JavaScript —
  every element carries its settled state in the markup. It reuses the demo
  modal's own `.vs-*` classes so the two surfaces cannot drift apart.
- Agents gets a **static chat still** (`.chat-still`): the demo's chat pane
  frozen on one exchange, reusing the demo's own classes (`.v-chat`, `.msg`,
  `.act`, `.msg-ai`, `.pcb`, the composer) so it cannot drift from the demo
  window. Every activity line is a real tool summary from
  `toolSummaryModel.ts` — past-tense label, then `, ` and the outcome:
  "Loaded skill explore-vault", "Searched notes for “lecture”, found 4
  notes", "Read Lecture 8 — Sleep, 61 lines". The skill load is on show
  because Skills is a point beside it. The staged edit is an **Update**
  because that is the only badge `landing.css` styles; the count wording is
  the real bar's. Its story (flashcards from two lectures into "Week 7
  review") is deliberately not the demo's. Two earlier visuals were pulled:
  four cards (no visual at all, four unrelated nouns) and a file-tree mock
  of the agent's folders (`Agents/Memories`, `Skills/…/SKILL.md`, `Chats/`)
  — truthful, but it read as ugly, and "a chat repeats the demo" applies
  equally to the graph and search stills. The headline says **assistant**,
  not agent, and says where it lives ("An assistant that lives in your
  vault"): the eyebrow keeps the plugin's name for the feature, but a
  first-time reader may not know what an agent is, and a headline that only
  states a claim ("Everything it knows is a note") assumes you already know
  what "it" is. Four points, named as the plugin names them: Memory
  (**not opt-in any more** — the plugin removed `memoryEnabled` in data
  migration v9→v10; an agent takes part iff its AGENT.md keeps its
  `# Memory` section — so never write "opt in"), Skills (the four core
  skill folders in `src/skills/defaults/`), Chats (`.chat` files in
  `targetFolder`, indexed, embeddable, branching), Integrations (Dataview,
  Tasks, TaskNotes from `CURATED_PLUGIN_INTEGRATIONS`; Canvas and Bases as
  seeded core-plugin skills; auto-discovery of any plugin exposing `api`).
  Approval lives in the lede (the demo *is* that feature); MCP, images/PDFs,
  subagents and parallel chats are the quiet `.fmore` line. The marks carry
  Lucide glyphs: `message-square` is the chat view's own icon (`Chat.ts` →
  `getIcon`) and `puzzle` is the plugin's own fallback glyph for a plugin
  (`getPluginIcon`); `brain` and `graduation-cap` are chosen, since memory
  and skills are text-headed settings sections with no glyph in the app.
  Avoid `git-fork`, which the demo already uses for the graph-selection
  chip.

### Section backgrounds

From the demo down, sections **strictly alternate** plain and tinted
(`--bg-2` with a `border-block`): demo plain, graph tinted, search plain,
agents tinted, privacy plain, final CTA tinted. The rule exists because the
page once ran three plain sections, one band, two plain, one band, which
read as arbitrary. Anything that sits on a tinted band has to lift off it:
the granularity explorer's frame uses `--bg`, the agents chat still uses the
Obsidian background token. Anything with `--bg-2` fills of its own — the privacy
claim cards — belongs on a plain section. If you add or
remove a section, re-alternate the whole run rather than tinting the new one
to taste, and keep the final CTA on a band.

The mobile bottom-sheet rules for the search modal are scoped to `.v-search`
(the demo's overlay). Unscoped they also hit `.search-still`, which reuses the
same `.vs-*` classes — and flipped the marketing still upside down on phones,
putting its results above its search box.

The demo's search modal has **no selection-summary pill**, though the real one
does (`button.s2b-search-selection-summary`, `"n selected"` from
`getSelectionSummaryText`). It was tried both places the real modal allows and
dropped from both: the demo picks exactly one note and the picked row is
already highlighted, so a badge counting to 1 restates the highlight. At the
plugin's own `bottom: 10px; right: 14px` it also sat on top of "esc Close" —
that corner is free in the real modal only because its input carries a clear
button. Don't re-add it without a reason the count itself carries.

If a selection indicator ever is needed here, it must be **absolutely
positioned**: an in-flow strip shoves every result row down the moment a note
is picked, which the real modal never does.

**Every claim in the pillar cells is checked against plugin source.** The
sources are the same table under "Verifying facts about the plugin" below —
`GraphControls.svelte` for the graph controls, `SearchModal.ts` for search
affordances. Do not add a cell you have not verified.

### Adding a docs page

Two steps, and the build fails if you only do the first:

1. Create the markdown file under `src/content/docs/<section>/`.
2. Add its slug to the `sidebar` array in `astro.config.mjs`.

Frontmatter requires `title` and `description`. **Quote any value containing a
colon** — unquoted colons are a YAML syntax error and will fail the build.

## Structure mirrors the plugin's settings

The sidebar deliberately follows the plugin's own settings tabs — **Search**,
**Agents**, **Graph** — so someone moving between the app and the docs finds
the same three features in the same shape.

Everything an agent *has* nests under `agents/`, the way the Agent editor's
sections do: skills, integrations, memory, MCP servers. Subagents are a section
of `agents/index.md` rather than their own page — the topic is short and reads
naturally next to multi-agent setup.

`search` and `graph` are groups in `astro.config.mjs`, not bare `link` entries.
A top-level `link` renders as a loose item and gets absorbed into the group
above it, which buried both under "Getting started".

### Implementation depth sits under its feature

Each feature group ends with a **How it works** page — `search/how-it-works`,
`graph/how-it-works` — holding the constants and the reasoning behind them.
These are deliberately *not* a separate "internals" section: a reader who wants
to know why recency can't hijack a ranking, or why the granularity slider has
the stops it does, is already reading that feature's page. Both are written
against plugin source and carry a "verified against version X" note.

There is no architecture page. `internals/architecture.md` was removed — it
described repo layout and composition-root detail that no user acts on, and it
was a summary of the plugin's own `AGENTS.md`, so it could only drift. If
contributor-facing architecture docs are wanted, they belong in the plugin repo
next to the code they describe, not here.

Keep the split honest when adding to these pages: the overview answers *what it
does for me*, the how-it-works page answers *why it behaves like that*. A fact a
user needs in order to use the feature belongs on the overview.

All pages are written. There are no remaining stubs.

## This site is the documentation

The plugin's README is deliberately minimal — pitch, install, development
setup, and links here. **Feature detail, provider lists, privacy explanation
and FAQ live only on this site.** Do not "restore" that content to the README;
duplicating it is what caused it to drift in the first place.

## Verifying facts about the plugin

**Docs claims must be checked against the plugin source.** Ground truth lives
in the plugin repo, checked out alongside this one at `../smart-second-brain`:

| Claim | Source of truth |
| --- | --- |
| Providers | `src/providers/index.ts` → `PROVIDER_TEMPLATES` |
| Built-in tools | `src/types/plugin.ts` → `BUILT_IN_TOOL_IDS` |
| Bundled core skills | `src/skills/defaults/*/SKILL.md` |
| Integration skills | `src/skills/integrations/*/SKILL.md`, and `CURATED_PLUGIN_INTEGRATIONS` in `src/agent/integrations/pluginIntegrations.ts` |
| Skill/memory folder paths | `src/utils/agentPaths.ts` |
| Command names | `src/main.ts` → `addCommand` calls |
| Settings/editor section names | `src/views/settings/Settings.svelte`, `src/components/modal/AgentEditorModal.svelte` |
| Graph controls (Granularity, Label topics, collapse, lasso) | `src/components/graph/GraphControls.svelte`; behaviour in `src/components/graph/SmartGraphView.svelte` |
| Graph selection bar verbs, immerse | `src/components/graph/SmartGraphView.svelte` (`handleImmerse`, the selection-bar markup) |
| Search affordances (filter chips, semantic toggle, attach, ask agent) | `src/components/modal/SearchModal.ts` |
| Staged edits (bar copy, per-hunk accept, same-note merging) | `src/components/chat/PendingChangesBar.svelte`, `src/editor/inlineDiffExtension.ts`, `src/stores/pendingChangesStore.svelte.ts` (`addChanges`) |
| Notice/toast wording | the `new Notice(...)` call for that action — e.g. `PendingChangesBar.svelte` `handleAcceptAll` |
| Platform support, min app version | `manifest.json` |
| Architecture | `AGENTS.md` (the plugin's own, under "Architecture") |

Note that the plugin's `AGENTS.md` prose can itself drift — it currently names
the core skills `vault`/`notes`/`web`/`update`, while the actual directories are
`explore-vault`, `manage-notes`, `manage-skills`, and `web`. **Prefer the source
files over any prose description of them**, including the plugin's own.

If that checkout is not accessible in the current session, say so rather than
writing from memory — a wrong feature list on a public site is worse than a
stub.

### Before a plugin release

Enumerable facts are **not** generated at build time; they are refreshed by
hand before each release. Work through this list against the sources above:

- [ ] `start/providers` — provider table matches `PROVIDER_TEMPLATES`
- [ ] `agents/skills` — bundled core skills match `src/skills/defaults/`
- [ ] `agents/integrations` — curated list matches
      `CURATED_PLUGIN_INTEGRATIONS`; the seeded-at-startup core-plugin
      integrations are the entries in `src/skills/integrations/` whose
      frontmatter carries `corePluginId` (canvas, bases). **Those two sets do
      not partition that directory**, and the page must not present it as
      though they do: a skill can carry `linkedPlugin` without a curated
      entry, in which case nothing ever seeds it — `resolvePluginIntegrations`
      gates every row on `pluginExposesApi`, so a plugin with no public `api`
      (obsidian-charts, which renders through `dataviewjs`) is offered by
      neither the curated nor the auto-discovery path. Reconcile the count
      against `CURATED_PLUGIN_INTEGRATIONS` alone, then account for each
      leftover skill directory explicitly
- [ ] `agents/index` — tool list matches `BUILT_IN_TOOL_IDS`
- [ ] `start/installation` — `minAppVersion` and platform support match
      `manifest.json`
- [ ] Landing page (`src/pages/index.astro`) — provider line in `#privacy`
      (each entry carries a `data-mode` of `local` or `cloud`; its mode must
      match whether `PROVIDER_TEMPLATES` marks it trusted), and the cells in
      all three pillar sections (`#graph-section`, `#search-section`,
      `#agents-section`) against the sources above
- [ ] Landing page — the granularity explorer still describes a control the
      graph has, and the search still (`.search-still`) still matches what
      `SearchModal` renders
- [ ] `src/scripts/vendor/*` — diff each file against its plugin source
      (paths in the provenance headers); refresh the copies and the commit
      hash if the plugin's layout/tuning changed
- [ ] `help/faq` — the "What's next?" project board link still resolves and
      the board is still public (the roadmap is deliberately *not* duplicated
      here — it went stale as a hand-written list)
- [ ] `search/how-it-works` and `graph/how-it-works` — constants and the
      "verified against" version note on each; sources are listed at the foot
      of both pages

Prose claims (staged edits, conversation branching, per-model capability
detection) are not mechanically checkable. Re-read them when the related
subsystem changes.

## Deployment

Pushes to `main` trigger `.github/workflows/deploy.yml`, which builds and
publishes to GitHub Pages. The apex domain is canonical; `www` redirects to it.

DNS is configured once in the registrar's UI and is deliberately not documented
here.
