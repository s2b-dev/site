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

- Styles live in `src/styles/landing.css` (~330 lines) and are **not** scoped
  or Tailwind-based — plain CSS with custom properties defined in `:root`.
- Animations live in `src/scripts/landing.js` — an animated hero canvas
  (force-directed graph), a typing search demo, a privacy toggle, and a
  stepped agent-chat sequence. All are vanilla JS driven by
  `IntersectionObserver`.
- The intro-gate script is **inlined** in `index.astro` with `is:inline` and
  must stay in `<head>` — it sets a class before first paint so the intro
  animation does not flash on repeat visits.
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
`privacy/model`.

Everything else is a stub carrying a "Work in progress" callout — all of
`features/`, `internals/`, `help/`, and `privacy/trusted-providers`.

## Verifying facts about the plugin

**Docs claims must be checked against the plugin source, not the plugin's
README.** The README in `s2b-dev/smart-second-brain` is known to be outdated in
at least three places (it claims desktop-only when `manifest.json` has
`isDesktopOnly: false`; it lists bundled skills that do not exist; it puts
skills in the config folder rather than the vault's `Agents/Skills/`).

Ground truth lives in the plugin repo, which is checked out alongside this one
at `../smart-second-brain`:

- Bundled skills → `src/skills/defaults/`
- Providers → `src/providers/`
- Platform support → `manifest.json`
- Architecture and conventions → `CLAUDE.md`, `docs/architecture-overview.md`

If that checkout is not accessible in the current session, say so rather than
writing from memory — a wrong feature list on a public site is worse than a
stub.

## Deployment

Pushes to `main` trigger `.github/workflows/deploy.yml`, which builds and
publishes to GitHub Pages. The apex domain is canonical; `www` redirects to it.

DNS is configured once in the registrar's UI and is deliberately not documented
here.
