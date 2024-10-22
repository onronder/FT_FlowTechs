const db = require('../config/database');

class ErrorLogger {
    async logError(error, context = {}) {
        try {
            const errorDetails = {
                name: error.name,
                message: error.message,
                code: error.code,
                details: error.details,
                stack: error.stack,
                context: context,
                timestamp: new Date()
            };

            await db.query(`
                INSERT INTO error_logs 
                (error_type, error_message, error_code, error_details, context, stack_trace)
                VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    error.name,
                    error.message,
                    error.code,
                    JSON.stringify(error.details),
                    JSON.stringify(context),
                    error.stack
                ]
            );

            console.error('Error logged:', errorDetails);
        } catch (logError) {
            console.error('Error logging failed:', logError);
            console.error('Original error:', error);
        }
    }

    async getErrorStats(timeframe = '24h') {
        const query = `
            SELECT 
                error_type,
                error_code,
                COUNT(*) as count,
                MIN(created_at) as first_occurrence,
                MAX(created_at) as last_occurrence
            FROM error_logs
            WHERE created_at > NOW() - INTERVAL '${timeframe}'
            GROUP BY error_type, error_code
            ORDER BY count DESC`;

        return await db.query(query);
    }
}

module.exports = new ErrorLogger();