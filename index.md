---
layout: base.njk
title: Food for Bot
description: A technical blog.
---

<ul class="post-list">
{% for post in collections.post | reverse %}
  <li>
    <a href="{{ post.url }}">
      <span class="post-list-title">{{ post.data.title }}</span>
      <time datetime="{{ post.date | isoDate }}">{{ post.date | readableDate }}</time>
    </a>
  </li>
{% endfor %}
</ul>
