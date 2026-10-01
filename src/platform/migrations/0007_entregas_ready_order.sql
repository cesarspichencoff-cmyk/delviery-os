-- Entregas — fila de pedidos prontos compartilhada.
BEGIN;

CREATE TABLE IF NOT EXISTS entregas.ready_order (
  unit_id TEXT NOT NULL REFERENCES identity.unit(unit_id),
  order_ref TEXT NOT NULL,
  label TEXT NOT NULL,
  channel TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (unit_id, order_ref)
);

CREATE INDEX IF NOT EXISTS ready_order_unit_time_idx
  ON entregas.ready_order(unit_id, created_at, order_ref);

COMMIT;
