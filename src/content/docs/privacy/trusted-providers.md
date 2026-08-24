---
title: Trusted providers
description: How trust is assigned, and what an untrusted provider cannot do.
sidebar:
  order: 2
---

Every provider you configure carries one flag: **trusted for private data**, or
not. It is the switch that decides whether the notes you marked private are
reachable at all.

The [privacy model](/privacy/model/) covers how notes become private. This page
covers what trust does with that.

## Defaults

| Provider | Default | Why |
| --- | --- | --- |
| **Ollama** | Trusted | Runs locally — nothing leaves the machine |
| **oMLX** | Trusted | Runs locally on your Mac |
| **OpenAI** | Untrusted | Remote |
| **Anthropic** | Untrusted | Remote |
| **OpenRouter** | Untrusted | Remote |
| **OpenAI-compatible** | Untrusted | The endpoint is arbitrary |

The rule is mechanical: the two local templates default to trusted, and
**everything else defaults to untrusted**, including a custom endpoint pointed
at your own hardware. The plugin has no way to know that
`http://192.168.1.40:8000` is a machine in your house, so it assumes it isn't.

If it *is* yours, mark it trusted yourself in the provider's settings.

## What untrusted blocks

For an untrusted provider, a private note is filtered out at every point where
it could otherwise reach the model:

- **`search_notes`** — private results are dropped from the ranking.
- **`read_content`** — refuses to return the content.
- **`grep_notes`** — private notes are not scanned.
- **`list_directory`** — the entry reads as `private` rather than listing.
- **`get_properties`** — frontmatter is withheld.
- **`get_all_tags`** — tags used only by private notes don't appear.
- **`manage_notes`** — private notes are skipped.
- **Embedding** — private notes are not indexed against an untrusted embedding
  provider. They are skipped with a `privacy` reason, not silently dropped.

The check is the same in each case: the file is private **and** the provider is
not trusted. The model is never asked to respect the boundary — it simply never
receives the content.

## Trust is per provider, not per agent

The flag lives on the provider. If two agents use the same untrusted provider,
both are blocked from the same notes. Switching an agent to a trusted local
model gives it access to everything, in that chat, immediately.

This is also why the embedding provider matters independently of the chat
provider. Indexing with a cloud embedding model and chatting with a local one
still sends your non-private notes to the cloud at index time.

## Two ways around the filter

Both are opt-in, and both are worth knowing about.

:::caution[Plugin integrations]
The `exec_<plugin>` tool — enabled per plugin under
[Integrations](/agents/integrations/) — runs code
against another Obsidian plugin's public API. It **bypasses the privacy filter
entirely** and can read or write any note regardless of your privacy settings.

This is why enabling an integration shows a warning before it turns on. If you
suppressed that warning with "don't ask again", it stays suppressed for every
integration.
:::

:::caution[`execute_javascript`]
Arbitrary JavaScript against the vault is not filtered per file either. It is
attached by the `explore-vault` core skill, so it is on by default for agents
using that skill.

If you keep genuinely sensitive notes and use an untrusted provider, disable
`execute_javascript` in the agent's Tools modal. Leaving it on means the
per-file guarantees above have a hole in them.
:::

## Conversation history

Past messages in a conversation can contain content read while a *trusted*
provider was selected. Switching that same chat to an untrusted provider would
send that history along with it, so the plugin checks the history for private
notes and warns you before the switch.

The check looks at attachments and at the file-touching tool calls
(`read_content`, `manage_notes`, `get_properties`) in the conversation.

## Verifying

Two places show you what actually happened rather than what was configured:

- The **indexing report** lists files skipped for privacy, distinctly from
  files excluded for other reasons.
- A blocked read tells the agent the note is private, and that shows in the
  tool output in the chat.

If you expected a note to be blocked and it wasn't, check whether the file is
actually matched by your privacy filter — in **public by default** mode a note
is private only if it is listed, and the two modes invert that test.
