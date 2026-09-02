---
title: How search works
description: "Hybrid semantic and lexical retrieval with fusion ranking, as implemented in Smart Second Brain."
sidebar:
  order: 2
---

Search runs two retrieval paths concurrently and fuses them:

```
index → retrieve ×2 → aggregate → normalize → fuse → boost → recency → rank
```

Every constant below is read from source. Measurements come from a 300-note
generated corpus with an 18-case graded relevance benchmark.

:::note
Verified against plugin version **2.0.2**. Constants change; if you are on a
much later version, treat the numbers as indicative and the structure as
current.
:::

## 1 · Indexing

### Reading content

`utils/fileFiltering.ts` → `readIndexableContent()`

Every vault file outside the agent folder is indexable. `.chat` files are
gunzipped and deduped by LangChain message id. Binary files (images, PDFs)
return an empty body and are indexed by title alone.

**Why the dedupe matters.** Conversation history is a tree of checkpoints, and
each checkpoint re-contains every prior message. Concatenating them repeated
the same text about 9×: 54 chat files expanded to 12.3M characters (~373
chunks) versus ~45 chunks for all real notes combined.

### Section-aware chunking

`utils/chunkText.ts` → `chunkText()`

Splits on every heading, H1 through H6, regardless of size, not only when the
token budget is exceeded. Each chunk is prefixed with `Note: <title>` plus the
full parent-heading breadcrumb, so an orphaned paragraph still carries its
context. Headings inside fenced code blocks do not split.

The title is deliberately **not** rendered as `# title`: `#` is ordinary note
content, so a body containing `# Appendix` would produce two sibling H1s with
nothing marking which is the document.

**Topic dilution.** An embedding averages everything it is given. A 1234-byte
note covering four cuisines scored `0.200` against a query that its Greek
section answered at `0.492` in isolation. It ranked 286 of 337 and never
surfaced. Adding a single off-topic section roughly halves the first topic's
signal.

### Embedding and storage

`vectorstore/HNSWVectorStore.ts`, in a Web Worker

One vector per chunk. Content budget `8191 tokens × 4 chars`. Graph parameters
`M = 16`, `efConstruction = 100`, `efSearch = 100`.

**`clear()` must delete the persisted graph.** Recreating the in-memory wrapper
left the serialized graph in its own IndexedDB database while `nextHnswId`
reset to 0. Reused numeric ids then collided with resurrected nodes, and
`search()` silently skipped every hit it could not map: 10,161 nodes against
377 mappings, and a 50-result query returning 4.

## 2 · Retrieval

Both paths run concurrently via `Promise.all`. Either may legitimately return
nothing: a keyword absent from the vault yields no lexical hits, and an
unconfigured provider yields no semantic hits.

### Semantic path

`vectorstore/VectorStoreService.ts` → `semanticSearch()`

Embeds the query, searches HNSW, applies path and tag filters at *chunk* level,
then aggregates to notes. Over-fetch is `10 × topK`.

The over-fetch factor is load-bearing rather than cosmetic: a note's supporting
chunks only contribute to its score if they were actually retrieved, so
under-fetching silently degrades aggregation back into first-hit-wins.

### Chunk to note aggregation

`vectorstore/chunkAggregation.ts`

```
score = best × (1 + 0.15 × s / (s + 3))
```

`s` is the summed strength of the supporting chunks, each measured *relative to
the note's own best chunk*. Three properties follow: the best chunk sets the
scale, total lift converges to 15% and can never exceed it, and two sections
that nearly match the best outweigh twenty that barely register.

**The previous form diverged.** Summing `1/(i+1)` is a harmonic series, so
support grew without bound in chunk count: +19% at 5 chunks, +39% at 20, +63%
at 100. A real 33-chunk note was inflated from a 0.662 best chunk to `0.909`,
and a long note scoring 0.55 per chunk beat a short note scoring 0.72.

### Lexical path

`vectorstore/MiniSearchService.ts`, BM25

Two passes are scored separately and merged by max: **identity** fields (title,
aliases, tags, path segments) and **content**.

| Field | Boost |
| --- | --- |
| `title` | 2.0 |
| `aliases` | 1.8 |
| `tags` | 1.5 |
| `pathSegments` | 1.2 |
| `content` | 1.0 |

Fuzzy distance `0.2`. Separating identity from content is what lets a title
match outrank a note that merely mentions the term many times.

## 3 · Fusion ranking

The governing rule: every signal is normalized **within the current result
set**. No constant is ever compared against a raw BM25 magnitude or a raw
cosine, and there are no hard rank cutoffs, so behaviour keeps its shape
across vault sizes and embedding models.

### Per-source normalization

Floor share `0.15`. Each source is mapped onto 0–1 with the floor pulled toward
zero rather than to the minimum.

Both extremes fail. Full min-max stretches *any* spread to fill the range, so
on a small set a 10-vs-9 near-tie becomes 1.0-vs-0.0 and the tail becomes
unliftable by any proportional term. Divide-by-max collapses narrow cosine
bands (0.40–0.55) into a useless cluster near 1.0.

