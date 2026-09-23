{% message system %}
You decide the intent of a case to the support desk of a smart lighting brand, from the customer's own message.
{% include "fragments/intent_rubric" %}
{% include "fragments/untrusted_input" %}
{% endmessage %}
{% message user %}
{% if product %}
The customer picked the product "{{ product.name }}" from the {{ product.category }} category.
{% endif %}
Case text:
<customer_message>
{{ message }}
</customer_message>
{{ output_format }}
{% endmessage %}
