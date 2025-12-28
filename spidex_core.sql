-- ================================
-- SPIDEX CORE — MASTER SCHEMA
-- ================================

-- ================================
-- USERS & IDENTITY
-- ================================
CREATE TABLE users (
    id UUID PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(120) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) CHECK (role IN ('buyer','seller','admin')) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ================================
-- ACCOUNTS (LEDGER)
-- ================================
CREATE TABLE accounts (
    id UUID PRIMARY KEY,
    owner_id UUID,
    owner_type VARCHAR(20) CHECK (owner_type IN ('user','platform','escrow')),
    currency VARCHAR(10) DEFAULT 'KES',
    created_at TIMESTAMP DEFAULT NOW()
);

-- ================================
-- TRANSACTIONS (IMMUTABLE)
-- ================================
CREATE TABLE transactions (
    id UUID PRIMARY KEY,
    reference VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ================================
-- ENTRIES (DOUBLE-ENTRY)
-- ================================
CREATE TABLE entries (
    id UUID PRIMARY KEY,
    transaction_id UUID REFERENCES transactions(id),
    account_id UUID REFERENCES accounts(id),
    amount NUMERIC(14,2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- RULE: SUM(entries.amount) per transaction MUST = 0

-- ================================
-- PAYMENTS (MPESA / PROVIDERS)
-- ================================
CREATE TABLE payments (
    id UUID PRIMARY KEY,
    provider VARCHAR(50),
    provider_reference VARCHAR(100),
    phone VARCHAR(20),
    amount NUMERIC(14,2),
    status VARCHAR(20) CHECK (status IN ('pending','success','failed')),
    idempotency_key VARCHAR(100) UNIQUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ================================
-- PRODUCTS
-- ================================
CREATE TABLE products (
    id UUID PRIMARY KEY,
    seller_id UUID REFERENCES users(id),
    title VARCHAR(150),
    price NUMERIC(14,2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ================================
-- ORDERS
-- ================================
CREATE TABLE orders (
    id UUID PRIMARY KEY,
    buyer_id UUID REFERENCES users(id),
    status VARCHAR(20) CHECK (status IN ('pending','paid','cancelled')),
    total NUMERIC(14,2),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ================================
-- ORDER ITEMS
-- ================================
CREATE TABLE order_items (
    id UUID PRIMARY KEY,
    order_id UUID REFERENCES orders(id),
    product_id UUID REFERENCES products(id),
    quantity INTEGER,
    price NUMERIC(14,2)
);

-- ================================
-- AUDIT LOGS (CRITICAL)
-- ================================
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    actor_id UUID,
    action TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);


-- ================================
-- INDEXES (PERFORMANCE)
-- ================================
CREATE INDEX idx_entries_transaction ON entries(transaction_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_orders_buyer ON orders(buyer_id);
