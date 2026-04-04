-- =============================================
-- SOURCE OF TRUTH (имитация 1С)
-- Эталонные данные — всё корректно
-- =============================================

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

CREATE TABLE suppliers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    contact_phone VARCHAR(50),
    city VARCHAR(100)
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    category_id INT REFERENCES categories(id),
    unit_price NUMERIC(12,2) NOT NULL,
    supplier_id INT REFERENCES suppliers(id)
);

-- Факт движения товаров (приход/расход)
CREATE TABLE stock_movements (
    id SERIAL PRIMARY KEY,
    product_id INT REFERENCES products(id),
    movement_type VARCHAR(10) NOT NULL CHECK (movement_type IN ('in', 'out')),
    quantity INT NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    total_amount NUMERIC(14,2) NOT NULL,
    movement_date DATE NOT NULL,
    document_number VARCHAR(50) NOT NULL,
    supplier_id INT REFERENCES suppliers(id)
);

-- Факт остатков (ежедневный снапшот)
CREATE TABLE stock_balances (
    id SERIAL PRIMARY KEY,
    product_id INT REFERENCES products(id),
    balance_date DATE NOT NULL,
    quantity INT NOT NULL,
    total_value NUMERIC(14,2) NOT NULL,
    UNIQUE(product_id, balance_date)
);

-- Факт продаж
CREATE TABLE sales (
    id SERIAL PRIMARY KEY,
    product_id INT REFERENCES products(id),
    sale_date DATE NOT NULL,
    quantity INT NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    total_amount NUMERIC(14,2) NOT NULL,
    customer_type VARCHAR(20) DEFAULT 'retail',
    receipt_number VARCHAR(50) NOT NULL
);

-- Индексы для удобства
CREATE INDEX idx_movements_date ON stock_movements(movement_date);
CREATE INDEX idx_movements_product ON stock_movements(product_id);
CREATE INDEX idx_balances_date ON stock_balances(balance_date);
CREATE INDEX idx_balances_product ON stock_balances(product_id);
CREATE INDEX idx_sales_date ON sales(sale_date);
CREATE INDEX idx_sales_product ON sales(product_id);
