export function invoiceDueDate(issueDate: string) {
  const due = new Date(`${issueDate.slice(0, 7)}-10T00:00:00Z`);
  if (issueDate > due.toISOString().slice(0, 10)) {
    due.setUTCMonth(due.getUTCMonth() + 1);
  }
  return due.toISOString().slice(0, 10);
}

// Invoice queries use i for the invoice and d for its optional delivery.
export const invoiceSlipNumberSql = "COALESCE(NULLIF(ltrim(substring(d.delivery_no FROM '^DEL-([0-9]+)$'),'0'),''),'L'||i.id::text)";

export function invoiceSlipCode(issueDate: string, slipNumber: string) {
  return `INV-${issueDate.replaceAll('-', '')}-${slipNumber}`;
}
