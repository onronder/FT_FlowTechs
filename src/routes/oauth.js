const express = require('express');
const router = express.Router();
const db = require('../config/database');
const auth = require('../middleware/auth');
const oauthService = require('../services/oauthService');

// Get OAuth URL for a destination
router.get('/authorize/:destinationId', auth, async (req, res) => {
    try {
        const { destinationId } = req.params;

        // Get destination configuration
        const destConfig = await db.query(`
            SELECT 
                d.*,
                dt.name as provider_name,
                dt.oauth_config
            FROM destinations d
            JOIN destination_types dt ON d.destination_type_id = dt.id
            WHERE d.id = $1 AND d.user_id = $2`,
            [destinationId, req.user.id]
        );

        if (destConfig.rows.length === 0) {
            return res.status(404).json({ error: 'Destination not found' });
        }

        const destination = destConfig.rows[0];
        const authUrl = await oauthService.getAuthorizationUrl(
            req.user.id, 
            destinationId, 
            {
                name: destination.provider_name,
                credentials: destination.credentials,
                oauth_config: destination.oauth_config
            }
        );

        res.json({ authUrl });
    } catch (error) {
        console.error('Authorization URL generation error:', error);
        res.status(500).json({ error: 'Failed to generate authorization URL' });
    }
});

// OAuth callback endpoint
router.get('/callback', async (req, res) => {
    try {
        const { code, state } = req.query;
        
        const result = await oauthService.handleCallback(code, state);

        // Return success page that closes the popup
        res.send(`
            <html>
                <body>
                    <script>
                        window.opener.postMessage(${JSON.stringify(result)}, "${process.env.APP_URL}");
                        window.close();
                    </script>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('OAuth callback error:', error);
        res.status(500).send(`
            <html>
                <body>
                    <script>
                        window.opener.postMessage({ error: "Authentication failed" }, "${process.env.APP_URL}");
                        window.close();
                    </script>
                </body>
            </html>
        `);
    }
});

// Force token refresh endpoint
router.post('/refresh/:destinationId', auth, async (req, res) => {
    try {
        const { destinationId } = req.params;

        // Verify destination belongs to user
        const destCheck = await db.query(
            'SELECT id FROM destinations WHERE id = $1 AND user_id = $2',
            [destinationId, req.user.id]
        );

        if (destCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Destination not found' });
        }

        const refreshedCredentials = await oauthService.refreshTokens(destinationId);
        res.json({ success: true, credentials: refreshedCredentials });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({ error: 'Failed to refresh tokens' });
    }
});

module.exports = router;