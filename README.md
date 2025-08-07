# MAIA - Medical AI Assistant

A secure, multi-user medical AI assistant with passkey authentication and knowledge base management.

## Features

- **Passkey Authentication**: Secure user authentication using WebAuthn
- **Knowledge Base Management**: Create and manage medical knowledge bases
- **DigitalOcean AI Integration**: Powered by DigitalOcean's AI platform
- **Multi-User Support**: Each user has their own secure workspace
- **File Upload**: Support for medical document uploads
- **Chat History**: Persistent conversation history

## Quick Start

1. **Install Dependencies**

   ```bash
   npm install
   ```

2. **Configure Environment**

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start Development Server**

   ```bash
   npm run dev
   ```

4. **Build for Production**
   ```bash
   npm run build
   npm start
   ```

## Environment Variables

See `.env` file for all required configuration variables.

## API Endpoints

- `GET /health` - Health check
- `GET /api/agents` - List available AI agents
- `GET /api/current-agent` - Get current agent details
- `POST /api/knowledge-bases` - Create knowledge base
- `POST /api/passkey/register` - Register passkey
- `POST /api/passkey/authenticate` - Authenticate with passkey

## Development

- **Frontend**: Vue.js 3 with Quasar UI
- **Backend**: Node.js with Express
- **Database**: Cloudant/CouchDB
- **Authentication**: WebAuthn passkeys
- **AI**: DigitalOcean AI Platform

## License

GPL-3
# Rollback to stable state
