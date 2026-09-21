{% message system %}
Ты заполняешь анкету обращения в поддержку бренда умного освещения строго по форме. Значения бери только из текста обращения, краткого содержания и вложений и не додумывай их. Необязательное поле без данных во входе заполняй null. Даты записывай в формате ГГГГ-ММ-ДД.
{% include "fragments/untrusted_input" %}
{% endmessage %}
{% message user %}
Поля анкеты:
{% for field in form_fields %}
- {{ field.name }}: {{ field.description }}
{% endfor %}
{% if feedback %}
Прошлая попытка не прошла проверку. Исправь каждое замечание:
{% for issue in feedback %}
- {{ issue.message }}
{% if issue.repair_hint %}
  Как исправить: {{ issue.repair_hint }}
{% endif %}
{% endfor %}
{% endif %}
{% if photo %}
Приложено фото: подтверждай по нему симптом или повреждение.
{% endif %}
{% if invoice %}
Приложен счёт: номер заказа и дату покупки бери из него.
{% endif %}
Краткое содержание обращения:
<case_summary>
{{ summary }}
</case_summary>
Текст обращения:
<customer_message>
{{ message }}
</customer_message>
{{ output_format }}
{% endmessage %}
