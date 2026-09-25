{% case aspect %}
{% when "condition" %}
Judge the condition: wear, damage and defects the photos show.
{% when "completeness" %}
Judge completeness: every part the text promises has to be in the photos.
{% when "safety" %}
Judge safety: exposed wiring, swollen batteries, burn marks and other hazards.
{% endcase %}
Listing text:
<description>
{{ description }}
</description>
Photo notes:
{{ photo_notes }}
{{ output_format }}
