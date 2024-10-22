const express = require('express');
const router = express.Router();
const db = require('../config/database');
const auth = require('../middleware/auth');

// Get all sources for a user
router.get('/', auth, async (req, res, next) => {
    try {
        const sources = await db.query(
            'SELECT s.*, at.name as api_type_name FROM sources s ' +
            'JOIN api_types at ON s.api_type_id = at.id ' +
            'WHERE s.user_id = $1 AND s.is_active = true',
            [req.user.id]
        );
        res.json(sources.rows);
    } catch (error) {
        next(error);
    }
});

// Get available Shopify APIs (Changed from /shopify/apis to /available-apis)
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
        res.json(apis.rows);
    } catch (error) {
        next(error);
    }
});

// Create a new source
router.post('/', auth, async (req, res, next) => {
    try {
        const { api_type_id, credentials } = req.body;
        
        const result = await db.query(
            'INSERT INTO sources (user_id, api_type_id, credentials) ' +
            'VALUES ($1, $2, $3) RETURNING *',
            [req.user.id, api_type_id, credentials]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        next(error);
    }
});

// Select APIs for a source
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
            return res.status(404).json({ error: 'Source not found' });
        }

        // Begin transaction
        await db.query('BEGIN');

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

        const result = await db.query(`
            SELECT ssa.*, sa.name as api_name
            FROM source_selected_apis ssa
            JOIN shopify_apis sa ON ssa.api_id = sa.id
            WHERE ssa.source_id = $1
        `, [sourceId]);

        res.json(result.rows);
    } catch (error) {
        await db.query('ROLLBACK');
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
            return res.status(404).json({ error: 'Source not found' });
        }

        const result = await db.query(`
            SELECT 
                ssa.id,
                ssa.api_id,
                sa.name as api_name,
                sa.endpoint,
                ssa.selected_fields,
                COALESCE(json_agg(
                    json_build_object(
                        'id', saf.id,
                        'field_name', saf.field_name,
                        'field_type', saf.field_type
                    ) 
                    ORDER BY saf.field_name
                ) FILTER (WHERE saf.id IS NOT NULL), '[]') as available_fields
            FROM source_selected_apis ssa
            JOIN shopify_apis sa ON ssa.api_id = sa.id
            LEFT JOIN shopify_api_fields saf ON sa.id = saf.api_id
            WHERE ssa.source_id = $1
            GROUP BY ssa.id, ssa.api_id, sa.name, sa.endpoint, ssa.selected_fields
        `, [sourceId]);

        res.json(result.rows);
    } catch (error) {
        next(error);
    }
});

module.exports = router;