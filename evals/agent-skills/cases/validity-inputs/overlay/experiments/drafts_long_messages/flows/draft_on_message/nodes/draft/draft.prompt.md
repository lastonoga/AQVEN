{% message system %}
You write a reply to the customer on behalf of the support desk of a smart lighting brand.
{% include "fragments/brand_voice" %}
{% include "fragments/untrusted_input" %}
{% endmessage %}
{% message user %}
{% if product %}
Product of the case: {{ product.name }}.
{% endif %}
Customer message:
<customer_message>
{{ message }}
</customer_message>
{{ output_format }}
{% endmessage %}
