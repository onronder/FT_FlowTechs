const express = require('express');
const router = express.Router();
const db = require('../config/database');
const auth = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// Validation middleware
const validateDestination = [
    body('destination_type_id').isInt().withMessage('Destination type ID must be an integer'),
    body('file_format_id').isInt().withMessage('File format ID must be an integer'),
    body('credentials').isObject().withMessage('Credentials must be an object'),
    // Conditional validation based on destination type
    body('credentials.host').if(body('destination_type_id').equals(1)).notEmpty().withMessage('SFTP host is required'),
    body('credentials.port').if(body('destination_type_id').equals(1)).isInt().withMessage('SFTP port must be a number'),
    body('credentials.username').if(body('destination_type_id').equals(1)).notEmpty().withMessage('SFTP username is required'),
    body('credentials.password').if(body('destination_type_id').equals(1)).notEmpty().withMessage('SFTP password is required'),
    body('credentials.directory').if(body('destination_type_id').equals(1)).notEmpty().withMessage('SFTP directory is required')
];

// Get available destination types
router.get('/types', auth, async (req, res, next) => {
    try {
        const types = await db.query(
            'SELECT * FROM destination_types WHERE is_active = true ORDER BY name'
        );
        console.log('Retrieved destination types:', types.rows);
        res.json(types.rows);
    } catch (error) {
        console.error('Error fetching destination types:', error);
        next(error);
    }
});

// Get available file formats
router.get('/file-formats', auth, async (req, res, next) => {
    try {
        const formats = await db.query(
            'SELECT * FROM file_formats WHERE is_active = true ORDER BY name'
        );
        console.log('Retrieved file formats:', formats.rows);
        res.json(formats.rows);
    } catch (error) {
        console.error('Error fetching file formats:', error);
        next(error);
    }
});

// Create a new destination
router.post('/', auth, validateDestination, async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { destination_type_id, file_format_id, credentials } = req.body;
        console.log('Creating destination:', { destination_type_id, file_format_id });

        // Verify destination type exists and get required fields
        const typeCheck = await db.query(
            'SELECT required_fields FROM destination_types WHERE id = $1 AND is_active = true',
            [destination_type_id]
        );

        if (typeCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Destination type not found' });
        }

        // Validate required fields based on destination type
        const requiredFields = typeCheck.rows[0].required_fields;
        for (const [field, type] of Object.entries(requiredFields)) {
            if (!credentials[field]) {
                return res.status(400).json({ error: `Missing required field: ${field}` });
            }
        }

        const result = await db.query(
            `INSERT INTO destinations 
            (user_id, destination_type_id, file_format_id, credentials) 
            VALUES ($1, $2, $3, $4) 
            RETURNING *`,
            [req.user.id, destination_type_id, file_format_id, credentials]
        );

        console.log('Destination created:', result.rows[0]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating destination:', error);
        next(error);
    }
});

// Get all destinations for user
router.get('/', auth, async (req, res, next) => {
    try {
        const destinations = await db.query(`
            SELECT 
                d.*,
                dt.name as destination_type_name,
                ff.name as file_format_name
            FROM destinations d
            JOIN destination_types dt ON d.destination_type_id = dt.id
            JOIN file_formats ff ON d.file_format_id = ff.id
            WHERE d.user_id = $1 AND d.is_active = true
            ORDER BY d.created_at DESC
        `, [req.user.id]);

        console.log('Retrieved destinations:', destinations.rows);
        res.json(destinations.rows);
    } catch (error) {
        console.error('Error fetching destinations:', error);
        next(error);
    }
});

// Update a destination
router.put('/:id', auth, validateDestination, async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { destination_type_id, file_format_id, credentials } = req.body;

        // Verify destination belongs to user
        const destinationCheck = await db.query(
            'SELECT id FROM destinations WHERE id = $1 AND user_id = $2 AND is_active = true',
            [id, req.user.id]
        );

        if (destinationCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Destination not found' });
        }

        const result = await db.query(
            `UPDATE destinations 
            SET destination_type_id = $1,
                file_format_id = $2,
                credentials = $3,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $4 AND user_id = $5
            RETURNING *`,
            [destination_type_id, file_format_id, credentials, id, req.user.id]
        );

        console.log('Destination updated:', result.rows[0]);
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating destination:', error);
        next(error);
    }
});

// Delete a destination
router.delete('/:id', auth, async (req, res, next) => {
    try {
        const { id } = req.params;

        // Verify destination belongs to user
        const destinationCheck = await db.query(
            'SELECT id FROM destinations WHERE id = $1 AND user_id = $2 AND is_active = true',
            [id, req.user.id]
        );

        if (destinationCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Destination not found' });
        }

        await db.query(
            'UPDATE destinations SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [id]
        );

        console.log('Destination deleted successfully');
        res.json({ message: 'Destination deleted successfully' });
    } catch (error) {
        console.error('Error deleting destination:', error);
        next(error);
    }
});

module.exports = router;