# MAIA2 Multi-User Privacy System Design

## Overview

The MAIA2 system is a comprehensive redesign of the MAIA cloud application to support multiple authenticated users with strict privacy controls, resource allocation management, and administrative oversight. This system runs alongside the existing MAIA infrastructure without breaking backward compatibility.

## Key Design Principles

1. **Complete User Isolation**: Each authenticated user has their own private agents and knowledge bases
2. **Resource Control**: Users must request and receive approval for resource allocation
3. **Audit Trail**: All actions are logged for compliance and security
4. **Admin Oversight**: Administrators approve resource requests and manage user access
5. **Backward Compatibility**: Existing users and functionality remain unaffected

## Database Architecture

### Current Database Architecture

| Database | Purpose | Key Features |
|----------|---------|--------------|
| `maia_users` | User management and authentication | Passkey credentials, approval status, resource limits |
| `maia3_chats` | Group chats and shared conversations | Multi-user conversations, sharing controls |
| `maia_knowledge_bases` | Knowledge base management | Document storage, indexing, user ownership |
| `maia_agents` | AI agent management | DigitalOcean integration, cost tracking |
| `maia_user_resources` | Resource allocation tracking | Request/approval workflow, usage monitoring |
| `maia_admin_approvals` | Administrative approval workflow | Request tracking, decision logging |
| `maia_audit_logs` | Comprehensive audit trail | Security events, compliance tracking |

## User Privacy Levels

### 1. Public Mode (Unknown User)
- **Access**: Basic AI models (ChatGPT, Claude, Gemini)
- **Limitations**: No persistent data, no file uploads, no private agents
- **Use Case**: Casual users, testing, public demonstrations

### 2. Private Mode (Authenticated User)
- **Access**: Personal AI agents, private knowledge bases, file uploads
- **Requirements**: Passkey authentication, admin approval
- **Limitations**: Resource quotas, usage monitoring
- **Use Case**: Healthcare professionals, researchers, business users

### 3. Restricted Mode (Special Access)
- **Access**: Enhanced resources, higher quotas, specialized agents
- **Requirements**: Additional admin approval, compliance verification
- **Use Case**: Enterprise users, compliance-sensitive applications

## Resource Allocation Workflow

### 1. User Registration
```
User creates passkey → System creates maia_users entry → Status: pending
```

### 2. Resource Request
```
User submits request → System creates maia2_admin_approvals entry → Admin notified
```

### 3. Admin Review
```
Admin reviews request → Approves/rejects → System updates maia2_user_resources
```

### 4. Resource Provisioning
```
System creates DigitalOcean resources → Updates maia2_agents/maia2_knowledge_bases
```

## API Endpoints

### Health and Status
- `GET /api/maia2/health` - System health check
- `GET /api/maia2/status` - Database status overview

### User Management
- `POST /api/maia2/users` - Create new user
- `GET /api/maia2/users/:username` - Get user profile
- `PUT /api/maia2/users/:username` - Update user profile
- `GET /api/maia2/users` - List users (admin only)

### Agent Management
- `POST /api/maia2/agents` - Create new agent
- `GET /api/maia2/agents` - Get user's agents
- `GET /api/maia2/agents/:agentId` - Get specific agent
- `PUT /api/maia2/agents/:agentId` - Update agent

### Knowledge Base Management
- `POST /api/maia2/knowledge-bases` - Create new knowledge base
- `GET /api/maia2/knowledge-bases` - Get user's knowledge bases

### Resource Allocation
- `POST /api/maia2/resources/request` - Request resource allocation

### Admin Approvals
- `POST /api/maia2/approvals` - Submit approval request
- `GET /api/maia2/approvals/pending` - Get pending approvals (admin only)

### Audit Logs
- `GET /api/maia2/audit-logs` - Get audit logs (admin only)

## Security and Privacy Features

### 1. Access Control
- **User Isolation**: Users can only access their own resources
- **Role-Based Access**: Admin vs. regular user permissions
- **Session Management**: Secure passkey-based authentication

