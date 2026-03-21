# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development

```bash
npm run dev      # Local dev server with live reload
npm run build    # Production build to _site/
```

## Architecture

Vanilla Eleventy v3 static blog deployed to GitHub Pages. Single Nunjucks layout (`_includes/base.njk`). Posts live in `posts/` with `tags: post` frontmatter for collection membership. Interactive visualizations are embedded inline in post Markdown as `<style>` and `<script>` blocks.
