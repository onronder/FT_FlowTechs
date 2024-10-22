const crypto = require('crypto');

class EncryptionService {
    constructor() {
        if (!process.env.ENCRYPTION_KEY) {
            throw new Error('ENCRYPTION_KEY environment variable is required');
        }
        this.algorithm = 'aes-256-gcm';
        this.keyLength = 32; // 256 bits
        this.ivLength = 16; // 128 bits
        this.saltLength = 64;
        this.tagLength = 16;
    }

    // Generate encryption key from environment variable
    #generateKey(salt) {
        return crypto.pbkdf2Sync(
            process.env.ENCRYPTION_KEY,
            salt,
            100000, // Number of iterations
            this.keyLength,
            'sha512'
        );
    }

    // Encrypt sensitive data
    encrypt(data) {
        try {
            // Generate random salt and IV
            const salt = crypto.randomBytes(this.saltLength);
            const iv = crypto.randomBytes(this.ivLength);
            
            // Generate key using salt
            const key = this.#generateKey(salt);
            
            // Create cipher
            const cipher = crypto.createCipheriv(this.algorithm, key, iv);
            
            // Encrypt data
            const encrypted = Buffer.concat([
                cipher.update(JSON.stringify(data), 'utf8'),
                cipher.final()
            ]);

            // Get auth tag
            const tag = cipher.getAuthTag();

            // Return encrypted data with all necessary components for decryption
            return {
                encrypted: encrypted.toString('base64'),
                iv: iv.toString('base64'),
                salt: salt.toString('base64'),
                tag: tag.toString('base64')
            };
        } catch (error) {
            console.error('Encryption error:', error);
            throw new Error('Failed to encrypt data');
        }
    }

    // Decrypt sensitive data
    decrypt(encryptedData) {
        try {
            // Extract components
            const {
                encrypted: encryptedText,
                iv: ivString,
                salt: saltString,
                tag: tagString
            } = encryptedData;

            // Convert base64 strings back to buffers
            const encrypted = Buffer.from(encryptedText, 'base64');
            const iv = Buffer.from(ivString, 'base64');
            const salt = Buffer.from(saltString, 'base64');
            const tag = Buffer.from(tagString, 'base64');

            // Generate key using salt
            const key = this.#generateKey(salt);

            // Create decipher
            const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
            decipher.setAuthTag(tag);

            // Decrypt data
            const decrypted = Buffer.concat([
                decipher.update(encrypted),
                decipher.final()
            ]);

            return JSON.parse(decrypted.toString('utf8'));
        } catch (error) {
            console.error('Decryption error:', error);
            throw new Error('Failed to decrypt data');
        }
    }

    // Encrypt specific fields in an object
    encryptFields(data, fieldsToEncrypt) {
        const result = { ...data };
        
        for (const field of fieldsToEncrypt) {
            if (result[field]) {
                result[field] = this.encrypt(result[field]);
            }
        }

        return result;
    }

    // Decrypt specific fields in an object
    decryptFields(data, fieldsToDecrypt) {
        const result = { ...data };
        
        for (const field of fieldsToDecrypt) {
            if (result[field]) {
                result[field] = this.decrypt(result[field]);
            }
        }

        return result;
    }
}

module.exports = new EncryptionService();