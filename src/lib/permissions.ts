/**
 * Role checks shared by the routes, so a page and the API it calls can never
 * disagree about who is allowed in.
 */
export function canManageWarehouse(role: string) {
  return role === "warehouse" || role === "admin";
}

/**
 * Recording a purchase — scanning an invoice, reviewing its lines and saving
 * it. The warehouse user does the shopping, so they file the invoice too;
 * everything after it (the ledger, reports, the card statement) stays admin.
 */
export function canRecordPurchases(role: string) {
  return role === "warehouse" || role === "admin";
}
