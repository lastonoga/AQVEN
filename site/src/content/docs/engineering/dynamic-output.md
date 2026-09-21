---
title: Dynamic Output
description: Let an input define fields, then validate the result at a stable boundary.
---

Most model outputs should use a fixed record. Use `Dynamic` when the fields are supplied by data at run time, such as a form whose questions differ by document category. The inference still needs a bounded schema source and a point where the result becomes a stable type.

## Define the fields in the input

`FieldSpec[]` is the built-in type for a list of field definitions. Each field has a `name`, `type`, and `description`, and may include constraints. A run might supply:

```yaml
form_fields:
  - name: "invoice_number"
    type: "Text"
    description: "Invoice identifier printed on the document"
    maxLength: 40
  - name: "total"
    type: "Float"
    description: "Total amount before currency conversion"
    minimum: 0
```

`FieldSpec` cannot contain media, `Dynamic`, or another `FieldSpec` as a field type. A nested record uses `type: "Record"` with `fields`. The generated [FieldSpec reference](/engineering/reference/media/#fieldspec) lists every allowed key and bound.

## Declare a dynamic inference output

This complete inference takes the document text and its form definition. `schema_from` points to the input field definitions:

```yaml
apiVersion: "aqven/v1"
kind: "Inference"
description: "Fill fields defined by the current document form"
in:
  - name: "document_text"
    type: "Text"
    description: "Text extracted from the document"
    maxLength: 10000
  - name: "form_fields"
    type: "FieldSpec[]"
    description: "Fields to extract for this document"
    maxItems: 30
out:
  - name: "record"
    type: "Dynamic"
    description: "Extracted values matching the supplied form"
    schema_from: "$in.form_fields"
    value_type: "InvoiceRecord"
    limits:
      max_fields: 30
      max_depth: 2
      max_text_length: 400
      max_items: 10
```

`limits` bounds a schema assembled from input. Without a bound, one run could request far more fields or nested text than intended. `value_type` is a hint naming a declared record or union; it is only valid on a `Dynamic` output. Changing the form fields changes the schema for that call, even if the inference YAML does not change.

## Narrow before fixed downstream logic

After the dynamic extraction, use a `narrow` node to validate it against the declared business type:

```yaml
apiVersion: "aqven/v1"
kind: "Node"
node: "narrow"
description: "Validate the extracted form as an invoice"
from: "$extract.out.record"
to: "InvoiceRecord"
```

If the generated form lacks a required invoice field, narrowing fails here. This is easier to debug than allowing an invalid value to reach a later tool. Add dataset cases for missing fields, unexpected fields, and nested records. The generated [OutputField reference](/engineering/reference/fields/#outputfield) lists `schema_from`, `value_type`, and `limits`; [DynamicLimits](/engineering/reference/media/#dynamiclimits) lists their bounds.
