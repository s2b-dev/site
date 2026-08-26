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
- **The demo's graph physics ARE the plugin's**, not an imitation.
  `src/scripts/vendor/` holds verbatim copies of four pure plugin modules
  (`graphLayout.ts`, `graphUtils.ts`, `graphAnimation.ts`, `convexHull.ts`,
  provenance headers name the commit) plus `d3-force`; the plugin extracted
  its force assembly from the canvas precisely so identical physics can run
  headlessly, and the demo uses that seam. The mini graph and the granularity
  explorer run a real simulation with the plugin's default settings
  (`DEFAULT_SMART_GRAPH_SETTINGS`) and its transition regimes: fresh-layout
  settle for the clustering beat, and the `RECLUSTER_*` transition (slow
  decay, high drag, 3× cohesion boost eased out by smoothstep — from
  `GraphCanvas.svelte`) for immerse, exit and slider moves. **Do not tune
  motion constants here** — if the demo moves wrong, either the vendored
  copies are stale or the harness misuses them. Cluster *assignments* stay
  authored (the demo does not run Leiden); physics mirrors, membership is
  script. Layouts live in world space with a fitted camera
  (`framingTransform` over full bounds, centred on the outlier-trimmed core),
  which is also why resizes never rebuild — see the gotchas below.
- **The demo** (`#demo`) is one looping storyline across a mock Obsidian
  window, in four phases the step cards below it can jump to. The graph
  clusters itself → a lasso immerses into a topic → a sub-topic is opened in
  the chat and the agent drafts a staged edit → semantic search finds a
  missing note, which the agent folds into the same draft before one approval.
  The phases are **one causal story, not four features**: the agent's first
  answer names the gap it cannot fill, which is what sends the story to
  search. Preserve that chain when editing — the header comment in
  `landing.js` says so too.
  The demo deliberately mirrors real plugin behaviour (ambient graph
  selection, `⌥A` attach, semantic toggle, staged edits, topic hulls built
  with the plugin's own convex-hull construction) — keep it truthful to the
  plugin when editing; verify against the live vault rather than guessing.
- Node counts on the demo's topic pills are the number of dots actually drawn
  in each hull. They were once inflated (five 9-node clusters labelled 12–24)
  and a reader who counts catches that instantly. If you change a count,
  change the cluster.
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
- The hull geometry comes from the vendored `convexHull.ts`
  (`buildTopicRegion`); the shared physics harness (`simConfigFor`,
  `makeSim`/`retune`, `startFresh`/`startRecluster`/`tickSim`/`settleSim`,
  the camera) lives at **module scope** in `landing.js` and is shared by both
  graph canvases. Keep the harness free of story state.
- The demo's mock UI uses its own `--ob-*` palette (both themes) matched to
  Obsidian's real values, not the site palette. One canvas gotcha: assigning
  `canvas.width` **clears** it, so any resize path must repaint synchronously
  or the graph blanks — and the chat pane's slide-in resizes the canvas
  without firing a window `resize`, so a `ResizeObserver` covers it. Resizes
  only re-fit the camera (layouts are world-space), so the story never
  restarts on resize.
- The page is written for non-technical readers (students, writers,
  researchers): no mono-font "dev" styling, no jargon in demo content or copy.
  Inter throughout — clean and minimal is the brief; display faces have been
  tried and rejected.
- Two scripts are **inlined** in `index.astro` with `is:inline` and must stay
  in `<head>`, both because they run before first paint: the theme script (sets
  `data-theme`, so the wrong palette never flashes) and the intro gate (sets a
  class, so the intro animation does not flash on repeat visits).
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
the eye starts skimming by the second one. Now graph and search share the
**side-by-side** `.split` shape (visual left, points right — consistent by
choice; the camera's zoom cap means a full-width canvas mostly holds dead
space), differentiated by content: graph = interactive framed canvas +
unboxed captions (`.fnotes`), search = static modal + marked list (`.plist`).
Agents = the page's only card grid, four wide. Before adding a card anywhere,
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
- Agents gets **no visual**: the demo's chat sits directly above it. Its grid
  is four cards, not eight — "Approval" was dropped because the demo *is* that
  feature and the section intro says it again, and the three minor ones
  (images/PDFs, helper agents, parallel chats) are one quiet `.fmore` line
  under the grid rather than three more boxes. Each card's keyword carries a
  14px Lucide glyph (`.fic`). Where the plugin has a real icon for the thing,
  use it — History gets `message-square` because that is the chat view's own
  icon (`Chat.ts` → `getIcon`). Memory, skills and MCP are text-headed
  settings sections with no glyph in the app, so those are chosen rather than
  mirrored; say which is which in the markup comment. Avoid `git-fork`, which
  the demo already uses for the graph-selection chip.

`.fcell` reads `--cell-bg` so a card stays raised against whichever background
its section uses. Only the agents pillar uses cards now, and it sits on the
page background; a card grid on a `--bg-2` section would need `--cell-bg:
var(--surface)` to separate at all.

The mobile bottom-sheet rules for the search modal are scoped to `.v-search`
(the demo's overlay). Unscoped they also hit `.search-still`, which reuses the
same `.vs-*` classes — and flipped the marketing still upside down on phones,
putting its results above its search box.

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

`search` and `graph` are single-page groups in `astro.config.mjs`, not bare
`link` entries. A top-level `link` renders as a loose item and gets absorbed
into the group above it, which buried both under "Getting started".

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
| Platform support, min app version | `manifest.json` |
| Architecture | `AGENTS.md` (the plugin's own, under "Architecture") |

Note that the plugin's `AGENTS.md` prose can itself drift — it currently names
the core skills `vault`/`notes`/`web`/`update`, while the actual directories are
`edit-notes`, `explore-vault`, `manage-skills`, and `web`. **Prefer the source
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
      `CURATED_PLUGIN_INTEGRATIONS`, and the seeded-at-startup core-plugin
      integrations match `src/skills/integrations/`
- [ ] `agents/index` — tool list matches `BUILT_IN_TOOL_IDS`
- [ ] `start/installation` — `minAppVersion` and platform support match
      `manifest.json`
- [ ] Landing page (`src/pages/index.astro`) — provider list, and the cells in
      all three pillar sections (`#graph-section`, `#search-section`,
      `#agents-section`) against the sources above
- [ ] Landing page — the granularity explorer still describes a control the
      graph has, and the search still (`.search-still`) still matches what
      `SearchModal` renders
- [ ] `src/scripts/vendor/*` — diff each file against its plugin source
      (paths in the provenance headers); refresh the copies and the commit
      hash if the plugin's layout/tuning changed
- [ ] `help/faq` — the "What's next?" list still reflects reality
- [ ] `internals/search-algorithm` — constants and the "verified against"
      version note; sources are listed at the foot of that page

Prose claims (staged edits, conversation branching, per-model capability
detection) are not mechanically checkable. Re-read them when the related
subsystem changes.

## Deployment

Pushes to `main` trigger `.github/workflows/deploy.yml`, which builds and
publishes to GitHub Pages. The apex domain is canonical; `www` redirects to it.

DNS is configured once in the registrar's UI and is deliberately not documented
here.
