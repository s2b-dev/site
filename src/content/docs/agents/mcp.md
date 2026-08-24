---
title: MCP servers
description: Connect external tools and data sources via MCP.
sidebar:
  order: 5
---

[MCP](https://modelcontextprotocol.io/) — the Model Context Protocol — is an
open standard for exposing tools to a language model. Point Smart Second Brain
at an MCP server and its tools appear alongside the agent's built-in ones.

This is how the agent reaches things that aren't in your vault: an issue
tracker, a database, a calendar, a local filesystem outside the vault.

## Per agent, not global

MCP servers are configured **per agent**, in the Agent editor. A research agent
can carry a web-heavy server set while your everyday note agent carries none.

## Adding a server

Two transports are supported.

### HTTP

Streamable HTTP, and the recommended transport for anything remote. Works on
**desktop and mobile**.

| Field | Example |
| --- | --- |
| **Name** | `My MCP Server` |
| **Server URL** | `https://mcp.example.com/mcp` |
| **Headers** | `Authorization: Bearer token`, one per line |

### stdio

Launches a local process and talks to it over stdin/stdout.

| Field | Example |
| --- | --- |
| **Command** | `npx` |
| **Arguments** | `-y @anthropic/mcp-server-filesystem /path/to/dir` |
| **Environment variables** | `API_KEY=your-key`, one per line in `KEY=VALUE` format |

:::caution[Desktop only]
stdio requires Node APIs that Obsidian's mobile WebView doesn't have. On
mobile, stdio servers are **skipped** — the agent starts with its remaining
tools rather than failing. If you need the same tools on both, use HTTP.
:::

## When tools are loaded

The handshake happens on the agent's first run and its tools are cached for
that agent. Concurrent runs share one in-flight handshake rather than each
opening their own.

If the handshake fails, the failure is **not** cached — the plugin retries on
the next run rather than leaving the agent toolless for the whole session. The
error is logged; check the developer console if a server's tools never appear.

Editing an agent's server list clears its cache, so changes take effect on the
next run without a restart.

## Privacy

:::caution
An MCP server is an external service, and the agent decides what to pass it.
Whatever the agent sends as tool arguments leaves your machine — including note
content, if the task involves note content.

The [privacy model](/privacy/model/) governs which notes the *provider* may
see. It does not constrain what a third-party MCP server does with what it
receives. Add servers you trust, and prefer scoping them narrowly.
:::

## Choosing between MCP and a skill

They solve different problems, and the answer is usually a skill.

Reach for a **skill** when the capability already exists in the vault or in
another Obsidian plugin — it's a file, it's version-controlled with your notes,
and it costs nothing at rest.

Reach for **MCP** when the capability lives in a genuinely external system that
needs credentials, a network connection, or a running process.
