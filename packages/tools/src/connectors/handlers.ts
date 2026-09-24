import "server-only";

import { registerHandler } from "../connector-runtime";

// ── Salesforce ─────────────────────────────────────────────────────────────
import * as salesforce from "./salesforce/handler";

registerHandler("salesforce", "business-ops.salesforce.search_accounts", salesforce.searchAccounts);
registerHandler("salesforce", "business-ops.salesforce.get_account", salesforce.getAccount);
registerHandler("salesforce", "business-ops.salesforce.search_contacts", salesforce.searchContacts);
registerHandler("salesforce", "business-ops.salesforce.get_contact", salesforce.getContact);
registerHandler("salesforce", "business-ops.salesforce.search_opportunities", salesforce.searchOpportunities);
registerHandler("salesforce", "business-ops.salesforce.get_opportunity", salesforce.getOpportunity);
registerHandler("salesforce", "business-ops.salesforce.draft_note", salesforce.draftNote);
registerHandler("salesforce", "business-ops.salesforce.create_note", salesforce.createNote);
registerHandler("salesforce", "business-ops.salesforce.update_record", salesforce.updateRecord);

// ── HubSpot ────────────────────────────────────────────────────────────────
import * as hubspot from "./hubspot/handler";

registerHandler("hubspot", "business-ops.hubspot.search_contacts", hubspot.searchContacts);
registerHandler("hubspot", "business-ops.hubspot.get_contact", hubspot.getContact);
registerHandler("hubspot", "business-ops.hubspot.search_companies", hubspot.searchCompanies);
registerHandler("hubspot", "business-ops.hubspot.get_company", hubspot.getCompany);
registerHandler("hubspot", "business-ops.hubspot.search_deals", hubspot.searchDeals);
registerHandler("hubspot", "business-ops.hubspot.get_deal", hubspot.getDeal);
registerHandler("hubspot", "business-ops.hubspot.draft_note", hubspot.draftNote);
registerHandler("hubspot", "business-ops.hubspot.create_note", hubspot.createNote);
registerHandler("hubspot", "business-ops.hubspot.update_record", hubspot.updateRecord);

// ── Zendesk ────────────────────────────────────────────────────────────────
import * as zendesk from "./zendesk/handler";

registerHandler("zendesk", "business-ops.zendesk.search_tickets", zendesk.searchTickets);
registerHandler("zendesk", "business-ops.zendesk.get_ticket", zendesk.getTicket);
registerHandler("zendesk", "business-ops.zendesk.draft_reply", zendesk.draftReply);
registerHandler("zendesk", "business-ops.zendesk.send_reply", zendesk.sendReply);
registerHandler("zendesk", "business-ops.zendesk.update_ticket_status", zendesk.updateTicketStatus);

// ── Intercom ───────────────────────────────────────────────────────────────
import * as intercom from "./intercom/handler";

registerHandler("intercom", "business-ops.intercom.search_conversations", intercom.searchConversations);
registerHandler("intercom", "business-ops.intercom.get_conversation", intercom.getConversation);
registerHandler("intercom", "business-ops.intercom.draft_reply", intercom.draftReply);
registerHandler("intercom", "business-ops.intercom.send_reply", intercom.sendReply);

// ── Stripe ─────────────────────────────────────────────────────────────────
import * as stripe from "./stripe/handler";

registerHandler("stripe", "business-ops.stripe.search_customers", stripe.searchCustomers);
registerHandler("stripe", "business-ops.stripe.get_customer", stripe.getCustomer);
registerHandler("stripe", "business-ops.stripe.list_payments", stripe.listPayments);
registerHandler("stripe", "business-ops.stripe.get_payment", stripe.getPayment);
registerHandler("stripe", "business-ops.stripe.list_invoices", stripe.listInvoices);
registerHandler("stripe", "business-ops.stripe.get_invoice", stripe.getInvoice);
registerHandler("stripe", "business-ops.stripe.draft_customer_update", stripe.draftCustomerUpdate);

// ── Shopify ────────────────────────────────────────────────────────────────
import * as shopify from "./shopify/handler";

registerHandler("shopify", "business-ops.shopify.search_orders", shopify.searchOrders);
registerHandler("shopify", "business-ops.shopify.get_order", shopify.getOrder);
registerHandler("shopify", "business-ops.shopify.search_customers", shopify.searchCustomers);
registerHandler("shopify", "business-ops.shopify.get_customer", shopify.getCustomer);
registerHandler("shopify", "business-ops.shopify.search_products", shopify.searchProducts);
registerHandler("shopify", "business-ops.shopify.get_product", shopify.getProduct);
registerHandler("shopify", "business-ops.shopify.draft_order_update", shopify.draftOrderUpdate);

// ── QuickBooks ─────────────────────────────────────────────────────────────
import * as quickbooks from "./quickbooks/handler";

registerHandler("quickbooks", "business-ops.quickbooks.search_customers", quickbooks.searchCustomers);
registerHandler("quickbooks", "business-ops.quickbooks.get_customer", quickbooks.getCustomer);
registerHandler("quickbooks", "business-ops.quickbooks.list_invoices", quickbooks.listInvoices);
registerHandler("quickbooks", "business-ops.quickbooks.get_invoice", quickbooks.getInvoice);
registerHandler("quickbooks", "business-ops.quickbooks.draft_invoice_update", quickbooks.draftInvoiceUpdate);
registerHandler("quickbooks", "business-ops.quickbooks.create_invoice", quickbooks.createInvoice);
