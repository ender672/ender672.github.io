---
layout: base.njk
title: Packing Revisions Small and Reading them Fast
description: A benchmark of revision storage strategies, delta encoders, and compressors.
date: 2026-03-20
tags: post
---

# Packing Revisions Small and Reading them Fast

<time class="post-date">March 20, 2026</time>

![Yahoo! homepage circa 2001](/assets/images/yahoo-homepage-2001.png)

What do George W. Bush, the Yahoo! homepage, and the linux kernel BTRFS driver have in common?

If you're thinking lots of revisions, then you're my kind of reader. The George W. Bush Wikipedia article has 48,000 edits, [ranking it all-time #4](https://en.wikipedia.org/wiki/Wikipedia:Silly_Things/Wikipedia%27s_article_on_George_W._Bush). The yahoo! homepage has snapshots going back to 1996 on the [wayback machine](https://web.archive.org/web/19961017235908/http://www2.yahoo.com/). The [BTRFS inode.c source](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/fs/btrfs/inode.c) file has 2,700 versions, making it one of the kernel's most-edited regular .c files, at least per my cursory investigation.

For this article, I created revision data sets for all three, I investigated how various source and revision control systems efficiently store and retrieve revisions, and I benchmarked reference implementations against each other.

My goal is to find the combination of revision storage strategy, delta encoding, and compression algorithm that leads to the smallest compressed size and fastest random revision read speed.

## TLDR - Winning Approaches

1. **SnapshotDelta/Zstd6/ZstdPatch6** - Packs the wikipedia data (2.5GB uncompressed) to 33MB, 0.16ms average read speed.
2. **SnapshotDelta/Lz4Hc/Fossil** - Packs wikipedia data to 48MB, 0.09ms average read speed.
3. **GroupedDelta/Zstd6/Fossil** - Packs the Yahoo data (1.7GB uncompressed) to 33MB, 0.20ms average read speed.

[Live demo here](http://revisionbench.duckdns.org).

[Live demo stats here](http://revisionbench.duckdns.org/stats).

More info in the Conclusion section.

## The Data

- George W. Bush (~15,000 revisions) — Full wikitext downloaded via the Wikipedia MediaWiki API.
- btrfs_inode.c (~2,700 revisions) — Extracted from the Linux kernel's git history.
- Yahoo! homepage (~13,500 snapshots) — Downloaded from the Wayback Machine.

Generally, the George W. Bush revisions are the smallest -- often just a single word or sentence is corrected. There are occasional occurrences of vandalism that entirely replace the content, but large changes they are extremely rare.

The BTRFS revisions are somewhere in the middle, the average revision changing about 33 lines, while typical revisions can rage quite a bit.

The Yahoo! homepage has the highest average number of lines changed per revision, even though most fall in the same range of number of lines changed as the BTRFS data set.

This gives us a good range of real-world revision data sets.

![Revision variance across data sets](/assets/images/revision_variance.png)

## Revision Storage Strategies

I started by looking at how existing projects store revisions.

- [BitKeeper](https://github.com/bitkeeper-scm/bitkeeper)
    All versions are interleaved into a single body annotated with control lines.
- [Darcs](http://darcs.net/)
    Latest state lives in the tree, older revisions as individual patch files.
- [Fossil](https://fossil-scm.org/)
    Searches up to five newer revisions for the best delta candidate. If none are good enough, it remains a snapshot. Opportunistic snapshots, reverse delta chains.
- [Git's Packfiles](https://github.com/git/git)
    Sorts revisions by file size descending, then looks at the last 10 that it processed for the best candidate. Has heuristics to penalize long delta chains, and for deciding to snapshot. Size-sorted delta chains with heuristic snapshots.
- [MediaWiki CGZ](https://www.mediawiki.org/)
    Concatenated gzipped history blobs. Chunks up to 20 revisions as snapshots into groups, and lets gzip compress them.
- [Mercurial's Revlog](https://www.mercurial-scm.org/)
    Most revisions stored as deltas against a previous revision. Deltas themselves can serve as the base for other deltas. Uses chain length, snapshot depth, and compressed size ratio to decide whether to delta or snapshot. Periodic snapshots, forward delta chains.
- [GNU RCS](https://www.gnu.org/software/rcs/)
    Newest revision is full text, older revisions store deltas that transform newer -> older. Single snapshot, reverse delta chain.

After testing reference implementations incorporating the above ideas, I came up with the following implementations for this benchmark:

1. **Naive**

    The simplest approach. Each revision is stored as a separate compressed file. No delta encoding, every revision is independently compressed.

2. **SnapshotDelta**

    Single-hop forward deltas against a nearby base snapshot. All data lives in one file. Periodically inserts a full snapshot when accumulated delta size exceeds 25% of the current revision size. Single-hop forward deltas.

3. **GroupedDelta**

    Revisions are batched into fixed-size groups (default 20). Each group is a single compressed blob file containing a full snapshot of the first revision followed by chained forward deltas against the previous revision within the group. Reading requires decompressing the entire group blob and replaying deltas from the base to the target position.

4. **RCS**

    Inspired by the Revision Control System. Uses reverse deltas, periodic checkpoints (every 64 revisions) or when delta ratio exceeds 25%.

5. **Revlog**

    Modeled after Mercurial's sparse-revlog algorithm. Implements a multi-stage delta base selection, falling back to a full snapshot.

Each of the above was implemented with a pluggable delta encoder and compressor.

## Delta Encoders

1. **Fossil** (The delta encoder, not the storage strategy) - Byte-level rolling-hash delta encoder inspired by Fossil SCM. Uses a 16-byte sliding window with a two-component rolling hash to find matching regions between source and target.

2. **ZstdPatch (level 3)** - Uses zstd's "prefix" (patch-from) mode where the source revision serves as a zstd dictionary. Compression and delta encoding happen in a single step.

3. **ZstdPatch (level 6)** - Better compression, but slower.

## Compressors

1. **Lz4** - Pure Rust (lz4_flex).

2. **Lz4Hc** - LZ4 High Compression via C bindings (lz4 crate).

3. **Zstd** (level 3) - Zstandard (zstd crate), using both level 3 and level 6.

4. **Zstd** (level 6) - Better compression but slower.

5. **Brotli** - (brotli crate), using quality 4.

## Strategy/Compressor/Delta Combinations

With 5 strategies, 5 compressors, and 3 delta encoders minus some pairings that didn't make much sense, I ended up with 31 approaches to compressing our data sets.

Each of these combinations was benchmarked against each of the three data sets.

## Results

### George W. Bush (15,000 revisions)

![George W. Bush scatter plot](/assets/images/results/George_W__Bush/scatter.png)

SnapshotDelta dominates the Pareto frontier; Revlog/RCS pack smallest but with slower reads.

<details><summary>Detailed bar charts</summary>

![George W. Bush detailed bar charts](/assets/images/results/George_W__Bush/chart.png)

</details>

<details><summary>Data table</summary>

| Approach | Packed Size | Pack Time | Read Random | Peak Mem (Pack) | Peak Mem (Read) |
|----------|------------|-----------|----------|-----------------|-----------------|
| GroupedDelta/Brotli/Fossil | 45.55 MB | 4.141 s | 0.65 ms | 185.19 MB | 2.82 MB |
| GroupedDelta/Lz4/Fossil | 92.38 MB | 2.554 s | 0.16 ms | 174.45 MB | 2.81 MB |
| GroupedDelta/Lz4Hc/Fossil | 67.73 MB | 5.183 s | 0.13 ms | 174.07 MB | 2.68 MB |
| GroupedDelta/Zstd3/Fossil | 47.26 MB | 2.696 s | 0.20 ms | 174.07 MB | 12.28 MB |
| GroupedDelta/Zstd6/Fossil | 44.25 MB | 3.479 s | 0.19 ms | 174.07 MB | 12.27 MB |
| Naive/Brotli | 856.85 MB | 36.357 s | 0.56 ms | 11.66 MB | 1.45 MB |
| Naive/Lz4 | 1353.40 MB | 5.563 s | 0.08 ms | 760.8 KB | 510.6 KB |
| Naive/Lz4Hc | 998.61 MB | 43.422 s | 0.06 ms | 646.6 KB | 463.6 KB |
| Naive/Zstd3 | 889.89 MB | 9.952 s | 0.13 ms | 646.6 KB | 10.59 MB |
| Naive/Zstd6 | 831.63 MB | 24.644 s | 0.13 ms | 646.6 KB | 10.59 MB |
| RCS/Brotli/Fossil | 28.31 MB | 3.520 s | 0.88 ms | 139.85 MB | 3.85 MB |
| RCS/Lz4/Fossil | 42.87 MB | 2.390 s | 0.29 ms | 174.60 MB | 3.91 MB |
| RCS/Lz4Hc/Fossil | 32.99 MB | 3.445 s | 0.27 ms | 151.61 MB | 3.87 MB |
| RCS/Zstd3/Fossil | 29.44 MB | 2.498 s | 0.42 ms | 142.82 MB | 24.12 MB |
| RCS/Zstd3/ZstdPatch3 | 28.18 MB | 1.831 s | 0.34 ms | 133.97 MB | 13.02 MB |
| RCS/Zstd6/Fossil | 27.83 MB | 3.019 s | 0.42 ms | 139.34 MB | 24.11 MB |
| RCS/Zstd6/ZstdPatch6 | 26.32 MB | 7.345 s | 0.34 ms | 129.67 MB | 13.01 MB |
| Revlog/Brotli/Fossil | 25.36 MB | 8.071 s | 0.79 ms | 62.81 MB | 1.92 MB |
| Revlog/Lz4/Fossil | 38.08 MB | 6.841 s | 0.25 ms | 97.22 MB | 1.69 MB |
| Revlog/Lz4Hc/Fossil | 29.94 MB | 7.828 s | 0.22 ms | 73.65 MB | 1.69 MB |
| Revlog/Zstd3/Fossil | 26.42 MB | 6.931 s | 0.33 ms | 64.91 MB | 21.97 MB |
| Revlog/Zstd3/ZstdPatch3 | 33.55 MB | 2.067 s | 0.34 ms | 64.08 MB | 10.93 MB |
| Revlog/Zstd6/Fossil | 25.08 MB | 7.437 s | 0.32 ms | 61.95 MB | 21.97 MB |
| Revlog/Zstd6/ZstdPatch6 | 31.65 MB | 8.409 s | 0.33 ms | 60.59 MB | 10.92 MB |
| SnapshotDelta/Brotli/Fossil | 40.46 MB | 5.989 s | 0.60 ms | 113.68 MB | 1.63 MB |
| SnapshotDelta/Lz4/Fossil | 61.00 MB | 2.944 s | 0.11 ms | 147.21 MB | 1.51 MB |
| SnapshotDelta/Lz4Hc/Fossil | 48.31 MB | 5.057 s | 0.09 ms | 145.92 MB | 1.46 MB |
| SnapshotDelta/Zstd3/Fossil | 42.10 MB | 3.318 s | 0.17 ms | 115.40 MB | 22.08 MB |
| SnapshotDelta/Zstd3/ZstdPatch3 | 37.49 MB | 1.858 s | 0.17 ms | 99.91 MB | 10.94 MB |
| SnapshotDelta/Zstd6/Fossil | 40.16 MB | 4.349 s | 0.17 ms | 121.38 MB | 22.08 MB |
| SnapshotDelta/Zstd6/ZstdPatch6 | 33.40 MB | 7.690 s | 0.16 ms | 91.29 MB | 10.93 MB |

<details><summary>By Packed Size (smallest first)</summary>

1. **Revlog/Zstd6/Fossil** — 25.08 MB
2. **Revlog/Brotli/Fossil** — 25.36 MB
3. **RCS/Zstd6/ZstdPatch6** — 26.32 MB
4. **Revlog/Zstd3/Fossil** — 26.42 MB
5. **RCS/Zstd6/Fossil** — 27.83 MB
6. **RCS/Zstd3/ZstdPatch3** — 28.18 MB
7. **RCS/Brotli/Fossil** — 28.31 MB
8. **RCS/Zstd3/Fossil** — 29.44 MB
9. **Revlog/Lz4Hc/Fossil** — 29.94 MB
10. **Revlog/Zstd6/ZstdPatch6** — 31.65 MB
11. **RCS/Lz4Hc/Fossil** — 32.99 MB
12. **SnapshotDelta/Zstd6/ZstdPatch6** — 33.40 MB
13. **Revlog/Zstd3/ZstdPatch3** — 33.55 MB
14. **SnapshotDelta/Zstd3/ZstdPatch3** — 37.49 MB
15. **Revlog/Lz4/Fossil** — 38.08 MB
16. **SnapshotDelta/Zstd6/Fossil** — 40.16 MB
17. **SnapshotDelta/Brotli/Fossil** — 40.46 MB
18. **SnapshotDelta/Zstd3/Fossil** — 42.10 MB
19. **RCS/Lz4/Fossil** — 42.87 MB
20. **GroupedDelta/Zstd6/Fossil** — 44.25 MB
21. **GroupedDelta/Brotli/Fossil** — 45.55 MB
22. **GroupedDelta/Zstd3/Fossil** — 47.26 MB
23. **SnapshotDelta/Lz4Hc/Fossil** — 48.31 MB
24. **SnapshotDelta/Lz4/Fossil** — 61.00 MB
25. **GroupedDelta/Lz4Hc/Fossil** — 67.73 MB
26. **GroupedDelta/Lz4/Fossil** — 92.38 MB
27. **Naive/Zstd6** — 831.63 MB
28. **Naive/Brotli** — 856.85 MB
29. **Naive/Zstd3** — 889.89 MB
30. **Naive/Lz4Hc** — 998.61 MB
31. **Naive/Lz4** — 1353.40 MB

</details>

<details><summary>By Read-Old Time (fastest first)</summary>

1. **Naive/Lz4Hc** — 0.06 ms
2. **Naive/Lz4** — 0.08 ms
3. **SnapshotDelta/Lz4Hc/Fossil** — 0.09 ms
4. **SnapshotDelta/Lz4/Fossil** — 0.11 ms
5. **Naive/Zstd6** — 0.13 ms
6. **GroupedDelta/Lz4Hc/Fossil** — 0.13 ms
7. **Naive/Zstd3** — 0.13 ms
8. **GroupedDelta/Lz4/Fossil** — 0.16 ms
9. **SnapshotDelta/Zstd6/ZstdPatch6** — 0.16 ms
10. **SnapshotDelta/Zstd6/Fossil** — 0.17 ms
11. **SnapshotDelta/Zstd3/ZstdPatch3** — 0.17 ms
12. **SnapshotDelta/Zstd3/Fossil** — 0.17 ms
13. **GroupedDelta/Zstd6/Fossil** — 0.19 ms
14. **GroupedDelta/Zstd3/Fossil** — 0.20 ms
15. **Revlog/Lz4Hc/Fossil** — 0.22 ms
16. **Revlog/Lz4/Fossil** — 0.25 ms
17. **RCS/Lz4Hc/Fossil** — 0.27 ms
18. **RCS/Lz4/Fossil** — 0.29 ms
19. **Revlog/Zstd6/Fossil** — 0.32 ms
20. **Revlog/Zstd3/Fossil** — 0.33 ms
21. **Revlog/Zstd6/ZstdPatch6** — 0.33 ms
22. **RCS/Zstd6/ZstdPatch6** — 0.34 ms
23. **Revlog/Zstd3/ZstdPatch3** — 0.34 ms
24. **RCS/Zstd3/ZstdPatch3** — 0.34 ms
25. **RCS/Zstd6/Fossil** — 0.42 ms
26. **RCS/Zstd3/Fossil** — 0.42 ms
27. **Naive/Brotli** — 0.56 ms
28. **SnapshotDelta/Brotli/Fossil** — 0.60 ms
29. **GroupedDelta/Brotli/Fossil** — 0.65 ms
30. **Revlog/Brotli/Fossil** — 0.79 ms
31. **RCS/Brotli/Fossil** — 0.88 ms

</details>

<details><summary>By Pack Time (fastest first)</summary>

1. **RCS/Zstd3/ZstdPatch3** — 1.831 s
2. **SnapshotDelta/Zstd3/ZstdPatch3** — 1.858 s
3. **Revlog/Zstd3/ZstdPatch3** — 2.067 s
4. **RCS/Lz4/Fossil** — 2.390 s
5. **RCS/Zstd3/Fossil** — 2.498 s
6. **GroupedDelta/Lz4/Fossil** — 2.554 s
7. **GroupedDelta/Zstd3/Fossil** — 2.696 s
8. **SnapshotDelta/Lz4/Fossil** — 2.944 s
9. **RCS/Zstd6/Fossil** — 3.019 s
10. **SnapshotDelta/Zstd3/Fossil** — 3.318 s
11. **RCS/Lz4Hc/Fossil** — 3.445 s
12. **GroupedDelta/Zstd6/Fossil** — 3.479 s
13. **RCS/Brotli/Fossil** — 3.520 s
14. **GroupedDelta/Brotli/Fossil** — 4.141 s
15. **SnapshotDelta/Zstd6/Fossil** — 4.349 s
16. **SnapshotDelta/Lz4Hc/Fossil** — 5.057 s
17. **GroupedDelta/Lz4Hc/Fossil** — 5.183 s
18. **Naive/Lz4** — 5.563 s
19. **SnapshotDelta/Brotli/Fossil** — 5.989 s
20. **Revlog/Lz4/Fossil** — 6.841 s
21. **Revlog/Zstd3/Fossil** — 6.931 s
22. **RCS/Zstd6/ZstdPatch6** — 7.345 s
23. **Revlog/Zstd6/Fossil** — 7.437 s
24. **SnapshotDelta/Zstd6/ZstdPatch6** — 7.690 s
25. **Revlog/Lz4Hc/Fossil** — 7.828 s
26. **Revlog/Brotli/Fossil** — 8.071 s
27. **Revlog/Zstd6/ZstdPatch6** — 8.409 s
28. **Naive/Zstd3** — 9.952 s
29. **Naive/Zstd6** — 24.644 s
30. **Naive/Brotli** — 36.357 s
31. **Naive/Lz4Hc** — 43.422 s

</details>

</details>

---

### btrfs inode.c (2,711 revisions)

![btrfs inode.c scatter plot](/assets/images/results/btrfs_inode_c/scatter.png)

RCS beats Revlog on size for code diffs; SnapshotDelta/Zstd6/ZstdPatch and SnapshotDelta/Lz4Hc/Fossil find the best performance balance.

<details><summary>Detailed bar charts</summary>

![btrfs inode.c detailed bar charts](/assets/images/results/btrfs_inode_c/chart.png)

</details>

<details><summary>Data table</summary>

| Approach | Packed Size | Pack Time | Read Random | Peak Mem (Pack) | Peak Mem (Read) |
|----------|------------|-----------|----------|-----------------|-----------------|
| GroupedDelta/Brotli/Fossil | 10.40 MB | 4.437 s | 0.85 ms | 75.54 MB | 10.64 MB |
| GroupedDelta/Lz4/Fossil | 25.18 MB | 4.013 s | 0.31 ms | 63.77 MB | 4.40 MB |
| GroupedDelta/Lz4Hc/Fossil | 17.28 MB | 5.132 s | 0.24 ms | 62.67 MB | 4.10 MB |
| GroupedDelta/Zstd3/Fossil | 10.62 MB | 3.971 s | 0.31 ms | 62.67 MB | 12.21 MB |
| GroupedDelta/Zstd6/Fossil | 9.55 MB | 4.252 s | 0.30 ms | 62.67 MB | 12.20 MB |
| Naive/Brotli | 172.05 MB | 7.398 s | 0.59 ms | 11.37 MB | 1.43 MB |
| Naive/Lz4 | 287.03 MB | 1.376 s | 0.11 ms | 535.9 KB | 480.6 KB |
| Naive/Lz4Hc | 197.28 MB | 14.689 s | 0.07 ms | 358.5 KB | 435.2 KB |
| Naive/Zstd3 | 177.24 MB | 2.234 s | 0.17 ms | 358.5 KB | 10.57 MB |
| Naive/Zstd6 | 159.24 MB | 5.898 s | 0.16 ms | 358.5 KB | 10.57 MB |
| RCS/Brotli/Fossil | 11.41 MB | 4.655 s | 1.15 ms | 65.70 MB | 2.16 MB |
| RCS/Lz4/Fossil | 18.02 MB | 4.183 s | 0.38 ms | 89.65 MB | 2.20 MB |
| RCS/Lz4Hc/Fossil | 13.09 MB | 4.947 s | 0.34 ms | 64.36 MB | 2.15 MB |
| RCS/Zstd3/Fossil | 11.71 MB | 4.215 s | 0.55 ms | 62.32 MB | 22.38 MB |
| RCS/Zstd3/ZstdPatch3 | 6.57 MB | 454.53 ms | 0.59 ms | 24.48 MB | 11.59 MB |
| RCS/Zstd6/Fossil | 10.72 MB | 4.542 s | 0.54 ms | 61.80 MB | 22.37 MB |
| RCS/Zstd6/ZstdPatch6 | 5.36 MB | 1.816 s | 0.53 ms | 21.93 MB | 11.52 MB |
| Revlog/Brotli/Fossil | 9.74 MB | 9.438 s | 0.97 ms | 30.00 MB | 2.01 MB |
| Revlog/Lz4/Fossil | 14.98 MB | 9.062 s | 0.31 ms | 40.60 MB | 1.63 MB |
| Revlog/Lz4Hc/Fossil | 11.22 MB | 9.424 s | 0.26 ms | 18.13 MB | 1.63 MB |
| Revlog/Zstd3/Fossil | 10.00 MB | 8.852 s | 0.41 ms | 27.74 MB | 21.91 MB |
| Revlog/Zstd3/ZstdPatch3 | 7.28 MB | 554.99 ms | 0.53 ms | 12.20 MB | 10.87 MB |
| Revlog/Zstd6/Fossil | 9.23 MB | 9.167 s | 0.40 ms | 26.89 MB | 21.91 MB |
| Revlog/Zstd6/ZstdPatch6 | 6.47 MB | 2.296 s | 0.46 ms | 11.19 MB | 10.51 MB |
| SnapshotDelta/Brotli/Fossil | 18.89 MB | 6.412 s | 0.66 ms | 76.27 MB | 2.03 MB |
| SnapshotDelta/Lz4/Fossil | 27.41 MB | 3.932 s | 0.15 ms | 73.58 MB | 1.48 MB |
| SnapshotDelta/Lz4Hc/Fossil | 20.12 MB | 6.049 s | 0.11 ms | 60.31 MB | 1.40 MB |
| SnapshotDelta/Zstd3/Fossil | 18.44 MB | 4.738 s | 0.21 ms | 61.85 MB | 22.02 MB |
| SnapshotDelta/Zstd3/ZstdPatch3 | 13.94 MB | 553.68 ms | 0.21 ms | 39.14 MB | 10.94 MB |
| SnapshotDelta/Zstd6/Fossil | 17.44 MB | 5.334 s | 0.20 ms | 63.66 MB | 22.05 MB |
| SnapshotDelta/Zstd6/ZstdPatch6 | 11.01 MB | 2.157 s | 0.20 ms | 31.57 MB | 10.91 MB |

<details><summary>By Packed Size (smallest first)</summary>

1. **RCS/Zstd6/ZstdPatch6** — 5.36 MB
2. **Revlog/Zstd6/ZstdPatch6** — 6.47 MB
3. **RCS/Zstd3/ZstdPatch3** — 6.57 MB
4. **Revlog/Zstd3/ZstdPatch3** — 7.28 MB
5. **Revlog/Zstd6/Fossil** — 9.23 MB
6. **GroupedDelta/Zstd6/Fossil** — 9.55 MB
7. **Revlog/Brotli/Fossil** — 9.74 MB
8. **Revlog/Zstd3/Fossil** — 10.00 MB
9. **GroupedDelta/Brotli/Fossil** — 10.40 MB
10. **GroupedDelta/Zstd3/Fossil** — 10.62 MB
11. **RCS/Zstd6/Fossil** — 10.72 MB
12. **SnapshotDelta/Zstd6/ZstdPatch6** — 11.01 MB
13. **Revlog/Lz4Hc/Fossil** — 11.22 MB
14. **RCS/Brotli/Fossil** — 11.41 MB
15. **RCS/Zstd3/Fossil** — 11.71 MB
16. **RCS/Lz4Hc/Fossil** — 13.09 MB
17. **SnapshotDelta/Zstd3/ZstdPatch3** — 13.94 MB
18. **Revlog/Lz4/Fossil** — 14.98 MB
19. **GroupedDelta/Lz4Hc/Fossil** — 17.28 MB
20. **SnapshotDelta/Zstd6/Fossil** — 17.44 MB
21. **RCS/Lz4/Fossil** — 18.02 MB
22. **SnapshotDelta/Zstd3/Fossil** — 18.44 MB
23. **SnapshotDelta/Brotli/Fossil** — 18.89 MB
24. **SnapshotDelta/Lz4Hc/Fossil** — 20.12 MB
25. **GroupedDelta/Lz4/Fossil** — 25.18 MB
26. **SnapshotDelta/Lz4/Fossil** — 27.41 MB
27. **Naive/Zstd6** — 159.24 MB
28. **Naive/Brotli** — 172.05 MB
29. **Naive/Zstd3** — 177.24 MB
30. **Naive/Lz4Hc** — 197.28 MB
31. **Naive/Lz4** — 287.03 MB

</details>

<details><summary>By Read-Old Time (fastest first)</summary>

1. **Naive/Lz4Hc** — 0.07 ms
2. **SnapshotDelta/Lz4Hc/Fossil** — 0.11 ms
3. **Naive/Lz4** — 0.11 ms
4. **SnapshotDelta/Lz4/Fossil** — 0.15 ms
5. **Naive/Zstd6** — 0.16 ms
6. **Naive/Zstd3** — 0.17 ms
7. **SnapshotDelta/Zstd6/ZstdPatch6** — 0.20 ms
8. **SnapshotDelta/Zstd6/Fossil** — 0.20 ms
9. **SnapshotDelta/Zstd3/ZstdPatch3** — 0.21 ms
10. **SnapshotDelta/Zstd3/Fossil** — 0.21 ms
11. **GroupedDelta/Lz4Hc/Fossil** — 0.24 ms
12. **Revlog/Lz4Hc/Fossil** — 0.26 ms
13. **GroupedDelta/Zstd6/Fossil** — 0.30 ms
14. **GroupedDelta/Lz4/Fossil** — 0.31 ms
15. **GroupedDelta/Zstd3/Fossil** — 0.31 ms
16. **Revlog/Lz4/Fossil** — 0.31 ms
17. **RCS/Lz4Hc/Fossil** — 0.34 ms
18. **RCS/Lz4/Fossil** — 0.38 ms
19. **Revlog/Zstd6/Fossil** — 0.40 ms
20. **Revlog/Zstd3/Fossil** — 0.41 ms
21. **Revlog/Zstd6/ZstdPatch6** — 0.46 ms
22. **RCS/Zstd6/ZstdPatch6** — 0.53 ms
23. **Revlog/Zstd3/ZstdPatch3** — 0.53 ms
24. **RCS/Zstd6/Fossil** — 0.54 ms
25. **RCS/Zstd3/Fossil** — 0.55 ms
26. **RCS/Zstd3/ZstdPatch3** — 0.59 ms
27. **Naive/Brotli** — 0.59 ms
28. **SnapshotDelta/Brotli/Fossil** — 0.66 ms
29. **GroupedDelta/Brotli/Fossil** — 0.85 ms
30. **Revlog/Brotli/Fossil** — 0.97 ms
31. **RCS/Brotli/Fossil** — 1.15 ms

</details>

<details><summary>By Pack Time (fastest first)</summary>

1. **RCS/Zstd3/ZstdPatch3** — 454.53 ms
2. **SnapshotDelta/Zstd3/ZstdPatch3** — 553.68 ms
3. **Revlog/Zstd3/ZstdPatch3** — 554.99 ms
4. **Naive/Lz4** — 1.376 s
5. **RCS/Zstd6/ZstdPatch6** — 1.816 s
6. **SnapshotDelta/Zstd6/ZstdPatch6** — 2.157 s
7. **Naive/Zstd3** — 2.234 s
8. **Revlog/Zstd6/ZstdPatch6** — 2.296 s
9. **SnapshotDelta/Lz4/Fossil** — 3.932 s
10. **GroupedDelta/Zstd3/Fossil** — 3.971 s
11. **GroupedDelta/Lz4/Fossil** — 4.013 s
12. **RCS/Lz4/Fossil** — 4.183 s
13. **RCS/Zstd3/Fossil** — 4.215 s
14. **GroupedDelta/Zstd6/Fossil** — 4.252 s
15. **GroupedDelta/Brotli/Fossil** — 4.437 s
16. **RCS/Zstd6/Fossil** — 4.542 s
17. **RCS/Brotli/Fossil** — 4.655 s
18. **SnapshotDelta/Zstd3/Fossil** — 4.738 s
19. **RCS/Lz4Hc/Fossil** — 4.947 s
20. **GroupedDelta/Lz4Hc/Fossil** — 5.132 s
21. **SnapshotDelta/Zstd6/Fossil** — 5.334 s
22. **Naive/Zstd6** — 5.898 s
23. **SnapshotDelta/Lz4Hc/Fossil** — 6.049 s
24. **SnapshotDelta/Brotli/Fossil** — 6.412 s
25. **Naive/Brotli** — 7.398 s
26. **Revlog/Zstd3/Fossil** — 8.852 s
27. **Revlog/Lz4/Fossil** — 9.062 s
28. **Revlog/Zstd6/Fossil** — 9.167 s
29. **Revlog/Lz4Hc/Fossil** — 9.424 s
30. **Revlog/Brotli/Fossil** — 9.438 s
31. **Naive/Lz4Hc** — 14.689 s

</details>

</details>

---

### yahoo.com (13,527 revisions)

![yahoo.com scatter plot](/assets/images/results/yahoo_com/scatter.png)

GroupedDelta wins on size by a large margin (unique to this dataset); delta encoding is less effective on large structural changes; Revlog/RCS fall behind.

<details><summary>Detailed bar charts</summary>

![yahoo.com detailed bar charts](/assets/images/results/yahoo_com/chart.png)

</details>

<details><summary>Data table</summary>

| Approach | Packed Size | Pack Time | Read Random | Peak Mem (Pack) | Peak Mem (Read) |
|----------|------------|-----------|----------|-----------------|-----------------|
| GroupedDelta/Brotli/Fossil | 34.33 MB | 47.012 s | 0.64 ms | 482.90 MB | 10.63 MB |
| GroupedDelta/Lz4/Fossil | 146.63 MB | 45.637 s | 0.30 ms | 471.03 MB | 3.90 MB |
| GroupedDelta/Lz4Hc/Fossil | 115.86 MB | 50.855 s | 0.21 ms | 469.83 MB | 3.77 MB |
| GroupedDelta/Zstd3/Fossil | 35.37 MB | 45.965 s | 0.20 ms | 469.83 MB | 11.83 MB |
| GroupedDelta/Zstd6/Fossil | 32.95 MB | 46.763 s | 0.20 ms | 469.83 MB | 11.82 MB |
| Naive/Brotli | 276.52 MB | 13.608 s | 0.23 ms | 10.81 MB | 736.1 KB |
| Naive/Lz4 | 435.77 MB | 2.107 s | 0.04 ms | 618.5 KB | 325.5 KB |
| Naive/Lz4Hc | 352.19 MB | 15.975 s | 0.03 ms | 476.2 KB | 307.7 KB |
| Naive/Zstd3 | 292.25 MB | 3.531 s | 0.07 ms | 476.1 KB | 10.54 MB |
| Naive/Zstd6 | 271.98 MB | 9.548 s | 0.06 ms | 476.1 KB | 10.54 MB |
| RCS/Brotli/Fossil | 115.19 MB | 52.157 s | 0.38 ms | 865.81 MB | 2.02 MB |
| RCS/Lz4/Fossil | 176.51 MB | 47.237 s | 0.11 ms | 1045.31 MB | 2.05 MB |
| RCS/Lz4Hc/Fossil | 144.95 MB | 52.332 s | 0.10 ms | 769.86 MB | 2.04 MB |
| RCS/Zstd3/Fossil | 120.86 MB | 47.466 s | 0.17 ms | 890.15 MB | 22.65 MB |
| RCS/Zstd3/ZstdPatch3 | 45.08 MB | 1.295 s | 0.43 ms | 142.92 MB | 13.17 MB |
| RCS/Zstd6/Fossil | 113.37 MB | 50.443 s | 0.16 ms | 705.48 MB | 22.65 MB |
| RCS/Zstd6/ZstdPatch6 | 40.54 MB | 4.815 s | 0.39 ms | 116.21 MB | 13.11 MB |
| Revlog/Brotli/Fossil | 107.65 MB | 78.213 s | 0.44 ms | 169.36 MB | 1.06 MB |
| Revlog/Lz4/Fossil | 163.07 MB | 74.417 s | 0.15 ms | 263.49 MB | 898.4 KB |
| Revlog/Lz4Hc/Fossil | 134.70 MB | 77.656 s | 0.13 ms | 239.48 MB | 898.3 KB |
| Revlog/Zstd3/Fossil | 112.69 MB | 74.236 s | 0.19 ms | 182.84 MB | 21.50 MB |
| Revlog/Zstd3/ZstdPatch3 | 48.42 MB | 1.531 s | 0.31 ms | 89.61 MB | 10.77 MB |
| Revlog/Zstd6/Fossil | 105.90 MB | 76.124 s | 0.19 ms | 174.40 MB | 21.50 MB |
| Revlog/Zstd6/ZstdPatch6 | 43.91 MB | 5.874 s | 0.29 ms | 85.58 MB | 10.74 MB |
| SnapshotDelta/Brotli/Fossil | 142.84 MB | 75.720 s | 0.31 ms | 685.14 MB | 1.40 MB |
| SnapshotDelta/Lz4/Fossil | 211.42 MB | 65.967 s | 0.08 ms | 662.20 MB | 938.6 KB |
| SnapshotDelta/Lz4Hc/Fossil | 178.22 MB | 77.765 s | 0.06 ms | 671.14 MB | 919.5 KB |
| SnapshotDelta/Zstd3/Fossil | 149.86 MB | 66.109 s | 0.11 ms | 675.51 MB | 21.54 MB |
| SnapshotDelta/Zstd3/ZstdPatch3 | 80.31 MB | 1.778 s | 0.11 ms | 237.76 MB | 10.77 MB |
| SnapshotDelta/Zstd6/Fossil | 140.50 MB | 71.859 s | 0.10 ms | 675.49 MB | 21.54 MB |
| SnapshotDelta/Zstd6/ZstdPatch6 | 71.98 MB | 6.282 s | 0.10 ms | 215.43 MB | 10.80 MB |

<details><summary>By Packed Size (smallest first)</summary>

1. **GroupedDelta/Zstd6/Fossil** — 32.95 MB
2. **GroupedDelta/Brotli/Fossil** — 34.33 MB
3. **GroupedDelta/Zstd3/Fossil** — 35.37 MB
4. **RCS/Zstd6/ZstdPatch6** — 40.54 MB
5. **Revlog/Zstd6/ZstdPatch6** — 43.91 MB
6. **RCS/Zstd3/ZstdPatch3** — 45.08 MB
7. **Revlog/Zstd3/ZstdPatch3** — 48.42 MB
8. **SnapshotDelta/Zstd6/ZstdPatch6** — 71.98 MB
9. **SnapshotDelta/Zstd3/ZstdPatch3** — 80.31 MB
10. **Revlog/Zstd6/Fossil** — 105.90 MB
11. **Revlog/Brotli/Fossil** — 107.65 MB
12. **Revlog/Zstd3/Fossil** — 112.69 MB
13. **RCS/Zstd6/Fossil** — 113.37 MB
14. **RCS/Brotli/Fossil** — 115.19 MB
15. **GroupedDelta/Lz4Hc/Fossil** — 115.86 MB
16. **RCS/Zstd3/Fossil** — 120.86 MB
17. **Revlog/Lz4Hc/Fossil** — 134.70 MB
18. **SnapshotDelta/Zstd6/Fossil** — 140.50 MB
19. **SnapshotDelta/Brotli/Fossil** — 142.84 MB
20. **RCS/Lz4Hc/Fossil** — 144.95 MB
21. **GroupedDelta/Lz4/Fossil** — 146.63 MB
22. **SnapshotDelta/Zstd3/Fossil** — 149.86 MB
23. **Revlog/Lz4/Fossil** — 163.07 MB
24. **RCS/Lz4/Fossil** — 176.51 MB
25. **SnapshotDelta/Lz4Hc/Fossil** — 178.22 MB
26. **SnapshotDelta/Lz4/Fossil** — 211.42 MB
27. **Naive/Zstd6** — 271.98 MB
28. **Naive/Brotli** — 276.52 MB
29. **Naive/Zstd3** — 292.25 MB
30. **Naive/Lz4Hc** — 352.19 MB
31. **Naive/Lz4** — 435.77 MB

</details>

<details><summary>By Read-Old Time (fastest first)</summary>

1. **Naive/Lz4Hc** — 0.03 ms
2. **Naive/Lz4** — 0.04 ms
3. **SnapshotDelta/Lz4Hc/Fossil** — 0.06 ms
4. **Naive/Zstd6** — 0.06 ms
5. **Naive/Zstd3** — 0.07 ms
6. **SnapshotDelta/Lz4/Fossil** — 0.08 ms
7. **RCS/Lz4Hc/Fossil** — 0.10 ms
8. **SnapshotDelta/Zstd6/ZstdPatch6** — 0.10 ms
9. **SnapshotDelta/Zstd6/Fossil** — 0.10 ms
10. **SnapshotDelta/Zstd3/ZstdPatch3** — 0.11 ms
11. **SnapshotDelta/Zstd3/Fossil** — 0.11 ms
12. **RCS/Lz4/Fossil** — 0.11 ms
13. **Revlog/Lz4Hc/Fossil** — 0.13 ms
14. **Revlog/Lz4/Fossil** — 0.15 ms
15. **RCS/Zstd6/Fossil** — 0.16 ms
16. **RCS/Zstd3/Fossil** — 0.17 ms
17. **Revlog/Zstd6/Fossil** — 0.19 ms
18. **Revlog/Zstd3/Fossil** — 0.19 ms
19. **GroupedDelta/Zstd6/Fossil** — 0.20 ms
20. **GroupedDelta/Zstd3/Fossil** — 0.20 ms
21. **GroupedDelta/Lz4Hc/Fossil** — 0.21 ms
22. **Naive/Brotli** — 0.23 ms
23. **Revlog/Zstd6/ZstdPatch6** — 0.29 ms
24. **GroupedDelta/Lz4/Fossil** — 0.30 ms
25. **SnapshotDelta/Brotli/Fossil** — 0.31 ms
26. **Revlog/Zstd3/ZstdPatch3** — 0.31 ms
27. **RCS/Brotli/Fossil** — 0.38 ms
28. **RCS/Zstd6/ZstdPatch6** — 0.39 ms
29. **RCS/Zstd3/ZstdPatch3** — 0.43 ms
30. **Revlog/Brotli/Fossil** — 0.44 ms
31. **GroupedDelta/Brotli/Fossil** — 0.64 ms

</details>

<details><summary>By Pack Time (fastest first)</summary>

1. **RCS/Zstd3/ZstdPatch3** — 1.295 s
2. **Revlog/Zstd3/ZstdPatch3** — 1.531 s
3. **SnapshotDelta/Zstd3/ZstdPatch3** — 1.778 s
4. **Naive/Lz4** — 2.107 s
5. **Naive/Zstd3** — 3.531 s
6. **RCS/Zstd6/ZstdPatch6** — 4.815 s
7. **Revlog/Zstd6/ZstdPatch6** — 5.874 s
8. **SnapshotDelta/Zstd6/ZstdPatch6** — 6.282 s
9. **Naive/Zstd6** — 9.548 s
10. **Naive/Brotli** — 13.608 s
11. **Naive/Lz4Hc** — 15.975 s
12. **GroupedDelta/Lz4/Fossil** — 45.637 s
13. **GroupedDelta/Zstd3/Fossil** — 45.965 s
14. **GroupedDelta/Zstd6/Fossil** — 46.763 s
15. **GroupedDelta/Brotli/Fossil** — 47.012 s
16. **RCS/Lz4/Fossil** — 47.237 s
17. **RCS/Zstd3/Fossil** — 47.466 s
18. **RCS/Zstd6/Fossil** — 50.443 s
19. **GroupedDelta/Lz4Hc/Fossil** — 50.855 s
20. **RCS/Brotli/Fossil** — 52.157 s
21. **RCS/Lz4Hc/Fossil** — 52.332 s
22. **SnapshotDelta/Lz4/Fossil** — 65.967 s
23. **SnapshotDelta/Zstd3/Fossil** — 66.109 s
24. **SnapshotDelta/Zstd6/Fossil** — 71.859 s
25. **Revlog/Zstd3/Fossil** — 74.236 s
26. **Revlog/Lz4/Fossil** — 74.417 s
27. **SnapshotDelta/Brotli/Fossil** — 75.720 s
28. **Revlog/Zstd6/Fossil** — 76.124 s
29. **Revlog/Lz4Hc/Fossil** — 77.656 s
30. **SnapshotDelta/Lz4Hc/Fossil** — 77.765 s
31. **Revlog/Brotli/Fossil** — 78.213 s

</details>

</details>

## Conclusion

The scatter plots were used to find the most interesting approaches, in my personal order of preference:

1. **SnapshotDelta/Zstd6/ZstdPatch6** - This approach has a good balance of speed vs size, always sits at the pareto front of the charts, and holds up well with the Yahoo! data, which sees larger revisions.
2. **SnapshotDelta/Lz4Hc/Fossil** - This approach has extremely fast reads while compromising on compression ratio. Another bonus is that Lz4Hc has a low memory footprint.
3. **GroupedDelta/Zstd6/Fossil** - This approach did extremely well at compressiong the Yahoo! data set with good read speed. It also did well on the other tests.

# Live Demo
[A live demo is here](http://revisionbench.duckdns.org)

This is a bare server with no CDN or caching, serving each of the three data sets using three different approaches.

You can view [live stats from the demo here](http://revisionbench.duckdns.org/stats)

## GitHub repo

This benchmark should be fully reproducable, including the web application with the code here:

[https://github.com/ender672/wikipediastorage](https://github.com/ender672/wikipediastorage)

## Limitations and Things Omitted From This Benchmark

- Many encoders and SCM storage strategies include integrity checksumming. I purposely omitted checksumming from this benchmark.
- I only benchmarked packfile creation time, storage space, read timing, and memory usage. I didn't benchmark pushing additional records into the packfile.
- Storage strategies were not allowed to cache data between calls.
- A gitpack implementation was removed due to long packing times and slow performance.
- Myers diff encoding was removed tue to slow read performance, even though some compression approaches showed promising packfile sizes.
- bsdiff was removed due to performance/read speed and the forced bzip2 compression.
- xdelta3 delta encoding was removed due to a bug in oxidelta (see below). Performance was actually good and in some cases better than fossil delta encoding.
- Zstd can pack an entire data set into an incredibly small archive, but reading individual revisions is too slow.

## Side Notes

During benchmarking, I encountered what appears to be a bug in the oxidelta crate that causes corruption.