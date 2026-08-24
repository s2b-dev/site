---
title: Memory
description: Opt-in working memory stored as real notes in your vault.
sidebar:
  order: 4
---

Memory lets an agent remember things between conversations — that you prefer
short answers, that your work is tracked under `#work`, that a project you keep
asking about lives in a particular folder.

It's off by default. Enable it per agent in the Agent editor.

## It's just a folder

Memories are notes in `Agents/Memories/`. Open the folder and read them. Edit
them. Delete the ones you disagree with. There is no opaque store and nothing
to export — it's your vault.

The folder is **global**: remembered facts belong to you, not to one agent, so
every memory-enabled agent shares it. What's per-agent is the *instructions* —
how eagerly to read and record — which live in that agent's
`Agents/System Prompts/<Agent Name>/Memory.md`.

## Writes here auto-apply

This is the one place the agent writes without staging changes for your review.
Requiring approval for every housekeeping edit to its own scratch space would
make the feature unusable, so the trade is scoped tightly: auto-apply inside
`Agents/Memories/`, review everywhere else.

The rest of your vault is unaffected — see [Agents](/agents/).

## Requires note-writing

Memory needs `manage_notes`, since recording a memory is a note write. If the
agent has no write tool — because no enabled skill attaches it, or a tool
override vetoed it — the memory instructions are **not** injected at all, even
with the toggle on.

That's deliberate: telling an agent to record memories with a tool it doesn't
have produces a confused agent, not a memoryless one.

## Pointers, not copies

The default instructions are opinionated about *what* gets stored, and it's
worth understanding why.

The vault is your long-term memory and the source of truth. The memory folder
is short-term memory the agent governs. So when something already lives in your
notes, the agent is told to store a **pointer** — the tag, the wikilink, the
folder, the search to run — rather than a copy.

At answer time it follows the pointer and re-reads the live note. A copy would
be a snapshot that silently goes stale; a pointer stays correct as you edit.

Full content is reserved for facts with no home in the vault: a preference you
stated in conversation and never wrote down.

The agent is also told to read memory *silently* — to check before saying it
doesn't know, rather than asking permission to look in its own folder.

## Customizing

`Memory.md` is a note. If the agent records too much, tell it to record less.
If you want it to keep a specific kind of note, say so there.

The shipped default remains available as a diff, so you can see what you've
changed and reset if an edit doesn't work out.

## Excluded from search

Like the rest of `Agents/`, the memory folder is excluded from indexing,
search, and the graph. Memories don't pollute your search results, and the
agent reaches them by reading the folder directly.
