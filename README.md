# Smart Second Brain — site

Landing page and documentation for the
[Smart Second Brain](https://github.com/s2b-dev/smart-second-brain) Obsidian
plugin. Built with [Astro](https://astro.build/) and
[Starlight](https://starlight.astro.build/), deployed to GitHub Pages at
[smartsecondbrain.dev](https://smartsecondbrain.dev).

## Development

```bash
bun install && bun run dev
```

| Command | Action |
| --- | --- |
| `bun run dev` | Dev server at `localhost:4321` |
| `bun run build` | Production build to `dist/` |
| `bun run preview` | Preview the production build locally |
| `bun run check` | Type-check with `astro check` |

## Layout

```
src/
├── pages/index.astro        landing page (custom route)
├── content/docs/            documentation, one folder per sidebar section
├── styles/landing.css       landing-page styles
├── styles/theme.css         Starlight theme tokens
└── scripts/landing.js       landing-page animations
```

The sidebar is defined in `astro.config.mjs`. Adding a docs page means creating
the markdown file **and** adding its slug to the sidebar config.

## Deployment

Pushes to `main` trigger `.github/workflows/deploy.yml`, which builds and
publishes to GitHub Pages.

The apex domain is canonical — the site is served at `smartsecondbrain.dev`,
and `www` redirects to it.
