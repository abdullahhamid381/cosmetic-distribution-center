ALTER TABLE invoices ADD COLUMN IF NOT EXISTS legacy_invoice_no TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_legacy_reference_unique ON invoices(legacy_invoice_no);
