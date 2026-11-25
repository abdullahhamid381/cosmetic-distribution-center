CREATE TABLE IF NOT EXISTS monthly_closing_documents (
 id BIGSERIAL PRIMARY KEY,
 month_start DATE NOT NULL CHECK(EXTRACT(DAY FROM month_start)=1),
 scope_key BIGINT NOT NULL DEFAULT 0 CHECK(scope_key>=0),
 snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 closed_by BIGINT REFERENCES users(id),
 closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(month_start,scope_key)
);
