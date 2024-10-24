/**
 * Standardized API Response Handler
 * Provides consistent response format across the application
 */
class ResponseHandler {
    static success(data = null, meta = null) {
        return {
            success: true,
            data,
            meta: {
                timestamp: new Date().toISOString(),
                ...meta
            }
        };
    }

    static error(error, code = 'INTERNAL_ERROR') {
        return {
            success: false,
            error: {
                code,
                message: error.message || 'An unexpected error occurred',
                details: error.details || null
            },
            meta: {
                timestamp: new Date().toISOString()
            }
        };
    }

    static paginated(data, total, page, limit) {
        return {
            success: true,
            data,
            meta: {
                timestamp: new Date().toISOString(),
                pagination: {
                    total,
                    page,
                    limit,
                    hasMore: total > page * limit,
                    totalPages: Math.ceil(total / limit)
                }
            }
        };
    }

    static badRequest(message = 'Invalid request parameters') {
        return this.error({ message }, 'BAD_REQUEST');
    }

    static unauthorized(message = 'Authentication required') {
        return this.error({ message }, 'UNAUTHORIZED');
    }

    static forbidden(message = 'Access denied') {
        return this.error({ message }, 'FORBIDDEN');
    }

    static notFound(message = 'Resource not found') {
        return this.error({ message }, 'NOT_FOUND');
    }

    static validation(details) {
        return this.error(
            { 
                message: 'Validation failed', 
                details 
            },
            'VALIDATION_ERROR'
        );
    }

    static conflict(message = 'Resource conflict') {
        return this.error({ message }, 'CONFLICT');
    }

    static tooManyRequests(message = 'Rate limit exceeded') {
        return this.error({ message }, 'TOO_MANY_REQUESTS');
    }

    static serviceUnavailable(message = 'Service temporarily unavailable') {
        return this.error({ message }, 'SERVICE_UNAVAILABLE');
    }

    static custom(code, message, details = null) {
        return this.error({ message, details }, code);
    }
}

module.exports = ResponseHandler;