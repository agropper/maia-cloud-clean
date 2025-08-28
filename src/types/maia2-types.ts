// MAIA2 Database Types for Enhanced Multi-User Privacy System

// ============================================================================
// USER MANAGEMENT TYPES
// ============================================================================

export interface Maia2User {
  _id: string;
  _rev?: string;
  type: 'user';
  
  // Basic user information
  username: string;
  email?: string;
  displayName?: string;
  
  // Authentication
  passkeyCredentials: PasskeyCredential[];
  lastLogin?: string;
  loginCount: number;
  
  // Privacy and access control
  status: 'active' | 'suspended' | 'deleted';
  approvalStatus: 'pending' | 'approved' | 'rejected';
  privacyLevel: 'public' | 'private' | 'restricted';
  
  // Resource allocation
  maxAgents: number;
  maxKnowledgeBases: number;
  maxStorageGB: number;
  
  // Metadata
  createdAt: string;
  updatedAt: string;
  createdBy?: string; // admin username
  notes?: string;
}

export interface PasskeyCredential {
  id: string;
  publicKey: string;
  signCount: number;
  backupEligible: boolean;
  backupState: boolean;
  createdAt: string;
  lastUsed?: string;
}

// ============================================================================
// AGENT MANAGEMENT TYPES
// ============================================================================

export interface Maia2Agent {
  _id: string;
  _rev?: string;
  type: 'agent';
  
  // Ownership and access
  owner: string; // username
  name: string;
  description?: string;
  
  // Agent configuration
  agentType: 'personal' | 'specialized' | 'general';
  model: string; // AI model identifier
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  
  // DigitalOcean integration
  digitalOceanId?: string;
  digitalOceanStatus?: 'creating' | 'running' | 'stopped' | 'error';
  digitalOceanEndpoint?: string;
  
  // Knowledge base associations
  knowledgeBases: string[]; // KB IDs
  maxContextLength: number;
  
  // Status and metadata
  status: 'active' | 'inactive' | 'error';
  createdAt: string;
  updatedAt: string;
  lastUsed?: string;
  usageCount: number;
  
  // Cost tracking
  estimatedCostPerHour?: number;
  totalCost?: number;
  costLimit?: number;
}

// ============================================================================
// KNOWLEDGE BASE TYPES
// ============================================================================

export interface Maia2KnowledgeBase {
  _id: string;
  _rev?: string;
  type: 'knowledge_base';
  
  // Ownership and access
  owner: string; // username
  name: string;
  description?: string;
  
  // Content and structure
  kbType: 'document' | 'structured' | 'hybrid';
  contentType: 'pdf' | 'text' | 'image' | 'mixed';
  documentCount: number;
  totalSizeBytes: number;
  
  // DigitalOcean integration
  digitalOceanId?: string;
  digitalOceanStatus?: 'creating' | 'indexing' | 'ready' | 'error';
  digitalOceanEndpoint?: string;
  
  // Indexing and search
  isIndexed: boolean;
  indexStatus: 'pending' | 'indexing' | 'complete' | 'error';
  lastIndexed?: string;
  searchableFields: string[];
  
  // Privacy and sharing
  isPublic: boolean;
  sharedWith: string[]; // usernames
  accessLevel: 'read' | 'write' | 'admin';
  
  // Status and metadata
  status: 'active' | 'inactive' | 'archived';
  createdAt: string;
  updatedAt: string;
  lastAccessed?: string;
  accessCount: number;
  
  // Cost tracking
  estimatedCostPerMonth?: number;
  totalCost?: number;
  costLimit?: number;
}

// ============================================================================
// USER RESOURCE ALLOCATION TYPES
// ============================================================================

export interface Maia2UserResource {
  _id: string;
  _rev?: string;
  type: 'user_resource';
  
  // User association
  userId: string; // username
  
  // Resource details
  resourceType: 'agent' | 'knowledge_base' | 'storage' | 'api_access';
  resourceId?: string; // specific resource ID if applicable
  
  // Allocation limits
  allocated: number;
  used: number;
  remaining: number;
  unit: 'count' | 'gb' | 'hours' | 'requests';
  
  // Approval workflow
  approvalStatus: 'pending' | 'approved' | 'rejected';
  requestedBy: string; // username
  requestedAt: string;
  approvedBy?: string; // admin username
  approvedAt?: string;
  rejectionReason?: string;
  
