---
layout: base.njk
title: Food for Bot
---

{% for post in collections.post | reverse %}
- [{{ post.data.title }}]({{ post.url }})
{% endfor %}
