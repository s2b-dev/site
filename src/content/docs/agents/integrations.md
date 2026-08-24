---
title: Integrations
description: Let an agent script other Obsidian plugins through their public APIs.
sidebar:
  order: 3
---

An integration lets an agent call another Obsidian plugin's public API. Ask for
your overdue tasks and it can query the Tasks plugin directly, rather than
guessing at the markdown your tasks are written in.

Integrations are enabled **per plugin, per agent**, in the Agent editor's
Integrations section.

## Curated integrations

Four ship with a prewritten skill documenting the plugin's API, so the agent
starts out knowing how to use it:

| Integration | Plugin | Seeded |
| --- | --- | --- |
| **Dataview** | `dataview` | When you enable the integration |
| **Tasks** | `obsidian-tasks-plugin` | When you enable the integration |
| **TaskNotes** | `tasknotes` | When you enable the integration |
| **Obsidian Charts** | `obsidian-charts` | When you enable the integration |

Two more are written against Obsidian's **core** plugins and seed automatically
at startup when the core plugin is enabled:

| Integration | Covers |
| --- | --- |
| **Canvas** | Reading and writing `.canvas` files — nodes, edges, layouts |
| **Bases** | Structured data and database-like views |

Canvas and Bases are skills only. They don't need an `exec_` tool, because
canvas and base files are files — the agent reads and writes them with the
tools it already has.

## Auto-discovery

The curated list isn't exhaustive. **Any enabled plugin that exposes an object
called `api` is discovered at runtime** and offered as an integration.

The plugin probes `.api` first and falls back to `.apiV1` — the Tasks plugin
exposes its surface as `apiV1`, and probing is defensive because either
accessor may be a lazy or throwing getter.

For an auto-discovered plugin there's no prewritten skill, so enabling it
creates an **editable API-scripting skill** instead: the agent introspects the
API before calling it, discovers what's actually there, and works from that.

This is where [`manage_skills`](/agents/skills/) pays off. Once the agent has
worked out how an API really behaves, it can fold the concrete methods and
arguments into that skill, so the next conversation skips the rediscovery.

## The `exec_<plugin>` tool

Enabling an integration binds a tool named after the plugin — `exec_dataview`,
`exec_tasknotes`, and so on. It evaluates JavaScript with the plugin's `api`
object in scope.

Two properties are worth understanding before you turn one on.

:::caution[It bypasses the privacy filter]
`exec_<plugin>` does **not** go through the per-file privacy check. It can read
or write any note regardless of your privacy mode or the provider's trust flag.

This is why enabling an integration shows a confirmation first. If you dismissed
that dialog with "don't ask again", it stays suppressed for *every* integration
from then on.

If you keep genuinely sensitive notes and use a cloud provider, this is the
setting to think hardest about. See
[Trusted providers](/privacy/trusted-providers/).
:::

:::caution[It runs on the main thread]
The code is not sandboxed. It needs access to Obsidian's live `app` object,
which a Web Worker cannot reach — that constraint is the whole reason this tool
exists in the form it does.

There is an execution timeout, but treat it as a courtesy rather than a
control: a tight infinite loop freezes Obsidian's UI, and the timeout never
gets a turn to fire. **The per-plugin approval gate is what actually carries
the risk here.**
:::

## Enabling one

1. Open the Agent editor and find the **Integrations** section.
2. Plugins you have installed appear with their name and description.
   Auto-discovered ones are marked **API scripting**; ones you don't have
   installed are marked **Not enabled**.
3. Toggle it on and confirm the privacy prompt.
4. The skill appears in `Agents/Skills/` as an ordinary note you can edit.

## If an integration doesn't work

**"not enabled or installed"** — the plugin is off. The agent re-resolves the
plugin at call time, so enabling it in Obsidian is enough; no restart needed.

**"does not expose an api object"** — the plugin has no scriptable surface, or
exposes it under a name other than `api`/`apiV1`. Nothing to do but ask the
plugin's author.

**The agent calls the API wrong** — for auto-discovered plugins this is
expected on the first attempt. Let it introspect, and once it gets something
working, ask it to record what it learned in the skill.
