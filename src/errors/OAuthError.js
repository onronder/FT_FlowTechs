class OAuthError extends Error {
    constructor(message, code, details = {}) {
        super(message);
        this.name = 'OAuthError';
        this.code = code;
        this.details = details;
        this.timestamp = new Date().toISOString();
    }
}

class OAuthTokenError extends OAuthError {
    constructor(message, details = {}) {
        super(message, 'TOKEN_ERROR', details);
        this.name = 'OAuthTokenError';
    }
}

class OAuthConfigError extends OAuthError {
    constructor(message, details = {}) {
        super(message, 'CONFIG_ERROR', details);
        this.name = 'OAuthConfigError';
    }
}

class OAuthStateError extends OAuthError {
    constructor(message, details = {}) {
        super(message, 'STATE_ERROR', details);
        this.name = 'OAuthStateError';
    }
}

class OAuthDestinationError extends OAuthError {
    constructor(message, details = {}) {
        super(message, 'DESTINATION_ERROR', details);
        this.name = 'OAuthDestinationError';
    }
}

class OAuthProviderError extends OAuthError {
    constructor(message, providerError, details = {}) {
        super(message, 'PROVIDER_ERROR', {
            ...details,
            providerError: providerError
        });
        this.name = 'OAuthProviderError';
    }
}

module.exports = {
    OAuthError,
    OAuthTokenError,
    OAuthConfigError,
    OAuthStateError,
    OAuthDestinationError,
    OAuthProviderError
};