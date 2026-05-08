-- Ezheyo Admin Database Schema
-- Run: psql -U postgres -d ezheyo_db -f database/schema.sql

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- 1. customers
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipheyo_userid  VARCHAR(100) UNIQUE,
  name             VARCHAR(200) NOT NULL,
  email            VARCHAR(200) UNIQUE NOT NULL,
  phone            VARCHAR(50),
  margin_rate      DECIMAL(5,2)  NOT NULL DEFAULT 0,
  payment_type     VARCHAR(20)   NOT NULL DEFAULT 'Prepay', -- 'Prepay' | 'Monthly'
  status           VARCHAR(20)   NOT NULL DEFAULT 'Active', -- 'Active' | 'Inactive'
  sales_person     VARCHAR(200),
  memo             TEXT,
  created_date     DATE,
  last_synced_at   TIMESTAMP,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 2. shipments
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shipments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_no        VARCHAR(100) UNIQUE NOT NULL,
  shipheyo_order_id  VARCHAR(100),
  date               DATE NOT NULL,
  customer_id        UUID REFERENCES customers(id) ON DELETE SET NULL,
  service_type       VARCHAR(50),   -- 'Ground' | 'Next Day Air' | '2nd Day Air'
  ups_cost           DECIMAL(10,2) NOT NULL DEFAULT 0,
  customer_charge    DECIMAL(10,2) NOT NULL DEFAULT 0,
  profit             DECIMAL(10,2) GENERATED ALWAYS AS (customer_charge - ups_cost) STORED,
  sales_person       VARCHAR(200),
  cod_amount         DECIMAL(10,2) NOT NULL DEFAULT 0,
  cod_status         VARCHAR(20),   -- 'pending' | 'collected' | 'returned' | NULL
  claim_status       VARCHAR(20),   -- 'claimed' | 'approved' | 'paid' | NULL
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 3. cod_statements
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cod_statements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_no    VARCHAR(100) UNIQUE NOT NULL,
  statement_date  DATE NOT NULL,
  source          VARCHAR(20) NOT NULL DEFAULT 'manual', -- 'auto' | 'manual'
  uploaded_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  parsed_status   VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'parsed' | 'failed'
  deposit_total   DECIMAL(10,2) NOT NULL DEFAULT 0,
  file_path       VARCHAR(500),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 4. cod_records
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cod_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_statement_id    UUID NOT NULL REFERENCES cod_statements(id) ON DELETE CASCADE,
  shipment_id         UUID REFERENCES shipments(id) ON DELETE SET NULL,
  reference_no        VARCHAR(100),
  tracking_no         VARCHAR(100) NOT NULL,
  pickup_date         DATE NOT NULL,
  delivery_date       DATE,
  cod_amount          DECIMAL(10,2) NOT NULL DEFAULT 0,
  check_no            VARCHAR(100),
  service_fee         DECIMAL(10,2) NOT NULL DEFAULT 0,
  premium_fee         DECIMAL(10,2) NOT NULL DEFAULT 0,
  check_amount        DECIMAL(10,2) NOT NULL DEFAULT 0,
  customer_id         UUID REFERENCES customers(id) ON DELETE SET NULL,
  returned            BOOLEAN NOT NULL DEFAULT FALSE,
  claimed_payment     BOOLEAN NOT NULL DEFAULT FALSE,
  email_sent          BOOLEAN NOT NULL DEFAULT FALSE,
  quickbook_status    VARCHAR(20) NOT NULL DEFAULT 'none', -- 'none' | 'bill_created' | 'paid'
  quickbook_bill_no   VARCHAR(100),
  paid                BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 5. payment_batches
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_batches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_date        DATE NOT NULL,
  customer_id       UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  total_amount      DECIMAL(10,2) NOT NULL DEFAULT 0,
  method            VARCHAR(30) NOT NULL, -- 'QB Bill' | 'Zelle' | 'Cash' | 'Check' | 'ACH'
  quickbook_bill_no VARCHAR(100),
  status            VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending' | 'paid'
  paid_date         DATE,
  memo              TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 6. payment_batch_records (junction)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_batch_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_batch_id  UUID NOT NULL REFERENCES payment_batches(id) ON DELETE CASCADE,
  cod_record_id     UUID NOT NULL REFERENCES cod_records(id) ON DELETE CASCADE,
  UNIQUE (payment_batch_id, cod_record_id)
);

-- ─────────────────────────────────────────────────────────────
-- 7. claims
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claims (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_no   VARCHAR(100) NOT NULL,
  shipment_id   UUID REFERENCES shipments(id) ON DELETE SET NULL,
  customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  type          VARCHAR(20) NOT NULL DEFAULT 'General', -- 'COD' | 'General'
  claim_amount  DECIMAL(10,2) NOT NULL DEFAULT 0,
  paid_amount   DECIMAL(10,2),
  claim_status  VARCHAR(20) NOT NULL DEFAULT 'claimed', -- 'claimed' | 'approved' | 'paid'
  ups_claim_no  VARCHAR(100),
  email_sent    BOOLEAN NOT NULL DEFAULT FALSE,
  memo          TEXT,
  paid_date     DATE,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 8. settlements
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settlements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month               VARCHAR(7) UNIQUE NOT NULL, -- '2026-02'
  revenue             DECIMAL(10,2) NOT NULL DEFAULT 0,
  ups_cost            DECIMAL(10,2) NOT NULL DEFAULT 0,
  net_profit          DECIMAL(10,2) NOT NULL DEFAULT 0,
  baeko_amount        DECIMAL(10,2) NOT NULL DEFAULT 0, -- 30%
  sales_amount        DECIMAL(10,2) NOT NULL DEFAULT 0, -- 10%
  overhead_amount     DECIMAL(10,2) NOT NULL DEFAULT 0, -- 60%
  baeko_paid          BOOLEAN NOT NULL DEFAULT FALSE,
  baeko_paid_date     DATE,
  baeko_paid_method   VARCHAR(30),
  baeko_memo          TEXT,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 9. settlement_payments (per-person payouts)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settlement_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id   UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  recipient_type  VARCHAR(20) NOT NULL, -- 'baeko' | 'sales_person'
  sales_person    VARCHAR(200),
  amount          DECIMAL(10,2) NOT NULL DEFAULT 0,
  method          VARCHAR(20) NOT NULL, -- 'Zelle' | 'Check' | 'Wire' | 'ACH' | 'Cash'
  paid_date       DATE NOT NULL,
  memo            TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_shipments_customer    ON shipments(customer_id);
CREATE INDEX IF NOT EXISTS idx_shipments_date        ON shipments(date);
CREATE INDEX IF NOT EXISTS idx_cod_records_statement ON cod_records(cod_statement_id);
CREATE INDEX IF NOT EXISTS idx_cod_records_customer  ON cod_records(customer_id);
CREATE INDEX IF NOT EXISTS idx_claims_customer       ON claims(customer_id);
CREATE INDEX IF NOT EXISTS idx_settlement_payments_s ON settlement_payments(settlement_id);
