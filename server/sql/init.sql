CREATE TABLE IF NOT EXISTS users (
 id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
 must_change_password BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS products (
 id SERIAL PRIMARY KEY, asin VARCHAR(10) UNIQUE NOT NULL, name TEXT NOT NULL, image_url TEXT,
 status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')), notes TEXT,
 amazon_inventory INTEGER NOT NULL DEFAULT 0 CHECK (amazon_inventory >= 0), deleted_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS amazon_skus (
 id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), sku TEXT NOT NULL,
 variant_name TEXT, inventory INTEGER NOT NULL DEFAULT 0 CHECK (inventory >= 0), deleted_at TIMESTAMPTZ,
 UNIQUE(product_id, sku)
);
CREATE TABLE IF NOT EXISTS supplier_skus (
 id SERIAL PRIMARY KEY, amazon_sku_id INTEGER NOT NULL REFERENCES amazon_skus(id), supplier_sku TEXT NOT NULL,
 purchase_url TEXT NOT NULL, specification TEXT, current_price NUMERIC(12,2), current_stock INTEGER,
 enabled BOOLEAN NOT NULL DEFAULT TRUE, deleted_at TIMESTAMPTZ, UNIQUE(amazon_sku_id, supplier_sku)
);
CREATE TABLE IF NOT EXISTS sync_runs (
 id SERIAL PRIMARY KEY, supplier_sku_id INTEGER NOT NULL REFERENCES supplier_skus(id), status TEXT NOT NULL,
 price NUMERIC(12,2), stock INTEGER, message TEXT, synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sync_runs_supplier_idx ON sync_runs(supplier_sku_id, synced_at DESC);
