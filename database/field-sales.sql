CREATE TABLE IF NOT EXISTS field_stock_bookings (
  id BIGSERIAL PRIMARY KEY,
  shop_id BIGINT NOT NULL REFERENCES shops(id),
  created_by BIGINT NOT NULL REFERENCES users(id),
  items JSONB NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 30),
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','FULFILLED','CANCELLED')),
  invoice_id BIGINT UNIQUE REFERENCES invoices(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_field_bookings_shop ON field_stock_bookings(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shops_assigned_sales ON shops(assigned_sales_id) WHERE active;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS field_submission_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_field_submission
  ON payments(field_submission_id) WHERE field_submission_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass AND conname = 'users_role_check'
      AND pg_get_constraintdef(oid) LIKE '%FIELD_SALES%'
  ) THEN
    ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE public.users ADD CONSTRAINT users_role_check
      CHECK (role IN ('ADMIN','MANAGER','WAREHOUSE','SALES','FIELD_SALES','ACCOUNTS','DELIVERY'));
  END IF;
END $$;
