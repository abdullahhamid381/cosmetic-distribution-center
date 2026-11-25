-- Cosmetic Distribution Center / initial schema
-- All financial values use NUMERIC(14,2); quantities are whole units.
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'SALES' CHECK (role IN ('ADMIN','MANAGER','WAREHOUSE','SALES','FIELD_SALES','ACCOUNTS','DELIVERY')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS manufacturers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS warehouses (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  location TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT 'GLANŹE',
  category TEXT,
  size_label TEXT,
  barcode TEXT,
  manufacturer_id BIGINT REFERENCES manufacturers(id),
  manufacturer_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (manufacturer_price >= 0),
  landed_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (landed_cost >= 0),
  trade_price NUMERIC(14,2) NOT NULL CHECK (trade_price >= 0),
  retail_price NUMERIC(14,2) NOT NULL CHECK (retail_price >= 0),
  min_stock INTEGER NOT NULL DEFAULT 10 CHECK (min_stock >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS shops (
  id BIGSERIAL PRIMARY KEY,
  shop_name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  region TEXT,
  default_discount NUMERIC(5,2) CHECK(default_discount BETWEEN 0 AND 100),
  credit_limit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(credit_limit >= 0),
  payment_terms_days INTEGER NOT NULL DEFAULT 30 CHECK (payment_terms_days BETWEEN 0 AND 365),
  assigned_sales_id BIGINT REFERENCES users(id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS shop_product_rates (
  shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  discount_pct NUMERIC(5,2) NOT NULL CHECK(discount_pct BETWEEN 0 AND 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(shop_id, product_id)
);
CREATE TABLE IF NOT EXISTS price_audit (
  id BIGSERIAL PRIMARY KEY,
  shop_id BIGINT REFERENCES shops(id),
  product_id BIGINT REFERENCES products(id),
  old_pct NUMERIC(5,2),
  new_pct NUMERIC(5,2),
  changed_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS batches (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id),
  warehouse_id BIGINT NOT NULL REFERENCES warehouses(id),
  batch_number TEXT NOT NULL,
  manufacture_date DATE,
  expiry_date DATE,
  unit_cost NUMERIC(14,2) NOT NULL CHECK(unit_cost >= 0),
  quantity_on_hand INTEGER NOT NULL DEFAULT 0 CHECK(quantity_on_hand >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, warehouse_id, batch_number)
);
CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL REFERENCES batches(id),
  product_id BIGINT NOT NULL REFERENCES products(id),
  warehouse_id BIGINT NOT NULL REFERENCES warehouses(id),
  movement_type TEXT NOT NULL CHECK(movement_type IN ('RECEIPT','DISPATCH','RETURN','ADJUSTMENT','TRANSFER_IN','TRANSFER_OUT')),
  quantity_delta INTEGER NOT NULL CHECK(quantity_delta <> 0),
  reference_type TEXT,
  reference_id BIGINT,
  note TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS stock_transfers (
  id BIGSERIAL PRIMARY KEY,
  source_batch_id BIGINT NOT NULL REFERENCES batches(id),
  destination_batch_id BIGINT NOT NULL REFERENCES batches(id),
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  note TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS deliveries (
  id BIGSERIAL PRIMARY KEY,
  delivery_no TEXT UNIQUE,
  shop_id BIGINT NOT NULL REFERENCES shops(id),
  warehouse_id BIGINT NOT NULL REFERENCES warehouses(id),
  status TEXT NOT NULL DEFAULT 'DISPATCHED' CHECK(status IN ('DISPATCHED','DELIVERED','PARTIAL')),
  recipient_name TEXT,
  tracking_note TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS delivery_items (
  id BIGSERIAL PRIMARY KEY,
  delivery_id BIGINT NOT NULL REFERENCES deliveries(id),
  product_id BIGINT NOT NULL REFERENCES products(id),
  batch_id BIGINT NOT NULL REFERENCES batches(id),
  quantity INTEGER NOT NULL CHECK(quantity > 0)
);
CREATE TABLE IF NOT EXISTS invoices (
  id BIGSERIAL PRIMARY KEY,
  invoice_no TEXT UNIQUE,
  shop_id BIGINT NOT NULL REFERENCES shops(id),
  delivery_id BIGINT UNIQUE REFERENCES deliveries(id),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  paid_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (paid_total >= 0),
  credit_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit_total >= 0),
  note TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoice_balance_valid CHECK(paid_total + credit_total <= total)
);
CREATE TABLE IF NOT EXISTS invoice_items (
  id BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES invoices(id),
  product_id BIGINT NOT NULL REFERENCES products(id),
  batch_id BIGINT NOT NULL REFERENCES batches(id),
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  retail_unit_price NUMERIC(14,2) NOT NULL,
  trade_unit_price NUMERIC(14,2) NOT NULL,
  discount_pct NUMERIC(5,2) NOT NULL,
  applied_unit_price NUMERIC(14,2) NOT NULL,
  unit_cost NUMERIC(14,2) NOT NULL,
  line_total NUMERIC(14,2) NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  payment_no TEXT UNIQUE,
  shop_id BIGINT NOT NULL REFERENCES shops(id),
  amount NUMERIC(14,2) NOT NULL CHECK(amount > 0),
  method TEXT NOT NULL CHECK(method IN ('CASH','BANK','EASYPAISA','JAZZCASH','CHEQUE','OTHER')),
  reference TEXT,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS payment_allocations (
  id BIGSERIAL PRIMARY KEY,
  payment_id BIGINT NOT NULL REFERENCES payments(id),
  invoice_id BIGINT NOT NULL REFERENCES invoices(id),
  amount NUMERIC(14,2) NOT NULL CHECK(amount > 0),
  UNIQUE(payment_id, invoice_id)
);
CREATE TABLE IF NOT EXISTS payment_receipts (
  payment_id BIGINT PRIMARY KEY REFERENCES payments(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK(content_type IN ('application/pdf','image/jpeg','image/png','image/webp')),
  file_data BYTEA NOT NULL CHECK(octet_length(file_data) BETWEEN 1 AND 5242880),
  uploaded_by BIGINT REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sales_returns (
  id BIGSERIAL PRIMARY KEY,
  return_no TEXT UNIQUE,
  invoice_id BIGINT NOT NULL REFERENCES invoices(id),
  shop_id BIGINT NOT NULL REFERENCES shops(id),
  reason TEXT NOT NULL,
  total_credit NUMERIC(14,2) NOT NULL CHECK(total_credit > 0),
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sales_return_items (
  id BIGSERIAL PRIMARY KEY,
  return_id BIGINT NOT NULL REFERENCES sales_returns(id),
  invoice_item_id BIGINT NOT NULL REFERENCES invoice_items(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  credit_amount NUMERIC(14,2) NOT NULL CHECK (credit_amount > 0)
);
CREATE TABLE IF NOT EXISTS expenses (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK(amount >= 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id BIGINT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_batches_stock ON batches(product_id,warehouse_id,quantity_on_hand);

CREATE TABLE IF NOT EXISTS record_trash (
  id BIGSERIAL PRIMARY KEY,
  entity TEXT NOT NULL,
  record_id BIGINT NOT NULL,
  snapshot JSONB NOT NULL,
  deleted_by BIGINT REFERENCES users(id),
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(entity,record_id)
);
CREATE TABLE IF NOT EXISTS bank_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  details JSONB NOT NULL DEFAULT '{}',
  updated_by BIGINT REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoice_shop_due ON invoices(shop_id,due_date);
CREATE INDEX IF NOT EXISTS idx_payment_shop ON payments(shop_id,payment_date);
CREATE INDEX IF NOT EXISTS idx_movements_date ON stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_shop ON deliveries(shop_id,created_at DESC);
INSERT INTO warehouses(name,location) VALUES ('Main Warehouse','Bhakkar') ON CONFLICT(name) DO NOTHING;

CREATE TABLE IF NOT EXISTS monthly_closings (
 id BIGSERIAL PRIMARY KEY,
 month_start DATE NOT NULL CHECK (EXTRACT(DAY FROM month_start)=1),
 shop_id BIGINT NOT NULL REFERENCES shops(id),
 snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 closed_by BIGINT REFERENCES users(id),
 closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(month_start,shop_id)
);

CREATE TABLE IF NOT EXISTS monthly_closing_documents (
 id BIGSERIAL PRIMARY KEY,
 month_start DATE NOT NULL CHECK(EXTRACT(DAY FROM month_start)=1),
 scope_key BIGINT NOT NULL DEFAULT 0 CHECK(scope_key>=0),
 snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 closed_by BIGINT REFERENCES users(id),
 closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(month_start,scope_key)
);

-- Stable store codes and transactional per-store invoice counters.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS store_code TEXT GENERATED ALWAYS AS
 ('SHP-' || lpad(id::text,GREATEST(6,length(id::text)),'0')) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS shops_store_code_unique ON shops(store_code);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS invoice_sequence BIGINT NOT NULL DEFAULT 0 CHECK (invoice_sequence >= 0);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS legacy_invoice_no TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_legacy_reference_unique ON invoices(legacy_invoice_no);

-- Store-name initials plus permanent ID keep similarly named stores unique.
CREATE OR REPLACE FUNCTION store_name_code(store_name TEXT,store_id BIGINT) RETURNS TEXT
LANGUAGE SQL IMMUTABLE AS $$
 SELECT COALESCE(NULLIF(left(string_agg(left(word,1),'' ORDER BY position),12),''),'STORE')
 || '-' || lpad(store_id::text,GREATEST(6,length(store_id::text)),'0')
 FROM regexp_split_to_table(upper(regexp_replace(store_name,'[^a-zA-Z0-9 ]',' ','g')),'\s+') WITH ORDINALITY AS words(word,position)
 WHERE word<>'';
$$;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='shops' AND column_name='store_code' AND is_generated='ALWAYS') THEN
  ALTER TABLE shops ALTER COLUMN store_code DROP EXPRESSION;
 END IF;
END $$;
-- Only replace the original generic codes. Later store renames keep their permanent code.
UPDATE invoices i SET invoice_no=store_name_code(s.shop_name,s.id)||substring(i.invoice_no FROM length(s.store_code)+1)
FROM shops s WHERE i.shop_id=s.id AND s.store_code ~ '^SHP-[0-9]+$'
AND left(i.invoice_no,length(s.store_code)+5)=s.store_code||'-INV-';
UPDATE shops SET store_code=store_name_code(shop_name,id) WHERE store_code IS NULL OR store_code ~ '^SHP-[0-9]+$';
ALTER TABLE shops ALTER COLUMN store_code SET NOT NULL;
CREATE OR REPLACE FUNCTION assign_store_name_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.store_code=store_name_code(NEW.shop_name,NEW.id);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS shops_assign_store_code ON shops;
CREATE TRIGGER shops_assign_store_code BEFORE INSERT ON shops FOR EACH ROW EXECUTE FUNCTION assign_store_name_code();

CREATE TABLE IF NOT EXISTS monthly_closing_revisions (
 id BIGSERIAL PRIMARY KEY,
 month_start DATE NOT NULL CHECK(EXTRACT(DAY FROM month_start)=1),
 scope_key BIGINT NOT NULL CHECK(scope_key>=0),
 snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 reopened_by BIGINT REFERENCES users(id),
 reason TEXT NOT NULL DEFAULT '',
 reopened_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS monthly_closing_revisions_period ON monthly_closing_revisions(month_start,scope_key);

CREATE TABLE IF NOT EXISTS public.closing_sessions (
 id BIGSERIAL PRIMARY KEY,
 scope_key BIGINT NOT NULL CHECK(scope_key>=0),
 from_date DATE NOT NULL,
 through_date DATE NOT NULL CHECK(through_date>=from_date),
 status TEXT NOT NULL DEFAULT 'CLOSED' CHECK(status IN ('CLOSED','REOPENED')),
 snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 closed_by BIGINT REFERENCES users(id),
 closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 reopened_by BIGINT REFERENCES users(id),
 reopened_at TIMESTAMPTZ,
 reopen_reason TEXT NOT NULL DEFAULT '',
 legacy_document_id BIGINT UNIQUE,
 legacy_statement_id BIGINT UNIQUE
);
CREATE INDEX IF NOT EXISTS closing_sessions_scope_dates ON public.closing_sessions(scope_key,through_date);
CREATE UNIQUE INDEX IF NOT EXISTS closing_sessions_closed_range ON public.closing_sessions(scope_key,from_date,through_date) WHERE status='CLOSED';
-- Import actual saved cutoffs; preserve each original snapshot unchanged.
INSERT INTO public.closing_sessions(scope_key,from_date,through_date,snapshot,closed_by,closed_at,legacy_document_id)
SELECT scope_key,
 CASE WHEN snapshot->'financials'->>'from' ~ '^\d{4}-\d{2}-\d{2}$' THEN (snapshot->'financials'->>'from')::date ELSE month_start END,
 CASE WHEN snapshot->'financials'->>'through' ~ '^\d{4}-\d{2}-\d{2}$' THEN (snapshot->'financials'->>'through')::date ELSE LEAST((month_start+INTERVAL '1 month - 1 day')::date,(closed_at AT TIME ZONE 'Asia/Karachi')::date) END,
 snapshot,closed_by,closed_at,id FROM public.monthly_closing_documents ON CONFLICT DO NOTHING;
INSERT INTO public.closing_sessions(scope_key,from_date,through_date,snapshot,closed_by,closed_at,legacy_statement_id)
SELECT c.shop_id,c.month_start,LEAST((c.month_start+INTERVAL '1 month - 1 day')::date,(c.closed_at AT TIME ZONE 'Asia/Karachi')::date),
 jsonb_build_object('statements',jsonb_build_array(c.snapshot),'financials',NULL),c.closed_by,c.closed_at,c.id
FROM public.monthly_closings c WHERE NOT EXISTS (SELECT 1 FROM public.closing_sessions s WHERE s.scope_key=c.shop_id AND s.from_date=c.month_start)
ON CONFLICT DO NOTHING;
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
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS broker_id BIGINT REFERENCES sales_brokers(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS broker_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK(broker_pct BETWEEN 0 AND 100);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS broker_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0
 CHECK(broker_discount_pct BETWEEN 0 AND 100 AND broker_discount_pct+discount_pct<=100);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS company_unit_price NUMERIC(14,2) CHECK(company_unit_price>=0);
UPDATE invoice_items SET company_unit_price=applied_unit_price WHERE company_unit_price IS NULL;
CREATE INDEX IF NOT EXISTS invoices_broker ON invoices(broker_id);

ALTER TABLE products ADD COLUMN IF NOT EXISTS box_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(box_cost>=0);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS cost_basis TEXT NOT NULL DEFAULT 'BATCH' CHECK(cost_basis IN ('FULL','MANUFACTURING','BOX','BATCH'));
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS manufacturing_unit_cost NUMERIC(14,2) CHECK(manufacturing_unit_cost>=0);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS box_unit_cost NUMERIC(14,2) CHECK(box_unit_cost>=0);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS first_discount_pct NUMERIC(5,2) CHECK(first_discount_pct BETWEEN 0 AND 100);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS second_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK(second_discount_pct BETWEEN 0 AND 100);

DO $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='broker_commission_payouts' AND column_name='broker_source') THEN
ALTER TABLE broker_commission_payouts ADD COLUMN IF NOT EXISTS broker_source TEXT NOT NULL DEFAULT 'LEGACY' CHECK(broker_source IN ('SALES','SHOP','LEGACY'));
-- Infer old payouts only where the broker has activity in a single department.
UPDATE broker_commission_payouts p SET broker_source='SALES' WHERE broker_source='LEGACY'
 AND EXISTS(SELECT 1 FROM customer_orders o WHERE o.broker_id=p.broker_id)
 AND NOT EXISTS(SELECT 1 FROM invoices i WHERE i.broker_id=p.broker_id);
UPDATE broker_commission_payouts p SET broker_source='SHOP' WHERE broker_source='LEGACY'
 AND EXISTS(SELECT 1 FROM invoices i WHERE i.broker_id=p.broker_id)
 AND NOT EXISTS(SELECT 1 FROM customer_orders o WHERE o.broker_id=p.broker_id);

END IF;
END $$;
CREATE INDEX IF NOT EXISTS broker_payout_source ON broker_commission_payouts(broker_id,broker_source);

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
