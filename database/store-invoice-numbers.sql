-- Stable store codes and transactional per-store invoice counters.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS store_code TEXT GENERATED ALWAYS AS
 ('SHP-' || lpad(id::text,GREATEST(6,length(id::text)),'0')) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS shops_store_code_unique ON shops(store_code);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS invoice_sequence BIGINT NOT NULL DEFAULT 0 CHECK (invoice_sequence >= 0);
