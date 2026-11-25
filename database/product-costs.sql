ALTER TABLE products ADD COLUMN IF NOT EXISTS box_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(box_cost>=0);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS cost_basis TEXT NOT NULL DEFAULT 'BATCH' CHECK(cost_basis IN ('FULL','MANUFACTURING','BOX','BATCH'));
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS manufacturing_unit_cost NUMERIC(14,2) CHECK(manufacturing_unit_cost>=0);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS box_unit_cost NUMERIC(14,2) CHECK(box_unit_cost>=0);
