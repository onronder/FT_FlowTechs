const db = require('../config/database');
const nodemailer = require('nodemailer');

class NotificationService {
    constructor() {
        // Initialize email transporter
        this.emailTransporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        // Notification types
        this.NOTIFICATION_TYPES = {
            JOB_SUCCESS: 'job_success',
            JOB_FAILURE: 'job_failure',
            TOKEN_EXPIRING: 'token_expiring',
            TOKEN_EXPIRED: 'token_expired',
            AUTH_REQUIRED: 'auth_required',
            TRANSFORMATION_ERROR: 'transformation_error',
            DESTINATION_ERROR: 'destination_error'
        };

        // Notification priorities
        this.PRIORITIES = {
            LOW: 'low',
            MEDIUM: 'medium',
            HIGH: 'high',
            URGENT: 'urgent'
        };
    }

    async createNotification(userId, type, message, data = {}, priority = 'medium') {
        try {
            const result = await db.query(`
                INSERT INTO notifications (
                    user_id,
                    type,
                    message,
                    data,
                    priority,
                    created_at
                ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                RETURNING *`,
                [userId, type, message, data, priority]
            );

            // Get user preferences for this notification type
            const userPrefs = await db.query(`
                SELECT notification_preferences
                FROM users
                WHERE id = $1`,
                [userId]
            );

            const preferences = userPrefs.rows[0]?.notification_preferences || {};

            // Handle different notification methods based on user preferences
            if (preferences.email && preferences.email.includes(type)) {
                await this.sendEmailNotification(userId, type, message, data);
            }

            // Could add more notification methods here (SMS, Slack, etc.)

            return result.rows[0];
        } catch (error) {
            console.error('Error creating notification:', error);
            throw error;
        }
    }

    async sendEmailNotification(userId, type, message, data) {
        try {
            // Get user email
            const userResult = await db.query(
                'SELECT email FROM users WHERE id = $1',
                [userId]
            );

            if (!userResult.rows.length) {
                throw new Error('User not found');
            }

            const userEmail = userResult.rows[0].email;

            // Get email template based on notification type
            const template = this.getEmailTemplate(type, message, data);

            await this.emailTransporter.sendMail({
                from: process.env.SMTP_FROM,
                to: userEmail,
                subject: template.subject,
                html: template.html
            });
        } catch (error) {
            console.error('Error sending email notification:', error);
            throw error;
        }
    }

    getEmailTemplate(type, message, data) {
        // Basic template function - could be more sophisticated
        const templates = {
            [this.NOTIFICATION_TYPES.JOB_SUCCESS]: {
                subject: 'Job Completed Successfully',
                html: `
                    <h2>Job Completed Successfully</h2>
                    <p>${message}</p>
                    <div>
                        <p>Job Details:</p>
                        <ul>
                            <li>Job ID: ${data.jobId}</li>
                            <li>Completed At: ${new Date(data.completedAt).toLocaleString()}</li>
                            <li>Source: ${data.sourceName}</li>
                            <li>Destination: ${data.destinationName}</li>
                        </ul>
                    </div>
                `
            },
            [this.NOTIFICATION_TYPES.JOB_FAILURE]: {
                subject: 'Job Failed',
                html: `
                    <h2>Job Failed</h2>
                    <p>${message}</p>
                    <div>
                        <p>Error Details:</p>
                        <pre>${JSON.stringify(data.error, null, 2)}</pre>
                    </div>
                `
            },
            [this.NOTIFICATION_TYPES.TOKEN_EXPIRING]: {
                subject: 'OAuth Token Expiring Soon',
                html: `
                    <h2>OAuth Token Expiring Soon</h2>
                    <p>${message}</p>
                    <p>Please reauthorize your connection to continue uninterrupted service.</p>
                `
            },
            // Add more templates as needed
        };

        return templates[type] || {
            subject: 'Notification',
            html: `<p>${message}</p>`
        };
    }

    async getNotifications(userId, options = {}) {
        const {
            limit = 10,
            offset = 0,
            type = null,
            unreadOnly = false,
            priority = null
        } = options;

        const queryParams = [userId, limit, offset];
        let queryConditions = 'WHERE user_id = $1';
        
        if (type) {
            queryParams.push(type);
            queryConditions += ` AND type = $${queryParams.length}`;
        }
        
        if (unreadOnly) {
            queryConditions += ' AND read_at IS NULL';
        }
        
        if (priority) {
            queryParams.push(priority);
            queryConditions += ` AND priority = $${queryParams.length}`;
        }

        const query = `
            SELECT *
            FROM notifications
            ${queryConditions}
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
        `;

        return await db.query(query, queryParams);
    }

    async markAsRead(notificationId, userId) {
        const result = await db.query(`
            UPDATE notifications
            SET read_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND user_id = $2
            RETURNING *`,
            [notificationId, userId]
        );

        return result.rows[0];
    }

    async updateUserPreferences(userId, preferences) {
        const result = await db.query(`
            UPDATE users
            SET notification_preferences = $1
            WHERE id = $2
            RETURNING notification_preferences`,
            [preferences, userId]
        );

        return result.rows[0];
    }
}

module.exports = new NotificationService();