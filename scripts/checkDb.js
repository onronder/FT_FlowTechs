require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

const checkDatabase = async () => {
    try {
        console.log('Checking database structure...\n');

        // Get all tables
        const tablesQuery = `
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `;
        const tables = await pool.query(tablesQuery);
        console.log('Tables in database:', tables.rows.length);
        tables.rows.forEach(table => console.log(`- ${table.table_name}`));

        // Check initial data in parametric tables
        console.log('\nChecking parametric data:');
        
        // Check API Types
        const apiTypes = await pool.query('SELECT * FROM api_types');
        console.log('\nAPI Types:', apiTypes.rows.length);
        console.log(apiTypes.rows);

        // Check Schedule Frequencies
        const frequencies = await pool.query('SELECT * FROM schedule_frequencies');
        console.log('\nSchedule Frequencies:', frequencies.rows.length);
        console.log(frequencies.rows);

        // Check File Formats
        const formats = await pool.query('SELECT * FROM file_formats');
        console.log('\nFile Formats:', formats.rows.length);
        console.log(formats.rows);

        // Check Destination Types
        const destinations = await pool.query('SELECT * FROM destination_types');
        console.log('\nDestination Types:', destinations.rows.length);
        console.log(destinations.rows);

        // Check Transformation Types
        const transformations = await pool.query('SELECT * FROM transformation_types');
        console.log('\nTransformation Types:', transformations.rows.length);
        console.log(transformations.rows);

    } catch (error) {
        console.error('Error checking database:', error);
    } finally {
        await pool.end();
    }
};

checkDatabase();