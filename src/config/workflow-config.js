/**
 * Workflow Configuration System
 * Centralized configuration for user workflow states and transitions
 * Designed to be backward compatible with existing maia_users database
 */

export const WORKFLOW_CONFIG = {
  // Map database workflowStage values to UI display information
  stages: {
    // Legacy stages (backward compatible)
    'no_passkey': {
      step: 1,
      name: 'Create Passkey',
      color: 'orange',
      description: 'User needs to create a passkey',
      canProceed: true,
      requiresAction: 'user',
      isLegacy: true
    },
    'request_email_sent': {
      step: 2,
      name: 'Request Email Sent',
      color: 'blue',
      description: 'User sent request email',
      canProceed: false,
      requiresAction: 'admin',
      isLegacy: true
    },
    'awaiting_approval': {
      step: 2,
      name: 'Request Pending',
      color: 'blue',
      description: 'Waiting for admin approval',
      canProceed: false,
      requiresAction: 'admin',
      isLegacy: true
    },
    'approved': {
      step: 3,
      name: 'Agent Creation',
      color: 'purple',
      description: 'Creating private AI agent',
      canProceed: true,
      requiresAction: 'system',
      isLegacy: true
    },
    'agent_assigned': {
      step: 4,
      name: 'Agent Assigned',
      color: 'green',
      description: 'Private AI agent assigned and deployed',
      canProceed: true,
      requiresAction: 'user',
      isLegacy: true
    },
    'waiting_for_deployment': {
      step: 4,
      name: 'Agent Deployment',
      color: 'indigo',
      description: 'Waiting for agent deployment',
      canProceed: true,
      requiresAction: 'system',
      isLegacy: true
    },
    'rejected': {
      step: 2,
      name: 'Request Rejected',
      color: 'red',
      description: 'Request was rejected by admin',
      canProceed: true,
      requiresAction: 'user',
      isLegacy: true
    },
    'suspended': {
      step: 0,
      name: 'Account Suspended',
      color: 'red',
      description: 'Account is suspended',
      canProceed: false,
      requiresAction: 'admin',
      isLegacy: true
    },
    
    // New extended stages (future-ready)
    'has_bucket': {
      step: 4,
      name: 'Bucket Ready',
      color: 'teal',
      description: 'Storage bucket created',
      canProceed: true,
      requiresAction: 'system',
      isLegacy: false
    },
    'has_files': {
      step: 5,
      name: 'Files Uploaded',
      color: 'indigo',
      description: 'Files uploaded to bucket',
      canProceed: true,
      requiresAction: 'user',
      isLegacy: false
    },
    'has_kb': {
      step: 6,
      name: 'Knowledge Base Created',
      color: 'green',
      description: 'Knowledge base is ready',
      canProceed: true,
      requiresAction: 'system',
      isLegacy: false
    },
    'adding_files': {
      step: 6,
      name: 'Adding Files',
      color: 'amber',
      description: 'Adding files to knowledge base',
      canProceed: true,
      requiresAction: 'user',
      isLegacy: false
    },
    'complete': {
      step: 7,
      name: 'Complete',
      color: 'green',
      description: 'All setup complete',
      canProceed: false,
      requiresAction: 'none',
      isLegacy: false
    },
    
    // Fallback for unknown states
    'unknown': {
      step: 0,
      name: 'Unknown State',
      color: 'grey',
      description: 'Unknown workflow state',
      canProceed: false,
      requiresAction: 'admin',
      isLegacy: false
    }
  },
  
  // Define valid transitions (backward compatible)
  transitions: {
    'no_passkey': ['request_email_sent', 'awaiting_approval'],
    'request_email_sent': ['awaiting_approval', 'approved', 'rejected'],
    'awaiting_approval': ['approved', 'rejected', 'suspended'],
    'rejected': ['awaiting_approval'],
    'approved': ['agent_assigned', 'has_bucket', 'suspended'],
    'agent_assigned': ['has_bucket', 'suspended'],
    'has_bucket': ['has_files', 'suspended'],
    'has_files': ['has_kb', 'suspended'],
    'has_kb': ['adding_files', 'complete', 'suspended'],
    'adding_files': ['complete', 'suspended'],
    'suspended': ['awaiting_approval', 'approved', 'has_bucket', 'has_files', 'has_kb'],
    'complete': [], // Terminal state
    'unknown': ['awaiting_approval'] // Allow recovery from unknown state
  },
  
  // Legacy workflow stage mapping (for backward compatibility)
  legacyStages: {
    'no_passkey': 'no_passkey',
    'awaiting_approval': 'awaiting_approval', 
    'approved': 'approved',
    'agent_assigned': 'agent_assigned',
    'waiting_for_deployment': 'waiting_for_deployment',
    'rejected': 'rejected',
    'suspended': 'suspended'
  }
};

/**
 * Get workflow stage configuration
 * @param {string} workflowStage - The workflow stage from database
 * @returns {Object} Stage configuration
 */
export function getWorkflowStageConfig(workflowStage) {
  const config = WORKFLOW_CONFIG.stages[workflowStage];
  if (config) {
    return config;
  }
  
  // Fallback for unknown stages
  console.warn(`Unknown workflow stage: ${workflowStage}, using fallback`);
  return WORKFLOW_CONFIG.stages['unknown'];
}

/**
 * Check if a workflow stage is legacy (backward compatible)
 * @param {string} workflowStage - The workflow stage
 * @returns {boolean} True if legacy stage
 */
export function isLegacyWorkflowStage(workflowStage) {
  const config = getWorkflowStageConfig(workflowStage);
  return config.isLegacy === true;
}

/**
 * Get the next possible workflow stages
 * @param {string} currentStage - Current workflow stage
 * @returns {Array} Array of possible next stages
 */
export function getNextPossibleStages(currentStage) {
  return WORKFLOW_CONFIG.transitions[currentStage] || [];
}

/**
 * Check if a transition is valid
 * @param {string} fromStage - Current stage
 * @param {string} toStage - Target stage
 * @returns {boolean} True if transition is valid
 */
export function canTransitionTo(fromStage, toStage) {
  const validTransitions = getNextPossibleStages(fromStage);
  return validTransitions.includes(toStage);
}
