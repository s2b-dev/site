---
title: Troubleshooting
description: Common problems and how to resolve them.
sidebar:
  order: 1
---

Most problems fall into one of four buckets: the provider can't be reached, the
index isn't what you think it is, the agent lacks a tool, or a note is being
filtered for privacy. This page walks each one.

## Start here

**Settings → Smart Second Brain → Troubleshooting** has two things worth
knowing about:

- **Developer Console logging.** Turn this on to get verbose `[S2B]` output in
  the developer console (`Ctrl`/`Cmd` + `Shift` + `I`). Almost every diagnosis
  below starts here.
- **Cleanup Plugin Data.** Deletes plugin settings and generated index data.
  Your secrets, skill files, and chat files inside the vault are **kept**. This
  is the "start clean without losing my work" button.

## The agent won't respond

### No model configured

The agent needs a chat model. Search and the graph don't, so if those work and
chat doesn't, this is almost always why. See
[Connecting a provider](/start/providers/).

### Authentication failures

An invalid or expired key surfaces as an auth error naming the provider. Re-add
the key in the provider's settings. Keys live in Obsidian's secret storage, so
re-pasting is the fix. Editing the config file won't help, since it only holds
a reference.

Also check the account itself: a valid key with no credit produces an auth-class
error, not a billing message.

### Rate limits

Chats run in parallel, so several at once against the same cloud account can
trip your provider's rate limit, as can a large embedding run competing with
an active chat.

Stagger the chats, or split the work across two providers: a local model for
routine questions and a cloud model for the heavy one. The status bar shows a
chip per running chat, which is the quickest way to see how many are actually
in flight.

### Connection failures

An endpoint error means the request never got a usable response. For Ollama and
oMLX, confirm the server is actually running and the base URL matches
(`http://localhost:11434` is Ollama's default).

Every request through the plugin has a **60-second ceiling**. Past that it fails
rather than hanging. An unreachable host used to leave indexing frozen with
Cancel unable to stop it. If you see timeouts against a remote endpoint, the
endpoint is accepting connections but not answering.

Note that provider SDKs retry internally with backoff, so a dead host can take
several multiples of 60 seconds before the error reaches you.

### Model not found

The model id no longer exists at that provider, or was never available on your
account. Re-select it from the model list rather than typing it.

### Streaming problems

Some endpoints, proxies especially, accept a streaming request and then fail
before responding. The plugin detects this and downgrades that provider to
buffered mode, so replies arrive all at once instead of token by token. If
responses appear complete but never stream, this is usually why.

## Search returns nothing useful

### Semantic search isn't running

Semantic retrieval needs an embedding model. Without one, only the lexical path
runs, which is fine, but it matches words rather than meaning.

If the agent reports that semantic search is unavailable, that is authoritative
and won't change mid-conversation. Configure an embedding model under
**Settings → Smart Second Brain → Embedding model**.

### The index is incomplete

The first build runs in the background with progress in the status bar; large
vaults take a few minutes. After that it is incremental.

The **indexing report** tells you what was skipped and why:

| Reason | Meaning |
| --- | --- |
| `excluded` | Not an indexable file type |
| `privacy` | Private note, untrusted provider (see below) |
| `too-large` | Exceeded the content budget |
| `not-indexed` | Not yet processed |
| `read-error` | The file couldn't be read |
| `embed-error` | The provider failed to embed it |

A wave of `embed-error` entries points at the provider, not the vault.

### Notes are missing on purpose

The agent folder (`Agents/` by default) is excluded from indexing, search, and
the graph. So are binary files' contents: images and PDFs are indexed by
**title only**.

### The results are just weak

Long notes covering several topics retrieve badly, because an embedding
averages everything it's given. A note covering four subjects scores roughly
half as well on any one of them as a focused note would. Splitting on headings
helps; the plugin chunks by heading for exactly this reason.

## The agent can't do something

### The tool isn't attached

A built-in tool is bound only when an **enabled skill** attaches it via
`allowed-tools`. If the agent says it can't search or can't write notes, check
that the relevant core skill (`explore-vault`, `manage-notes`, `web`) is enabled
for that agent.

### A tool override vetoed it

Even with a skill attaching it, the agent-level **Tools** modal can veto a tool.
Open the Agent editor → General → Tools and check the switch.

### Memory isn't working

Memory has no toggle. An agent uses it as long as the `# Memory` section is
still in its `AGENT.md`; if it never reads memory, open that note from the Agent
editor's **System prompt** row and check the section is there.

If it reads memories but never records any, it lacks `manage_notes`: enable the
`manage-notes` core skill for that agent and check the Tools modal hasn't vetoed
the tool. See [Memory](/agents/memory/).

### It says it edited a note, but nothing changed

It didn't edit anything. Note writes are **staged for review**: they appear as
an inline diff and apply only when you accept them. Use **Next pending change**
and **Previous pending change** from the command palette to step through the
queue.

The agent is instructed never to claim a change was applied, but models do
sometimes say it anyway.

## A note is being withheld

If a read returns "private" or a note never appears in results, the privacy
filter is blocking it for an untrusted provider.

Check two things in order:

1. **Is the note actually private?** The two vault modes invert the test. In
   *private by default*, a note is private unless listed. In *public by
   default*, it's private only if listed.
2. **Is the provider trusted?** Only Ollama and oMLX default to trusted.
   Everything else, including a custom endpoint on your own hardware,
   defaults to untrusted until you say otherwise.

See [Trusted providers](/privacy/trusted-providers/).

## MCP tools don't appear

**stdio servers do nothing on mobile.** The transport needs Node APIs the
mobile WebView lacks, so they're skipped and the agent starts with its
remaining tools. Use HTTP transport if you need the same tools on both
platforms.

Otherwise, the handshake failed. Turn on verbose logging and look for the MCP
initialization lines. Failed handshakes aren't cached, so the retry happens on
the next run. You don't need to restart Obsidian.

## Mobile

**A BRAT update didn't take effect.** Fully quit and reopen Obsidian. A plain
reload keeps the cached plugin code.

**Things are slower.** Embedding and graph work are genuinely heavier on a
phone. Consider indexing on desktop against a synced vault.

## Nothing above helped

Turn on **Developer Console logging**, reproduce the problem, and check the
console for `[S2B]` lines.

Then search the
[existing issues](https://github.com/s2b-dev/smart-second-brain/issues) before
opening a new one. If you do open one, include what you tried, any error
messages, and the steps to reproduce. Both buttons are in the Troubleshooting
settings tab.
