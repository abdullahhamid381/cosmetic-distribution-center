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
