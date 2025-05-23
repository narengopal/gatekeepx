# GatedEntry Frontend

This is the frontend application for the GatedEntry visitor management system. It provides a modern, responsive user interface for managing visitors, blocks, and flats in a gated community.

## Features

- User authentication (login/register)
- Role-based access control (Admin, Security Guard, Resident)
- Guest invitation with QR code generation
- QR code scanning for visitor check-in
- Visitor log management
- Block and flat management
- Real-time notifications

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- Backend server running on port 3001

## Installation

1. Clone the repository
2. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

## Development

To start the development server:

```bash
npm start
```

The application will be available at http://localhost:3000.

## Building for Production

To create a production build:

```bash
npm run build
```

The build artifacts will be stored in the `build/` directory.

## Project Structure

```
src/
  ├── components/     # Reusable UI components
  ├── contexts/       # React contexts (e.g., AuthContext)
  ├── pages/         # Page components
  │   ├── admin/     # Admin-specific pages
  │   └── ...        # Other pages
  ├── utils/         # Utility functions
  ├── App.js         # Main application component
  └── index.js       # Application entry point
```

## Available Scripts

- `npm start`: Runs the app in development mode
- `npm test`: Launches the test runner
- `npm run build`: Builds the app for production
- `npm run eject`: Ejects from Create React App

## Dependencies

- React 18
- React Router DOM
- Axios
- React QR Scanner
- Tailwind CSS

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request 