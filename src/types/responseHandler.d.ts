declare module '../utils/responseHandler' {
    interface ApiResponse<T = any> {
        success: boolean;
        data?: T;
        error?: ApiError;
        meta: ApiMetadata;
    }

    interface ApiError {
        code: string;
        message: string;
        details?: any;
    }

    interface ApiMetadata {
        timestamp: string;
        pagination?: PaginationMeta;
    }

    interface PaginationMeta {
        total: number;
        page: number;
        limit: number;
        hasMore: boolean;
        totalPages: number;
    }

    interface ValidationError {
        field: string;
        message: string;
    }

    type ErrorCode = 
        | 'INTERNAL_ERROR'
        | 'BAD_REQUEST'
        | 'UNAUTHORIZED'
        | 'FORBIDDEN'
        | 'NOT_FOUND'
        | 'VALIDATION_ERROR'
        | 'CONFLICT'
        | 'TOO_MANY_REQUESTS'
        | 'SERVICE_UNAVAILABLE'
        | string;

    class ResponseHandler {
        static success<T>(data?: T, meta?: Partial<Omit<ApiMetadata, 'timestamp'>>): ApiResponse<T>;
        
        static error(error: Error | { message: string; details?: any }, code?: ErrorCode): ApiResponse;
        
        static paginated<T>(
            data: T[],
            total: number,
            page: number,
            limit: number
        ): ApiResponse<T[]>;
        
        static badRequest(message?: string): ApiResponse;
        static unauthorized(message?: string): ApiResponse;
        static forbidden(message?: string): ApiResponse;
        static notFound(message?: string): ApiResponse;
        static validation(details: ValidationError | ValidationError[]): ApiResponse;
        static conflict(message?: string): ApiResponse;
        static tooManyRequests(message?: string): ApiResponse;
        static serviceUnavailable(message?: string): ApiResponse;
        static custom(code: string, message: string, details?: any): ApiResponse;
    }

    export = ResponseHandler;
}