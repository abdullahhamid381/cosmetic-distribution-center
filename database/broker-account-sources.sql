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