### 2. Data Protection
- **Encryption**: All sensitive data encrypted at rest
- **Audit Logging**: Complete trail of all data access and modifications
- **Compliance**: Built-in support for HIPAA, GDPR, and other frameworks

### 3. Resource Monitoring
- **Usage Tracking**: Monitor resource consumption and costs
- **Quota Enforcement**: Prevent resource abuse
- **Cost Controls**: Set limits and alerts for spending

## Implementation Phases

### Phase 1: Database Setup ✅
- [x] Create maia2 database structure
- [x] Implement database setup routes
- [x] Create TypeScript type definitions
- [x] Implement MAIA2 client

### Phase 2: Core API Implementation ✅
- [x] Implement user management endpoints
- [x] Implement agent management endpoints
- [x] Implement knowledge base endpoints
- [x] Implement resource allocation endpoints

### Phase 3: Frontend Integration (Next)
- [ ] Update Agent Management dialog for maia2
- [ ] Implement user registration and approval workflow
- [ ] Add resource request forms
- [ ] Create admin approval interface

### Phase 4: DigitalOcean Integration (Next)
- [ ] Implement agent creation via DigitalOcean API
- [ ] Implement knowledge base provisioning
- [ ] Add cost tracking and monitoring
- [ ] Implement resource scaling

### Phase 5: Advanced Features (Future)
- [ ] Multi-tenant support
- [ ] Advanced compliance features
- [ ] Performance optimization
- [ ] Monitoring and alerting

## Migration Strategy

### 1. Parallel Operation
- Existing users continue using current system
- New users can opt into maia2 system
- Both systems operate independently

### 2. Gradual Migration
- Users can migrate existing agents and knowledge bases
- Admin tools to facilitate migration
- Data validation and integrity checks

### 3. Legacy Support
- Maintain backward compatibility
- Deprecation timeline for old system
- Support for existing integrations

## Cost Structure

### Resource Pricing
- **AI Agents**: $X/hour based on model and resources
- **Knowledge Bases**: $Y/month based on storage and indexing
- **API Access**: $Z per 1000 requests
- **Storage**: $W per GB per month

### User Tiers
- **Basic**: 1 agent, 2 knowledge bases, 1GB storage
- **Professional**: 3 agents, 5 knowledge bases, 10GB storage
- **Enterprise**: Custom limits and dedicated resources

## Compliance and Governance

### 1. Data Residency
- All data stored in specified geographic regions
- Compliance with local data protection laws
- Audit trail for data location and access

### 2. Access Controls
- Multi-factor authentication required
- Session timeout and automatic logout
- IP address restrictions (configurable)

### 3. Monitoring and Alerting
- Real-time security monitoring
- Automated threat detection
- Compliance violation alerts

## Testing and Validation

### 1. Unit Testing
- Database operations
- API endpoint functionality
- Security middleware

### 2. Integration Testing
- End-to-end workflows
- Cross-database operations
- Error handling and recovery

### 3. Security Testing
- Penetration testing
- Vulnerability assessment
- Compliance validation

## Deployment Considerations

### 1. Environment Setup
- Development: Local Cloudant instance
- Staging: Shared Cloudant instance
- Production: Dedicated Cloudant instance

### 2. Configuration Management
- Environment-specific settings
- Feature flags for gradual rollout
- Configuration validation

### 3. Monitoring and Observability
- Application performance monitoring
- Database performance metrics
- User activity analytics

## Future Enhancements

### 1. Advanced AI Features
- Custom model training
- Multi-modal agents
- Advanced reasoning capabilities

### 2. Enterprise Features
- Single sign-on (SSO) integration
- Advanced role-based access control
- Custom compliance frameworks

### 3. Scalability Improvements
- Horizontal scaling
- Load balancing
- Geographic distribution

## Conclusion

The MAIA2 system provides a robust foundation for multi-user privacy and resource management while maintaining backward compatibility. The phased implementation approach allows for gradual rollout and validation, ensuring system stability and user satisfaction.

This system addresses the growing need for secure, private AI interactions in healthcare and other sensitive domains, providing users with the tools they need while maintaining strict privacy controls and administrative oversight.
