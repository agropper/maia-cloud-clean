# MAIA - Medical AI Assistant

**MAIA** (Medical AI Assistant) is a non-commercial, open source demonstration of patient-controlled health records and private AI technology. MAIA puts patients and physicians in complete control of their information technology, including modern, open source AI.

> **📖 For a general introduction and getting started guide, visit our [GitHub Wiki](https://github.com/agropper/maia-cloud-clean/wiki)**

## 🎯 Key Features

### Core Functionality
- **📄 Health Record Import**: Import and index hundreds of pages of records downloaded from modern EHR patient portals
- **🤖 Private AI Assistant**: Create patient summaries that correct errors and protect sensitive information
- **🔍 Natural Language Search**: Search and abstract health records using natural language chats without sharing with commercial AIs
- **💬 Multi-AI Integration**: Use patient summaries and human chat threads to ask questions of commercial LLMs (ChatGPT, Gemini, Claude, DeepSeek)
- **🔗 Secure Sharing**: Share chats with physicians using links that can be added to patient portal messages, emails, or texts

### Privacy & Security
- **🔐 Passkey Authentication**: Secure WebAuthn-based authentication
- **🛡️ Privacy-First Design**: Private AI acts as a privacy-preserving bridge between EHRs and commercial AI
- **👥 Multi-User Support**: Each user has their own secure workspace
- **🌐 Deep Link Sharing**: Secure sharing of conversations with invited participants

### Admin Panel Features (`/admin2`)
- **👤 User Management**: Approve, reject, and manage user accounts
- **🤖 Agent Management**: Create and deploy private AI agents for users
- **📊 Knowledge Base Management**: Monitor and manage user knowledge bases
- **📈 Analytics Dashboard**: View user statistics, session data, and system health
- **🔧 System Administration**: Database operations, and maintenance tools

## 🏗️ Architecture

### Frontend
- **Vue.js 3** with Composition API
- **Quasar Framework** for UI components
- **TypeScript** for type safety
- **Vite** for build tooling

### Backend
- **Node.js** with Express.js
- **Session Management** with in-memory storage
- **Rate Limiting** and security middleware
- **RESTful API** design

### Database
- **IBM Cloudant** (CouchDB-compatible) for user data, chat history, and metadata
- **Free tier** supports over a dozen patients

## 🔧 Essential APIs & Services

### DigitalOcean Hosting
**Primary hosting platform for the complete MAIA stack:**

- **🌐 App Hosting**: Deploy the MAIA application
- **🤖 Private AI Agents**: Host and manage personal AI agents
- **📚 Knowledge Base with Embeddings**: Store and index health records
- **📁 File Storage**: Secure storage for uploaded documents

> **💰 Get $200 credit for your MAIA deployment: [DigitalOcean Referral Link](https://m.do.co/c/6837d806e656)**

### IBM Cloudant Database
- **Free tier** available
- **CouchDB-compatible** NoSQL database
- **Automatic scaling** and backup
- **Global availability**

### Resend Email Service
- **Free tier** available
- **Transactional emails** for user notifications
- **Admin notifications** and support communications

### AI Provider APIs
- **Google Gemini**: `GEMINI_API_KEY`
- **Anthropic Claude**: `ANTHROPIC_API_KEY`
- **OpenAI ChatGPT**: `CHATGPT_API_KEY`
- **DeepSeek**: `DEEPSEEK_API_KEY`

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- DigitalOcean account (for hosting)
- API keys for AI providers

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/agropper/maia-cloud-clean.git
   cd maia-cloud-clean
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Build for production**
   ```bash
   npm run build
   npm start
   ```

## 💰 Cost Structure

### Hosting Costs
- **DigitalOcean**: ~$30/month for full MAIA deployment
- **Supports**: Up to a dozen family/community members
- **Free Credit**: $200 with [referral link](https://m.do.co/c/6837d806e656) (covers ~6 months)

### Free Services
- **IBM Cloudant**: Free tier database
- **Resend**: Free tier email service
- **AI APIs**: Pay-per-use (typically very low cost for on-demand usage)

## 🔐 Environment Configuration

See `.env.example` for all required configuration variables:

```bash
# DigitalOcean Configuration
DIGITALOCEAN_TOKEN=your-digitalocean-token-here
DIGITALOCEAN_ACCESS_KEY=your-access-key-here
DIGITALOCEAN_SECRET_KEY=your-secret-key-here

# Database Configuration
CLOUDANT_URL=your-cloudant-url-here
CLOUDANT_USERNAME=your-cloudant-username-here
CLOUDANT_PASSWORD=your-cloudant-password-here

# AI Provider APIs
GEMINI_API_KEY=your-gemini-api-key-here
ANTHROPIC_API_KEY=your-anthropic-api-key-here
CHATGPT_API_KEY=your-chatgpt-api-key-here
DEEPSEEK_API_KEY=your-deepseek-api-key-here

# Email Service
RESEND_API_KEY=your-resend-api-key-here
RESEND_FROM_EMAIL=your-from-email@yourdomain.com
```

## 📚 Documentation

- **[GitHub Wiki](https://github.com/agropper/maia-cloud-clean/wiki)**: General introduction and getting started
- **[Environment Variables](./Documents/ENVIRONMENT_VARIABLES.md)**: Detailed configuration guide
- **[Admin Panel](./Documents/ADMIN_PANEL.md)**: Admin panel documentation
- **[Build & Debug](./Documents/BUILD_AND_DEBUG.md)**: Development setup guide

## 🤝 Contributing

MAIA is an open source project. Contributions are welcome! Please see our [GitHub Wiki](https://github.com/agropper/maia-cloud-clean/wiki) for more information about the project and how to get involved.

## 📄 License

GPL-3.0 License - see [LICENSE](./LICENSE) file for details.

## 🆘 Support

- **Documentation**: [GitHub Wiki](https://github.com/agropper/maia-cloud-clean/wiki)
- **Issues**: [GitHub Issues](https://github.com/agropper/maia-cloud-clean/issues)
- **Live Demo**: [test.agropper.xyz](https://test.agropper.xyz)

---

**MAIA puts patients first, their invited physicians and caregivers second, and leaves hospital and institutional interests completely out of the picture.**