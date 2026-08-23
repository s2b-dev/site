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

> [!NOTE]
> GitHub Pages requires the repository to be **public** on the free plan. While
> this repo is private the workflow will run but the deploy step cannot
> publish.

### DNS

The apex domain is canonical — users should only ever see
`smartsecondbrain.dev`, never a `www.` prefix. GitHub redirects `www` to the
apex automatically once the custom domain is set in repository settings.

If the registrar supports **ALIAS/ANAME** records or CNAME flattening at the
apex, prefer a single record pointing at `s2b-dev.github.io`. GitHub can then
rotate its IPs without any DNS change here.

Otherwise, point the apex at GitHub Pages' four IPv4 and four IPv6 endpoints.
Verify the current values against
[GitHub's documentation](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
before applying them — the set below is recorded for convenience, not as a
source of truth.

```
A     smartsecondbrain.dev  185.199.108.153
A     smartsecondbrain.dev  185.199.109.153
A     smartsecondbrain.dev  185.199.110.153
A     smartsecondbrain.dev  185.199.111.153
AAAA  smartsecondbrain.dev  2606:50c0:8000::153
AAAA  smartsecondbrain.dev  2606:50c0:8001::153
AAAA  smartsecondbrain.dev  2606:50c0:8002::153
AAAA  smartsecondbrain.dev  2606:50c0:8003::153
```

The four addresses are redundant anycast endpoints, not a range — clients fail
over between them if one is unreachable.

Then enable Pages in repository settings with source **GitHub Actions**, set
the custom domain, and turn on **Enforce HTTPS** once the certificate is
issued.
