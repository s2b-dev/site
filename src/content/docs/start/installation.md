---
title: Installation
description: Install Smart Second Brain from Obsidian's community plugins, or from a manual build.
sidebar:
  order: 1
---

Smart Second Brain runs on Obsidian `1.5.0` or newer.

## From community plugins

1. Open **Settings → Community plugins** in Obsidian.
2. Turn off **Restricted mode** if it is on.
3. Choose **Browse**, search for *Smart Second Brain*, and select **Install**.
4. Select **Enable**.

That's it. Smarter search and the Smart Graph work immediately, with no
configuration and no AI provider. See [First run](/start/first-run/) for what to
try first.

## Manual install

Download the latest release from
[GitHub releases](https://github.com/s2b-dev/smart-second-brain/releases) and
extract `main.js`, `manifest.json`, and `styles.css` into:

```
<your-vault>/.obsidian/plugins/smart-second-brain/
```

Reload Obsidian, then enable the plugin under **Settings → Community plugins**.

## Beta releases via BRAT

Pre-release builds are published for testing and can be installed with
[BRAT](https://github.com/TfTHacker/obsidian42-brat). Add
`s2b-dev/smart-second-brain` as a beta plugin.

:::caution
On mobile, fully quit and reopen Obsidian after a BRAT update — the app caches
plugin code across a plain reload, so the new build may not take effect
otherwise.
:::

## Building from source

The project uses [Bun](https://bun.sh/) as its package manager.

```bash
git clone https://github.com/s2b-dev/smart-second-brain.git
```

```bash
bun install && bun run build
```

The production bundle is written to `build/prod`.
