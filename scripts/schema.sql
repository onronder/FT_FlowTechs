-- scripts/schema.sql

-- Drop existing tables if they exist (be careful with this in production!)
DO $$ 
BEGIN
    -- Drop tables in correct order (respecting foreign key constraints)
    DROP TABLE IF EXISTS schedules;
    DROP TABLE IF EXISTS source_selected_apis;
    DROP TABLE IF EXISTS transformations;
    DROP TABLE IF EXISTS destinations;
    DROP TABLE IF EXISTS sources;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS schedule_frequencies;
    DROP TABLE IF EXISTS file_formats;
    DROP TABLE IF EXISTS destination_types;
    DROP TABLE IF EXISTS transformation_types;
    DROP TABLE IF EXISTS shopify_api_fields;
    DROP TABLE IF EXISTS shopify_apis;
    DROP TABLE IF EXISTS api_types;
END $$;

-- Parametric Tables for Configuration

-- API Types (e.g., Shopify, WooCommerce, etc. for future use)
CREATE TABLE api_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shopify Available APIs
CREATE TABLE shopify_apis (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shopify API Fields
CREATE TABLE shopify_api_fields (
    id SERIAL PRIMARY KEY,
    api_id INTEGER REFERENCES shopify_apis(id),
    field_name VARCHAR(100) NOT NULL,
    field_type VARCHAR(50) NOT NULL,
    is_required BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transformation Types
CREATE TABLE transformation_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    example TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Destination Types
CREATE TABLE destination_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    required_fields JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- File Format Types
CREATE TABLE file_formats (
    id SERIAL PRIMARY KEY,
    name VARCHAR(10) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Schedule Frequencies
CREATE TABLE schedule_frequencies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Modified Core Tables to Use Parametric References

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sources (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    api_type_id INTEGER REFERENCES api_types(id),
    credentials JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Source API Selections (which APIs user selected for their source)
CREATE TABLE source_selected_apis (
    id SERIAL PRIMARY KEY,
    source_id INTEGER REFERENCES sources(id),
    api_id INTEGER REFERENCES shopify_apis(id),
    selected_fields JSONB, -- Stores selected field IDs
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE transformations (
    id SERIAL PRIMARY KEY,
    source_id INTEGER REFERENCES sources(id),
    transformation_type_id INTEGER REFERENCES transformation_types(id),
    name VARCHAR(255) NOT NULL,
    configuration JSONB NOT NULL, -- Stores transformation specific settings
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE destinations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    destination_type_id INTEGER REFERENCES destination_types(id),
    file_format_id INTEGER REFERENCES file_formats(id),
    credentials JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE schedules (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    source_id INTEGER REFERENCES sources(id),
    transformation_id INTEGER REFERENCES transformations(id),
    destination_id INTEGER REFERENCES destinations(id),
    frequency_id INTEGER REFERENCES schedule_frequencies(id),
    day_of_week INTEGER,
    day_of_month INTEGER,
    time_of_day TIME NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_run TIMESTAMP,
    next_run TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial parametric data

-- API Types
INSERT INTO api_types (name) VALUES ('Shopify');

-- Schedule Frequencies
INSERT INTO schedule_frequencies (name, description) VALUES
    ('DAILY', 'Runs once every day'),
    ('WEEKLY', 'Runs once every week'),
    ('MONTHLY', 'Runs once every month');

-- File Formats
INSERT INTO file_formats (name, description) VALUES
    ('CSV', 'Comma-separated values'),
    ('JSON', 'JavaScript Object Notation'),
    ('TXT', 'Plain text file');

-- Destination Types
INSERT INTO destination_types (name, description, required_fields) VALUES
    ('SFTP', 'Secure File Transfer Protocol', '{"host": "string", "port": "number", "username": "string", "password": "string", "directory": "string"}'),
    ('OneDrive', 'Microsoft OneDrive Storage', '{"client_id": "string", "client_secret": "string", "refresh_token": "string", "folder_path": "string"}'),
    ('GoogleDrive', 'Google Drive Storage', '{"client_id": "string", "client_secret": "string", "refresh_token": "string", "folder_id": "string"}');

-- Transformation Types
INSERT INTO transformation_types (name, description, example) VALUES
    ('CAST', 'Convert data type', 'CAST(field AS INTEGER)'),
    ('TOSTRING', 'Convert to string', 'TOSTRING(field)'),
    ('CONCATENATE', 'Join multiple fields', 'CONCATENATE(field1, " ", field2)');

-- Indexes for better performance
CREATE INDEX idx_sources_user_id ON sources(user_id) WHERE is_active = true;
CREATE INDEX idx_schedules_next_run ON schedules(next_run) WHERE is_active = true;
CREATE INDEX idx_source_selected_apis_source_id ON source_selected_apis(source_id) WHERE is_active = true;