require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

const insertSampleData = async () => {
    try {
        console.log('Starting to insert sample data...');

        // Add unique constraint if it doesn't exist
        console.log('Adding unique constraint to shopify_apis table...');
        await pool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint 
                    WHERE conname = 'shopify_apis_name_key'
                ) THEN
                    ALTER TABLE shopify_apis ADD CONSTRAINT shopify_apis_name_key UNIQUE (name);
                END IF;
            END $$;
        `);

        // Insert Shopify APIs one by one to handle conflicts
        console.log('Inserting Shopify APIs...');
        const apisToInsert = [
            ['Products', '/admin/api/2024-01/products.json', 'Retrieve product information'],
            ['Orders', '/admin/api/2024-01/orders.json', 'Retrieve order information'],
            ['Customers', '/admin/api/2024-01/customers.json', 'Retrieve customer information'],
            ['Inventory', '/admin/api/2024-01/inventory_items.json', 'Retrieve inventory information']
        ];

        for (const [name, endpoint, description] of apisToInsert) {
            await pool.query(`
                INSERT INTO shopify_apis (name, endpoint, description)
                VALUES ($1, $2, $3)
                ON CONFLICT (name) 
                DO UPDATE SET 
                    endpoint = EXCLUDED.endpoint,
                    description = EXCLUDED.description
                RETURNING id, name;
            `, [name, endpoint, description]);
        }

        // Get API IDs
        const productsApi = await pool.query("SELECT id FROM shopify_apis WHERE name = 'Products' LIMIT 1");
        const ordersApi = await pool.query("SELECT id FROM shopify_apis WHERE name = 'Orders' LIMIT 1");
        
        const productsApiId = productsApi.rows[0].id;
        const ordersApiId = ordersApi.rows[0].id;

        // Add unique constraint for api_fields if it doesn't exist
        console.log('Adding composite unique constraint to shopify_api_fields table...');
        await pool.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint 
                    WHERE conname = 'shopify_api_fields_api_id_field_name_key'
                ) THEN
                    ALTER TABLE shopify_api_fields 
                    ADD CONSTRAINT shopify_api_fields_api_id_field_name_key 
                    UNIQUE (api_id, field_name);
                END IF;
            END $$;
        `);

        // Insert fields for Products API
        console.log('Inserting Product API fields...');
        const productFields = [
            ['id', 'number', true],
            ['title', 'string', true],
            ['vendor', 'string', false],
            ['product_type', 'string', false],
            ['created_at', 'datetime', true],
            ['updated_at', 'datetime', true],
            ['published_at', 'datetime', false],
            ['status', 'string', true]
        ];

        for (const [fieldName, fieldType, isRequired] of productFields) {
            await pool.query(`
                INSERT INTO shopify_api_fields (api_id, field_name, field_type, is_required)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (api_id, field_name) 
                DO UPDATE SET 
                    field_type = EXCLUDED.field_type,
                    is_required = EXCLUDED.is_required;
            `, [productsApiId, fieldName, fieldType, isRequired]);
        }

        // Insert fields for Orders API
        console.log('Inserting Order API fields...');
        const orderFields = [
            ['id', 'number', true],
            ['order_number', 'string', true],
            ['total_price', 'decimal', true],
            ['created_at', 'datetime', true],
            ['updated_at', 'datetime', true],
            ['financial_status', 'string', true],
            ['fulfillment_status', 'string', false]
        ];

        for (const [fieldName, fieldType, isRequired] of orderFields) {
            await pool.query(`
                INSERT INTO shopify_api_fields (api_id, field_name, field_type, is_required)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (api_id, field_name) 
                DO UPDATE SET 
                    field_type = EXCLUDED.field_type,
                    is_required = EXCLUDED.is_required;
            `, [ordersApiId, fieldName, fieldType, isRequired]);
        }

        console.log('Sample data inserted successfully!');

        // Verify the data
        const verifyApis = await pool.query('SELECT name FROM shopify_apis ORDER BY name;');
        console.log('\nAvailable APIs:', verifyApis.rows.map(row => row.name));

        const verifyFields = await pool.query(`
            SELECT sa.name as api_name, saf.field_name
            FROM shopify_api_fields saf
            JOIN shopify_apis sa ON saf.api_id = sa.id
            ORDER BY sa.name, saf.field_name;
        `);
        console.log('\nAPI Fields:');
        verifyFields.rows.forEach(row => {
            console.log(`${row.api_name}: ${row.field_name}`);
        });

    } catch (error) {
        console.error('Error inserting sample data:', error);
    } finally {
        await pool.end();
    }
};

insertSampleData();