-- Insert sample Shopify APIs
INSERT INTO shopify_apis (name, endpoint, description) VALUES
    ('Products', '/admin/api/2024-01/products.json', 'Retrieve product information'),
    ('Orders', '/admin/api/2024-01/orders.json', 'Retrieve order information'),
    ('Customers', '/admin/api/2024-01/customers.json', 'Retrieve customer information'),
    ('Inventory', '/admin/api/2024-01/inventory_items.json', 'Retrieve inventory information');

-- Insert sample fields for Products API
INSERT INTO shopify_api_fields (api_id, field_name, field_type, is_required) VALUES
    ((SELECT id FROM shopify_apis WHERE name = 'Products'), 'id', 'number', true),
    ((SELECT id FROM shopify_apis WHERE name = 'Products'), 'title', 'string', true),
    ((SELECT id FROM shopify_apis WHERE name = 'Products'), 'vendor', 'string', false),
    ((SELECT id FROM shopify_apis WHERE name = 'Products'), 'product_type', 'string', false),
    ((SELECT id FROM shopify_apis WHERE name = 'Products'), 'created_at', 'datetime', true),
    ((SELECT id FROM shopify_apis WHERE name = 'Products'), 'updated_at', 'datetime', true),
    ((SELECT id FROM shopify_apis WHERE name = 'Products'), 'published_at', 'datetime', false),
    ((SELECT id FROM shopify_apis WHERE name = 'Products'), 'status', 'string', true);

-- Insert sample fields for Orders API
INSERT INTO shopify_api_fields (api_id, field_name, field_type, is_required) VALUES
    ((SELECT id FROM shopify_apis WHERE name = 'Orders'), 'id', 'number', true),
    ((SELECT id FROM shopify_apis WHERE name = 'Orders'), 'order_number', 'string', true),
    ((SELECT id FROM shopify_apis WHERE name = 'Orders'), 'total_price', 'decimal', true),
    ((SELECT id FROM shopify_apis WHERE name = 'Orders'), 'created_at', 'datetime', true),
    ((SELECT id FROM shopify_apis WHERE name = 'Orders'), 'updated_at', 'datetime', true),
    ((SELECT id FROM shopify_apis WHERE name = 'Orders'), 'financial_status', 'string', true),
    ((SELECT id FROM shopify_apis WHERE name = 'Orders'), 'fulfillment_status', 'string', false);