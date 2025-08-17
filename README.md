# MAIA - Medical AI Assistant

A secure, multi-user medical AI assistant with passkey authentication, knowledge base management, and advanced chat features.

## 🎉 Latest Release: v1.1.0

**Production-ready release with enhanced user experience and cloud deployment capabilities.**

### ✨ New Features in v1.1.0
- **🗑️ Message Deletion System**: Delete messages with confirmation modals and intelligent cleanup
- **🔧 Enhanced AI Integration**: Fixed Gemini API and improved error handling
- **🌐 Production Domain Support**: Dynamic domain configuration for cloud deployment
- **📱 Improved UI/UX**: Better message editing and management tools
- **🛡️ Enhanced Security**: Improved passkey authentication and CORS handling

## Features

- **🔐 Passkey Authentication**: Secure user authentication using WebAuthn
- **🧠 Knowledge Base Management**: Create and manage medical knowledge bases
- **🤖 Multi-AI Integration**: Support for Anthropic Claude, Google Gemini, ChatGPT, DeepSeek, and DigitalOcean AI
- **👥 Multi-User Support**: Each user has their own secure workspace
- **📁 File Upload & Processing**: Support for PDF and medical document uploads with AI analysis
- **💬 Advanced Chat Management**: Edit, delete, and manage chat messages with intelligent cleanup
- **🌐 Group Sharing**: Share chats with team members via secure deep links
- **📊 Agent Management**: Create and configure custom AI agents for specific use cases
- **🔒 Enterprise Security**: CORS protection, rate limiting, and secure data handling

## 🗑️ Message Management Features

### Message Editing & Deletion
- **Edit Messages**: Click the edit button on any message to modify content
- **Delete Messages**: Use the "Delete this message" button with confirmation modal
- **Intelligent Cleanup**: Automatically removes related user questions when deleting AI responses
- **Audit Trail**: Comprehensive console logging for all deletion operations

### Group Chat Sharing
- **Secure Deep Links**: Share conversations via encrypted URLs
- **Team Collaboration**: Multiple users can access shared chat sessions
- **Real-time Updates**: Live synchronization of chat changes across users

## Quick Start

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

### 🔐 Passkey Configuration

The passkey system now supports flexible domain configuration through environment variables. See [DOMAIN_CONFIGURATION.md](./DOMAIN_CONFIGURATION.md) for detailed configuration options.

**Quick Setup:**
```bash
# For production deployment
PASSKEY_RPID=your-domain.com
PASSKEY_ORIGIN=https://your-domain.com

# Or use general domain variables
DOMAIN=your-domain.com
HTTPS=true
```

## API Endpoints

### Core Services
- `GET /health` - Health check
- `GET /api/agents` - List available AI agents
- `GET /api/current-agent` - Get current agent details
- `POST /api/knowledge-bases` - Create knowledge base

### Authentication
- `POST /api/passkey/register` - Register passkey
- `POST /api/passkey/authenticate` - Authenticate with passkey

### AI Chat Services
- `POST /api/anthropic-chat` - Anthropic Claude integration
- `POST /api/gemini-chat` - Google Gemini integration
- `POST /api/chatgpt-chat` - OpenAI ChatGPT integration
- `POST /api/deepseek-r1-chat` - DeepSeek integration
- `POST /api/personal-chat` - DigitalOcean Personal AI

### File & Chat Management
- `POST /api/parse-pdf` - PDF document processing
- `POST /api/group-chats` - Group chat management
- `GET /api/shared/{shareId}` - Access shared conversations

## Development

- **Frontend**: Vue.js 3 with Quasar UI
- **Backend**: Node.js with Express
- **Database**: Cloudant/CouchDB
- **Authentication**: WebAuthn passkeys
- **AI**: Multi-provider support (Anthropic, Gemini, DeepSeek, DigitalOcean)

## 🚀 Production Deployment

### DigitalOcean App Platform
The application is configured for easy deployment on DigitalOcean App Platform:

1. **Automatic Deployment**: Connected to GitHub with auto-deploy on push to main
2. **Environment Variables**: Configure production settings in DigitalOcean dashboard
3. **Domain Configuration**: Dynamic domain handling for production environments
4. **SSL/TLS**: Automatic HTTPS certificate management

### Environment Configuration
See `DOMAIN_CONFIGURATION.md` for detailed setup instructions and environment variable examples.

### Health Monitoring
- Health check endpoint: `/health`
- Built-in logging and error tracking
- Rate limiting and security measures

## 📋 Changelog

### v1.1.0 (2025-08-15) - Production Release
- ✨ **NEW**: Message deletion system with confirmation modals
- ✨ **NEW**: Intelligent cleanup of related messages
- 🔧 **FIXED**: Gemini API integration errors
- 🔧 **FIXED**: Vue component warnings and event handling
- 🌐 **IMPROVED**: Production domain configuration
- 🛡️ **ENHANCED**: CORS and security improvements
- 📱 **IMPROVED**: Message editing and management UI
- 🚀 **READY**: Cloud deployment configuration

### v1.0.0 (Initial Release)
- Core MAIA application with passkey authentication
- Knowledge base management
- Multi-AI provider support
- File upload and processing
- Group chat sharing

## License

GPL-3
