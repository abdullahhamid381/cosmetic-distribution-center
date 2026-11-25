ALTER TABLE broker_commission_payouts ADD COLUMN IF NOT EXISTS payment_time TIME;
ALTER TABLE broker_commission_payouts ADD COLUMN IF NOT EXISTS balance_before NUMERIC(14,2);
ALTER TABLE broker_commission_payouts ADD COLUMN IF NOT EXISTS balance_after NUMERIC(14,2);
CREATE TABLE IF NOT EXISTS broker_payout_receipts (
 payout_id BIGINT PRIMARY KEY REFERENCES broker_commission_payouts(id) ON DELETE CASCADE,
 file_name TEXT NOT NULL,
 content_type TEXT NOT NULL CHECK(content_type IN ('application/pdf','image/jpeg','image/png','image/webp')),
 file_data BYTEA NOT NULL CHECK(octet_length(file_data)<=5242880),
 uploaded_by BIGINT REFERENCES users(id),
 uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
