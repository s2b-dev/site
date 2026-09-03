---
title: Search
description: Full-text, fuzzy, tag-aware search, plus optional semantic retrieval.
sidebar:
  order: 1
---

Search is the layer that works the moment you install the plugin. No provider,
no API key, no index build to wait through. Open the command palette and run
**Smart Second Brain: Search notes**.

## Two retrieval paths

Search has a **lexical** path and, when an embedding model is configured, a
**semantic** path. The search window runs one of them at a time; only the
agent can ask for both fused into a single ranking.

**Lexical** matches the words you typed. It is BM25-style scoring over a
MiniSearch index, with fuzzy matching for typos and prefix matching so partial
words still hit. It needs no model and no network.

**Semantic** matches meaning. Your query is embedded and compared against the
embedded chunks of your notes, so a search for *"why my mornings feel
scattered"* can surface a note that only ever says "context switching". This
path requires an embedding model. See [What works without a model](/start/first-run/).

Results are normalized, boosted, and re-ranked before you see them.
[How search works](/search/how-it-works/) documents the pipeline in full,
including the constants.

## Choosing a strategy

The search window always opens in **lexical** mode. Press **Tab** (or the
semantic button in the tap bar on mobile) to run the current query
**semantically** instead. That switch is a one-shot: the semantic results stay
on screen, but as soon as you change the query text the next search runs
lexically again. Switching requires a search embedding index; without one the
plugin shows a notice pointing at the setting.

Reach for lexical when you know the vocabulary: a project code name, a person,
an error string. Reach for semantic when you know the idea but not the words
your past self used.

The two modes are deliberately not fused in the search window. Pressing Tab
means you have looked at the lexical results and they are not what you wanted,
and mixing them back in re-injects the ordering you just rejected.

| Strategy | What it matches | Needs an embedding model | Available to |
| --- | --- | --- | --- |
| `lexical` | Exact and fuzzy words | No | You and the agent |
| `semantic` | Meaning and concepts | Yes | You and the agent |
| `hybrid` | Both, fused | Yes | The agent only |

`hybrid` exists only on the agent's `search_notes` tool, and even there it is
not the default: the agent starts lexical and is told to escalate, reaching for
hybrid when a query mixes a specific term such as a name, tag, or filename with
a fuzzy concept.

## Filters

Searches can be narrowed before ranking rather than after:

- **Path:** restrict to a folder or a single note.
- **Tags:** restrict to notes carrying given tags.
- **Properties:** restrict on frontmatter keys and values.

Filters apply at chunk level on the semantic path, so a filtered semantic
search doesn't quietly waste its result budget on chunks that were going to be
discarded anyway.

## Recency

Notes you have touched recently get a ranking boost. This is deliberate and
mild: it breaks ties in favour of what you're actually working on without
letting a freshly-saved but irrelevant note outrank a strong match.

## What search excludes

The agent's own folder (`Agents/` by default, holding memories, skills, and
system prompts) is excluded from indexing, search, and the graph. It is plugin
machinery that happens to be stored as notes, and it would otherwise dominate
results about the plugin itself.

PDFs are indexed by their extracted text, not just their title — both for
lexical search and, when an embedding model is configured, semantic search.
Images are indexed by title only; there is no OCR or image-content extraction.
On mobile, an oversized or scanned PDF falls back to title-only indexing, since
above a certain size a PDF is predominantly scanned pages with no text to
extract.

## Chat files

Conversations are stored as `.chat` files in your vault, and they are indexed,
so you can find a past conversation by searching for what was said in it.
Because conversation history is a tree of checkpoints where each checkpoint
re-contains every prior message, chat files are deduped by message id before
indexing. Without that, a single conversation would be indexed many times over.

Chats are also transcludable: `![[My conversation.chat]]` renders the
transcript inside another note. See
[Embedding a chat in a note](/agents/#embedding-a-chat-in-a-note).

## The `search_notes` tool

The agent reaches the same pipeline through its `search_notes` tool, with the
same filters and one extra strategy, `hybrid`, which fuses the lexical and
semantic paths. When you ask the agent a question about your notes, this is
what runs. See [Agents](/agents/).

:::note
If no embedding model is configured, the agent is told so in the tool result
rather than left to guess. It stops retrying `semantic` and varies its search
terms instead.
:::
