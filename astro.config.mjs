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
			],
			// The landing page at "/" is a custom route, not a Starlight page.
			disable404Route: false,
			sidebar: [
				{
					label: 'Getting started',
					items: [
						{ label: 'Installation', slug: 'start/installation' },
						{ label: 'First run', slug: 'start/first-run' },
						{ label: 'Connecting a provider', slug: 'start/providers' },
					],
				},
				// Mirrors the plugin's own settings tabs: Search, Agents, Graph.
				// Everything an agent *has* (skills, integrations, memory, MCP)
				// nests under Agents, the way the Agent editor's sections do.
				// Search and Graph are single-page groups rather than bare links:
				// a top-level `link` renders as a loose item and gets absorbed
				// into the group above it, which buried them under "Getting
				// started". A one-item group keeps the three features parallel.
				{
					label: 'Search',
					items: [{ label: 'Search', slug: 'search' }],
				},
				{
					label: 'Graph',
					items: [{ label: 'Graph', slug: 'graph' }],
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
					label: 'How it works',
					items: [
						{ label: 'Architecture', slug: 'internals/architecture' },
						{ label: 'Search algorithm', slug: 'internals/search-algorithm' },
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
