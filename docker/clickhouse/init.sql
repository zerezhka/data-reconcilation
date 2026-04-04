-- =============================================
-- ANALYTICS (имитация ClickHouse после ETL)
-- Та же структура, данные загружены из "1С"
-- =============================================

CREATE TABLE IF NOT EXISTS categories (
    id UInt32,
    name String
) ENGINE = MergeTree() ORDER BY id;

CREATE TABLE IF NOT EXISTS suppliers (
    id UInt32,
    name String,
    contact_phone String,
    city String
) ENGINE = MergeTree() ORDER BY id;

CREATE TABLE IF NOT EXISTS products (
    id UInt32,
    sku String,
    name String,
    category_id UInt32,
    unit_price Decimal(12,2),
    supplier_id UInt32
) ENGINE = MergeTree() ORDER BY id;

CREATE TABLE IF NOT EXISTS stock_movements (
    id UInt32,
    product_id UInt32,
    movement_type String,
    quantity Int32,
    unit_price Decimal(12,2),
    total_amount Decimal(14,2),
    movement_date Date,
    document_number String,
    supplier_id UInt32
) ENGINE = MergeTree() ORDER BY (movement_date, id);

CREATE TABLE IF NOT EXISTS stock_balances (
    id UInt32,
    product_id UInt32,
    balance_date Date,
    quantity Int32,
    total_value Decimal(14,2)
) ENGINE = MergeTree() ORDER BY (balance_date, product_id);

CREATE TABLE IF NOT EXISTS sales (
    id UInt32,
    product_id UInt32,
    sale_date Date,
    quantity Int32,
    unit_price Decimal(12,2),
    total_amount Decimal(14,2),
    customer_type String,
    receipt_number String
) ENGINE = MergeTree() ORDER BY (sale_date, id);
