ALTER TABLE invoices ADD COLUMN IF NOT EXISTS broker_id BIGINT REFERENCES sales_brokers(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS broker_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK(broker_pct BETWEEN 0 AND 100);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS broker_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0
 CHECK(broker_discount_pct BETWEEN 0 AND 100 AND broker_discount_pct+discount_pct<=100);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS company_unit_price NUMERIC(14,2) CHECK(company_unit_price>=0);
UPDATE invoice_items SET company_unit_price=applied_unit_price WHERE company_unit_price IS NULL;
CREATE INDEX IF NOT EXISTS invoices_broker ON invoices(broker_id);
