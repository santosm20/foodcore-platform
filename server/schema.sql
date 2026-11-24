-- Modelo inicial para PostgreSQL em produção. A API atual usa JSON local apenas para prototipagem.
CREATE TABLE customers (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency CHAR(3) NOT NULL DEFAULT 'BRL',
  interval TEXT NOT NULL DEFAULT 'MONTHLY',
  active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  plan_id TEXT NOT NULL REFERENCES plans(id),
  provider TEXT NOT NULL DEFAULT 'PAGBANK',
  provider_subscription_id TEXT,
  status TEXT NOT NULL,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE licenses (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  subscription_id UUID REFERENCES subscriptions(id),
  key_hash TEXT NOT NULL UNIQUE,
  machine_hash TEXT,
  status TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE releases (
  id UUID PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  storage_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE payment_events (
  id UUID PRIMARY KEY,
  provider_event_id TEXT UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