### Weighted blend

```
0.7 × (0.6 · semantic + 0.4 · lexical) + 0.3 × RRF
```

Normalized score carries the relevance signal. RRF (`k = 60`) is retained only
as a stability term for when one source's magnitudes are degenerate, for
example every BM25 hit tied. Semantic leads because it is the only source that
can bridge a vocabulary gap; lexical remains the sole signal for exact terms.

### Identity boosts

Title `0.18` and alias `0.17`, as fractions of the fused 0–1 score (`0.30` each
when only semantic results exist).

Applied to lexical-only queries too. These previously required a semantic
source, which left an exact alias match on a keyword query with no credit at
all and forced an oversized recency bonus to compensate.

## 4 · Recency

A note's recency boost decays by open order (`4.5` down to a floor of `0.5`,
decay `0.75`) over the last 20 opened notes. It then passes three independent
guards. Each exists because a specific measured case failed without it.

| Guard | Value | Rationale |
| --- | --- | --- |
| eligibility | ≥ 0.80 | Ratio of this note's raw source score to the best result's. Replaced a hard top-10 *rank* cutoff, under which a strong match at rank 11 was gated while a weak one at rank 10 was not. Measured on raw scores rather than normalized ones, because normalization deliberately stretches small sets and would split genuine near-ties. |
| lift cap | 2 × typical gap | Adaptive, not fixed. The ceiling is twice the median gap between adjacent results in this query's own set, clamped to 0.02–0.30. |
| crowding | 1 / n² | Where `n` counts eligible results that are also recent. When everything is recent, recency identifies nothing, and each rival both dilutes the signal and raises the cost of acting on it. |

**The cap and the crowding term solve different problems.** The cap asks *how
far behind is this note, relative to how tightly this set is packed*, which is
why it must adapt rather than be a fixed percentage. Adjacent results sit ~1%
apart in a dense semantic set but ~10% apart in a sparse lexical one, so the
same 12% deficit is a chasm in one and a near-tie in the other. The crowding
term asks *how many notes have the same claim*. Neither substitutes for the
other: without crowding, three recently-opened siblings pushed the correct
answer from rank 1 to rank 4 even though each sat within a normal adjacent gap
of it.

**Dead end worth recording.** Scaling the cap to the gap *to the leader* looks
equivalent but cannot work: it is monotonic in relative relevance, while the
required outcomes are not. A distractor at 0.8747 must lose while a genuine
near-tie at 0.8844 must win: 1.1 points apart, opposite verdicts. Set spread
is the signal that separates them.

Notes that fail the gate keep their **recent** badge but receive no score
change. The signal stays visible without distorting the ranking.

## 5 · Measured behaviour

| Dimension | Status | Evidence |
| --- | --- | --- |
| set size | stable | Identical relative structure at n = 5, 25, 100, 500, 2000 keeps the target at rank 1; top-to-second margin drifts only 4.88% → 4.25% across a 400× range. |
| cosine band | stable | Ordering preserved from wide (0.9 / 0.5 / 0.3) to very narrow (0.42 / 0.418 / 0.416). |
| note length | bounded | A 0.75-scoring long note can never beat a 0.90-scoring short one; it asymptotes at 0.8625 regardless of chunk count. |
| embedding model | stable | qwen3-8b 0.9966, harrier-oss-0.6b 0.9934. A fixed lift cap fitted to qwen's separation scored only 0.9729 on harrier; making the cap adapt to result-set spread recovered it. |
| latency | local-bound | About 97% of query time is the embedding call. Local MLX ~28 ms versus remote ~1626 ms; ANN search ~47 ms and lexical ~6 ms are effectively free. |

### Benchmark

`bun run test:benchmark`, 18 graded cases over a deterministic 300-note
corpus, scored by nDCG@10 and MRR. Queries deliberately avoid each target
note's own wording, so term overlap alone cannot find them. Cases cover
near-synonym bridging, lexical distractors, zero-overlap retrieval, very short
and multi-chunk targets, alias matches, multi-target queries, near-duplicate
discrimination, recency conflicts, and length bias.

The suite ratchets: it fails if the mean drops below the recorded baseline, and
prints the new value when it improves.

**Length-bias probes come in pairs:** one case where the many-chunk note is
*wrong*, one where it is genuinely right. Without the first, chunk-count
inflation is invisible, since in every earlier case the many-chunk note also
happened to be correct. Without the second, a fix can over-correct into a
blanket penalty on long notes.

## Source

`utils/chunkText.ts` · `utils/fileFiltering.ts` ·
`vectorstore/VectorStoreService.ts` · `vectorstore/chunkAggregation.ts` ·
`vectorstore/HNSWVectorStore.ts` · `vectorstore/MiniSearchService.ts` ·
`search/finalSearchRanking.ts` · `search/recentNotes.ts`
