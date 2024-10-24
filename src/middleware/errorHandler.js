const responseHandler = require('../utils/responseHandler');
const errorLogger = require('../services/errorLogger');

const errorHandler = async (err, req, res, next) => {
    // Log error
    await errorLogger.logError(err, {
        path: req.path,
        method: req.method,
        query: req.query,
        body: req.body,
        user: req.user?.id
    });

    // Handle specific error types
    if (err.name === 'ValidationError') {
        return res.status(400).json(
            responseHandler.validation(err.details)
        );
    }

    if (err.name === 'UnauthorizedError') {
        return res.status(401).json(
            responseHandler.unauthorized(err.message)
        );
    }

    if (err.name === 'ForbiddenError') {
        return res.status(403).json(
            responseHandler.forbidden(err.message)
        );
    }

    if (err.name === 'NotFoundError') {
        return res.status(404).json(
            responseHandler.notFound(err.message)
        );
    }

    // Handle database errors
    if (err.code && err.code.startsWith('23')) {
        return res.status(400).json(
            responseHandler.error(
                { message: 'Database constraint violation' },
                'DATABASE_ERROR'
            )
        );
    }

    // Default error response
    res.status(500).json(
        responseHandler.error(err)
    );
};

module.exports = errorHandler;