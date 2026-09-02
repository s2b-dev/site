---
title: Agents
description: The tool-using agent that reads your notes before answering.
sidebar:
  order: 1
---

An agent is a chat that can actually look things up. Ask it a question and it
searches your vault, reads what looks relevant, and answers with wikilinks back
to the notes it used, so you can check its work.

An agent needs a chat model. See
[Connecting a provider](/start/providers/).

What an agent *has* is covered on its own page: the
[skills](/agents/skills/) that give it tools, the
[integrations](/agents/integrations/) that let it script other plugins, its
[memory](/agents/memory/), and any [MCP servers](/agents/mcp/) it connects to.

## Conversations are notes

Chats are stored as `.chat` files in your vault. They open in a sidebar split
rather than replacing the note you're reading, they sync with everything else,
and they are indexed, so you can search for a conversation by what was said in
it.

**History is a tree, not a list.** Editing an earlier message or regenerating a
reply creates a *branch* rather than destroying what was there. You can explore
an alternative line of questioning and still go back.

### Embedding a chat in a note

Because a chat is a file, you can transclude one into any note:

```markdown
![[My conversation.chat]]
```

The note renders the conversation inline, as a read-only transcript with the
chat's title and last-modified date. Click the title to open the real thing.

This is the payoff of conversations being notes rather than app state. When a
chat contains the reasoning behind a decision, embed it in the project note
instead of paraphrasing it. The record stays where you'll look for it, and it
updates when the conversation does.

Hovering a `.chat` link gives you the same preview without a modifier key.

A few properties worth knowing:

- **Read-only.** You can't continue a conversation from inside an embed.
- **It follows the active branch.** The embed resolves the same branch the chat
  view would show, so an embedded chat and the open one agree.
- **It re-renders when the chat changes**, including while an agent is still
  working in it.
- **It loads lazily.** A skeleton appears immediately and the transcript swaps
  in once parsed, so embedding a long chat (or several in one note) doesn't
  block the page from painting.

## Built-in tools

These are the tools the agent can be given. Which ones it actually has depends
on its enabled skills. See [Skills](/agents/skills/).

| Tool | What it does |
| --- | --- |
| `search_notes` | Search the vault (lexical, semantic, or hybrid) |
| `list_directory` | List folders and files |
| `read_content` | Read a note's content |
| `grep_notes` | Find an exact substring or regex across notes |
| `get_all_tags` | List every tag in the vault |
| `get_properties` | Read frontmatter properties, or list all property keys |
| `execute_javascript` | Run JavaScript against the vault |
| `manage_notes` | Create, update, delete, and move notes (**staged for review**) |
| `fetch_url` | Fetch a public web page as markdown |
| `web_search` | Search the web |
| `manage_skills` | Create, revise, or delete skills |

Two more tools appear situationally: `load_skill`, which pulls in a skill's full
instructions on demand, and a delegation tool when an agent has subagents
configured.

`search_notes` is not a second, weaker search. It runs the same ranking pipeline
as the search modal you open yourself: the same strategies, the same filters,
the same fusion. The agent sees the results you would have seen. See
[Search](/search/). The one difference is the starting point: the agent searches
lexically unless it asks for `semantic` or `hybrid`, and if no embedding index is
ready, it's told so in the result rather than being left to guess.

Tool names and descriptions are editable per agent, so you can rename a tool or
sharpen its description if your model responds better to different wording.

## Nothing is written without your approval

Every note mutation goes through a staging queue. The agent doesn't write to
disk. It proposes changes, which appear as an inline diff in the editor, and
you accept or reject them.

The one exception is the agent's memory folder, where writes auto-apply. That
is scoped to that folder alone, and an agent only uses it while its system
prompt note still has a memory section. See [Memory](/agents/memory/).

:::caution
The agent is instructed never to claim a change has already been applied,
because it hasn't. If it tells you it edited a note, the edit is still sitting
in the review queue.
:::

## Multiple agents

You can configure several agents, each with its own model, system prompt,
enabled skills, tool overrides, and MCP servers. Switch between them per chat.

A practical split: a fast, cheap local model for everyday vault questions, and
a frontier cloud model for work that needs real reasoning.

### They run in parallel

Chats don't queue behind each other. Start a slow research task in one chat,
open another, and keep working. Both agents run at once, on different models
if you like.

Each chat owns its own session state, so an action in one can't leak into
another. A running chat is **parked, not cancelled**, when you navigate away
from it: close the tab, keep reading your notes, and come back to a finished
answer.

