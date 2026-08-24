---
title: Architecture
description: How the plugin is put together.
sidebar:
  order: 1
---

How Smart Second Brain is assembled: what owns what, where state lives, and how
the agent, retrieval, and graph fit together.

This page describes the shape of the system. The
[search algorithm reference](/internals/search-algorithm/) covers retrieval in
depth, with constants.

## Stack

Svelte 5 (runes) and TypeScript, bundled by Vite into a CommonJS `main.js` for
Obsidian. LangChain and LangGraph drive agent execution. Bun is the package
manager.

The plugin runs on **desktop and mobile** — `isDesktopOnly` is false. A few
capabilities are desktop-gated where the mobile WebView lacks the APIs; stdio
MCP transport is the main one.

## Composition root

`src/main.ts` owns lifecycle, and it is the only thing that does.

It constructs the data store, then registers views, commands, and editor
extensions **synchronously**. Everything expensive — lexical search, the vector
store, skills, the agent manager — is deferred to `onLayoutReady` so the
workspace paints immediately. If you open a chat before that finishes, the
agent manager lazily initializes rather than failing.

Three views are registered: the chat view (a `FileView` over `.chat` files),
the Smart Graph, and onboarding. A fourth — Note Context — exists in the source
but is disabled for the initial release.

One notable patch: `WorkspaceLeaf.prototype.openFile` is wrapped so `.chat`
files always open in the configured sidebar split instead of replacing the note
you're reading.

## Layers

### `src/agent/` — orchestration

`Agent.ts` wraps LangChain React-agent execution and streaming.
`AgentManager.ts` is the Obsidian-facing facade: it registers providers, binds
tools, assembles the system prompt, and resolves multimodal capability per
model at runtime.

`ObsidianChatManager.ts` is a custom LangGraph checkpoint saver. Threads are
NDJSON `.chat` files in the vault, with a fast index held in plugin data.
Because checkpoints form a **tree**, editing or regenerating a message branches
history rather than truncating it.

### `src/providers/` — model access

One file per vendor, plus a runtime registry holding only the providers you
have actually configured. OpenAI-compatible is a first-class template rather
than a fallback, and multiple instances of the same template are supported with
distinct names and endpoints.

### `src/vectorstore/` and `src/search/` — retrieval

`VectorStoreService` owns index lifecycle and supports **multiple indexes keyed
by embedding model**, so chat retrieval and graph analytics can run on
different models. `HNSWVectorStore` plus a worker handle approximate nearest
neighbours; `MiniSearchService` provides BM25-style lexical retrieval that
works with no embedding model configured at all.

`src/search/` is the ranking pipeline on top: query planning, lexical scoring,
recency boosting, and final fusion. The search modal and the `search_notes`
tool share it.

### `src/stores/` — state

Svelte 5 runes in `*.svelte.ts` files. Three matter:

- `dataStore` — canonical configuration, and secret *indirection*.
- `chatStore` — the message timeline, branching metadata, and messenger
  orchestration.
- `pendingChangesStore` — staged note mutations awaiting review.

### `src/lib/` — host adapters

Where Obsidian's quirks are absorbed. `obsidianFetch.ts` tries native fetch and
falls back to `requestUrl` for CORS, with a 60-second per-request ceiling —
without it, an unreachable host leaves the promise permanently unsettled and
indexing hangs with no way to cancel. `aiTransport.ts` handles streaming-mode
downgrade for endpoints that can't stream.

### Others

`src/components/` holds feature-vertical Svelte UI; `src/views/` holds thin
Obsidian view wrappers that mount those components; `src/editor/` holds
CodeMirror extensions for inline diffs and selection highlighting;
`src/utils/` holds pure helpers — clustering, projection, chunking, PDF
extraction, token estimation.

Markdown rendering goes through Obsidian's own renderer, not a custom one.

## Agent context is one vault folder

Everything an agent's behaviour is built from is a real, visible note under one
configurable root (`Agents/` by default):

```
Agents/
├── Memories/                    shared memory notes; writes auto-apply
├── Skills/
│   └── <name>/SKILL.md          every skill, including bundled core ones
└── System Prompts/
    └── <Agent Name>/
        ├── Base.md              the base system prompt
        └── Memory.md            memory-usage instructions
```

The three subdirectory names are fixed; the root is configurable.

Because both prompt files share a folder named after the agent, renaming,
duplicating, or deleting an agent is a single directory operation rather than a
per-file one.

The whole tree is excluded from indexing, search, and the graph — it is plugin
machinery that happens to be stored as notes.

## System prompt assembly

The prompt is built per run, from:

1. The base prompt (`Base.md`, falling back to the shipped default).
2. Memory instructions, when memory is enabled **and** a write tool is
   available — injected right after the base prompt.
3. An `<available_skills>` block listing every enabled skill by *description*.

Skill bodies are not included. They load on demand through `load_skill`, which
is what keeps a large skill library affordable.

Prompt-file content is cached in memory — populated at init and on vault change
— so assembly and the reactive staleness check never hit disk.

## Tool binding

A built-in tool is bound when **an enabled skill attaches it via
`allowed-tools`** and the agent-level per-tool override hasn't vetoed it.

Because a tool can be attached by several skills, overrides are agent-level
rather than per-skill.

MCP tools are appended after the built-ins, memoized per agent so a network
handshake doesn't repeat every run. Concurrent runs share one in-flight
handshake, and a failed handshake is deliberately **not** cached.

## Cross-cutting invariants

**Staged writes.** Tools that mutate notes go through `pendingChangesStore` for
review. The memory folder is the single exception.

**Worker offload.** Graph projection, clustering, the semantic neighbour scan,
and HNSW operations run in Web Workers, so a large vault doesn't freeze the UI.

**Capability-driven multimodal.** Vision and PDF support is resolved per model
at runtime. There are no hard-coded provider assumptions.

**Secrets by reference.** `dataStore` holds secret *ids*. Raw values resolve
through `secretStorage.ts`, so the config file never contains a key.

**Privacy at the boundary.** Every read tool checks the file against the
provider's trust flag before returning content. See
[Trusted providers](/privacy/trusted-providers/).

## Source

The plugin repository is
[`s2b-dev/smart-second-brain`](https://github.com/s2b-dev/smart-second-brain).
Contributor-facing guidance, including the canonical architecture notes this
page summarizes, lives in
[`AGENTS.md`](https://github.com/s2b-dev/smart-second-brain/blob/dev/AGENTS.md).
