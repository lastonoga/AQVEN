import { defineFlow, tool, llm, code, call, human, branch, root, $const } from "@wf/dsl";
import { consensusExtractor, extractTypes } from "@wf/std/extract";
import type { ConflictPolicy } from "@wf/std/extract";
import { t, vendorsForTenant, extractInvoice, checkInvoiceArithmetic, mergeInvoice } from "./domain/invoices.js";
import type { ExtractRequest, Invoice, SourceDoc } from "./domain/invoices.js";

const $input = root<ExtractRequest>("input");

const vendors = tool("vendors", {
  description: "Справочник поставщиков арендатора",
  tool: vendorsForTenant, effect: "read", ttlSeconds: 3600, timeoutMs: 8_000,
  out: t.VendorArr, in: { document: $input.document },
});

const extract = llm("extract", {
  description: "Экстракция полей счёта: поставщик и валюта — только из справочников",
  fn: extractInvoice, modelRole: "extractor", trustIn: "untrusted",
  overrides: { temperature: 0, maxOutputTokens: 900 },
  allowedSets: [
    { type: t.VendorId, from: vendors.out.$all.id },
    { type: t.CurrencyCode, from: $input.catalog.currencies.$all.code },
  ],
  outputContract: { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" },
  in: { document: $input.document, vendors: vendors.out, currencies: $input.catalog.currencies },
});

const validate = code("validate", {
  description: "Арифметика счёта: сумма строк против итога",
  fn: checkInvoiceArithmetic, pure: true, timeoutMs: 3_000, out: extractTypes.ValidationReport,
  in: { value: extract.out, rules: $const(["lines_sum_equals_total", "invoice_no_format"]) },
});

const consensus = call("consensus", {
  description: "Три независимых прогона экстрактора и согласование критичных полей",
  component: consensusExtractor<Invoice, SourceDoc>(), typeArgs: ["Invoice"],
  out: t.InvoiceConsensus, budget: { usdMicros: 90_000 },
  in: { doc: $input.document, n: $const(3), threshold: $const(0.67),
    criticalFields: $const(["vendorId", "invoiceNo", "totalMinor"]), onConflict: $const<ConflictPolicy>("escalate") },
});

const reconcile = code("reconcile", {
  description: "Сборка записи: значения согласования, ошибки валидации",
  fn: mergeInvoice, pure: true, timeoutMs: 3_000, out: t.InvoiceRecord,
  in: { draft: extract.out, consensus: consensus.out, report: validate.out },
});

const review = human("review", {
  description: "Разбор расхождения по критичным полям",
  form: t.InvoiceReviewForm, timeoutSeconds: 86_400, onTimeout: "escalate", out: t.InvoiceRecord,
  in: { record: reconcile.out, agreement: consensus.out.agreement },
});

const decide = branch("decide", {
  description: "Согласие экстракторов по критичным полям",
  on: consensus.out.agreement.level, onType: extractTypes.AgreementLevel, default: null,
  cases: { unanimous: reconcile.out, majority: reconcile.out, conflict: review },
});

export default defineFlow({
  flow: "extract_validate", version: 1, input: "ExtractRequest",
  output: { type: "InvoiceRecord", from: decide.out },
  context: ["date", "locale", "tenant"],
  budget: { usdMicros: 200_000, seconds: 120, tokens: null },
  policies: { trust: { defaultIn: "untrusted" }, pii: { maskInTraces: true, allowlistProfile: "pii_safe" },
    escalation: { role: "accountant" } },
  defaults: { retry: { attempts: 2, backoff: "exponential", baseDelayMs: 500, jitter: "full",
      retryOn: ["timeout", "rate_limit", "server_error"] }, timeoutMs: 45_000 },
  nodes: [vendors, extract, validate, consensus, reconcile, review, decide],
});
