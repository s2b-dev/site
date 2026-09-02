---
title: Privacy model
description: How Smart Second Brain decides what a provider is allowed to see.
sidebar:
  order: 1
---

The plugin's guiding rule: **a provider only sees what you let it see.** Search
and the graph run entirely on your machine. The only component that can send
note content anywhere is the agent, and only when you've configured a cloud
provider.

## Two vault modes

Set this under **Settings → Smart Second Brain → Privacy**.

**Private by default.** Nothing is exposed unless you explicitly allow it. Only
notes you mark as allowed can be read, embedded, or sent to an untrusted
provider. This is the strict choice, good for vaults containing journals,
client work, or health notes.

**Public by default.** Everything is available except what you explicitly
exclude. Convenient for vaults that are mostly reference material.

Either way, the decision is per note or per folder, and you can change it at
any time.

## Trusted and untrusted providers

Every provider is marked trusted or untrusted:

- **Local providers** (Ollama, oMLX) default to **trusted**, since the data
  never leaves your machine.
- **Cloud providers** default to **untrusted**. They are blocked from private
  notes even if the agent tries to reach one.

The block is enforced in the plugin, not left to the model's discretion. An
untrusted provider cannot read, embed, or be sent a private note.

## Staged edits

The agent can create and modify notes, but never writes directly. Changes are
staged in a review queue and shown as an inline diff. Nothing touches disk
until you accept it.

## What leaves your machine

| Feature | Sends data out |
| --- | --- |
| Search (lexical) | Never |
| Smart Graph | Never |
| Embeddings via Ollama/oMLX | Never |
| Embeddings via a cloud provider | Yes, for non-private notes |
| Agent chat via a local model | Never |
| Agent chat via a cloud provider | Yes, for non-private notes |

:::caution
The privacy filter is applied when notes are **indexed and read**. Note
filenames are content too. A title alone can be revealing, so prefer marking
the whole folder private rather than relying on file-level exclusions in
sensitive areas.
:::
