# FlowTechs

A robust ETL (Extract, Transform, Load) platform designed for seamless data integration and transformation.

## Features

- OAuth-based authentication for secure data access
- Support for multiple data sources (currently Shopify)
- Customizable data transformations
- Multiple destination options (SFTP, OneDrive, Google Drive)
- Scheduled job execution
- Comprehensive notification system
- Secure credential management

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/flowtechs.git
cd flowtechs
```

2. Install dependencies:
```bash
npm install
```

3. Create .env file:
```bash
cp .env.example .env
```

4. Update environment variables in .env file

5. Initialize database:
```bash
npm run init-db
```

6. Start the server:
```bash
npm run dev
```

## Environment Variables

Create a `.env` file with the following variables:

```plaintext
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=your_railway_postgresql_url

# Security
JWT_SECRET=your_jwt_secret
ENCRYPTION_KEY=your_encryption_key

# SMTP (for notifications)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

## Project Structure

```
src/
├── config/         # Configuration files
├── routes/         # API routes
├── services/       # Business logic
├── middleware/     # Custom middleware
├── utils/          # Utility functions
└── scripts/        # Database scripts
```

## API Documentation

[API documentation will be added here]

## Contributing

[Contributing guidelines will be added here]

## License

MIT