// API Response Types
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: ApiError;
    meta?: ApiMetadata;
}

export interface ApiError {
    code: string;
    message: string;
    details?: any;
}

export interface ApiMetadata {
    timestamp: string;
    pagination?: PaginationMeta;
}

export interface PaginationMeta {
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}

// Generic Types
export interface BaseEntity {
    id: number;
    created_at: string;
    updated_at: string;
    is_active: boolean;
}

// User Types
export interface User extends BaseEntity {
    email: string;
    name?: string;
    notification_preferences: NotificationPreferences;
}

export interface NotificationPreferences {
    email: string[];
    inApp: string[];
}

// Source Types
export interface Source extends BaseEntity {
    user_id: number;
    api_type_id: number;
    credentials: ShopifyCredentials;
}

export interface ShopifyCredentials {
    shop_name: string;
    shop_url: string;
    access_token: string;
    api_version: string;
}

// Transformation Types
export interface Transformation extends BaseEntity {
    source_id: number;
    name: string;
    transformation_type_id: number;
    configuration: TransformationConfig[];
}

export interface TransformationConfig {
    api: string;
    field: string;
    type: string;
    configuration: Record<string, any>;
}

// Destination Types
export interface Destination extends BaseEntity {
    user_id: number;
    destination_type_id: number;
    file_format_id: number;
    credentials: DestinationCredentials;
}

export interface DestinationCredentials {
    // SFTP
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    directory?: string;

    // OAuth (OneDrive/Google Drive)
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    accessToken?: string;
    tokenExpiresAt?: string;
}

// Schedule Types
export interface Schedule extends BaseEntity {
    user_id: number;
    source_id: number;
    transformation_id?: number;
    destination_id: number;
    frequency_id: number;
    day_of_week?: number;
    day_of_month?: number;
    time_of_day: string;
    last_run?: string;
    next_run?: string;
}

// Job Types
export interface JobExecution extends BaseEntity {
    schedule_id: number;
    status: JobStatus;
    started_at: string;
    completed_at?: string;
    error?: string;
    details?: Record<string, any>;
}

export type JobStatus = 
    | 'PENDING'
    | 'STARTED'
    | 'EXTRACTING'
    | 'VALIDATING'
    | 'TRANSFORMING'
    | 'FORMATTING'
    | 'UPLOADING'
    | 'COMPLETED'
    | 'FAILED';

// Parametric Types
export interface ApiType extends BaseEntity {
    name: string;
    description?: string;
}

export interface TransformationType extends BaseEntity {
    name: string;
    description?: string;
    example?: string;
}

export interface DestinationType extends BaseEntity {
    name: string;
    description?: string;
    auth_type: 'basic' | 'oauth2';
    oauth_config?: OAuthConfig;
    required_fields: Record<string, string>;
}

export interface OAuthConfig {
    authUrlTemplate: string;
    tokenUrlTemplate: string;
    requiredScopes: string[];
    requiredCredentials: string[];
}

export interface FileFormat extends BaseEntity {
    name: string;
    description?: string;
}

export interface ScheduleFrequency extends BaseEntity {
    name: string;
    description?: string;
}