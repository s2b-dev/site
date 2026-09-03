---
title: Memory
description: Working memory stored as real notes in your vault.
sidebar:
  order: 4
---

Memory lets an agent remember things between conversations: that you prefer
short answers, that your work is tracked under `#work`, that a project you keep
asking about lives in a particular folder.

It's on by default. Each agent's system prompt note, `AGENT.md`, ships with a
`# Memory` section. Delete that section and the agent stops using memory. There
is no separate toggle. See
[The system prompt is a note](/agents/#the-system-prompt-is-a-note).

## Where memories are stored

Memories are notes in `Agents/Memories/`. Open the folder and read them, edit
them, or delete the ones you disagree with. There is no opaque store and
nothing to export.

The folder is **global**: remembered facts belong to you, not to one agent, so
every agent with a memory section shares it. What's per-agent is the
*instructions* for how eagerly to read and record, which are the `# Memory`
section of that agent's `Agents/<Agent Name>/AGENT.md`.

## Writes here auto-apply

This is the one place the agent writes without staging changes for your review.
Requiring approval for every housekeeping edit to its own scratch space would
make the feature unusable, so the trade is scoped tightly: auto-apply inside
`Agents/Memories/`, review everywhere else.

The rest of your vault is unaffected. See [Agents](/agents/).

## Requires note-writing

Recording a memory is a note write, so it needs `manage_notes`, which the
`manage-notes` core skill attaches. An agent without that tool, because no
enabled skill attaches it or a tool override vetoed it, can still **read** its
memory folder (listing and reading notes come with `explore-vault`) but cannot
add to it.

In that case the assembled prompt ends with a note that no write tools are
enabled and that the agent must not claim to modify notes, so it should tell
you it can't record something rather than pretend it did.

## Pointers, not copies

The default instructions are opinionated about *what* gets stored, and it's
worth understanding why.

The vault is your long-term memory and the source of truth. The memory folder
is short-term memory the agent governs. So when something already lives in your
notes, the agent is told to store a **pointer** (the tag, the wikilink, the
folder, the search to run) rather than a copy.

At answer time it follows the pointer and re-reads the live note. A copy would
be a snapshot that silently goes stale. A pointer stays correct as you edit.

Full content is reserved for facts with no home in the vault: a preference you
stated in conversation and never wrote down.

The agent is also told to read memory *silently*: to check before saying it
doesn't know, rather than asking permission to look in its own folder.

## Customizing

The `# Memory` section is part of a note. If the agent records too much, tell
it to record less. If you want it to keep a specific kind of note, say so
there. The folder path at the top of the section is a `{{memoryFolder}}`
placeholder filled in from the Agents folder setting. Leave it as it is.

The shipped default remains available as a diff (**Diff with default** in the
Agent editor, shown once your note differs), so you can see what you've changed
and reset if an edit doesn't work out.

## Excluded from search

Like the rest of `Agents/`, the memory folder is excluded from indexing,
search, and the graph. Memories don't pollute your search results, and the
agent reaches them by reading the folder directly.
