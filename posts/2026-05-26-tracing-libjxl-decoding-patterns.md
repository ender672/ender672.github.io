---
layout: base.njk
title: Tracing libjxl decoding patterns, with JPEG XL as the trace data container
description: Visualizing the spatial order in which libjxl decodes strips across 1–16 threads, with the trace data itself stored in a JPEG XL container.
date: 2026-05-26
tags: post
---

# Tracing libjxl decoding patterns, with JPEG XL as the trace data container

<p class="post-meta"><time datetime="2026-05-26">May 26, 2026</time> · Tim Elliott</p>

I wanted to understand the order in which libjxl decodes an image. Which strips come first, which threads grab them, and how all of that shifts as you add cores. So I instrumented the decoder, recorded a timestamp for every region as it landed, and rendered the result as a video.

The twist: the intermediate container that stores the trace data is itself a JPEG XL image with the same dimensions as the input, encoded losslessly as 8-bit RGBA. The red channel holds the thread ID (`0xFF` marks pixels no callback ever wrote); green, blue, and alpha together form a 24-bit microsecond timestamp, MSB-first, rebased so the first callback sits at zero. That gives ~16.8 s of decode-time headroom before the field would wrap, comfortably more than any trace here needs.

In the clips below, each pixel lights up in its thread's color the moment that region was delivered by the library via callback. Each clip is slowed down by the factor shown next to it (≈222× means one second of video is roughly 4.5 ms of actual decoding).

**[cargo.jxl](https://jxl-trace-data.netlify.app/cargo.jxl):** 14,178 × 16,239, 230.24 Mpx, RGB, 14.16 MB · ≈16.7× slowdown

<video src="/assets/videos/cargo_grid.mp4" controls autoplay muted loop playsinline></video>

**[pineapple-alpha.jxl](https://jxl-trace-data.netlify.app/pineapple-alpha.jxl):** 2,560 × 1,600, 4.1 Mpx, RGBA, 1.56 MB · ≈222× slowdown

<video src="/assets/videos/pineapple_grid.mp4" controls autoplay muted loop playsinline></video>

A caveat on the timing: the wall-clock microseconds in each trace are measured from the first worker callback that delivered pixels. `0 ms` is when the first strip lands. libjxl's pre-callback setup and disk I/O are excluded.

## The setup

The traces were captured on an AMD Ryzen 7 5700X (8 physical cores / 16 SMT threads, 4.67 GHz max, with AVX2, F16C, and SHA-NI) backed by 62 GiB of RAM, running Fedora (Linux 7.0.9-205.fc44 x86_64). The toolchain was gcc 16.1.1 against libjxl 0.11.1.

## The intermediate data

The videos above were rendered by stepping through that data frame by frame, but you can also just *look* at the raw map: the spatial layout of threads and timings is visible at a glance.

The thumbnails below are PNG re-encodes of the original JPEG XL traces, because [JPEG XL browser support is still patchy](https://caniuse.com/jpegxl). Click a thumbnail for the full-size PNG, or grab the `.jxl` from the link underneath.

Pineapple-alpha previews are shown at native resolution (2,560 × 1,600). Cargo previews are downsampled to fit within a 2,560-pixel bounding box, since 230 Mpx of trace data is too much to ship to a browser inline. All the `.jxl` links go to full-resolution originals hosted on a separate Netlify drop, so you can grab the bit-exact traces for either image.

**cargo**

<div class="trace-grid">
  <figure>
    <a href="/assets/images/cargo_map_t1.png"><img src="/assets/images/cargo_map_t1_thumb.png" alt="cargo trace map, 1 thread"></a>
    <figcaption>1 thread<br><a href="https://jxl-trace-data.netlify.app/cargo_map_t1.jxl">jxl</a></figcaption>
  </figure>
  <figure>
    <a href="/assets/images/cargo_map_t2.png"><img src="/assets/images/cargo_map_t2_thumb.png" alt="cargo trace map, 2 threads"></a>
    <figcaption>2 threads<br><a href="https://jxl-trace-data.netlify.app/cargo_map_t2.jxl">jxl</a></figcaption>
  </figure>
  <figure>
    <a href="/assets/images/cargo_map_t4.png"><img src="/assets/images/cargo_map_t4_thumb.png" alt="cargo trace map, 4 threads"></a>
    <figcaption>4 threads<br><a href="https://jxl-trace-data.netlify.app/cargo_map_t4.jxl">jxl</a></figcaption>
  </figure>
  <figure>
    <a href="/assets/images/cargo_map_t8.png"><img src="/assets/images/cargo_map_t8_thumb.png" alt="cargo trace map, 8 threads"></a>
    <figcaption>8 threads<br><a href="https://jxl-trace-data.netlify.app/cargo_map_t8.jxl">jxl</a></figcaption>
  </figure>
  <figure>
    <a href="/assets/images/cargo_map_t16.png"><img src="/assets/images/cargo_map_t16_thumb.png" alt="cargo trace map, 16 threads"></a>
    <figcaption>16 threads<br><a href="https://jxl-trace-data.netlify.app/cargo_map_t16.jxl">jxl</a></figcaption>
  </figure>
</div>

**pineapple-alpha**

<div class="trace-grid">
  <figure>
    <a href="/assets/images/pineapple_alpha_map_t1.png"><img src="/assets/images/pineapple_alpha_map_t1_thumb.png" alt="pineapple-alpha trace map, 1 thread"></a>
    <figcaption>1 thread<br><a href="https://jxl-trace-data.netlify.app/pineapple_alpha_map_t1.jxl">jxl</a></figcaption>
  </figure>
  <figure>
    <a href="/assets/images/pineapple_alpha_map_t2.png"><img src="/assets/images/pineapple_alpha_map_t2_thumb.png" alt="pineapple-alpha trace map, 2 threads"></a>
    <figcaption>2 threads<br><a href="https://jxl-trace-data.netlify.app/pineapple_alpha_map_t2.jxl">jxl</a></figcaption>
  </figure>
  <figure>
    <a href="/assets/images/pineapple_alpha_map_t4.png"><img src="/assets/images/pineapple_alpha_map_t4_thumb.png" alt="pineapple-alpha trace map, 4 threads"></a>
    <figcaption>4 threads<br><a href="https://jxl-trace-data.netlify.app/pineapple_alpha_map_t4.jxl">jxl</a></figcaption>
  </figure>
  <figure>
    <a href="/assets/images/pineapple_alpha_map_t8.png"><img src="/assets/images/pineapple_alpha_map_t8_thumb.png" alt="pineapple-alpha trace map, 8 threads"></a>
    <figcaption>8 threads<br><a href="https://jxl-trace-data.netlify.app/pineapple_alpha_map_t8.jxl">jxl</a></figcaption>
  </figure>
  <figure>
    <a href="/assets/images/pineapple_alpha_map_t16.png"><img src="/assets/images/pineapple_alpha_map_t16_thumb.png" alt="pineapple-alpha trace map, 16 threads"></a>
    <figcaption>16 threads<br><a href="https://jxl-trace-data.netlify.app/pineapple_alpha_map_t16.jxl">jxl</a></figcaption>
  </figure>
</div>

## Reproducing it

The C program that captures the trace (using libjxl) and the trace-rendering tool live at [ender672/libjxl-thread-visualization](https://github.com/ender672/libjxl-thread-visualization).
