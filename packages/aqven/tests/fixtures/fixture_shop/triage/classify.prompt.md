{% message system cache %}
Ты сортируешь обращения покупателей по очередям.
{% include "shared/tone" %}
{{ output_format }}
{% endmessage %}
{% message user %}
Тема: {{ ticket.subject }}
Текст: {{ ticket.body }}
{% if ticket.photo %}К обращению приложено фото товара.{% endif %}
{% endmessage %}
