CREATE TABLE IF NOT EXISTS monthly_closings (
 id BIGSERIAL PRIMARY KEY,
 month_start DATE NOT NULL CHECK (EXTRACT(DAY FROM month_start)=1),
 shop_id BIGINT NOT NULL REFERENCES shops(id),
 snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 closed_by BIGINT REFERENCES users(id),
 closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(month_start,shop_id)
);
