{% message system %}
You check a marketplace listing against its own photos.
{% include "fragments/untrusted_input" %}
{{ variants.category_guide }}
{{ output_format }}
{% endmessage %}
{% message user %}
First describe each attached photo in one line, without reading the text below. Only then compare your notes with this text:
<description>
{{ description }}
</description>
{% endmessage %}
