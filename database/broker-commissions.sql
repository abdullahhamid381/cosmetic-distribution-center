CREATE TABLE IF NOT EXISTS sales_brokers (
 id BIGSERIAL PRIMARY KEY,
 full_name TEXT NOT NULL,
 phone TEXT NOT NULL DEFAULT '',
 email TEXT NOT NULL DEFAULT '',
 commission_pct NUMERIC(5,2) NOT NULL DEFAULT 10 CHECK(commission_pct BETWEEN 0 AND 100),
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sales_agents ALTER COLUMN commission_pct SET DEFAULT 20;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='customer_orders' AND column_name='commission_basis') THEN
  ALTER TABLE customer_orders ADD COLUMN commission_basis TEXT NOT NULL DEFAULT 'PROFIT' CHECK(commission_basis IN ('PROFIT','RETAIL'));
  UPDATE sales_agents SET commission_pct=20 WHERE commission_pct=0;
  UPDATE customer_orders SET commission_basis='RETAIL',commission_pct=CASE WHEN commission_pct=0 THEN 20 ELSE commission_pct END WHERE status IN ('PENDING','DISPATCHED');
 END IF;
END $$;
ALTER TABLE customer_orders ALTER COLUMN commission_basis SET DEFAULT 'RETAIL';
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS broker_id BIGINT REFERENCES sales_brokers(id);
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS broker_pct NUMERIC(5,2) NOT NULL DEFAULT 10 CHECK(broker_pct BETWEEN 0 AND 100);
-- Settled snapshots retain their original basis. The one-time block preserves later custom zero rates.
CREATE INDEX IF NOT EXISTS customer_orders_broker ON customer_orders(broker_id);
CREATE TABLE IF NOT EXISTS broker_commission_payouts (
 id BIGSERIAL PRIMARY KEY,
 broker_id BIGINT NOT NULL REFERENCES sales_brokers(id),
 amount NUMERIC(14,2) NOT NULL CHECK(amount>0),
 method TEXT NOT NULL CHECK(method IN ('CASH','BANK','EASYPAISA','JAZZCASH','OTHER')),
 reference TEXT NOT NULL DEFAULT '',
 note TEXT NOT NULL DEFAULT '',
 payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
 created_by BIGINT NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS broker_commission_payouts_broker ON broker_commission_payouts(broker_id);
