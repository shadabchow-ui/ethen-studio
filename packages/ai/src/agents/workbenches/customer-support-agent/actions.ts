import type { CustomerSupportState } from "./state";
import { CUSTOMER_SUPPORT_FIXTURE } from "./fixture";

export function selectTicket(
  state: CustomerSupportState,
  ticketId: string | null,
): CustomerSupportState {
  return {
    ...state,
    selectedTicketId: ticketId,
    rightPanelOpen: ticketId !== null,
    rightPanelTab: ticketId !== null ? state.rightPanelTab : "ai-assist",
  };
}

export function setRightPanelTab(
  state: CustomerSupportState,
  tab: CustomerSupportState["rightPanelTab"],
): CustomerSupportState {
  return {
    ...state,
    rightPanelTab: tab,
  };
}

export function toggleRightPanel(
  state: CustomerSupportState,
): CustomerSupportState {
  return {
    ...state,
    rightPanelOpen: !state.rightPanelOpen,
  };
}

export function setActiveView(
  state: CustomerSupportState,
  view: string,
): CustomerSupportState {
  return {
    ...state,
    activeView: view,
    selectedTicketId: null,
    rightPanelOpen: false,
  };
}

export function createInitialState(): CustomerSupportState {
  return CUSTOMER_SUPPORT_FIXTURE;
}
