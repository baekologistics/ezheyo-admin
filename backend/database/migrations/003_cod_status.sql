-- Migration 003: COD status columns
-- Applied: 2026-05-19

-- ── cod_records 컬럼 추가 ──────────────────────────────────────────
ALTER TABLE cod_records ADD COLUMN IF NOT EXISTS cod_status       VARCHAR(20) DEFAULT 'pending';
ALTER TABLE cod_records ADD COLUMN IF NOT EXISTS payment_method   VARCHAR(20) DEFAULT 'qb_bill'
  CHECK (payment_method IN ('qb_bill', 'zelle'));
ALTER TABLE cod_records ADD COLUMN IF NOT EXISTS returned_reason  TEXT;
ALTER TABLE cod_records ADD COLUMN IF NOT EXISTS paid_date        TIMESTAMP;
ALTER TABLE cod_records ADD COLUMN IF NOT EXISTS batch_id         UUID REFERENCES payment_batches(id);

-- ── 기존 데이터 마이그레이션 ───────────────────────────────────────
UPDATE cod_records SET cod_status = 'paid'      WHERE paid = true;
UPDATE cod_records SET cod_status = 'returned'  WHERE returned = true  AND paid = false;
UPDATE cod_records SET cod_status = 'collected' WHERE customer_id IS NOT NULL AND paid = false AND returned = false;
UPDATE cod_records SET cod_status = 'pending'   WHERE cod_status IS NULL;

-- ── cod_status ENUM 제약 ───────────────────────────────────────────
ALTER TABLE cod_records ADD CONSTRAINT cod_status_check
  CHECK (cod_status IN ('pending', 'collected', 'paid', 'returned'));

-- ── customers 테이블: COD 결제 방식 기본값 ────────────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS cod_payment_method VARCHAR(20) DEFAULT 'qb_bill'
  CHECK (cod_payment_method IN ('qb_bill', 'zelle'));
