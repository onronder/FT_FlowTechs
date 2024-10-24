const db = require('../config/database');
const schedule = require('node-schedule');
const shopifyService = require('./shopifyService');
const transformationService = require('./transformationService');
const destinationService = require('./destinationService');
const fileFormatService = require('./fileFormatService');
const { validateData } = require('../utils/validation');
const errorLogger = require('./errorLogger');

class JobProcessor {
    constructor() {
        this.activeJobs = new Map();
        this.retryAttempts = 3;
        this.retryDelay = 5000; // 5 seconds
    }

    async executeJob(jobConfig) {
        const { scheduleId, sourceId, transformationId, destinationId } = jobConfig;
        const jobContext = { scheduleId, startTime: new Date() };

        try {
            // Start job execution record
            const jobExecution = await this.createJobExecution(jobConfig);
            jobContext.jobExecutionId = jobExecution.id;

            // 1. Extract Data
            const sourceData = await this.extractData(sourceId);
            await this.updateJobStatus(jobContext, 'EXTRACTING', 'Data extracted successfully');

            // 2. Validate Data
            const validationResult = await this.validateData(sourceData);
            if (!validationResult.isValid) {
                throw new Error(`Data validation failed: ${validationResult.errors.join(', ')}`);
            }
            await this.updateJobStatus(jobContext, 'VALIDATING', 'Data validated successfully');

            // 3. Apply Transformations
            const transformedData = await this.applyTransformations(transformationId, sourceData);
            await this.updateJobStatus(jobContext, 'TRANSFORMING', 'Transformations applied successfully');

            // 4. Convert Format
            const destination = await this.getDestinationConfig(destinationId);
            const formattedData = await this.convertFormat(transformedData, destination.file_format);
            await this.updateJobStatus(jobContext, 'FORMATTING', 'Format conversion completed');

            // 5. Upload to Destination
            await this.uploadToDestination(formattedData, destination);
            await this.updateJobStatus(jobContext, 'COMPLETED', 'Job completed successfully');

            // 6. Update schedule next run time
            await this.updateScheduleNextRun(scheduleId);

            return { success: true, jobExecutionId: jobContext.jobExecutionId };
        } catch (error) {
            await this.handleJobError(jobContext, error);
            throw error;
        }
    }

    async createJobExecution(jobConfig) {
        return await db.query(`
            INSERT INTO job_executions (
                schedule_id,
                source_id,
                transformation_id,
                destination_id,
                status,
                started_at
            ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
            RETURNING *
        `, [
            jobConfig.scheduleId,
            jobConfig.sourceId,
            jobConfig.transformationId,
            jobConfig.destinationId,
            'STARTED'
        ]);
    }

    async extractData(sourceId) {
        const source = await db.query('SELECT * FROM sources WHERE id = $1', [sourceId]);
        const sourceConfig = source.rows[0];

        // Get selected APIs and fields
        const selectedApis = await db.query(`
            SELECT sa.*, ssa.selected_fields
            FROM source_selected_apis ssa
            JOIN shopify_apis sa ON ssa.api_id = sa.id
            WHERE ssa.source_id = $1
        `, [sourceId]);

        // Extract data for each selected API
        const data = {};
        for (const api of selectedApis.rows) {
            const apiData = await shopifyService.fetchData(
                sourceConfig.credentials,
                api.endpoint,
                api.selected_fields
            );
            data[api.name] = apiData;
        }

        return data;
    }

    async validateData(data) {
        const validationRules = {
            required: ['id', 'created_at'],
            types: {
                id: 'number',
                created_at: 'string',
                updated_at: 'string'
            }
        };

        return validateData(data, validationRules);
    }

    async applyTransformations(transformationId, data) {
        if (!transformationId) return data;

        const transformation = await db.query(
            'SELECT * FROM transformations WHERE id = $1',
            [transformationId]
        );

        if (!transformation.rows.length) {
            return data;
        }

        return await transformationService.applyTransformations(
            data,
            transformation.rows[0].configuration
        );
    }

    async convertFormat(data, format) {
        switch (format.toLowerCase()) {
            case 'csv':
                return await fileFormatService.convertToCsv(data);
            case 'json':
                return await fileFormatService.convertToJson(data);
            case 'xml':
                return await fileFormatService.convertToXml(data);
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
    }

    async uploadToDestination(data, destination) {
        return await destinationService.uploadData(data, destination);
    }

    async updateJobStatus(jobContext, status, message) {
        await db.query(`
            UPDATE job_executions
            SET 
                status = $1,
                message = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
        `, [status, message, jobContext.jobExecutionId]);
    }

    async handleJobError(jobContext, error) {
        await errorLogger.logError(error, {
            component: 'JobProcessor',
            jobExecutionId: jobContext.jobExecutionId
        });

        await this.updateJobStatus(
            jobContext,
            'FAILED',
            `Job failed: ${error.message}`
        );
    }

    async updateScheduleNextRun(scheduleId) {
        const schedule = await db.query(
            'SELECT * FROM schedules WHERE id = $1',
            [scheduleId]
        );

        if (!schedule.rows.length) return;

        const nextRun = this.calculateNextRun(schedule.rows[0]);
        
        await db.query(`
            UPDATE schedules
            SET 
                last_run = CURRENT_TIMESTAMP,
                next_run = $1
            WHERE id = $2
        `, [nextRun, scheduleId]);
    }

    calculateNextRun(schedule) {
        // Implementation based on frequency_id, time_of_day, etc.
    }
}

module.exports = new JobProcessor();