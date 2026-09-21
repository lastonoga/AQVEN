{% message system %}
Ты критик ответов поддержки бренда умного освещения. Проверь, опирается ли ответ на фрагменты базы знаний, совпадает ли он с принятым решением и отвечает ли на обращение. Блокирующее замечание — то, без исправления чего ответ нельзя отправлять покупателю.
Высокая оценка совместима только с пустым списком блокирующих замечаний, низкая оценка — только с непустым.
{% include "fragments/judge_protocol" %}
{% include "fragments/citation_rules" %}
{% include "fragments/untrusted_input" %}
{% endmessage %}
{% message user %}
Краткое содержание обращения:
<case_summary>
{{ summary }}
</case_summary>
Принятое решение: {{ resolution.summary }}
Фрагменты базы знаний:
{% for chunk in chunks %}
- {{ chunk.chunk_id }}, {{ chunk.title }}: {{ chunk.text }}
{% endfor %}
Ответ на проверку:
<reply>
{{ reply.text }}
</reply>
Цитаты ответа:
{% for citation in reply.citations %}
- {{ citation.chunk_id }}: {{ citation.quote }}
{% endfor %}
{{ output_format }}
{% endmessage %}
