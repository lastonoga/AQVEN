import { defineId, defineType, listType } from "@wf/dsl";
import type { Fn, Id } from "@wf/dsl";
import { z } from "zod";
import type { Agreement, Consensus, ValidationIssue, ValidationReport } from "@wf/std/extract";
import { agreementSchema, consensusSchema, validationIssueSchema } from "./std.js";
import { idValue, schemaOf } from "./schema.js";

export type VendorId = Id<"VendorId">;
export type CurrencyCode = Id<"CurrencyCode">;

export type Vendor = { id: VendorId; name: string; taxNumber: string };
export type Currency = { code: CurrencyCode; title: string };
export type SourceDoc = { text: string; pages: number };
export type Catalog = { currencies: Currency[] };
export type ExtractRequest = { document: SourceDoc; catalog: Catalog };

export type InvoiceLine = { description: string; amountMinor: number };
export type Invoice = {
  vendorId: VendorId;
  currency: CurrencyCode;
  invoiceNo: string;
  totalMinor: number;
  lines: InvoiceLine[];
};
export type InvoiceRecord = { invoice: Invoice; agreement: Agreement; issues: ValidationIssue[] };
export type InvoiceReview = { approve: boolean; correctedTotalMinor: number; comment: string };

const vendorIdType = defineId<VendorId>("VendorId", {
  description: "Идентификатор поставщика; счёт разрешено привязать только к поставщику из справочника арендатора",
  source: "vendors_for_tenant()",
  allowedSet: "dynamic",
  codeFormat: "prefixed_ordinal",
});

const currencyCodeType = defineId<CurrencyCode>("CurrencyCode", {
  description: "Код валюты счёта по ISO 4217; допустимы только валюты из справочника",
  source: "catalog.currencies[].code",
  allowedSet: "dynamic",
  codeFormat: "identity",
});

const vendorIdSchema = schemaOf(vendorIdType);
const currencyCodeSchema = schemaOf(currencyCodeType);

const vendorSchema: z.ZodType<Vendor> = z.object({
  id: vendorIdSchema.describe("Идентификатор поставщика в справочнике"),
  name: z.string().describe("Название поставщика так, как оно напечатано в счёте"),
  taxNumber: z.string().describe("ИНН или налоговый номер поставщика"),
});

const vendorExample: Vendor = {
  id: idValue<VendorId>("vnd-teplo-service"),
  name: 'ООО «Тепло-Сервис»',
  taxNumber: "7719456123",
};

const vendorType = defineType("Vendor", {
  schema: vendorSchema,
  description: "Поставщик из справочника арендатора: кандидат на привязку счёта",
  example: vendorExample,
});

const currencySchema: z.ZodType<Currency> = z.object({
  code: currencyCodeSchema.describe("Код валюты по ISO 4217"),
  title: z.string().describe("Название валюты по-русски"),
});

const currencyExample: Currency = { code: idValue<CurrencyCode>("RUB"), title: "Российский рубль" };

const currencyType = defineType("Currency", {
  schema: currencySchema,
  description: "Валюта из справочника: разрешённое значение поля счёта",
  example: currencyExample,
});

const sourceDocSchema: z.ZodType<SourceDoc> = z.object({
  text: z.string().describe("Распознанный текст документа целиком, в порядке страниц"),
  pages: z.int().describe("Число страниц документа"),
});

const sourceDocExample: SourceDoc = {
  text: "СЧЁТ № 114 от 12.03.2025\nПоставщик: ООО «Тепло-Сервис», ИНН 7719456123\nТеплоноситель, 200 л — 84 000,00\nМонтаж узла учёта — 36 500,00\nИтого к оплате: 120 500,00 руб.",
  pages: 1,
};

const sourceDocType = defineType("SourceDoc", {
  schema: sourceDocSchema,
  description: "Исходный документ счёта, из которого извлекаются поля",
  example: sourceDocExample,
});

const catalogSchema: z.ZodType<Catalog> = z.object({
  currencies: z.array(currencySchema).describe("Валюты, разрешённые для счетов этого арендатора"),
});

const catalogExample: Catalog = { currencies: [currencyExample] };

const catalogType = defineType("Catalog", {
  schema: catalogSchema,
  description: "Справочники арендатора, которыми ограничено извлечение счёта",
  example: catalogExample,
});

const extractRequestSchema: z.ZodType<ExtractRequest> = z.object({
  document: sourceDocSchema.describe("Документ счёта, из которого извлекаются поля"),
  catalog: catalogSchema.describe("Справочники, ограничивающие значения полей"),
});

const extractRequestExample: ExtractRequest = { document: sourceDocExample, catalog: catalogExample };

const extractRequestType = defineType("ExtractRequest", {
  schema: extractRequestSchema,
  description: "Заявка на извлечение счёта: вход воркфлоу extract_validate",
  example: extractRequestExample,
});

