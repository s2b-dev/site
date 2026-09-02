// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import svelte from '@astrojs/svelte';

export default defineConfig({
	site: 'https://smartsecondbrain.dev',
	integrations: [
		svelte(),
		starlight({
			title: 'Smart Second Brain',
			description:
				'An Obsidian plugin with smarter search, an interactive knowledge graph, and an AI agent that reads your notes before it answers.',
			logo: {
				light: './src/assets/logo-light.svg',
				dark: './src/assets/logo-dark.svg',
				replacesTitle: true,
			},
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/s2b-dev/smart-second-brain',
				},
			],
			editLink: {
				baseUrl: 'https://github.com/s2b-dev/site/edit/main/',
			},
			customCss: ['./src/styles/theme.css'],
			// Starlight's default is /favicon.svg; the .ico is for browsers
			// that request /favicon.ico without reading the markup.
			favicon: '/favicon.svg',
			head: [
				{
					tag: 'link',
					attrs: { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
				},
				// Cloudflare Web Analytics: cookieless, no cross-site tracking,
				// so no consent banner. The token is public by design (it ships
				// in the markup on every page load). The landing page carries
				// the same tag in its own <head> — it bypasses Starlight's
				// layout, so this entry does not reach it.
				{
					tag: 'script',
					attrs: {
						type: 'module',
						src: 'https://static.cloudflareinsights.com/beacon.min.js',
						'data-cf-beacon': '{"token": "303916a95994415190ed79caf5046bde"}',
					},
				},
			],
			// The landing page at "/" is a custom route, not a Starlight page.
			disable404Route: false,
			sidebar: [
				{
					label: 'Getting started',
					items: [
						{ label: 'Installation', slug: 'start/installation' },
						{ label: 'What works without a model', slug: 'start/first-run' },
						{ label: 'Connecting a provider', slug: 'start/providers' },
					],
				},
				// Mirrors the plugin's own settings tabs: Search, Agents, Graph.
				// Everything an agent *has* (skills, integrations, memory, MCP)
				// nests under Agents, the way the Agent editor's sections do.
				// Each feature group ends with its own "How it works" page: the
				// implementation depth sits under the feature it explains rather
				// than in a separate internals section, so a reader who wants the
				// constants finds them where they were already reading. (Note
				// these must stay groups, not bare `link` entries — a top-level
				// link renders loose and gets absorbed into the group above it,
				// which once buried both under "Getting started".)
				{
					label: 'Search',
					items: [
						{ label: 'Overview', slug: 'search' },
						{ label: 'How search works', slug: 'search/how-it-works' },
					],
				},
				{
					label: 'Graph',
					items: [
						{ label: 'Overview', slug: 'graph' },
						{ label: 'How the graph works', slug: 'graph/how-it-works' },
					],
				},
				{
					label: 'Agents',
					items: [
						{ label: 'Overview', slug: 'agents' },
						{ label: 'Skills', slug: 'agents/skills' },
						{ label: 'Integrations', slug: 'agents/integrations' },
						{ label: 'Memory', slug: 'agents/memory' },
						{ label: 'MCP servers', slug: 'agents/mcp' },
					],
				},
				{
					label: 'Privacy',
					items: [
						{ label: 'Privacy model', slug: 'privacy/model' },
						{ label: 'Trusted providers', slug: 'privacy/trusted-providers' },
					],
				},
				{
					label: 'Help',
					items: [
						{ label: 'Troubleshooting', slug: 'help/troubleshooting' },
						{ label: 'FAQ', slug: 'help/faq' },
					],
				},
			],
		}),
	],
});
