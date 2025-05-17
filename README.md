# GatedEntry - Visitor Management System

A visitor management platform for gated residential communities that enables residents to pre-invite guests, generates secure QR codes for quick entry, and offers guards a scanning interface.

## Features

- Resident, Security, and Admin roles
- QR code-based visitor check-in
- Real-time notifications
- Daily staff passes
- Visitor history and logs
- Mobile-first PWA interface

## Tech Stack

- Frontend: React.js with TailwindCSS
- Backend: Node.js with Express
- Database: SQLite (Development) / PostgreSQL (Production)
- Authentication: JWT
- QR Code: qrcode.react (generation) and html5-qrcode (scanning)

## Prerequisites

- Node.js (v16 or higher)
- npm (v7 or higher)

## Setup Instructions

1. Clone the repository:
```bash
git clone <repository-url>
cd gatedentry
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
# Create .env file in backend directory
cp backend/.env.example backend/.env
```

4. Initialize the database:
```bash
cd backend
npx knex migrate:latest
npx knex seed:run
```

5. Start the development servers:
```bash
# From root directory
npm run dev
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend: http://localhost:3001

## Development

- Frontend development server runs on port 3000
- Backend development server runs on port 3001
- API documentation is available at http://localhost:3001/api-docs

## Testing

```bash
# Run all tests
npm test

# Run frontend tests
npm test --workspace=frontend

# Run backend tests
npm test --workspace=backend
```

## License

MIT 