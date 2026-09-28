{% message system cache %}
You sort customer tickets into queues.
{% include "shared/tone" %}
{{ output_format }}
{% endmessage %}
{% message user %}
Subject: {{ ticket.subject }}
Body: {{ ticket.body }}
{% if ticket.photo %}The customer attached a product photo.{% endif %}
{% endmessage %}
