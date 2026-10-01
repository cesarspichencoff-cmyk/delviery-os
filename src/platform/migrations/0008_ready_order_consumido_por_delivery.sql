-- Entregas — ready_order deixa a fila no mesmo commit da delivery.
-- Regra no banco, não no adapter: qualquer writer PostgreSQL respeita a
-- mesma invariante e o rollback restaura a fila automaticamente.
BEGIN;

CREATE OR REPLACE FUNCTION entregas.consumir_ready_order_por_delivery()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM entregas.ready_order r
  USING entregas.trip t
  WHERE t.trip_id = NEW.trip_id
    AND r.unit_id = t.unit_id
    AND r.order_ref = NEW.order_ref;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS delivery_consumir_ready_order
  ON entregas.delivery;

CREATE TRIGGER delivery_consumir_ready_order
AFTER INSERT ON entregas.delivery
FOR EACH ROW
EXECUTE FUNCTION entregas.consumir_ready_order_por_delivery();

COMMIT;
