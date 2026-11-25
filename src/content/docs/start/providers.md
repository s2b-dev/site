---
title: Connecting a provider
description: Set up OpenAI, Anthropic, Google Gemini, Mistral, Ollama, LM Studio, OpenRouter, Hugging Face, or any OpenAI-compatible endpoint.
sidebar:
  order: 3
---

A provider supplies the models the agent runs on. Smart Second Brain is
provider-agnostic: you bring your own, and you can configure several at once
and switch between them per chat.

Add one under **Settings → Smart Second Brain → General → Providers → Add
provider**.

## Supported providers

| Provider | Runs locally | Notes |
| --- | --- | --- |
| **Ollama** | Yes | Fully local. Nothing leaves your machine. |
| **oMLX** | Yes | Local inference on Apple Silicon. |
| **LM Studio** | Yes | Local models through LM Studio's server. |
| **OpenAI** | No | API key, or ChatGPT sign-in. |
| **Anthropic** | No | Claude models. |
| **Google Gemini** | No | Gemini chat and embedding models. API key from Google AI Studio. |
| **Mistral** | No | Mistral's own chat and embedding models, served from the EU. |
| **OpenRouter** | No | Routes to many vendors behind one key. |
| **Hugging Face** | No | Open models from Hugging Face's inference providers. Hugging Face sign-in, or an access token. Chat models only. |
| **Custom** (OpenAI-compatible) | Depends | Any endpoint speaking the OpenAI API. |

### More providers

Many more services speak the OpenAI API: DeepSeek, Groq, Fireworks, Moonshot,
Z.ai and a few hundred others. Rather than a template each, **Add provider →
More providers** lists them, from the public [models.dev](https://models.dev)
directory. Search for one and pick it. You get a **Custom** provider with the
service's name, logo and API address already filled in, plus a link to where
you get its key. Paste the key and you're connected. Like every Custom
provider, it starts out untrusted.

The list is bundled with the plugin and refreshed with each release, so
nothing is fetched from models.dev while you use it. Smart Second Brain hasn't
tested these services one by one. If a service isn't listed, add it as a
Custom provider yourself.

You can create **multiple instances of the same provider type** with distinct
display names and endpoints, useful for separating a work key from a personal
one, or pointing at two different self-hosted endpoints.

## Local setup with Ollama

1. Install [Ollama](https://ollama.com/) and start it.
2. Pull a chat model and an embedding model:

```bash
ollama pull llama3.1 && ollama pull qwen3-embedding:0.6b
```

3. In plugin settings, add an **Ollama** provider. The default base URL is
   `http://localhost:11434`.

Local providers are treated as **trusted** by default, since no data leaves the
machine.

## Local setup with LM Studio

1. Install [LM Studio](https://lmstudio.ai/) and download a chat model, plus an
   embedding model if you want semantic search.
2. Open LM Studio's **Developer** tab and switch the server on.
3. In plugin settings, add an **LM Studio** provider. The default server URL is
   `http://localhost:1234`. Leave the API key empty unless you turned on
   authentication in LM Studio.

The plugin reads LM Studio's model list to tell chat models from embedding
models, and sizes a model's context window to the length LM Studio actually
loaded it with.

### Other local engines

A llama.cpp server, or anything else that speaks the OpenAI API, works through
the **Custom** provider (the OpenAI-compatible template). Set the base URL to
the server's API root, such as `http://localhost:8080/v1`. The plugin uses
the address exactly as you enter it, and only adds `/v1` when you give a bare
host like `http://localhost:8080`. The API key can usually be left empty.

A Custom provider starts **untrusted**, because the plugin cannot tell a
local endpoint from a remote one. If you want it to see private notes, mark it
trusted in the provider's settings. See
[Trusted providers](/privacy/trusted-providers/).

## Cloud setup

Add the provider, paste your API key, and select a model. Keys are held in
Obsidian's secret storage. The plugin's config file stores only a reference,
never the raw key.

OpenAI and Hugging Face also offer a sign-in button instead of a key: click it,
approve access in your browser, and you're connected. Hugging Face's sign-in
works on mobile too.

Cloud providers are **untrusted by default**, which means they are blocked from
reading, embedding, or receiving any note you've marked private. See the
[Privacy model](/privacy/model/).

## Choosing a model

Use the most capable model your provider offers. Agent quality depends heavily
on reasoning and tool-use ability. Frontier cloud models give the best results.
For a fully local setup, pair a capable Ollama chat model with a strong
embedding model.

Model names move faster than this page does. For a current comparison,
[Artificial Analysis](https://artificialanalysis.ai/) ranks chat models on
quality against price and covers open-weights models alongside hosted ones.
Weight its agentic and tool-use benchmarks over the headline intelligence
score — the agent spends most of its time calling tools, and a strong reasoner
that calls them unreliably is the worse choice here.

For **embedding**, `qwen3-embedding` is a good default. It is multilingual, and
it is available on Ollama, oMLX, LM Studio and OpenRouter, so the same choice follows you
between a local and a hosted setup. Sizes go 0.6b / 4b / 8b. `0.6b` is the
laptop-friendly one.

To compare alternatives, the [MTEB leaderboard](https://huggingface.co/spaces/mteb/leaderboard)
is the standard reference. Read the **Multilingual** board rather than the
English one unless your vault is English-only, and compare within a size group
— it buckets models at `<500M`, `500M–1B`, `1B–5B` and `>5B`, and the overall
top rows are large hosted models that a local setup can't run. What matters for
retrieval quality is the best model in the size you can actually afford to run.

:::note
Some embedding models expect a search query to be phrased differently from the
text being searched. The plugin handles that automatically for the families
that need it — Qwen3-Embedding, harrier, gte-Qwen2, BGE English and
mxbai — based on the model id. There is no setting, and switching models
needs no reindex. See
[Query instructions](/search/how-it-works/#query-instructions-for-asymmetric-models).
:::

:::tip
Vision and PDF support is detected per model at runtime, so a model that
supports images will accept them without extra configuration.
:::
