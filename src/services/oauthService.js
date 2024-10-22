const axios = require('axios');
const crypto = require('crypto');
const db = require('../config/database');
const encryptionService = require('./encryptionService');
const errorLogger = require('./errorLogger');
const {
    OAuthError,
    OAuthTokenError,
    OAuthConfigError,
    OAuthStateError,
    OAuthDestinationError,
    OAuthProviderError
} = require('../errors/OAuthError');

class OAuthService {
    constructor() {
        this.SENSITIVE_FIELDS = ['accessToken', 'refreshToken', 'clientSecret'];
        this.MAX_RETRY_ATTEMPTS = 3;
        this.RETRY_DELAY = 1000; // 1 second
        this.TOKEN_REFRESH_THRESHOLD = 300000; // 5 minutes in milliseconds
        this.STATE_EXPIRY = '10 minutes';
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async retryOperation(operation, maxAttempts = this.MAX_RETRY_ATTEMPTS) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                
                if (error instanceof OAuthConfigError || 
                    error instanceof OAuthStateError ||
                    error.response?.status === 401) {
                    throw error; // Don't retry auth errors
                }

                if (attempt === maxAttempts) {
                    throw error;
                }

                await this.delay(this.RETRY_DELAY * attempt);
            }
        }

        throw lastError;
    }

    async getDestinationConfig(destinationId) {
        try {
            const result = await db.query(`
                SELECT 
                    d.*,
                    dt.name as provider_name,
                    dt.oauth_config
                FROM destinations d
                JOIN destination_types dt ON d.destination_type_id = dt.id
                WHERE d.id = $1 AND d.is_active = true`,
                [destinationId]
            );

            if (result.rows.length === 0) {
                throw new OAuthDestinationError('Destination not found', { destinationId });
            }

            return result.rows[0];
        } catch (error) {
            if (error instanceof OAuthError) throw error;
            throw new OAuthDestinationError(
                'Failed to fetch destination configuration',
                { destinationId, cause: error.message }
            );
        }
    }

    async getDestinationCredentials(destinationId) {
        try {
            const result = await db.query(
                'SELECT credentials FROM destinations WHERE id = $1 AND is_active = true',
                [destinationId]
            );

            if (result.rows.length === 0) {
                throw new OAuthDestinationError('Destination not found', { destinationId });
            }

            return result.rows[0].credentials;
        } catch (error) {
            if (error instanceof OAuthError) throw error;
            throw new OAuthDestinationError(
                'Failed to fetch destination credentials',
                { destinationId, cause: error.message }
            );
        }
    }

    async updateDestinationCredentials(destinationId, credentials, oldCredentials = null) {
        const context = { destinationId };
        
        try {
            await db.query('BEGIN');

            await db.query(
                `UPDATE destinations 
                SET credentials = $1, 
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2 AND is_active = true`,
                [credentials, destinationId]
            );

            await db.query(
                `INSERT INTO destination_credentials_audit 
                (destination_id, action, old_credentials, new_credentials)
                VALUES ($1, $2, $3, $4)`,
                [
                    destinationId, 
                    'update', 
                    this.sanitizeCredentials(oldCredentials),
                    this.sanitizeCredentials(credentials)
                ]
            );

            await db.query('COMMIT');
        } catch (error) {
            await db.query('ROLLBACK');
            await errorLogger.logError(error, context);
            throw new OAuthDestinationError(
                'Failed to update destination credentials',
                { destinationId, cause: error.message }
            );
        }
    }

    sanitizeCredentials(credentials) {
        if (!credentials) return null;
        const sanitized = { ...credentials };
        for (const field of this.SENSITIVE_FIELDS) {
            if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
            }
        }
        return sanitized;
    }

    async generateState(userId, destinationId, provider) {
        try {
            const state = crypto.randomBytes(32).toString('hex');
            
            await db.query(`
                INSERT INTO oauth_states 
                (state, user_id, destination_id, provider, expires_at)
                VALUES ($1, $2, $3, $4, NOW() + INTERVAL '${this.STATE_EXPIRY}')`,
                [state, userId, destinationId, provider]
            );
            
            return state;
        } catch (error) {
            throw new OAuthStateError(
                'Failed to generate state',
                { userId, destinationId, provider, cause: error.message }
            );
        }
    }

    async verifyState(state) {
        try {
            const result = await db.query(`
                DELETE FROM oauth_states
                WHERE state = $1 AND expires_at > NOW()
                RETURNING user_id, destination_id, provider`,
                [state]
            );
            
            if (result.rows.length === 0) {
                throw new OAuthStateError('Invalid or expired state parameter', { state });
            }
            
            return result.rows[0];
        } catch (error) {
            if (error instanceof OAuthError) throw error;
            throw new OAuthStateError(
                'State verification failed',
                { state, cause: error.message }
            );
        }
    }

    async getAuthorizationUrl(userId, destinationId) {
        const context = { userId, destinationId };
        
        try {
            const config = await this.getDestinationConfig(destinationId);
            const state = await this.generateState(userId, destinationId, config.provider_name);
            
            const params = new URLSearchParams({
                client_id: config.credentials.clientId,
                response_type: 'code',
                redirect_uri: config.credentials.redirectUri,
                scope: config.oauth_config.requiredScopes.join(' '),
                state: state,
                access_type: 'offline',
                prompt: 'consent'
            });

            return `${config.oauth_config.authUrlTemplate}?${params.toString()}`;
        } catch (error) {
            await errorLogger.logError(error, context);
            if (error instanceof OAuthError) throw error;
            throw new OAuthError(
                'Failed to generate authorization URL',
                'AUTH_URL_ERROR',
                { cause: error.message }
            );
        }
    }

    async exchangeCodeForTokens(code, config) {
        const context = { 
            provider: config.provider_name,
            clientId: config.credentials.clientId
        };

        try {
            const params = new URLSearchParams({
                client_id: config.credentials.clientId,
                client_secret: config.credentials.clientSecret,
                code: code,
                redirect_uri: config.credentials.redirectUri,
                grant_type: 'authorization_code'
            });

            const response = await this.retryOperation(async () => {
                try {
                    return await axios.post(
                        config.oauth_config.tokenUrlTemplate,
                        params,
                        {
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            timeout: 5000
                        }
                    );
                } catch (error) {
                    if (axios.isAxiosError(error)) {
                        if (error.response) {
                            throw new OAuthProviderError(
                                'Provider rejected token exchange',
                                error.response.data,
                                {
                                    status: error.response.status,
                                    statusText: error.response.statusText
                                }
                            );
                        } else if (error.request) {
                            throw new OAuthProviderError(
                                'No response from provider',
                                error,
                                { timeout: error.config.timeout }
                            );
                        }
                    }
                    throw error;
                }
            });

            return response.data;
        } catch (error) {
            await errorLogger.logError(error, context);
            throw error;
        }
    }

    async exchangeRefreshToken(refreshToken, config) {
        const context = {
            provider: config.provider_name,
            clientId: config.credentials.clientId
        };

        try {
            const params = new URLSearchParams({
                client_id: config.credentials.clientId,
                client_secret: config.credentials.clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            });

            const response = await this.retryOperation(async () => {
                try {
                    return await axios.post(
                        config.oauth_config.tokenUrlTemplate,
                        params,
                        {
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            timeout: 5000
                        }
                    );
                } catch (error) {
                    if (axios.isAxiosError(error)) {
                        if (error.response?.status === 401) {
                            throw new OAuthTokenError(
                                'Refresh token is invalid or expired',
                                { provider: config.provider_name }
                            );
                        }
                        throw new OAuthProviderError(
                            'Token refresh failed',
                            error.response?.data || error,
                            {
                                status: error.response?.status,
                                statusText: error.response?.statusText
                            }
                        );
                    }
                    throw error;
                }
            });

            return response.data;
        } catch (error) {
            await errorLogger.logError(error, context);
            throw error;
        }
    }

    async handleCallback(code, state) {
        const context = { code, state };
        
        try {
            const stateData = await this.verifyState(state);
            context.stateData = stateData;

            const config = await this.getDestinationConfig(stateData.destination_id);
            context.destinationId = stateData.destination_id;

            const tokens = await this.exchangeCodeForTokens(code, config);

            await db.query('BEGIN');

            try {
                const updatedCredentials = {
                    ...config.credentials,
                    accessToken: encryptionService.encrypt(tokens.access_token),
                    refreshToken: encryptionService.encrypt(tokens.refresh_token),
                    tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString()
                };

                await this.updateDestinationCredentials(
                    stateData.destination_id,
                    updatedCredentials,
                    config.credentials
                );

                await db.query('COMMIT');
                
                return { 
                    success: true, 
                    destination_id: stateData.destination_id,
                    expires_in: tokens.expires_in
                };
            } catch (error) {
                await db.query('ROLLBACK');
                throw error;
            }
        } catch (error) {
            await errorLogger.logError(error, context);
            if (error instanceof OAuthError) throw error;
            throw new OAuthError(
                'OAuth callback failed',
                'CALLBACK_ERROR',
                { cause: error.message }
            );
        }
    }

    async refreshTokens(destinationId) {
        const context = { destinationId };

        try {
            const config = await this.getDestinationConfig(destinationId);
            const currentCredentials = config.credentials;

            if (!currentCredentials.refreshToken) {
                throw new OAuthTokenError(
                    'No refresh token available',
                    { destinationId }
                );
            }

            const refreshToken = encryptionService.decrypt(currentCredentials.refreshToken);
            const tokens = await this.exchangeRefreshToken(refreshToken, config);

            const updatedCredentials = {
                ...currentCredentials,
                accessToken: encryptionService.encrypt(tokens.access_token),
                tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString()
            };

            if (tokens.refresh_token) {
                updatedCredentials.refreshToken = encryptionService.encrypt(tokens.refresh_token);
            }

            await this.updateDestinationCredentials(
                destinationId,
                updatedCredentials,
                currentCredentials
            );
            
            return updatedCredentials;
        } catch (error) {
            await errorLogger.logError(error, context);
            throw error;
        }
    }

    async checkAndRefreshTokens(destinationId) {
        try {
            const credentials = await this.getDestinationCredentials(destinationId);
            const expiresAt = new Date(credentials.tokenExpiresAt);
            
            if (expiresAt.getTime() - Date.now() < this.TOKEN_REFRESH_THRESHOLD) {
                return await this.refreshTokens(destinationId);
            }

            return credentials;
        } catch (error) {
            throw new OAuthTokenError(
                'Token refresh check failed',
                { destinationId, cause: error.message }
            );
        }
    }

    async getDecryptedCredentials(destinationId) {
        try {
            const updatedCredentials = await this.checkAndRefreshTokens(destinationId);
            return encryptionService.decryptFields(updatedCredentials, this.SENSITIVE_FIELDS);
        } catch (error) {
            throw new OAuthError(
                'Failed to get decrypted credentials',
                'DECRYPTION_ERROR',
                { destinationId, cause: error.message }
            );
        }
    }

    async revokeTokens(destinationId) {
        const context = { destinationId };

        try {
            const config = await this.getDestinationConfig(destinationId);
            const credentials = await this.getDestinationCredentials(destinationId);

            const updatedCredentials = {
                ...credentials,
                accessToken: null,
                refreshToken: null,
                tokenExpiresAt: null
            };

            await this.updateDestinationCredentials(
                destinationId,
                updatedCredentials,
                credentials
            );

            return { success: true };
        } catch (error) {
            await errorLogger.logError(error, context);
            throw new OAuthError(
                'Failed to revoke tokens',
                'REVOCATION_ERROR',
                { destinationId, cause: error.message }
            );
        }
    }

    validateOAuthConfig(config) {
        const requiredFields = ['clientId', 'clientSecret', 'redirectUri'];
        const missingFields = requiredFields.filter(field => !config.credentials[field]);
        
        if (missingFields.length > 0) {
            throw new OAuthConfigError(
                'Missing required OAuth fields',
                { missingFields }
            );
        }

        if (!config.oauth_config?.requiredScopes) {
            throw new OAuthConfigError('Missing required OAuth scopes configuration');
        }

        return true;
    }
}

module.exports = new OAuthService();