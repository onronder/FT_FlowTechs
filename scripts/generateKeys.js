const crypto = require('crypto');

const generateSecureKey = (length = 64) => {
    return crypto.randomBytes(length).toString('hex');
};

console.log('\nGenerated Security Keys:\n');
console.log('JWT_SECRET=', generateSecureKey());
console.log('ENCRYPTION_KEY=', generateSecureKey());
console.log('\nAdd these to your .env file\n');