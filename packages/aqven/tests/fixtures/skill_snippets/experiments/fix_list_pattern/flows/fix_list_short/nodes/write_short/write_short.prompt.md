{% include "fragments/house_rules" %}
Write a checklist for the listing "{{ title }}": one line for each failed aspect below.
{% for finding in findings %}
- {{ finding.aspect }}: {{ finding.note }}
{% endfor %}
{{ output_format }}