The status bar shows a clickable chip per running chat, which is how you get
back to one you've navigated away from. Turn it off with **Show active agents
in status bar** under **Settings → Agents** if you'd rather not see them.

:::tip
Parallelism is bounded by whatever your provider allows. Several concurrent
chats against one cloud account can hit rate limits. A local model and a cloud
model side by side avoids that entirely.
:::

### Subagents

An agent can be given other agents as **subagents**, which it can delegate
self-contained subtasks to. Each subagent runs with its own model, tools, and
prompt, and returns only its result, so a long, noisy subtask doesn't fill the
main conversation's context.

Delegating to a copy of itself is the common case: a clean-context worker for a
task whose intermediate steps you don't need to see.

Subagents also run in parallel: an agent can dispatch several tasks in a single
turn and let them work simultaneously, rather than waiting for each in turn.
Each one's activity is nested under its own task card in the transcript, so you
can follow what each is doing.

Delegation is **one level deep**. A subagent's own subagents are ignored.

## Attachments and multimodal

Drop files straight onto the chat to attach them. The whole chat pane is the
drop target, not just the composer, and it outlines itself while you drag.
Dragging works from **inside Obsidian** (the file explorer, search results, and
other file lists) and from **outside** it (Finder, Explorer, your desktop).
Pasting a file into the composer attaches it too.

Dragging a vault file **attaches its content**. That is different from typing a
`[[wikilink]]`, which adds a reference the agent can follow. Drag when you
want the file itself in the conversation.

Accepted: `txt`, `md`, `csv`, `json`, `pdf`, and images (`png`, `jpg`, `jpeg`,
`gif`, `webp`). Anything else is flagged during the drag rather than failing
after it. Folders are skipped; drag the files inside them.

Vision and PDF support is resolved **per model at runtime**, not assumed from
the provider. A model that accepts images will accept them without extra
configuration; one that doesn't won't be offered the option. If you drag an
image onto a model that has no vision support, the drop is refused up front and
tells you to switch models, rather than being sent and rejected.

PDF text is extracted locally before anything is sent.

## Everything an agent is made of is a note

An agent has no hidden configuration. Its memory, its skills, and its system
prompt are all real, visible notes under one folder in your vault:

```
Agents/
├── Memories/                    shared memory notes; writes auto-apply
├── Skills/
│   └── <name>/SKILL.md          every skill, including the bundled ones
└── <Agent Name>/
    └── AGENT.md                 the agent's system prompt, memory instructions included
```

The root is configurable (**Agents folder** under **Settings → Agents**);
`Agents/` is only the default. `Memories/` and `Skills/` are fixed names.
Every other folder directly under the root is one agent, holding a single
`AGENT.md`.

Because the whole agent is one note in a folder named after it, renaming,
duplicating, or deleting an agent is a single folder operation. Copy the folder
and you have copied the agent.

The whole tree is **excluded from indexing, search, and the graph**. It is
plugin machinery that happens to be stored as notes, and it would otherwise
dominate any result about the plugin itself.

### The system prompt is a note

Each agent's system prompt is the body of its `AGENT.md`. It is an ordinary
note, editable in Obsidian like anything else, and it ships in three sections:
the base instructions, a `# Current Date` section, and a `# Memory` section
holding the memory instructions. **Deleting a section is how you opt out of
it.** Remove `# Memory` and that agent stops using memory; there is no separate
toggle.

Values that must stay live are written into the note as placeholders and filled
in each time the prompt is assembled: `{{date}}` becomes today's date, and
`{{memoryFolder}}` becomes the current memory folder. Leave them in place.
Changing the Agents folder later never leaves a stale path baked into the note.

The note carries a small frontmatter block the plugin manages (`author` and
`version`). The version records which shipped default your copy started from,
which is how the plugin tells an untouched copy from one you edited.

The shipped default remains available for comparison. When your note differs
from it, the Agent editor's **System prompt** row shows a **Diff with default**
button; the diff view shows what you changed and lets you reset. When a plugin
update moves the default, an untouched note is updated silently, and a
customized one is left alone with a notice rather than a silent overwrite.

## Where the answer comes from

The assembled system prompt is the agent's note with its placeholders filled
in, plus the descriptions of every enabled skill (and a short guard saying no
write tools are enabled, when none is). Skill *bodies* are not included up
front. They're advertised by description and loaded on demand,
so a dozen skills don't cost you a dozen skill-bodies' worth of context on
every turn.
