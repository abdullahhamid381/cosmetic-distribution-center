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
