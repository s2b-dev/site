---
title: FAQ
description: Frequently asked questions.
sidebar:
  order: 2
---

Don't see your question? Ask in the
[Q&A](https://github.com/s2b-dev/smart-second-brain/discussions/categories/q-a).

## Are any queries sent to the cloud?

Only if you choose a cloud AI provider **and** the notes involved are not
marked private. Search and the graph run entirely locally. With a local
provider such as Ollama, everything stays on your machine.

Even with a cloud provider configured, you can mark notes or folders private.
Those are blocked from being read, embedded, or sent to any untrusted provider.
See the [privacy model](/privacy/model/).

## What are the limitations?

Worth knowing before you start:

- **Quality depends on the model.** Models vary in reasoning, tool use, and
  embedding quality, so results differ between them.
- **Quality depends on your vault.** Answers improve when notes are
  well-structured and each covers a coherent topic. Notes mixing many unrelated
  subjects retrieve poorly.
- **The assistant can be wrong.** If relevant notes don't exist, or the model
  misreads them, you'll get an unsatisfying answer. Rephrasing the query or
  describing the context in more detail usually helps.

## What models do you recommend?

Use the most capable model your provider offers. Agent quality depends heavily
on reasoning and tool-use ability. For a fully local setup, pair a capable
Ollama chat model with a strong embedding model such as `mxbai-embed-large`.

## Does it work with non-English vaults?

Yes. Response quality varies with the model and the language it reasons in, and
strong multilingual embedding models give the best retrieval results. More UI
translations are on the way.

## What's next?

What's planned, in progress and done is tracked on the public
[project board](https://github.com/orgs/s2b-dev/projects/10/views/1).
