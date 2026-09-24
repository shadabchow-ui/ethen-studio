// ── Business ops normalized types ───────────────────────────────────────────
// Shared across CRM, support, payment, and commerce providers.
// Every type is minimised for safe client exposure — no raw provider blobs.

/** Normalised account / company record. */
export interface NormalizedAccount {
  id: string;
  providerId: string;
  name: string;
  /** Domain or website when available. */
  website: string | null;
  /** Industry / vertical classification. */
  industry: string | null;
  /** Number of employees when available. */
  employeeCount: number | null;
  /** Annual revenue when available. */
  annualRevenue: number | null;
  /** Primary phone (minimised to last 4 digits when sensitive). */
  phoneDisplay: string | null;
  /** ISO 8601 timestamp when the record was last modified upstream. */
  updatedAt: string | null;
}

/** Normalised contact / customer person record. */
export interface NormalizedContact {
  id: string;
  providerId: string;
  /** Full name or display name. */
  name: string;
  /** Redacted email (e.g. j***@***domain.com). */
  emailDisplay: string | null;
  /** Minimised phone display. */
  phoneDisplay: string | null;
  /** Associated account/company name. */
  accountName: string | null;
  /** Job title. */
  title: string | null;
  updatedAt: string | null;
}

/** Normalised deal / opportunity record. */
export interface NormalizedDeal {
  id: string;
  providerId: string;
  name: string;
  /** Deal stage / status label. */
  stage: string | null;
  /** Deal amount when available. */
  amount: number | null;
  /** Currency code when provided. */
  currency: string | null;
  /** Expected close date ISO 8601. */
  closeDate: string | null;
  /** Associated contact name. */
  contactName: string | null;
  /** Associated account name. */
  accountName: string | null;
  updatedAt: string | null;
}

/** Normalised support ticket or conversation record. */
export interface NormalizedTicket {
  id: string;
  providerId: string;
  /** Ticket subject or conversation title. */
  subject: string;
  /** Ticket status (e.g. open, pending, solved, closed). */
  status: string | null;
  /** Priority label when available. */
  priority: string | null;
  /** Requester / contact name (minimised). */
  requesterName: string | null;
  /** Redacted requester email. */
  requesterEmailDisplay: string | null;
  /** ISO 8601 when the ticket was created. */
  createdAt: string | null;
  /** ISO 8601 when the ticket was last updated. */
  updatedAt: string | null;
}

/** Normalised order record (commerce). */
export interface NormalizedOrder {
  id: string;
  providerId: string;
  /** Order number / display ID. */
  orderNumber: string;
  /** Order status label. */
  status: string | null;
  /** Total amount. */
  total: number | null;
  /** Currency code. */
  currency: string | null;
  /** Customer name (minimised). */
  customerName: string | null;
  /** ISO 8601 order creation timestamp. */
  createdAt: string | null;
  /** ISO 8601 last update timestamp. */
  updatedAt: string | null;
}

/** Normalised payment / invoice record. */
export interface NormalizedInvoice {
  id: string;
  providerId: string;
  /** Invoice number / display ID. */
  invoiceNumber: string;
  /** Invoice status (e.g. paid, open, overdue, void). */
  status: string | null;
  /** Total amount. */
  total: number | null;
  /** Currency code. */
  currency: string | null;
  /** Customer name (minimised). */
  customerName: string | null;
  /** ISO 8601 due date. */
  dueDate: string | null;
  /** ISO 8601 when the invoice was created. */
  createdAt: string | null;
  updatedAt: string | null;
}

/** Normalised product / store item reference. */
export interface NormalizedProduct {
  id: string;
  providerId: string;
  name: string;
  /** SKU or product code when available. */
  sku: string | null;
  /** Price when available. */
  price: number | null;
  /** Currency code. */
  currency: string | null;
  /** Inventory quantity or null when not tracked. */
  inventoryQuantity: number | null;
  updatedAt: string | null;
}

/** Normalised activity / comment / note record. */
export interface NormalizedActivity {
  id: string;
  providerId: string;
  /** Activity type label (e.g. note, comment, email, call). */
  type: string | null;
  /** Truncated / minimised body text (max 500 chars). */
  body: string | null;
  /** Author display name (minimised). */
  authorName: string | null;
  /** ISO 8601 creation timestamp. */
  createdAt: string | null;
}
