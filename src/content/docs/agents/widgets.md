---
title: Widgets
description: "Interactive dashboards, charts and plots the agent builds from your vault, kept as files you can embed anywhere."
sidebar:
  order: 3
---

Ask the agent for a dashboard of your open tasks, a heatmap of when you edit
notes, or a 3D plot of a function you are studying, and it answers with a
**widget**: a small interactive page, rendered right there in the chat, built
from live data in your vault. Keep the ones you like as `.widget` files. They
open in their own tab, embed in any note, and stay up to date as the vault
changes.

Widgets need the [`widgets` skill](/agents/skills/), which ships with the plugin
and is on by default. Live data needs the
[Dataview](https://github.com/blacksmithgu/obsidian-dataview) plugin; without it
a widget can still show data the agent gathered, it just won't refresh itself.

## In the chat

A widget renders as a card in the reply, with a small toolbar above it:

- **Expand** opens it almost full-window for a closer look.
- **Copy as block** puts the widget on the clipboard as a code block you can
  paste into any note, where it renders the same way.
- **Save as a widget file** writes it to your **Widgets folder** (Settings →
  Agents → Widgets, default `Widgets/`) and opens it.

A widget starts rendering the moment its block is complete, while the rest of
the reply is still streaming.

## Widget files

A saved widget is a `.widget` file. It behaves like any file in the vault:

- **Its own tab.** Open it from the file explorer or the quick switcher and it
  fills the pane. The header has **Edit source** (a plain-text editor for the
  file, since Obsidian has none for the extension); **Rename…** is in the tab's
  context menu, with the other file actions.
- **Embeddable.** `![[Vault overview.widget]]` renders it inside a note at its
  own height. Hovering a link to it shows the same preview as any page preview.
- **Live.** Edit the file, or accept an agent's edit to it, and every open tab
  and embed re-renders.

The agent can revise a saved widget the same way it edits notes: it reads the
file and stages the change, and you review it as the **rendered widget** before
anything is written. The chat's pending-changes bar previews the proposal in
place (with the source diff a click away), and the widget's own pane shows the
proposed version under an accept/reject bar, with a toggle back to the current
one.

:::note
Obsidian Sync carries `.widget` files only if **Sync all other types** is on
in its settings. Links written *inside* a widget open and preview normally but
don't count as backlinks, since Obsidian's link index reads markdown only.
:::

## What is in a widget

A widget is an HTML page with a short header:

````markdown
```s2b-widget
---
title: Notes per tag
description: The fifteen most-used tags, as a bar chart
icon: tags
queries:
  tags: TABLE length(rows) AS n FROM "" FLATTEN file.tags AS tag GROUP BY tag
---
<div id="chart"></div>
<script>
  s2b.onData(({ tags }) => { /* draw from tags.rows */ });
</script>
```
````

The header keys, all optional:

| Key | What it does |
| --- | --- |
| `title` | Shown on the card and the tab; the file name when saved |
| `description` | One line on what the widget shows. With the title, the only part of a saved widget that search indexes |
| `icon` | Any [Lucide](https://lucide.dev/icons/) icon name for the tab and card; the default is `component` |
| `height` | A fixed height in pixels. Without it the widget sizes to its content; with it, it still shrinks when the content is shorter |
| `queries` | Named [Dataview](https://blacksmithgu.github.io/obsidian-dataview/queries/structure/) queries. The plugin runs them, hands the results to the widget, and runs them again whenever the vault changes |
| `libs` | Bundled libraries to load. Currently `plotly`, for 2D and 3D plots |

The `.widget` file is exactly this, without the fence lines. You never need to
write one by hand, but you can, and the source editor shows the header keys as
a reminder.

### Links to notes

Anything in a widget marked with `data-note="Path/To/Note.md"` (or a plain link
whose target is a vault path) is a note link: click opens the note, Cmd/Ctrl-click
opens it in a new tab, and hovering shows a page preview. Page preview lists
widgets as their own source, **S2B Widgets**, so you can decide there whether the
preview needs a modifier key, as for any other source.

### Plots

With `libs: plotly` a widget gets [Plotly](https://plotly.com/javascript/) for
line, scatter, bar and pie charts, and for 3D surfaces, scatter and meshes with
orbit and zoom. The build is bundled with the plugin, so plots work offline like
everything else. Without a library, a widget can still draw with SVG or a
canvas.

## Widgets are sandboxed

A widget is code the agent wrote, so it runs in a box:

- It renders in an isolated frame with **no access to Obsidian, your vault, or
  the network**. It cannot fetch, load remote scripts, or navigate anywhere.
- The **plugin** runs the widget's queries and passes the results in. The
  widget sees only what its own queries return.
- Libraries are bundled with the plugin, never downloaded.

Treat a widget like anything else the agent produces: it can only act on data
you let the agent read.

## Widgets and search

A saved widget is indexed by its **title and description only**, so you and
the agent can find "the tags overview" without its code ever showing up as a
search result. A widget pasted into a note as a block is likewise reduced to a
marker with its title before that note is indexed.
