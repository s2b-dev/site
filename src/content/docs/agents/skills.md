---
title: Skills
description: Reusable instruction sets that extend what the agent can do.
sidebar:
  order: 2
---

A skill is a folder in your vault containing a `SKILL.md`: some frontmatter, and
a body of instructions. That is the whole format, and it is not specific to this
plugin — it is [Agent Skills](https://agentskills.io/specification), an open
format originally from Anthropic and now read by a range of agent tools. A skill
you wrote for one of those works here by copying its folder in, and one you write
here travels the other way.

Skills live under `Agents/Skills/<name>/SKILL.md`. They are ordinary notes, so
you can write one in Obsidian without leaving the app.

## Skills bind the agent's tools

Skills are not an add-on layered over the agent's built-in abilities — they are
how the agent gets those abilities. A skill's frontmatter can carry an
`allowed-tools` line, and a built-in tool is bound only when some **enabled**
skill attaches it. Turn off the skill, and the agent loses the tool.

```markdown
---
name: manage-notes
description: Create, update, delete, and move notes. All writes are staged for the user's review...
allowed-tools: manage_notes
---

## Write Operations
- All write operations (create, update, delete, move) are staged for user approval...
```

## Bundled core skills

Four ship with the plugin and are seeded into your vault on first run:

| Skill | Attaches | Covers |
| --- | --- | --- |
| `explore-vault` | `search_notes`, `list_directory`, `read_content`, `grep_notes`, `get_all_tags`, `get_properties`, `execute_javascript` | Finding and reading notes: verify tags and properties before querying, and what to do when a search comes back weak |
| `manage-notes` | `manage_notes` | Creating, editing, deleting and moving notes: the staging policy, and how to replace or withdraw an edit it has already staged |
| `web` | `fetch_url`, `web_search` | Reaching the public internet, vault-first |
| `manage-skills` | `manage_skills` | Authoring and revising skills |

Older vaults had `manage-notes` under the name `edit-notes` and `manage-skills`
under `update-skills`. The plugin renames the folders on update and keeps your
on/off setting for each.

They are ordinary notes once seeded, so edit them freely. If a plugin update
changes a default you had customized, you get a notice rather than a silent
overwrite. Deleting a bundled core skill is refused: it would simply reappear
on the next startup.

## Integration skills

Some skills are written against another Obsidian plugin. The Canvas and Bases
ones cover Obsidian's own core plugins and seed at startup whenever that core
plugin is enabled. The Dataview, Tasks and TaskNotes ones seed when you enable
the integration, which is a deliberate opt-in rather than something that
follows from having the plugin installed.

They are ordinary skills once seeded, but enabling one also grants the agent a
tool that runs code against that plugin, so they're opt-in per plugin. See
[Integrations](/agents/integrations/).

## Loading is lazy

Every enabled skill's **description** is in the system prompt. Its **body** is
not. The agent reads the descriptions, decides a skill is relevant, and pulls
the full instructions in with `load_skill`.

This is what makes a large skill library affordable: twenty skills cost you
twenty one-line descriptions per turn, not twenty full bodies.

Write descriptions accordingly. The description is the only thing the agent
sees when deciding whether to load a skill, so it should say *when* to load it,
not just what the skill is about.

## Tool overrides

Because a tool can be attached by more than one skill, per-tool switches are
**not** per-skill. They live in one agent-level **Tools** modal, reachable from
the Agent editor's General section, which lists every built-in tool flat and
shows which skill(s) attach it.

A tool is bound when an enabled skill attaches it **and** the per-tool override
hasn't vetoed it. The override is the way to keep a skill's guidance while
denying it one specific tool.

## The agent can write skills

With the `manage-skills` skill enabled, the agent can author new skills, revise
skills attached to it, and delete skills it created.

This is how a discovery becomes permanent: once the agent works out how some
API actually behaves, it folds the concrete methods and arguments into a skill
so the next run skips the rediscovery.

Unlike note edits, **skill operations apply immediately**. There is no review
queue. Creating a skill is the same action as attaching it.

:::caution
A skill the agent creates may only request tools from a fixed read-only
allow-list: `search_notes`, `read_content`, `list_directory`, `grep_notes`,
`get_all_tags`, and `get_properties`. Anything else it asks for is silently
dropped.

That list is the guard against an agent granting itself new capability by
writing a skill that requests it. It deliberately excludes note writes, code
execution, network access, and skill authoring itself.
:::

## Writing your own

Create `Agents/Skills/<name>/SKILL.md` with `name` and `description` in the
frontmatter, and your instructions in the body. It's discovered on the next
scan: any directory containing a `SKILL.md` is a skill. There are no reserved
names.

`name` and `description` are the two fields the format requires: `name` must be
lowercase letters, numbers and hyphens (up to 64 characters) and must match the
folder it sits in, and `description` is capped at 1024 characters. The optional
`license`, `compatibility` and `metadata` fields are read and preserved, so a
skill written elsewhere keeps them.

`allowed-tools` is how this plugin grants tools, and it is the one field whose
effect is specific to Smart Second Brain — the format marks it experimental, and
what a tool name means is up to each agent. Skills carrying an `allowed-tools`
line from another tool are still valid here, and the names simply won't match
anything, so they attach nothing.

A user skill with no `allowed-tools` line attaches no tools. It is pure
guidance, which is often exactly what you want. Keep skills narrow and the
instructions concrete, and write down only what you'd actually want the agent
to remember doing again.
