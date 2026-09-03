---
title: Graph
description: "The interactive graph view: clustering, layout, and filtering."
sidebar:
  order: 1
---

Obsidian's own graph shows you the links you wrote. The Smart Graph shows you
the structure you didn't: the topics your vault has organized itself into, and
the notes that are about the same thing without ever linking to each other.

Open it with **Smart Second Brain: Open smart graph**.

## What's drawn

**Authored links.** Your wikilinks, optionally with arrowheads showing
direction (**Directed links**).

**Inferred links.** When an embedding model is configured, the graph adds edges
between notes that are semantically similar but not linked. Two controls govern
them:

- **Neighbors (k):** how many inferred neighbours each note may contribute.
  The default is 5. The union is denser than it sounds, because an edge
  survives if *either* endpoint ranks the other.
- **Similarity threshold:** the minimum cosine similarity for an inferred
  edge. The default is 0.55; below roughly that, pairs are noise rather than
  genuine topical overlap.

The threshold matters more than k for keeping topics clean.

## Topics

The graph partitions itself into topics using Leiden community detection, and
renders them as tinted regions with name pills.

**Granularity** is the control you'll actually use: one slider that moves
between few broad topics and many narrow ones. Underneath it is the Leiden
**Resolution (γ)**: higher means more, smaller topics.

Because Leiden returns a flat partition, the hierarchy is built by running it
twice, once coarse and once fine, then rolling each fine topic up into whichever
coarse topic holds most of its notes. That's what lets you ask "what is this
vault about?" at more than one altitude and get consistent answers: every note
rolls up somewhere.

Related controls:

- **Link-only topics:** detect topics from authored links alone, ignoring
  inferred edges.
- **Seed:** the PRNG seed. The same seed on the same graph gives the same
  topics, so a layout you liked is reproducible.

A group needs at least two notes to count as a topic. A single note is not a
topic; it stays on the graph without a region.

### Topic labels

Topics are named after their best-connected note's filename by default. With a
**Topic naming model** set under **Settings → Graph**, the **Name topics with
AI** button in the Topics panel sends each topic's note titles to that model
and names the topic from them. Names are cached by topic membership, so an
unchanged topic is never named twice. Naming runs in the background and can be
cancelled; if the graph changes underneath it, the in-flight pass is aborted.
**Name topics automatically** (off by default) runs it whenever the topics
change instead of only on request.

## Highlighting

Two structural highlights are the reason to keep this view open:

**Bridges.** Notes whose neighbours are mostly in *other* topics. These are
where your thinking connects, and they are usually the notes worth developing.
The **Bridge threshold** sets the minimum fraction of foreign-topic neighbours
required to qualify.

**Isolated / unlinked.** Notes with no authored links. Orphans you meant to
connect and forgot.

## Layout

The layout is a force simulation with five exposed forces:

| Control | Effect |
| --- | --- |
| **Link distance** | Target distance between connected nodes |
| **Repulsion** | How strongly nodes push each other apart |
| **Center force** | How strongly the graph is pulled toward the centre |
| **Link strength** | How strongly edges pull connected nodes together |
| **Cluster cohesion** | How strongly nodes are pulled toward their topic centre |

Rendering goes through PixiJS, and projection, clustering, and the semantic
neighbour scan run in Web Workers so dragging stays smooth on a large vault.
Past a threshold the neighbour scan switches from an exact pairwise comparison
to an HNSW-accelerated approximate one, where the quadratic scan stops being
viable.

## Scope

**Markdown only** excludes non-markdown files from the graph. As with search,
the agent folder is always excluded.

## Interacting

Click a topic's label to collapse just that group. Select segments with
shift/⌘ to multi-select. Clicking a note opens it.

:::note
Inferred links, semantic topics, and generated topic labels all depend on
configuration you may not have: inferred edges and semantic topics need an
embedding model, and generated labels need a chat model. Without either, the
graph still renders your authored links and detects topics from them alone.
:::
