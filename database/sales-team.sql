CREATE TABLE IF NOT EXISTS sales_agents (
 id BIGSERIAL PRIMARY KEY,
 user_id BIGINT NOT NULL UNIQUE REFERENCES users(id),
 phone TEXT NOT NULL DEFAULT '',
 commission_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK(commission_pct BETWEEN 0 AND 100),
 active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS customer_orders (
 id BIGSERIAL PRIMARY KEY,
 agent_id BIGINT NOT NULL REFERENCES sales_agents(id),
 customer_name TEXT NOT NULL,
 phone TEXT NOT NULL,
 alternate_phone TEXT NOT NULL DEFAULT '',
 address TEXT NOT NULL,
 city TEXT NOT NULL,
 requirements TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','DISPATCHED','DELIVERED','RETURNED','CANCELLED')),
 courier_name TEXT NOT NULL DEFAULT '',
 tracking_number TEXT NOT NULL DEFAULT '',
 shipping_charge NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(shipping_charge>=0),
 courier_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(courier_cost>=0),
 shipping_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(shipping_cost>=0),
 return_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(return_cost>=0),
 commission_pct NUMERIC(5,2) NOT NULL CHECK(commission_pct BETWEEN 0 AND 100),
 created_by BIGINT NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS customer_order_items (
 id BIGSERIAL PRIMARY KEY,
 order_id BIGINT NOT NULL REFERENCES customer_orders(id),
 batch_id BIGINT NOT NULL REFERENCES batches(id),
 product_id BIGINT NOT NULL REFERENCES products(id),
 quantity INTEGER NOT NULL CHECK(quantity>0),
 retail_price NUMERIC(14,2) NOT NULL CHECK(retail_price>=0),
 unit_cost NUMERIC(14,2) NOT NULL CHECK(unit_cost>=0),
 UNIQUE(order_id,batch_id)
);
CREATE TABLE IF NOT EXISTS customer_order_history (
 id BIGSERIAL PRIMARY KEY,
 order_id BIGINT NOT NULL REFERENCES customer_orders(id),
 status TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '',
 changed_by BIGINT NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE customer_order_items ADD COLUMN IF NOT EXISTS original_retail_price NUMERIC(14,2) CHECK(original_retail_price>=0);
ALTER TABLE customer_order_items ADD COLUMN IF NOT EXISTS first_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK(first_discount_pct BETWEEN 0 AND 100);
ALTER TABLE customer_order_items ADD COLUMN IF NOT EXISTS second_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK(second_discount_pct BETWEEN 0 AND 100);
CREATE INDEX IF NOT EXISTS customer_orders_agent_status ON customer_orders(agent_id,status);
ALTER TABLE customer_orders ALTER COLUMN agent_id DROP NOT NULL;
