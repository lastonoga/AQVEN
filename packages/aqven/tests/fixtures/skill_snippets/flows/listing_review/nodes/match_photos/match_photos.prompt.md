{% message system %}
You check a marketplace listing against its own photos.
{% include "fragments/untrusted_input" %}
{{ variants.category_guide }}
{{ output_format }}
{% endmessage %}
{% message user %}
The photos of the listing are attached. Describe each photo in one line, then say whether they show the item this text describes:
<description>
{{ description }}
</description>
{% endmessage %}
