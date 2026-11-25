ALTER TABLE sales_agents ADD COLUMN IF NOT EXISTS designation TEXT NOT NULL DEFAULT 'Sales Agent';
ALTER TABLE sales_agents ADD COLUMN IF NOT EXISTS territory TEXT NOT NULL DEFAULT '';
ALTER TABLE sales_agents ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';
ALTER TABLE sales_agents ADD COLUMN IF NOT EXISTS joined_on DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE sales_agents ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS landmark TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS postal_code TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'DIRECT';
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK(priority IN ('NORMAL','HIGH','URGENT'));
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS expected_delivery DATE;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ;
UPDATE customer_orders o SET delivered_at=h.at FROM (SELECT order_id,MIN(created_at) AS at FROM customer_order_history WHERE status='DELIVERED' GROUP BY order_id) h WHERE o.id=h.order_id AND o.delivered_at IS NULL;
UPDATE customer_orders o SET dispatched_at=h.at FROM (SELECT order_id,MIN(created_at) AS at FROM customer_order_history WHERE status='DISPATCHED' GROUP BY order_id) h WHERE o.id=h.order_id AND o.dispatched_at IS NULL;
CREATE TABLE IF NOT EXISTS sales_agent_targets (
 agent_id BIGINT NOT NULL REFERENCES sales_agents(id),
 month DATE NOT NULL CHECK(EXTRACT(DAY FROM month)=1),
 retail_target NUMERIC(14,2) NOT NULL CHECK(retail_target>=0),
 order_target INTEGER NOT NULL DEFAULT 0 CHECK(order_target>=0),
 updated_by BIGINT NOT NULL REFERENCES users(id),
 PRIMARY KEY(agent_id,month)
);
CREATE TABLE IF NOT EXISTS customer_order_payments (
 id BIGSERIAL PRIMARY KEY,
 order_id BIGINT NOT NULL REFERENCES customer_orders(id),
 kind TEXT NOT NULL CHECK(kind IN ('COLLECTION','REFUND')),
 amount NUMERIC(14,2) NOT NULL CHECK(amount>0),
 method TEXT NOT NULL CHECK(method IN ('CASH','BANK','EASYPAISA','JAZZCASH','COD','OTHER')),
 reference TEXT NOT NULL DEFAULT '',
 note TEXT NOT NULL DEFAULT '',
 payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
 created_by BIGINT NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS customer_order_payments_order ON customer_order_payments(order_id);
CREATE TABLE IF NOT EXISTS sales_commission_payouts (
 id BIGSERIAL PRIMARY KEY,
 agent_id BIGINT NOT NULL REFERENCES sales_agents(id),
 amount NUMERIC(14,2) NOT NULL CHECK(amount>0),
 method TEXT NOT NULL CHECK(method IN ('CASH','BANK','EASYPAISA','JAZZCASH','OTHER')),
 reference TEXT NOT NULL DEFAULT '',
 note TEXT NOT NULL DEFAULT '',
 payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
 created_by BIGINT NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sales_commission_payouts_agent ON sales_commission_payouts(agent_id);
CREATE TABLE IF NOT EXISTS sales_followups (
 id BIGSERIAL PRIMARY KEY,
 order_id BIGINT NOT NULL REFERENCES customer_orders(id),
 due_date DATE NOT NULL,
 note TEXT NOT NULL,
 created_by BIGINT NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 completed_by BIGINT REFERENCES users(id),
 completed_at TIMESTAMPTZ,
 outcome TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sales_followups_due ON sales_followups(due_date) WHERE completed_at IS NULL;
