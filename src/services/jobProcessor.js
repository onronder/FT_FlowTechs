const db = require('../config/database');
const schedule = require('node-schedule');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { Transform } = require('stream');
const crypto = require('crypto');

class JobProcessor {
    constructor() {
        this.activeJobs = new Map();
        this.tempDir = path.join(__dirname, '../temp');
    }

    async initialize() {
        try {
            console.log('Initializing job processor...');
            
            // Create temp directory if it doesn't exist
            await fs.mkdir(this.tempDir, { recursive: true });
            
            // Load all active schedules
            const schedules = await db.query(`
                SELECT 
                    s.*,
                    src.credentials as source_credentials,
                    d.credentials as destination_credentials,
                    d.destination_type_id,
                    d.file_format_id,
                    t.configuration as transformation_config
                FROM schedules s
                JOIN sources src ON s.source_id = src.id
                LEFT JOIN transformations t ON s.transformation_id = t.id
                JOIN destinations d ON s.destination_id = d.id
                WHERE s.is_active = true
            `);

            // Schedule each job
            for (const scheduledJob of schedules.rows) {
                this.scheduleJob(scheduledJob);
            }

            console.log(`Initialized ${schedules.rows.length} jobs`);
        } catch (error) {
            console.error('Error initializing job processor:', error);
            throw error;
        }
    }

    async scheduleJob(jobConfig) {
        try {
            const jobKey = `job_${jobConfig.id}`;
            
            // Cancel existing job if it exists
            if (this.activeJobs.has(jobKey)) {
                this.activeJobs.get(jobKey).cancel();
            }

            // Create cron expression based on frequency
            const cronExpression = this.createCronExpression(jobConfig);
            
            // Schedule new job
            const job = schedule.scheduleJob(cronExpression, async () => {
                try {
                    await this.processJob(jobConfig);
                } catch (error) {
                    console.error(`Error processing job ${jobConfig.id}:`, error);
                    await this.updateJobStatus(jobConfig.id, 'error', error.message);
                }
            });

            this.activeJobs.set(jobKey, job);
            console.log(`Scheduled job ${jobConfig.id} with cron: ${cronExpression}`);
        } catch (error) {
            console.error(`Error scheduling job ${jobConfig.id}:`, error);
            throw error;
        }
    }

    createCronExpression({ frequency_id, time_of_day, day_of_week, day_of_month }) {
        const [hours, minutes] = time_of_day.split(':');
        
        switch (frequency_id) {
            case 1: // Daily
                return `${minutes} ${hours} * * *`;
            case 2: // Weekly
                return `${minutes} ${hours} * * ${day_of_week}`;
            case 3: // Monthly
                return `${minutes} ${hours} ${day_of_month} * *`;
            default:
                throw new Error('Invalid frequency');
        }
    }

    async processJob(jobConfig) {
        console.log(`Processing job ${jobConfig.id}...`);
        
        try {
            // Update job status to running
            await this.updateJobStatus(jobConfig.id, 'running');

            // 1. Extract data from source
            const data = await this.extractData(jobConfig);

            // 2. Apply transformations if configured
            const transformedData = jobConfig.transformation_config 
                ? await this.transformData(data, jobConfig.transformation_config)
                : data;

            // 3. Save to temporary file in specified format
            const tempFilePath = await this.saveToTempFile(
                transformedData, 
                jobConfig.file_format_id
            );

            // 4. Upload to destination
            await this.uploadToDestination(
                tempFilePath,
                jobConfig.destination_type_id,
                jobConfig.destination_credentials
            );

            // 5. Clean up
            await fs.unlink(tempFilePath);

            // Update job status to completed
            await this.updateJobStatus(jobConfig.id, 'completed');
            
            console.log(`Job ${jobConfig.id} completed successfully`);
        } catch (error) {
            console.error(`Error in job ${jobConfig.id}:`, error);
            await this.updateJobStatus(jobConfig.id, 'error', error.message);
            throw error;
        }
    }

    async extractData(jobConfig) {
        // Implement Shopify API data extraction
        const { shop_url, access_token } = jobConfig.source_credentials;
        
        // Configure Shopify API client
        const shopifyClient = axios.create({
            baseURL: `https://${shop_url}/admin/api/2024-01`,
            headers: {
                'X-Shopify-Access-Token': access_token,
                'Content-Type': 'application/json'
            }
        });

        // Extract data based on selected APIs
        // Implementation will depend on your specific needs
        // This is a simplified example
        return shopifyClient.get('/products.json');
    }

    async transformData(data, transformationConfig) {
        // Apply configured transformations
        // Implementation will depend on your transformation types
        return transformationConfig.reduce((acc, transform) => {
            switch (transform.type) {
                case 'CAST':
                    // Implement casting logic
                    break;
                case 'TOSTRING':
                    // Implement string conversion logic
                    break;
                case 'CONCATENATE':
                    // Implement concatenation logic
                    break;
                default:
                    throw new Error(`Unknown transformation type: ${transform.type}`);
            }
            return acc;
        }, data);
    }

    async saveToTempFile(data, formatId) {
        const tempFileName = `${crypto.randomBytes(16).toString('hex')}`;
        const tempFilePath = path.join(this.tempDir, tempFileName);

        switch (formatId) {
            case 1: // CSV
                // Implement CSV conversion and save
                break;
            case 2: // JSON
                await fs.writeFile(tempFilePath, JSON.stringify(data, null, 2));
                break;
            case 3: // TXT
                // Implement TXT conversion and save
                break;
            default:
                throw new Error('Invalid file format');
        }

        return tempFilePath;
    }

    async uploadToDestination(filePath, destinationType, credentials) {
        switch (destinationType) {
            case 1: // SFTP
                // Implement SFTP upload
                break;
            case 2: // OneDrive
                // Implement OneDrive upload
                break;
            case 3: // Google Drive
                // Implement Google Drive upload
                break;
            default:
                throw new Error('Invalid destination type');
        }
    }

    async updateJobStatus(jobId, status, error = null) {
        try {
            await db.query(`
                UPDATE schedules
                SET 
                    last_run = CURRENT_TIMESTAMP,
                    next_run = CASE 
                        WHEN frequency_id = 1 THEN CURRENT_TIMESTAMP + interval '1 day'
                        WHEN frequency_id = 2 THEN CURRENT_TIMESTAMP + interval '7 days'
                        WHEN frequency_id = 3 THEN CURRENT_TIMESTAMP + interval '1 month'
                    END,
                    last_status = $2,
                    last_error = $3
                WHERE id = $1
            `, [jobId, status, error]);
        } catch (dbError) {
            console.error('Error updating job status:', dbError);
        }
    }
}

module.exports = new JobProcessor();