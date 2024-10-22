const express = require('express');
const router = express.Router();
const db = require('../config/database');
const auth = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// Validation middleware
const validateSchedule = [
    body('source_id').isInt().withMessage('Source ID must be an integer'),
    body('transformation_id').isInt().withMessage('Transformation ID must be an integer'),
    body('destination_id').isInt().withMessage('Destination ID must be an integer'),
    body('frequency_id').isInt().withMessage('Frequency ID must be an integer'),
    body('time_of_day').matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Time must be in HH:mm format'),
    body('day_of_week').optional().isInt({ min: 0, max: 6 }).withMessage('Day of week must be between 0 and 6'),
    body('day_of_month').optional().isInt({ min: 1, max: 31 }).withMessage('Day of month must be between 1 and 31')
];

// Get available schedule frequencies
router.get('/frequencies', auth, async (req, res, next) => {
    try {
        const frequencies = await db.query(
            'SELECT * FROM schedule_frequencies WHERE is_active = true ORDER BY name'
        );
        res.json(frequencies.rows);
    } catch (error) {
        next(error);
    }
});

// Create a new schedule
router.post('/', auth, validateSchedule, async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const {
            source_id,
            transformation_id,
            destination_id,
            frequency_id,
            time_of_day,
            day_of_week,
            day_of_month
        } = req.body;

        // Verify all components belong to user
        const verifyComponents = await db.query(`
            SELECT 
                s.id as source_exists,
                t.id as transform_exists,
                d.id as destination_exists
            FROM sources s
            LEFT JOIN transformations t ON t.id = $2
            LEFT JOIN destinations d ON d.id = $3
            WHERE s.id = $1 
            AND s.user_id = $4 
            AND (t.source_id = s.id OR t.id IS NULL)
            AND (d.user_id = $4 OR d.id IS NULL)
        `, [source_id, transformation_id, destination_id, req.user.id]);

        if (verifyComponents.rows.length === 0) {
            return res.status(404).json({ error: 'One or more components not found' });
        }

        // Calculate next run time based on frequency
        const calculateNextRun = await db.query(`
            SELECT 
                CASE 
                    WHEN sf.name = 'DAILY' THEN 
                        CASE 
                            WHEN $1::time > CURRENT_TIME THEN CURRENT_DATE + $1::time
                            ELSE CURRENT_DATE + interval '1 day' + $1::time
                        END
                    WHEN sf.name = 'WEEKLY' THEN 
                        CURRENT_DATE + 
                        ((7 + $2::int - EXTRACT(DOW FROM CURRENT_DATE)::int) % 7) * interval '1 day' +
                        $1::time
                    WHEN sf.name = 'MONTHLY' THEN 
                        DATE_TRUNC('month', CURRENT_DATE) + 
                        ($3::int - 1) * interval '1 day' +
                        $1::time
                END as next_run
            FROM schedule_frequencies sf
            WHERE sf.id = $4
        `, [time_of_day, day_of_week, day_of_month, frequency_id]);

        const next_run = calculateNextRun.rows[0].next_run;

        // Create schedule
        const result = await db.query(`
            INSERT INTO schedules (
                user_id,
                source_id,
                transformation_id,
                destination_id,
                frequency_id,
                time_of_day,
                day_of_week,
                day_of_month,
                next_run
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [
            req.user.id,
            source_id,
            transformation_id,
            destination_id,
            frequency_id,
            time_of_day,
            day_of_week,
            day_of_month,
            next_run
        ]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        next(error);
    }
});

// Get all schedules for user
router.get('/', auth, async (req, res, next) => {
    try {
        const schedules = await db.query(`
            SELECT 
                s.*,
                sf.name as frequency_name,
                src.credentials->>'shop_name' as shop_name,
                t.name as transformation_name,
                dt.name as destination_type,
                ff.name as file_format
            FROM schedules s
            JOIN schedule_frequencies sf ON s.frequency_id = sf.id
            JOIN sources src ON s.source_id = src.id
            LEFT JOIN transformations t ON s.transformation_id = t.id
            JOIN destinations d ON s.destination_id = d.id
            JOIN destination_types dt ON d.destination_type_id = dt.id
            JOIN file_formats ff ON d.file_format_id = ff.id
            WHERE s.user_id = $1 AND s.is_active = true
            ORDER BY s.next_run ASC
        `, [req.user.id]);

        res.json(schedules.rows);
    } catch (error) {
        next(error);
    }
});

// Update a schedule
router.put('/:id', auth, validateSchedule, async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const {
            source_id,
            transformation_id,
            destination_id,
            frequency_id,
            time_of_day,
            day_of_week,
            day_of_month
        } = req.body;

        // Verify schedule belongs to user
        const scheduleCheck = await db.query(
            'SELECT id FROM schedules WHERE id = $1 AND user_id = $2 AND is_active = true',
            [id, req.user.id]
        );

        if (scheduleCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Schedule not found' });
        }

        // Calculate next run time
        const calculateNextRun = await db.query(`
            SELECT 
                CASE 
                    WHEN sf.name = 'DAILY' THEN 
                        CASE 
                            WHEN $1::time > CURRENT_TIME THEN CURRENT_DATE + $1::time
                            ELSE CURRENT_DATE + interval '1 day' + $1::time
                        END
                    WHEN sf.name = 'WEEKLY' THEN 
                        CURRENT_DATE + 
                        ((7 + $2::int - EXTRACT(DOW FROM CURRENT_DATE)::int) % 7) * interval '1 day' +
                        $1::time
                    WHEN sf.name = 'MONTHLY' THEN 
                        DATE_TRUNC('month', CURRENT_DATE) + 
                        ($3::int - 1) * interval '1 day' +
                        $1::time
                END as next_run
            FROM schedule_frequencies sf
            WHERE sf.id = $4
        `, [time_of_day, day_of_week, day_of_month, frequency_id]);

        const next_run = calculateNextRun.rows[0].next_run;

        const result = await db.query(`
            UPDATE schedules
            SET source_id = $1,
                transformation_id = $2,
                destination_id = $3,
                frequency_id = $4,
                time_of_day = $5,
                day_of_week = $6,
                day_of_month = $7,
                next_run = $8,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $9 AND user_id = $10
            RETURNING *
        `, [
            source_id,
            transformation_id,
            destination_id,
            frequency_id,
            time_of_day,
            day_of_week,
            day_of_month,
            next_run,
            id,
            req.user.id
        ]);

        res.json(result.rows[0]);
    } catch (error) {
        next(error);
    }
});

// Delete a schedule
router.delete('/:id', auth, async (req, res, next) => {
    try {
        const { id } = req.params;

        // Verify schedule belongs to user
        const scheduleCheck = await db.query(
            'SELECT id FROM schedules WHERE id = $1 AND user_id = $2 AND is_active = true',
            [id, req.user.id]
        );

        if (scheduleCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Schedule not found' });
        }

        await db.query(
            'UPDATE schedules SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [id]
        );

        res.json({ message: 'Schedule deleted successfully' });
    } catch (error) {
        next(error);
    }
});

module.exports = router;