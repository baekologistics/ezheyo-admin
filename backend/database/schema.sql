-- Ezheyo Admin Database Schema
-- Run: psql -U js -d ezheyo_db -f database/schema.sql

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
-- 2. orders
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_no        VARCHAR(100) NOT NULL,          -- first package tracking
  shipheyo_order_id  VARCHAR(100) UNIQUE,            -- SHIPHEYO order ID (upsert key)
  date               DATE NOT NULL,
  customer_id        UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_email     VARCHAR(200),
  customer_name      VARCHAR(200),
  service_type       VARCHAR(50),   -- 'Ground' | 'Next Day Air' | '2nd Day Air'
  ups_cost           DECIMAL(10,2) NOT NULL DEFAULT 0,
  customer_charge    DECIMAL(10,2) NOT NULL DEFAULT 0,
  profit             DECIMAL(10,2) GENERATED ALWAYS AS (customer_charge - ups_cost) STORED,
  sales_person       VARCHAR(200),
  cod_amount         DECIMAL(10,2) NOT NULL DEFAULT 0,
  cod_status         VARCHAR(20),   -- 'pending' | 'collected' | 'returned' | NULL
  claim_status       VARCHAR(20),   -- 'claimed' | 'approved' | 'paid' | NULL
  total_packages     INTEGER NOT NULL DEFAULT 1,
  packages           JSONB,         -- [{tracking_no, weight, width, length, height, ref_no, cod_amount, shipper_name, shipper_addr, receiver_name, receiver_addr}]
  ref_no             VARCHAR(200),
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
  order_id            UUID REFERENCES orders(id) ON DELETE SET NULL,
  reference_no        VARCHAR(100),
  tracking_no         VARCHAR(100) NOT NULL,
  pickup_date         DATE,
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
  order_id      UUID REFERENCES orders(id) ON DELETE SET NULL,
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
-- 10. sales_persons
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_persons (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(200) NOT NULL,
  email      VARCHAR(200),
  phone      VARCHAR(50),
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 11. customer_sales  (many-to-many with ratio)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sales_person_id UUID NOT NULL REFERENCES sales_persons(id) ON DELETE CASCADE,
  ratio           INTEGER NOT NULL DEFAULT 100 CHECK (ratio > 0 AND ratio <= 100),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (customer_id, sales_person_id)
);

-- ─────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_customer       ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_date           ON orders(date);
CREATE INDEX IF NOT EXISTS idx_orders_tracking       ON orders(tracking_no);
CREATE INDEX IF NOT EXISTS idx_cod_records_statement ON cod_records(cod_statement_id);
CREATE INDEX IF NOT EXISTS idx_cod_records_customer  ON cod_records(customer_id);
CREATE INDEX IF NOT EXISTS idx_claims_customer       ON claims(customer_id);
CREATE INDEX IF NOT EXISTS idx_settlement_payments_s ON settlement_payments(settlement_id);
CREATE INDEX IF NOT EXISTS idx_customer_sales_customer ON customer_sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_sales_sp       ON customer_sales(sales_person_id);

-- ─────────────────────────────────────────────────────────────
-- 12. request_types
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS request_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR NOT NULL UNIQUE,
  label       VARCHAR NOT NULL,
  description TEXT,
  icon        VARCHAR,
  active      BOOLEAN DEFAULT TRUE,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMP DEFAULT NOW()
);

INSERT INTO request_types (code, label, description, icon, sort_order) VALUES
  ('payment',      'Payment Request', '충전/차감 요청', '💰', 1),
  ('void',         'Void Request',    '주문 취소 요청', '🚫', 2),
  ('supply_order', 'Supply Order',    '용품 주문',     '📦', 3),
  ('claim',        'Claim',           '클레임 요청',   '📋', 4)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 13. customer_requests
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_no         SERIAL,
  request_type_id    UUID REFERENCES request_types(id),
  customer_id        UUID REFERENCES customers(id),
  customer_email     VARCHAR,
  status             VARCHAR DEFAULT 'pending',
  title              VARCHAR,
  description        TEXT,
  memo               TEXT,
  admin_memo         TEXT,
  payment_type       VARCHAR,
  amount             DECIMAL(10,2),
  tracking_no        VARCHAR,
  order_id           VARCHAR,
  extra_data         JSONB,
  processed_by       VARCHAR,
  processed_at       TIMESTAMP,
  shipheyo_synced    BOOLEAN DEFAULT FALSE,
  shipheyo_synced_at TIMESTAMP,
  email_sent         BOOLEAN DEFAULT FALSE,
  email_sent_at      TIMESTAMP,
  created_at         TIMESTAMP DEFAULT NOW(),
  updated_at         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_requests_type   ON customer_requests(request_type_id);
CREATE INDEX IF NOT EXISTS idx_customer_requests_cust   ON customer_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_requests_status ON customer_requests(status);
CREATE INDEX IF NOT EXISTS idx_customer_requests_date   ON customer_requests(created_at);
