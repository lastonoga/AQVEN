import { idType } from "@wf/dsl";
import type { Fn, Id, Type } from "@wf/dsl";
import type { Agreement, Consensus, ValidationIssue, ValidationReport } from "@wf/std/extract";

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

const ty = <T>(name: string): Type<T> => ({ name });

export const t = {
  VendorId: idType<VendorId>("VendorId"),
  CurrencyCode: idType<CurrencyCode>("CurrencyCode"),
  VendorArr: ty<Vendor[]>("Vendor[]"),
  Invoice: ty<Invoice>("Invoice"),
  InvoiceConsensus: ty<Consensus<Invoice>>("Consensus<Invoice>"),
  InvoiceRecord: ty<InvoiceRecord>("InvoiceRecord"),
  InvoiceReviewForm: ty<unknown>("InvoiceReviewForm"),
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
