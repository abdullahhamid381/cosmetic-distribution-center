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
