ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS payment_plan TEXT NOT NULL DEFAULT 'PENDING' CHECK(payment_plan IN ('COD','ADVANCE','PENDING'));
CREATE TABLE IF NOT EXISTS order_payment_reports (
 id BIGSERIAL PRIMARY KEY,
 order_id BIGINT NOT NULL REFERENCES customer_orders(id),
 amount NUMERIC(14,2) NOT NULL CHECK(amount>0),
 method TEXT NOT NULL CHECK(method IN ('CASH','BANK','EASYPAISA','JAZZCASH','OTHER')),
 reference TEXT NOT NULL DEFAULT '',
 note TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','VERIFIED','REJECTED')),
 created_by BIGINT NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 reviewed_by BIGINT REFERENCES users(id),
 reviewed_at TIMESTAMPTZ,
 review_note TEXT NOT NULL DEFAULT '',
 payment_id BIGINT UNIQUE REFERENCES customer_order_payments(id)
);
CREATE INDEX IF NOT EXISTS order_payment_reports_order ON order_payment_reports(order_id,status);
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
