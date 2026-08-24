---
title: Search
description: Full-text, fuzzy, tag-aware search, plus optional semantic retrieval.
---

Search is the layer that works the moment you install the plugin. No provider,
no API key, no index build to wait through — open the command palette and run
**Smart Second Brain: Search notes**.

## Two retrieval paths

Search runs a **lexical** path and, when an embedding model is configured, a
**semantic** path, then fuses their results into one ranking.

**Lexical** matches the words you typed. It is BM25-style scoring over a
MiniSearch index, with fuzzy matching for typos and prefix matching so partial
words still hit. It needs no model and no network.

**Semantic** matches meaning. Your query is embedded and compared against the
embedded chunks of your notes, so a search for *"why my mornings feel
scattered"* can surface a note that only ever says "context switching". This
path requires an embedding model — see [First run](/start/first-run/).

Results from both paths are normalized, fused, and re-ranked before you see
them. The [search algorithm reference](/internals/search-algorithm/) documents
the pipeline in full, including the constants.

## Choosing a strategy

Search exposes three strategies:

| Strategy | What it matches | Needs an embedding model |
| --- | --- | --- |
| `lexical` | Exact and fuzzy words | No |
| `semantic` | Meaning and concepts | Yes |
| `hybrid` | Both, fused | Yes |

Reach for `lexical` when you know the vocabulary — a project code name, a
person, an error string. Reach for `semantic` when you know the idea but not
the words your past self used. `hybrid` is the sensible default once embeddings
are configured, and is what the agent escalates to when a query mixes an exact
term with a fuzzy concept.

## Filters

Searches can be narrowed before ranking rather than after:

- **Path** — restrict to a folder or a single note.
- **Tags** — restrict to notes carrying given tags.
- **Properties** — restrict on frontmatter keys and values.

Filters apply at chunk level on the semantic path, so a filtered semantic
search doesn't quietly waste its result budget on chunks that were going to be
discarded anyway.

## Recency

Notes you have touched recently get a ranking boost. This is deliberate and
mild: it breaks ties in favour of what you're actually working on without
letting a freshly-saved but irrelevant note outrank a strong match.

## What search excludes

The agent's own folder — `Agents/` by default, holding memories, skills, and
system prompts — is excluded from indexing, search, and the graph. It is plugin
machinery that happens to be stored as notes, and it would otherwise dominate
results about the plugin itself.

Binary files such as images and PDFs are indexed by **title only**. Their
content is not embedded.

## Chat files

Conversations are stored as `.chat` files in your vault, and they are indexed —
so you can find a past conversation by searching for what was said in it.
Because conversation history is a tree of checkpoints where each checkpoint
re-contains every prior message, chat files are deduped by message id before
indexing. Without that, a single conversation would be indexed many times over.

Chats are also transcludable — `![[My conversation.chat]]` renders the
transcript inside another note. See
[Embedding a chat in a note](/agents/#embedding-a-chat-in-a-note).

## The `search_notes` tool

The agent reaches the same pipeline through its `search_notes` tool, with the
same strategies and filters. When you ask the agent a question about your
notes, this is what runs. See [Agents](/agents/).

:::note
If no embedding model is configured, the agent is told so in the tool result
rather than left to guess — it stops retrying `semantic` and varies its search
terms instead.
:::
