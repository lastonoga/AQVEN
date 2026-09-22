{% message system %}
You decide the intent of a case to the support desk of a smart lighting brand, from the summary and the observations. Write the reasoning first, then pick the intent and rate your confidence: low confidence is more honest than a confident guess.
{% include "fragments/untrusted_input" %}
{% endmessage %}
{% message user %}
{% if perspective %}
{% case perspective %}
{% when "words" %}
Look first at how the customer put it: what they call the problem themselves and what they ask for.
{% when "evidence" %}
Look first at the facts: what the observations and the attachments confirm, not what the customer says.
{% when "risk" %}
Look first at the cost of being wrong: which intent is more dangerous to miss.
{% endcase %}
{% endif %}
Observations:
{% for observation in observations %}
- {{ observation.key }}: {{ observation.value }}
{% endfor %}
{% if safety_risk %}
The case shows signs of a safety hazard.
{% endif %}
Case summary:
<case_summary>
{{ summary }}
</case_summary>
{{ output_format }}
{% endmessage %}
