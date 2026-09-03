---
title: How the graph works
description: "Inferred edges, Leiden topic detection, the granularity ladder, and the force layout, as implemented in Smart Second Brain."
sidebar:
  order: 2
---

The graph is built in four stages, each of which can run without the one after
it:

```
edges → topics → hierarchy → layout
```

Every constant below is read from source.

:::note
Verified against plugin version **2.0.2**. Constants change; if you are on a
much later version, treat the numbers as indicative and the structure as
current.
:::

## 1 · Edges

Two kinds of edge reach the graph, and only the first needs a model.

**Authored edges** come from Obsidian's own `resolvedLinks`. Their weight is
the number of links between the two notes.

**Inferred edges** come from a neighbour scan over your embeddings, weighted by
cosine similarity. A pair that already has an authored link is excluded, so an
inferred edge always represents a connection you did *not* write.

### Best chunk, not mean vector

`utils/semanticEdges.ts` → `bestChunkSimilarity()`

Notes are embedded in chunks, and two notes' similarity is the best score
between *any* chunk of one and any chunk of the other, not the distance
between their average vectors.

Averaging would make a note about three subjects match nothing well. Best-chunk
keeps a note discoverable by any one of its sections, which is the same
reasoning behind [chunk-to-note aggregation](/search/how-it-works/#chunk-to-note-aggregation)
in search.

### Union of top-K

Defaults: **K = 5** neighbours per note, **threshold = 0.55** cosine.

The union is denser than K alone suggests, because an edge survives if *either*
endpoint ranks the other. A note that nothing else considers a top-5 neighbour
still gets its own five.

The threshold matters more than K for keeping topics clean. Below roughly 0.55
pairs are noise floor rather than genuine overlap, and noise edges are what
smear topic boundaries.

One subtlety shared by both kernels below: a wiki-linked pair still *occupies*
one of a note's K slots before being dropped at emission. K is a budget of
considered neighbours, not of drawn edges.

### Two kernels

`SEMANTIC_HNSW_MIN_CHUNKS = 2000`

Below 2000 chunks, an exact O(chunks²) pairwise scan: deterministic, and
already sub-second at that size (measured 1–2s at 2k chunks with dim 1024,
growing quadratically). Above it, an HNSW-accelerated approximate search, whose
n·log n build is what lets large vaults get semantic edges at all.

The approximate kernel builds a **transient index over exactly the chunks in
this batch**, never the live vault index. That one contains notes outside the
current graph, whose hits would crowd out on-screen neighbours.

Two patches are applied to the HNSW instance. Level selection is re-seeded,
because the library uses `Math.random` and drifting edges would mean drifting
*topics* between rebuilds. And the similarity function is replaced with a plain
dot product, since chunks are pre-normalized and the library's cosine
re-derives both norms on every comparison.

## 2 · Topics

`utils/computeWorker.ts` → the `leiden` case, via `leiden-ts`

Topics are Leiden communities over the edge set, run in a Web Worker. Edges are
deduplicated first (`leiden-ts` rejects duplicate undirected edges) and
self-loops are collapsed.

The **seed defaults to 42** and is exposed as a setting: the same seed on the
same graph gives the same topics, so a layout you liked is reproducible.

## 3 · The granularity ladder

`utils/topicHierarchy.ts`

Leiden's resolution γ governs how many communities you get. Granularity is the
control that exposes it, and most of this module exists to make that control
behave.

### Why γ isn't shown directly

The useful range is non-linear, since 0.1 → 0.4 reshapes the graph far more than
2.0 → 2.3, and a continuous slider implies precision that doesn't exist. Dozens of
nearby γ values collapse to the identical partition while each one still costs a
Leiden run.

So granularity is a ladder of discrete levels, each a distinct grouping you can
return to.

### The ladder is derived per vault

How many meaningfully different groupings exist depends entirely on a vault's
size and structure. A small uniform vault may support three; a large varied one
reaches the cap of **six**. So the plugin **probes** 14 γ values from 0.1 to
8.0, then picks the rungs.

Probing is cheap relative to its payoff: each result also warms the Leiden
cache, so every granularity step afterwards is instant.

Three rules thin the candidates:

| Rule | Value | Why |
| --- | --- | --- |
| readability cap | 30 topics | Past a few dozen the view stops being readable at any vault size: the colour palette has 24 slots, label pills crowd out, hulls tile the canvas. The finest rungs were "more topics", not "more insight". Waived if it would leave fewer than two rungs. |
| distinctness | 1.3× | Each rung must have at least 1.3× the previous rung's topic count. 22 vs 24 topics is not a different way of seeing the vault, but it cost a slider stop and a Leiden run. |
| fragmentation | 50% singletons | A single note isn't a topic; it's a note that failed to join one. Once most groups are single notes the partition has stopped describing structure. |

Fewer than two usable levels and the derivation returns nothing, falling back to
a static ladder rather than showing a slider that cannot move.

**Rungs must increase in γ *and* in topic count together.** Leiden's topic count
trends upward with γ but is not guaranteed monotonic. It is a stochastic
heuristic, and a higher γ can land on a partition with fewer real topics.
Ordering rungs by count and by resolution independently let those two orderings
disagree, producing a slider that walked backwards: 4 topics at level 2, 3
topics at level 3. A γ that dips is now skipped.

**Probe counts are filtered to nodes the view actually renders.** Leiden runs
over topic edges only, so its map covers just the connected nodes while the
graph shows every node. Counting without that filter produced rungs labelled
with topic counts the view never displayed.

Both of those rules are recent enough that cached ladders from before them
would describe sliders the current build would never produce, so the cache key
includes a rules identity (`v2` plus the constants) that retires stale entries
automatically.

### Two levels at once

`buildTopicHierarchy()`, `COARSE_RESOLUTION_FACTOR = 0.35`

Leiden returns a flat partition, so the hierarchy is built by running it twice:
once at your γ, once at 0.35× that (floored at 0.05 so an already-low γ doesn't
collapse to a single blob).

Each fine topic is then assigned to the coarse topic holding the **plurality**
of its notes; ties break on the lower parent id, so the result is deterministic.
Nodes the coarse run left unassigned don't vote, and a child whose members are
entirely unassigned at the coarse level is dropped, having nothing to roll up
into.

That plurality vote is what guarantees every note rolls up somewhere, which is
what lets you ask "what is this vault about?" at more than one altitude and get
consistent answers.

## 4 · Layout

`utils/graphLayout.ts`, d3-force

The force assembly is extracted from the canvas so identical physics can run
headlessly: the layout benchmark measures the same forces you see, not a
reimplementation that could drift.

Five forces are exposed as sliders (link distance, repulsion, centering, link
strength, cluster cohesion). What follows is what happens to those values
before they reach the simulation.

### Centering is a spring, not a recentring

The graph uses `forceX` + `forceY` toward the origin, **not** `forceCenter`.
`forceCenter` shifts the centroid; a spring toward origin actually pulls. This
matches Obsidian's own graph.

Unlinked nodes get **exactly twice** the centering of clustered ones. Centering
is the sole inward force a satellite feels, so at equal strength it settles well
outside the linked structure. A ratio behaves at every density where an absolute
boost did not. That out-pulled deeply-relaxed sparse graphs about 6× and
dragged satellites inside the topic ring.

### Cohesion is damped by cluster size

`COHESION_REFERENCE_MEMBERS = 40`, floor `0.55`

Cohesion pull is proportional to a node's distance from its cluster centroid,
and that distance grows with √members, so at one shared strength a 900-member
cluster compresses its rim about five times harder than a 40-member one.
√-damping cancels the geometric growth. The floor keeps huge clusters coherent;
at 0.4 the biggest ones swelled until neighbouring topics interpenetrated.

Unclustered nodes feel no cohesion at all. An earlier `?? 0` fallback silently
treated them as members of community 0, and ids are size-sorted, so every
unsorted note was dragged toward the *largest* topic, piling up as a crescent on
its rim.

### Density scaling pulls the two length scales apart

`utils/graphUtils.ts` → `densityForceProfile()`

Fit zoom is roughly `viewport / (spacing × √n)`, so with constant spacing a large
graph forces the camera far out while a small one huddles in a blob. Spacing
therefore scales by `(400 / n)^¼`.

But one uniform factor compacts everything equally, and the two length scales
want opposite treatment: on a large vault the gaps *between* clusters should
shrink while the *inside* of each cluster gets room to breathe. A uniform squeeze
produced tight solid blobs floating far apart. So each force scales differently:

| Force | Scaling | Reason |
| --- | --- | --- |
| spacing | `spread` | The raw density signal. |
| charge | `√spread` sparse, `spread^0.35` dense | Charge acts on both scales at once, so full scaling squeezed cluster interiors on big graphs and flung satellites to the horizon on small ones. |
| center | `(1/spread)^2.5`, capped 2.2× | Must *outpace* compaction; a linear response barely engaged before the spread floor bound it. Negligible against local forces inside a cluster, so it closes inter-cluster gaps without compressing anything. |
| cohesion | `spread^1.8`, floored 0.4, never above 1 | The intra-cluster crush; letting clusters expand fills the gaps centering is closing. |

All four are exactly 1 at the 400-node reference density, so the tuned defaults
are the behaviour at normal vault size.

### Collapsed topics need their own curves

When topics are collapsed, each becomes one node whose degree is a *crossing
link count*, a few to several thousand, where a note's degree is a handful.
Three things adapt:

**Radius.** A collapsed topic's size encodes its **member count**, not its
connectivity; the rolled-up edge widths already carry that, and encoding it
twice left member count encoded nowhere. Following the bubble-chart
convention, area is proportional to members, so the radius grows with
√members, normalized **per vault**: the largest topic in the current
segmentation sits at the ceiling (26 world px over the base size) and every
other topic at its true share of that, down to a floor of 6. The normalizer
comes from all topics, not only the collapsed ones, so a bubble never changes
size because a *different* topic was expanded. A fixed saturating curve was
tried first and was already flat at real vault sizes: an 8-note topic drew at
a third the size of a 1000-note one, and 1000 versus 2000 were
indistinguishable.

**Spring length.** Stiffness only changes how *fast* a pair converges, not where
it settles, so with one fixed distance, two topics joined by 200 links come to
rest exactly as far apart as two joined by 3. Rest length is shortened for
heavily-crossed pairs, down to 0.45× at saturation.

That shortening is measured **relative to the graph's own median coupling**, not
an absolute crossing count. Absolute counts scale with vault size: on a small
collapsed view nearly every pair blew past a fixed saturation, so all springs
shrank in unison and the whole ring compressed. Uniform shrinkage conveys no
coupling structure at all.

**A surface floor.** Rest length is measured between centres but coupling is
about surfaces, so without a floor a heavily-crossed pair of large topics gets a
rest length shorter than the sum of their radii, so the spring literally asks
the discs to overlap.

### Nodes counter-zoom partially

Edges and labels counter-scale fully with the camera; nodes were the only
element shrinking 1:1 with zoom-out, which is why a fitted large vault read as
"edges with no nodes". Node radii are multiplied by `zoom^-0.28`, so on screen
they scale with `zoom^0.72`.

Partial rather than full, so zoom still conveys depth. This is render and
hit-test only; the physics must never see a camera-dependent radius.

## Source

`utils/semanticEdges.ts` · `utils/topicHierarchy.ts` · `utils/graphLayout.ts` ·
`utils/graphUtils.ts` · `utils/computeWorker.ts` ·
`views/smart-graph/graphDataBuilder.ts`