  // Usage tracking
  lastUsed?: string;
  usageHistory: ResourceUsage[];
  
  // Metadata
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  notes?: string;
}

export interface ResourceUsage {
  timestamp: string;
  amount: number;
  description: string;
  cost?: number;
}

// ============================================================================
// ADMIN APPROVAL WORKFLOW TYPES
// ============================================================================

export interface Maia2AdminApproval {
  _id: string;
  _rev?: string;
  type: 'admin_approval';
  
  // Request details
  userId: string; // username
  approvalType: 'resource_allocation' | 'agent_creation' | 'kb_creation' | 'access_upgrade';
  
  // Request specifics
  requestedResources: RequestedResource[];
  justification: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  
  // Approval workflow
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  submittedAt: string;
  reviewedBy?: string; // admin username
  reviewedAt?: string;
  decision?: 'approved' | 'rejected';
  decisionReason?: string;
  
  // Notifications
  userNotified: boolean;
  userNotifiedAt?: string;
  adminNotified: boolean;
  adminNotifiedAt?: string;
  
  // Metadata
  createdAt: string;
  updatedAt: string;
  expiresAt?: string; // auto-expire if not reviewed
  priority: number;
}

export interface RequestedResource {
  resourceType: string;
  amount: number;
  unit: string;
  duration?: string; // for temporary allocations
  cost?: number;
}

// ============================================================================
// AUDIT LOG TYPES
// ============================================================================

export interface Maia2AuditLog {
  _id: string;
  _rev?: string;
  type: 'audit_log';
  
  // Event details
  timestamp: string;
  userId: string; // username or 'system' for system events
  action: string;
  resourceType: 'user' | 'agent' | 'knowledge_base' | 'resource' | 'approval' | 'system';
  resourceId?: string;
  
  // Event context
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  
  // Impact assessment
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectsPrivacy: boolean;
  affectsSecurity: boolean;
  
  // Compliance
  complianceTags: string[]; // e.g., ['hipaa', 'gdpr', 'sox']
  retentionRequired: boolean;
  retentionPeriod?: string;
  
  // Metadata
  createdAt: string;
  indexed: boolean;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface Maia2ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  timestamp: string;
  requestId?: string;
}

export interface Maia2PaginatedResponse<T> extends Maia2ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ============================================================================
// ENUMERATION TYPES
// ============================================================================

export const USER_STATUSES = ['active', 'suspended', 'deleted'] as const;
export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'] as const;
export const PRIVACY_LEVELS = ['public', 'private', 'restricted'] as const;
export const AGENT_TYPES = ['personal', 'specialized', 'general'] as const;
export const KB_TYPES = ['document', 'structured', 'hybrid'] as const;
export const RESOURCE_TYPES = ['agent', 'knowledge_base', 'storage', 'api_access'] as const;
export const AUDIT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type UserStatus = typeof USER_STATUSES[number];
export type ApprovalStatus = typeof APPROVAL_STATUSES[number];
export type PrivacyLevel = typeof PRIVACY_LEVELS[number];
export type AgentType = typeof AGENT_TYPES[number];
export type KbType = typeof KB_TYPES[number];
export type ResourceType = typeof RESOURCE_TYPES[number];
export type AuditSeverity = typeof AUDIT_SEVERITIES[number];

// ============================================================================
// DATABASE QUERY TYPES
// ============================================================================

export interface Maia2QueryOptions {
  limit?: number;
  skip?: number;
  sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
  filter?: Record<string, any>;
  includeDeleted?: boolean;
}

export interface Maia2ViewQuery {
  view: string;
  startkey?: any;
  endkey?: any;
  key?: any;
  keys?: any[];
  limit?: number;
  skip?: number;
  descending?: boolean;
  include_docs?: boolean;
}

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

export interface Maia2Notification {
  _id: string;
  _rev?: string;
  type: 'notification';
  
  // Recipient
  userId: string;
  
  // Notification content
  title: string;
  message: string;
  category: 'approval' | 'resource' | 'security' | 'system' | 'info';
  
  // Status
  isRead: boolean;
  readAt?: string;
  
  // Actions
  actions?: NotificationAction[];
  
  // Metadata
  createdAt: string;
  expiresAt?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

export interface NotificationAction {
  label: string;
  action: string;
  url?: string;
  data?: Record<string, any>;
}
