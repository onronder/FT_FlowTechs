const express = require('express');
const router = express.Router();
const db = require('../config/database');
const auth = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const responseHandler = require('../utils/responseHandler');

// Validation middleware for source creation/update
const validateSource = [
    body('api_type_id').isInt().withMessage('API type ID must be an integer'),
    body('credentials').isObject().withMessage('Credentials must be an object'),
    body('credentials.shop_name').notEmpty().withMessage('Shop name is required'),
    body('credentials.shop_url').isURL().withMessage('Valid shop URL is required'),
    body('credentials.access_token').notEmpty().withMessage('Access token is required'),
    body('credentials.api_version').notEmpty().withMessage('API version is required')
];

// Get available APIs and their fields
router.get('/available-apis', auth, async (req, res, next) => {
    try {
        const apis = await db.query(`
            SELECT sa.*, 
                   COALESCE(json_agg(
                       json_build_object(
                           'id', saf.id,
                           'field_name', saf.field_name,
                           'field_type', saf.field_type,
                           'is_required', saf.is_required
                       ) 
                       ORDER BY saf.field_name
                   ) FILTER (WHERE saf.id IS NOT NULL), '[]') as fields
            FROM shopify_apis sa
            LEFT JOIN shopify_api_fields saf ON sa.id = saf.api_id
            WHERE sa.is_active = true
            GROUP BY sa.id
            ORDER BY sa.name;
        `);

        res.json(responseHandler.success(apis.rows));
    } catch (error) {
        next(error);
    }
});

