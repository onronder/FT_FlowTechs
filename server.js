require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const authRoutes = require('./src/routes/auth');
const sourceRoutes = require('./src/routes/source');
const transformationRoutes = require('./src/routes/transformation');
const destinationRoutes = require('./src/routes/destination');
const scheduleRoutes = require('./src/routes/schedule');
const errorHandler = require('./src/middleware/errorHandler');
const jobProcessor = require('./src/services/jobProcessor');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sources', sourceRoutes);
app.use('/api/transformations', transformationRoutes);
app.use('/api/destinations', destinationRoutes);
app.use('/api/schedules', scheduleRoutes);

// Error handler
app.use(errorHandler);

// Initialize job processor
jobProcessor.initialize().catch(error => {
    console.error('Failed to initialize job processor:', error);
    process.exit(1);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    await jobProcessor.shutdown();
    process.exit(0);
});