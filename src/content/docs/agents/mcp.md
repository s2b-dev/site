---
title: MCP servers
description: Connect external tools and data sources via MCP.
sidebar:
  order: 5
---

[MCP](https://modelcontextprotocol.io/), the Model Context Protocol, is an
open standard for exposing tools to a language model. Point Smart Second Brain
at an MCP server and its tools appear alongside the agent's built-in ones.

This is how the agent reaches things that aren't in your vault: an issue
tracker, a database, a calendar, a service running on your own machine.

## Per agent, not global

MCP servers are configured **per agent**, in the Agent editor. A research agent
can carry a web-heavy server set while your everyday note agent carries none.

## Adding a server

Servers are reached over **HTTP** (Streamable HTTP, falling back to SSE for
older servers). The same configuration works on **desktop and mobile**.

| Field | Example |
| --- | --- |
| **Name** | `My MCP Server` |
| **Server URL** | `https://mcp.example.com/mcp` |
| **Headers** | `Authorization: Bearer token`, one per line |

Pasting a server's published JSON config (the `mcpServers` block from its
README, or a VS Code `servers` entry) into any field fills the form for you.
**Test connection** lists the tools the server offers before you save.

:::note[No local command (stdio) servers]
Smart Second Brain does not launch processes, so servers that only speak stdio
(`"command": "npx", "args": [...]`) cannot be added; pasting such a config is
refused with a message. To use one, run it behind a small HTTP bridge such as
[`mcp-proxy`](https://github.com/sparfenyuk/mcp-proxy) or
[`supergateway`](https://github.com/supercorp-ai/supergateway) and point the
plugin at the bridge's URL. Anything the bridge exposes then works on mobile
too.
:::

## When tools are loaded

The handshake happens on the agent's first run and its tools are cached for
that agent. Concurrent runs share one in-flight handshake rather than each
opening their own.

If the handshake fails, the failure is **not** cached. The plugin retries on
the next run rather than leaving the agent toolless for the whole session. The
error is logged. Check the developer console if a server's tools never appear.

Editing an agent's server list clears its cache, so changes take effect on the
next run without a restart.

## Privacy

:::caution
An MCP server is an external service, and the agent decides what to pass it.
Whatever the agent sends as tool arguments leaves your machine, including note
content, if the task involves note content.

The [privacy model](/privacy/model/) governs which notes the *provider* may
see. It does not constrain what a third-party MCP server does with what it
receives. Add servers you trust, and prefer scoping them narrowly.
:::

## Choosing between MCP and a skill

They solve different problems, and the answer is usually a skill.

Reach for a **skill** when the capability already exists in the vault or in
another Obsidian plugin. It's a file, it's version-controlled with your notes,
and it costs nothing at rest.

Reach for **MCP** when the capability lives in a genuinely external system that
needs credentials, a network connection, or a running service.
