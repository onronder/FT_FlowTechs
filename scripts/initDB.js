// scripts/initDb.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

const initDb = async () => {
    try {
        // Test connection
        console.log('Testing database connection...');
        await pool.query('SELECT NOW()');
        console.log('✓ Database connection successful\n');

        // Read schema file
        console.log('Reading schema file...');
        const schema = fs.readFileSync(
            path.join(__dirname, 'schema.sql'),
            'utf8'
        );
        console.log('✓ Schema file read successfully\n');

        // Execute schema
        console.log('Creating database schema...');
        await pool.query(schema);
        console.log('✓ Database schema created successfully\n');

        console.log('Database initialization completed successfully!');
    } catch (error) {
        console.error('Error during database initialization:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
};

initDb();