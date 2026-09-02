---
title: What works without a model
description: What works immediately after install, and what needs a model.
sidebar:
  order: 2
---

Smart Second Brain is built in three layers, and each one is useful on its own.
Nothing below requires an account, an API key, or an internet connection until
you reach the agent.

## Works immediately, no provider needed

**Smarter search.** Full-text, fuzzy, and tag/frontmatter-aware. Already more
capable than Obsidian's built-in search, with no setup.

**Smart Graph.** An interactive graph view with clustering, layout, and
filtering. Out of the box it renders your wikilinks.

Open either from the command palette:

- `Smart Second Brain: Search notes`
- `Smart Second Brain: Open smart graph`

## Add an embedding model for the semantic layer

An embedding model unlocks concept-level retrieval: search matches meaning
rather than exact words, and the graph gains semantic similarity edges between
notes that aren't explicitly linked.

This can run fully locally through [Ollama](https://ollama.com/); a strong
starting point is `mxbai-embed-large`. No note content leaves your machine.

Configure it under **Settings → Smart Second Brain → Embedding model**.

## Add an AI provider for the agent

A chat model enables the full agent: it searches your vault, reads what's
relevant, and answers with links back to the notes it used. See
[Connecting a provider](/start/providers/).

:::note
The agent stages every note edit for your review as an inline diff. Nothing is
written to disk until you approve it.
:::

## Indexing

The first index build runs in the background and its progress appears in the
status bar. Large vaults take a few minutes. Indexing is incremental after
that, so only changed notes are reprocessed.
