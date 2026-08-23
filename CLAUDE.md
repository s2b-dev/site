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
- The hero canvas reads its lightness/alpha from the `--g-*` CSS tokens and
  repaints on the `s2b-theme-change` event — keep hue/saturation matching the
  plugin's cluster formula, and adjust only lightness/alpha per theme.
- The nav's GitHub star count is fetched **at build time** in the `index.astro`
  frontmatter. A failed fetch is non-fatal: it logs a warning and renders the
  button without a count, so builds still pass offline or when rate-limited.
- Install CTAs use `obsidian://show-plugin?id=…`, which is a **no-op when
  Obsidian is not installed** — so every one is paired with a visible
  `community.obsidian.md` fallback link. Keep that pairing when editing them.
  The `.ob-mark` glyph is Obsidian's own faceted icon (`obsidian.md/favicon.svg`);
  the flat silhouette from their gradient logo turns to mush below ~24px.
- Animations live in `src/scripts/landing.js` — an animated hero canvas
  (force-directed graph), a typing search demo, a privacy toggle, and a
  stepped agent-chat sequence. All are vanilla JS driven by
  `IntersectionObserver`.
- Two scripts are **inlined** in `index.astro` with `is:inline` and must stay
  in `<head>`, both because they run before first paint: the theme script (sets
  `data-theme`, so the wrong palette never flashes) and the intro gate (sets a
  class, so the intro animation does not flash on repeat visits).
- Everything respects `prefers-reduced-motion`.

Do not "modernize" this into Starlight components or Tailwind without being
asked — the visual design is the point.

### Adding a docs page

Two steps, and the build fails if you only do the first:

1. Create the markdown file under `src/content/docs/<section>/`.
2. Add its slug to the `sidebar` array in `astro.config.mjs`.

Frontmatter requires `title` and `description`. **Quote any value containing a
colon** — unquoted colons are a YAML syntax error and will fail the build.

## Content status

Written: `start/installation`, `start/first-run`, `start/providers`,
`privacy/model`, `help/faq`.

Everything else is a stub carrying a "Work in progress" callout — all of
`features/`, `internals/`, `help/troubleshooting`, and
`privacy/trusted-providers`.

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
| Bundled skills | `src/skills/defaults/*/SKILL.md` |
| Skill/memory folder paths | `src/utils/agentPaths.ts` |
| Platform support, min app version | `manifest.json` |
| Architecture | `docs/architecture-overview.md`, `CLAUDE.md` |

If that checkout is not accessible in the current session, say so rather than
writing from memory — a wrong feature list on a public site is worse than a
stub.

### Before a plugin release

Enumerable facts are **not** generated at build time; they are refreshed by
hand before each release. Work through this list against the sources above:

- [ ] `start/providers` — provider table matches `PROVIDER_TEMPLATES`
- [ ] `features/skills` — bundled skills match `src/skills/defaults/`
- [ ] `features/agent` — tool list matches `BUILT_IN_TOOL_IDS`
- [ ] `start/installation` — `minAppVersion` and platform support match
      `manifest.json`
- [ ] Landing page (`src/pages/index.astro`) — feature grid and provider list
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
