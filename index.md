---
layout: base.njk
title: Food for Bot
description: A technical blog.
---

{% for post in collections.post | reverse %}
- <time datetime="{{ post.date | isoDate }}">{{ post.date | readableDate }}</time> — [{{ post.data.title }}]({{ post.url }})
{% endfor %}
