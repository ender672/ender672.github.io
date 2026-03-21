---
layout: base.njk
title: Tim's Blog
---

{% for post in collections.post | reverse %}
- [{{ post.data.title }}]({{ post.url }})
{% endfor %}
