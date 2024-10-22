const express = require('express');
const router = express.Router();
const db = require('../config/database');
const auth = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// Validation middleware for transformation creation/update
const validateTransformation = [
    body('source_id').isInt().withMessage('Source ID must be an integer'),
    body('name').isString().trim().notEmpty().withMessage('Name is required'),
    body('transformations').isArray().withMessage('Transformations must be an array'),
    body('transformations.*.api').isString().notEmpty().withMessage('API name is required'),
    body('transformations.*.field').isString().notEmpty().withMessage('Field name is required'),
    body('transformations.*.type').isString().notEmpty().withMessage('Transformation type is required'),
    body('transformations.*.configuration').isObject().withMessage('Configuration must be an object')
];

// Get available transformation types
router.get('/types', auth, async (req, res, next) => {
    try {
        const types = await db.query(
            'SELECT * FROM transformation_types WHERE is_active = true ORDER BY name'
        );
        console.log('Retrieved transformation types:', types.rows);
        res.json(types.rows);
    } catch (error) {
        console.error('Error fetching transformation types:', error);
        next(error);
    }
});

// Get all transformations for a user
router.get('/', auth, async (req, res, next) => {
    try {
        const transformations = await db.query(`
            SELECT 
                t.*,
                s.credentials->>'shop_name' as shop_name,
                array_agg(DISTINCT sa.name) as affected_apis
            FROM transformations t
            JOIN sources s ON t.source_id = s.id
            JOIN source_selected_apis ssa ON s.id = ssa.source_id
            JOIN shopify_apis sa ON ssa.api_id = sa.id
            WHERE s.user_id = $1 AND t.is_active = true
            GROUP BY t.id, s.credentials->>'shop_name'
            ORDER BY t.created_at DESC
        `, [req.user.id]);

        console.log('Retrieved transformations for user:', transformations.rows);
        res.json(transformations.rows);
    } catch (error) {
        console.error('Error fetching transformations:', error);
        next(error);
    }
});

// Create a new transformation
router.post('/', auth, validateTransformation, async (req, res, next) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { source_id, name, transformations } = req.body;
        console.log('Creating transformation:', { source_id, name, transformations });

        // Verify source belongs to user
        const sourceCheck = await db.query(
            'SELECT id FROM sources WHERE id = $1 AND user_id = $2',
            [source_id, req.user.id]
        );

        if (sourceCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Source not found' });
        }

        // Verify transformation types exist
        const transformationTypes = await db.query(
            'SELECT name FROM transformation_types WHERE is_active = true'
        );
        const validTypes = transformationTypes.rows.map(t => t.name);

        // Validate each transformation type
        for (const transform of transformations) {
            if (!validTypes.includes(transform.type)) {
                return res.status(400).json({
                    error: `Invalid transformation type: ${transform.type}. Valid types are: ${validTypes.join(', ')}`
                });
            }
        }

        // Begin transaction
        await db.query('BEGIN');

        try {
            // Create the transformation record
            const transformationResult = await db.query(
                `INSERT INTO transformations 
                (source_id, name, configuration) 
                VALUES ($1, $2, $3) 
                RETURNING *`,
                [source_id, name, JSON.stringify(transformations)]
            );

            await db.query('COMMIT');
            console.log('Transformation created:', transformationResult.rows[0]);
            res.status(201).json(transformationResult.rows[0]);
        } catch (error) {
            await db.query('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Error creating transformation:', error);
        next(error);
    }
});

// Get transformations for a specific source
router.get('/source/:sourceId', auth, async (req, res, next) => {
    try {
        const { sourceId } = req.params;
        console.log('Fetching transformations for source:', sourceId);

        // Verify source belongs to user
        const sourceCheck = await db.query(
            'SELECT id FROM sources WHERE id = $1 AND user_id = $2',
            [sourceId, req.user.id]
        );

        if (sourceCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Source not found' });
        }

        const transformations = await db.query(`
            SELECT 
                t.*,
                s.credentials->>'shop_name' as shop_name,
                array_agg(DISTINCT sa.name) as affected_apis
            FROM transformations t
            JOIN sources s ON t.source_id = s.id
            JOIN source_selected_apis ssa ON s.id = ssa.source_id
            JOIN shopify_apis sa ON ssa.api_id = sa.id
            WHERE t.source_id = $1 AND t.is_active = true
            GROUP BY t.id, s.credentials->>'shop_name'
            ORDER BY t.created_at DESC
        `, [sourceId]);

        console.log('Retrieved transformations:', transformations.rows);
        res.json(transformations.rows);
    } catch (error) {
        console.error('Error fetching source transformations:', error);
        next(error);
    }
});

// Get a specific transformation
router.get('/:id', auth, async (req, res, next) => {
    try {
        const { id } = req.params;
        console.log('Fetching transformation:', id);

        const transformation = await db.query(`
            SELECT 
                t.*,
                s.credentials->>'shop_name' as shop_name,
                array_agg(DISTINCT sa.name) as affected_apis
            FROM transformations t
            JOIN sources s ON t.source_id = s.id
            JOIN source_selected_apis ssa ON s.id = ssa.source_id
            JOIN shopify_apis sa ON ssa.api_id = sa.id
            WHERE t.id = $1 AND s.user_id = $2 AND t.is_active = true
            GROUP BY t.id, s.credentials->>'shop_name'
        `, [id, req.user.id]);

        if (transformation.rows.length === 0) {
            return res.status(404).json({ error: 'Transformation not found' });
        }

        console.log('Retrieved transformation:', transformation.rows[0]);
        res.json(transformation.rows[0]);
    } catch (error) {
        console.error('Error fetching transformation:', error);
        next(error);
    }
});

// Update a transformation
router.put('/:id', auth, validateTransformation, async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { name, transformations } = req.body;
        console.log('Updating transformation:', { id, name, transformations });

        // Verify transformation belongs to user's source
        const transformationCheck = await db.query(`
            SELECT t.id 
            FROM transformations t
            JOIN sources s ON t.source_id = s.id
            WHERE t.id = $1 AND s.user_id = $2 AND t.is_active = true
        `, [id, req.user.id]);

        if (transformationCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Transformation not found' });
        }

        const result = await db.query(`
            UPDATE transformations 
            SET name = $1, 
                configuration = $2, 
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3 
            RETURNING *
        `, [name, JSON.stringify(transformations), id]);

        console.log('Transformation updated:', result.rows[0]);
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating transformation:', error);
        next(error);
    }
});

// Delete a transformation
router.delete('/:id', auth, async (req, res, next) => {
    try {
        const { id } = req.params;
        console.log('Deleting transformation:', id);

        // Verify transformation belongs to user's source
        const transformationCheck = await db.query(`
            SELECT t.id 
            FROM transformations t
            JOIN sources s ON t.source_id = s.id
            WHERE t.id = $1 AND s.user_id = $2 AND t.is_active = true
        `, [id, req.user.id]);

        if (transformationCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Transformation not found' });
        }

        await db.query(
            'UPDATE transformations SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [id]
        );

        console.log('Transformation deleted successfully');
        res.json({ message: 'Transformation deleted successfully' });
    } catch (error) {
        console.error('Error deleting transformation:', error);
        next(error);
    }
});

module.exports = router;