// Get all sources for a user
router.get('/', auth, async (req, res, next) => {
    try {
        const { page = 1, limit = 10, search, api_type } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT s.*, 
                   at.name as api_type_name,
                   COALESCE(json_agg(
                       DISTINCT jsonb_build_object(
                           'api_id', ssa.api_id,
                           'api_name', sa.name,
                           'selected_fields', ssa.selected_fields
                       )
                   ) FILTER (WHERE ssa.id IS NOT NULL), '[]') as selected_apis
            FROM sources s
            JOIN api_types at ON s.api_type_id = at.id
            LEFT JOIN source_selected_apis ssa ON s.id = ssa.source_id
            LEFT JOIN shopify_apis sa ON ssa.api_id = sa.id
            WHERE s.user_id = $1 AND s.is_active = true
        `;

        const values = [req.user.id];
        let valueIndex = 2;

        if (search) {
            query += ` AND (
                at.name ILIKE $${valueIndex} OR 
                s.credentials->>'shop_name' ILIKE $${valueIndex}
            )`;
            values.push(`%${search}%`);
            valueIndex++;
        }

        if (api_type) {
            query += ` AND s.api_type_id = $${valueIndex}`;
            values.push(api_type);
            valueIndex++;
        }

        query += ` GROUP BY s.id, at.name
                  ORDER BY s.created_at DESC
                  LIMIT $${valueIndex} OFFSET $${valueIndex + 1}`;
        
        values.push(limit, offset);

        // Get total count
        const countQuery = `
            SELECT COUNT(*) 
            FROM sources s
            WHERE s.user_id = $1 AND s.is_active = true
        `;

        const [sources, countResult] = await Promise.all([
            db.query(query, values),
            db.query(countQuery, [req.user.id])
        ]);

        const total = parseInt(countResult.rows[0].count);

        res.json(responseHandler.paginated(
            sources.rows,
            total,
            parseInt(page),
            parseInt(limit)
        ));
    } catch (error) {
        next(error);
    }
});

// Create a new source
router.post('/', [auth, validateSource], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json(responseHandler.validation(errors.array()));
        }

        const { api_type_id, credentials } = req.body;

        // Begin transaction
        await db.query('BEGIN');

        try {
            // Create source
            const sourceResult = await db.query(
                `INSERT INTO sources (user_id, api_type_id, credentials)
                VALUES ($1, $2, $3)
                RETURNING *`,
                [req.user.id, api_type_id, credentials]
            );

            const source = sourceResult.rows[0];

            // If selected APIs are provided, store them
            if (req.body.selected_apis) {
                for (const api of req.body.selected_apis) {
                    await db.query(
                        `INSERT INTO source_selected_apis (source_id, api_id, selected_fields)
                        VALUES ($1, $2, $3)`,
                        [source.id, api.api_id, JSON.stringify(api.fields)]
                    );
                }
            }

            await db.query('COMMIT');

            // Fetch complete source data with selected APIs
            const result = await db.query(`
                SELECT s.*, 
                       at.name as api_type_name,
                       json_agg(
                           DISTINCT jsonb_build_object(
                               'api_id', ssa.api_id,
                               'api_name', sa.name,
                               'selected_fields', ssa.selected_fields
                           )
                       ) as selected_apis
                FROM sources s
                JOIN api_types at ON s.api_type_id = at.id
                LEFT JOIN source_selected_apis ssa ON s.id = ssa.source_id
                LEFT JOIN shopify_apis sa ON ssa.api_id = sa.id
                WHERE s.id = $1
                GROUP BY s.id, at.name`,
                [source.id]
            );

            res.status(201).json(responseHandler.success(result.rows[0]));
        } catch (error) {
            await db.query('ROLLBACK');
            throw error;
        }
    } catch (error) {
        next(error);
    }
});

// Update source API selections
router.post('/:sourceId/apis', auth, async (req, res, next) => {
    try {
        const { sourceId } = req.params;
        const { selectedApis } = req.body;

        // Verify source belongs to user
        const sourceCheck = await db.query(
            'SELECT id FROM sources WHERE id = $1 AND user_id = $2',
            [sourceId, req.user.id]
        );

        if (sourceCheck.rows.length === 0) {
            return res.status(404).json(responseHandler.notFound('Source not found'));
        }

        // Begin transaction
        await db.query('BEGIN');

        try {
            // Delete existing selections
            await db.query(
                'DELETE FROM source_selected_apis WHERE source_id = $1',
                [sourceId]
            );

            // Insert new selections
            for (const selection of selectedApis) {
                await db.query(
                    `INSERT INTO source_selected_apis 
                    (source_id, api_id, selected_fields)
                    VALUES ($1, $2, $3)`,
                    [sourceId, selection.api_id, JSON.stringify(selection.fields)]
                );
            }

            await db.query('COMMIT');

            // Fetch updated source data
            const result = await db.query(`
                SELECT ssa.*, sa.name as api_name
                FROM source_selected_apis ssa
                JOIN shopify_apis sa ON ssa.api_id = sa.id
                WHERE ssa.source_id = $1
            `, [sourceId]);

            res.json(responseHandler.success(result.rows));
        } catch (error) {
            await db.query('ROLLBACK');
            throw error;
        }
    } catch (error) {
        next(error);
    }
});

// Get selected APIs for a source
router.get('/:sourceId/apis', auth, async (req, res, next) => {
    try {
        const { sourceId } = req.params;

        // Verify source belongs to user
        const sourceCheck = await db.query(
            'SELECT id FROM sources WHERE id = $1 AND user_id = $2',
            [sourceId, req.user.id]
        );

        if (sourceCheck.rows.length === 0) {
            return res.status(404).json(responseHandler.notFound('Source not found'));
        }

        const result = await db.query(`
            SELECT 
                ssa.id,
                ssa.api_id,
                sa.name as api_name,
                sa.endpoint,
                ssa.selected_fields,
                json_agg(
                    json_build_object(
                        'id', saf.id,
                        'field_name', saf.field_name,
                        'field_type', saf.field_type
                    )
                ) as available_fields
            FROM source_selected_apis ssa
            JOIN shopify_apis sa ON ssa.api_id = sa.id
            LEFT JOIN shopify_api_fields saf ON sa.id = saf.api_id
            WHERE ssa.source_id = $1
            GROUP BY ssa.id, ssa.api_id, sa.name, sa.endpoint, ssa.selected_fields
        `, [sourceId]);

        res.json(responseHandler.success(result.rows));
    } catch (error) {
        next(error);
    }
});

// Update source
router.put('/:id', [auth, validateSource], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json(responseHandler.validation(errors.array()));
        }

        const { id } = req.params;
        const { api_type_id, credentials } = req.body;

        // Verify source belongs to user
        const sourceCheck = await db.query(
            'SELECT id FROM sources WHERE id = $1 AND user_id = $2',
            [id, req.user.id]
        );

        if (sourceCheck.rows.length === 0) {
            return res.status(404).json(responseHandler.notFound('Source not found'));
        }

        const result = await db.query(
            `UPDATE sources 
            SET api_type_id = $1,
                credentials = $2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3 AND user_id = $4
            RETURNING *`,
            [api_type_id, credentials, id, req.user.id]
        );

        res.json(responseHandler.success(result.rows[0]));
    } catch (error) {
        next(error);
    }
});

// Delete source
router.delete('/:id', auth, async (req, res, next) => {
    try {
        const { id } = req.params;

        // Verify source belongs to user
        const sourceCheck = await db.query(
            'SELECT id FROM sources WHERE id = $1 AND user_id = $2',
            [id, req.user.id]
        );

        if (sourceCheck.rows.length === 0) {
            return res.status(404).json(responseHandler.notFound('Source not found'));
        }

        await db.query(
            'UPDATE sources SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [id]
        );

        res.json(responseHandler.success({ message: 'Source deleted successfully' }));
    } catch (error) {
        next(error);
    }
});

module.exports = router;