const invoiceLineSchema: z.ZodType<InvoiceLine> = z.object({
  description: z.string().describe("Назначение строки счёта так, как оно напечатано"),
  amountMinor: z.int().describe("Сумма строки в копейках выбранной валюты"),
});

const invoiceSchema: z.ZodType<Invoice> = z.object({
  vendorId: vendorIdSchema.describe("Поставщик счёта: только из справочника арендатора"),
  currency: currencyCodeSchema.describe("Валюта счёта: только из справочника валют"),
  invoiceNo: z.string().describe("Номер счёта так, как он напечатан в документе"),
  totalMinor: z.int().describe("Итог счёта в копейках; обязан сходиться с суммой строк"),
  lines: z.array(invoiceLineSchema).describe("Строки счёта в порядке их следования в документе"),
});

const invoiceExample: Invoice = {
  vendorId: idValue<VendorId>("vnd-teplo-service"),
  currency: idValue<CurrencyCode>("RUB"),
  invoiceNo: "114",
  totalMinor: 12_050_000,
  lines: [
    { description: "Теплоноситель, 200 л", amountMinor: 8_400_000 },
    { description: "Монтаж узла учёта", amountMinor: 3_650_000 },
  ],
};

const invoiceType = defineType("Invoice", {
  schema: invoiceSchema,
  description: "Счёт поставщика: поля, извлечённые из документа и сверенные со справочниками",
  example: invoiceExample,
});

const invoiceConsensusExample: Consensus<Invoice> = {
  value: invoiceExample,
  agreement: {
    level: "majority",
    share: 0.67,
    fields: [
      { field: "totalMinor", level: "unanimous", share: 1 },
      { field: "invoiceNo", level: "majority", share: 0.67 },
    ],
  },
};

const invoiceConsensusType = defineType("Consensus<Invoice>", {
  schema: consensusSchema(invoiceSchema, "Счёт, собранный из согласованных извлечений"),
  description: "Согласие трёх независимых извлечений счёта: значение и уровень согласия по полям",
  example: invoiceConsensusExample,
});

const invoiceRecordSchema: z.ZodType<InvoiceRecord> = z.object({
  invoice: invoiceSchema.describe("Счёт после слияния извлечений и валидации"),
  agreement: agreementSchema.describe("Согласие извлечений по документу и по критичным полям"),
  issues: z.array(validationIssueSchema).describe("Нарушения правил, найденные при проверке счёта"),
});

const invoiceRecordExample: InvoiceRecord = {
  invoice: invoiceExample,
  agreement: invoiceConsensusExample.agreement,
  issues: [
    {
      field: "invoiceNo",
      severity: "warning",
      rule: "number_format",
      hint: "Два извлечения дали «114», одно — «No 114»; проверьте номер по скану",
    },
  ],
};

const invoiceRecordType = defineType("InvoiceRecord", {
  schema: invoiceRecordSchema,
  description: "Запись счёта для учётной системы: счёт, согласие извлечений и замечания валидации",
  example: invoiceRecordExample,
});

const invoiceReviewSchema: z.ZodType<InvoiceReview> = z.object({
  approve: z.boolean().describe("Проводить ли счёт в учётной системе"),
  correctedTotalMinor: z.int().describe("Итог счёта в копейках после правки оператором"),
  comment: z.string().describe("Комментарий оператора: что исправлено и на основании чего"),
});

const invoiceReviewExample: InvoiceReview = {
  approve: true,
  correctedTotalMinor: 12_050_000,
  comment: "Номер счёта сверен со сканом: 114. Итог совпадает с суммой строк.",
};

const invoiceReviewFormType = defineType<unknown>("InvoiceReviewForm", {
  schema: invoiceReviewSchema,
  description: "Форма разбора счёта оператором: проводить ли счёт и какой итог считать верным",
  example: invoiceReviewExample,
});

export const t = {
  VendorId: vendorIdType,
  CurrencyCode: currencyCodeType,
  Vendor: vendorType,
  VendorArr: listType(vendorType),
  Currency: currencyType,
  SourceDoc: sourceDocType,
  Catalog: catalogType,
  ExtractRequest: extractRequestType,
  Invoice: invoiceType,
  InvoiceConsensus: invoiceConsensusType,
  InvoiceRecord: invoiceRecordType,
  InvoiceReviewForm: invoiceReviewFormType,
};

export const vendorsForTenant: Fn<{ document: SourceDoc }, Vendor[]> = { name: "vendors_for_tenant" };
export const extractInvoice: Fn<
  { document: SourceDoc; vendors: Vendor[]; currencies: Currency[] },
  Invoice
> = { name: "extract_invoice" };
export const checkInvoiceArithmetic: Fn<{ value: Invoice; rules: string[] }, ValidationReport> = {
  name: "check_invoice_arithmetic",
};
export const mergeInvoice: Fn<
  { draft: Invoice; consensus: Consensus<Invoice>; report: ValidationReport },
  InvoiceRecord
> = { name: "merge_invoice" };
