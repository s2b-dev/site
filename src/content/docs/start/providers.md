---
title: Connecting a provider
description: Set up OpenAI, Anthropic, Ollama, OpenRouter, or any OpenAI-compatible endpoint.
sidebar:
  order: 3
---

A provider supplies the models the agent runs on. Smart Second Brain is
provider-agnostic — you bring your own, and you can configure several at once
and switch between them per chat.

Add one under **Settings → Smart Second Brain → Providers → Add provider**.

## Supported providers

| Provider | Runs locally | Notes |
| --- | --- | --- |
| **Ollama** | Yes | Fully local. Nothing leaves your machine. |
| **oMLX** | Yes | Local inference on Apple Silicon. |
| **OpenAI** | No | Also covers OpenAI Codex sign-in. |
| **Anthropic** | No | Claude models. |
| **OpenRouter** | No | Routes to many vendors behind one key. |
| **OpenAI-compatible** | Depends | Any endpoint speaking the OpenAI API. |

You can create **multiple instances of the same provider type** with distinct
display names and endpoints — useful for separating a work key from a personal
one, or pointing at two different self-hosted endpoints.

## Local setup with Ollama

1. Install [Ollama](https://ollama.com/) and start it.
2. Pull a chat model and an embedding model:

```bash
ollama pull llama3.1 && ollama pull mxbai-embed-large
```

3. In plugin settings, add an **Ollama** provider. The default base URL is
   `http://localhost:11434`.

Local providers are treated as **trusted** by default, since no data leaves the
machine.

## Cloud setup

Add the provider, paste your API key, and select a model. Keys are held in
Obsidian's secret storage — the plugin's config file stores only a reference,
never the raw key.

Cloud providers are **untrusted by default**, which means they are blocked from
reading, embedding, or receiving any note you've marked private. See the
[Privacy model](/privacy/model/).

## Choosing a model

Use the most capable model your provider offers — agent quality depends heavily
on reasoning and tool-use ability. Frontier cloud models give the best results.
For a fully local setup, pair a capable Ollama chat model with a strong
embedding model.

:::tip
Vision and PDF support is detected per model at runtime, so a model that
supports images will accept them without extra configuration.
:::
