---
title: Memory
description: Working memory stored as real notes in your vault.
sidebar:
  order: 5
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

## How the agent finds them

The agent doesn't have to go looking. The `# Memory` section of its prompt ends
with an **index** of the folder, rebuilt every time the prompt is assembled: one
line per note, with the note's path and a one-line summary. When a question
could depend on remembered context, the agent reads the notes whose line fits,
silently, before answering.

The summary comes from a `description` property in the note's frontmatter.
Notes the agent writes get one; add one to notes you write yourself, and keep
the value quoted so a `#` or a `: ` inside it isn't read as YAML syntax:

```markdown
---
description: "Where work is tracked: the #work tag and the [[Projects]] note"
---
```

A note without a description is listed by its first heading, or failing that
its filename.

### Always-loaded notes

A note with `always: true` in its frontmatter is included in full, not just
listed. That is for the few facts every conversation needs: who you are, how
you like answers. The plugin seeds one such note, `Agents/Memories/User.md`,
the first time the folder is empty. It is a default, not a rule: rename it,
rewrite it, or delete it and nothing breaks. The plugin only knows the two
properties.

Both parts are bounded so memory can never crowd out the conversation:

| Part | Budget |
| --- | --- |
| Always-loaded note bodies, combined | 3000 characters |
| The list, all lines combined | 4000 characters |
| One line of the list | 160 characters |

Past the budget an always-loaded note is cut short with a marker, and the list
ends with a count of notes not shown, which the agent can still reach with
`list_directory`. Notes themselves have no limit; a long note costs one line
until the agent opens it.

The whole block is fenced and labelled as recorded facts rather than
instructions, so a note that happens to read like a command is treated as a
note.

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

## Memory or skill?

Memory is not the only place the agent can keep what it learns. The
instructions draw one line, keyed on who acts:

- **How you work** goes to memory: who you are, what you prefer, where things
  live in your vault. It is written as plain facts ("User prefers short
  answers"), never as instructions to itself, because an instruction re-read in
  a later conversation could override what you are asking for then.
- **How the agent should do a kind of task** goes into the
  [skill](/agents/skills/#the-agent-can-write-skills) it used for that task:
  the steps that worked, the pitfalls, and your corrections. Those load only
  when that kind of task comes up again.

Nothing that only mattered in one conversation is written anywhere. Before it
finishes a task, the agent is told to ask itself whether it learned something
worth keeping, route it to one of those two places, and otherwise save nothing.

## Review after busy turns

An agent in the middle of a long task tends to answer and move on, so the
end-of-task check above is easy to skip. **Review after busy turns**, in the
Agent editor's **Self-improvement** section, runs that check as a separate,
short side run once the conversation has done enough work.

It is **off by default**: each review is one extra model call over the
conversation. Switched on, it works like this:

- Every turn's tool calls are counted, and the count is kept with the chat,
  so it survives closing Obsidian and disappears with the chat. Loading a skill
  does not count; reading guidance is preparation, not work.
- When the count since the last review reaches **5**, the review runs right
  after the answer is on screen. It reads the conversation as a transcript,
  decides whether anything in it is worth keeping, and puts it where the
  routing above says: a fact about you into a memory note, a lesson about the
  task into the skill that was used. It sees the same memory index and skill
  list the agent does, so it can check before duplicating something.
- A notice tells you what it saved, for example *S2B Agent learned: revised
  skill weekly-review; saved memory User*. Most reviews save nothing, and
  then there is no notice.
- A turn in which the agent revised a skill itself resets the count without
  a review: the work the review exists to prompt has already been done.

The review can only write in two places. Memory notes go through a writer that
cannot address anything outside `Agents/Memories/`; it adds to an existing note
rather than replacing it, so two reviews finishing at once cannot lose each
other's facts. Skill changes go through the same `manage_skills` tool the agent
has, minus deletion: a reviewer can create or revise a skill, never remove
one. Nothing else in your vault is reachable from a review.

**Review model** picks which model runs it. The default is the agent's own chat
model, but a cheaper one is fine: the review reads a transcript and writes
short notes. **Also on mobile** is off by default, because a side model call
on a phone spends battery and data on work you are not watching.

Nothing is scheduled. If Obsidian closes before a review runs, it does not run,
and the same conversation trips the count again next time.

## Customizing

The `# Memory` section is part of a note. If the agent records too much, tell
it to record less. If you want it to keep a specific kind of note, say so
there. Two placeholders live in the section and are filled in each time the
prompt is assembled: `{{memoryFolder}}` at the top becomes the folder path from
the Agents folder setting, and `{{memoryIndex}}` at the end becomes the index
described above. Leave both as they are.

The shipped default remains available as a diff (**Diff with default** in the
Agent editor, shown once your note differs), so you can see what you've changed
and reset if an edit doesn't work out.

## Excluded from search

Like the rest of `Agents/`, the memory folder is excluded from indexing,
search, and the graph. Memories don't pollute your search results, and the
agent reaches them through the index in its prompt and by reading the folder
directly.
