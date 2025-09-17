/**
 * Workflow Utilities
 * Backward-compatible utilities for managing user workflow states
 */

import { getWorkflowStageConfig, isLegacyWorkflowStage } from '../config/workflow-config.js';

export class WorkflowUtils {
  /**
   * Get flow step information for a user and optional agent
   * @param {Object} user - User object from database
   * @param {Object} agent - Optional agent object
   * @returns {Object} Flow step configuration
   */
  static getFlowStep(user, agent = null) {
    if (!user) {
      return null;
    }
    
    // Get the workflow stage from database (backward compatible)
    const workflowStage = user.workflowStage || this.determineLegacyWorkflowStage(user);
    
    // Get base configuration for this stage
    let stageConfig = getWorkflowStageConfig(workflowStage);
    
    // Apply agent-specific logic for backward compatibility
    if (agent) {
      stageConfig = this.applyAgentLogic(stageConfig, agent, workflowStage);
    }
    
    return stageConfig;
  }
  
  /**
   * Determine workflow stage for legacy users without workflowStage field
   * @param {Object} user - User object from database
   * @returns {string} Workflow stage
   */
  static determineLegacyWorkflowStage(user) {
    // Check if user has a passkey (look for credentialID field)
    if (!user.credentialID) {
      return 'no_passkey';
    }
    
    // For legacy users without approvalStatus field, assume they need approval
    if (!user.approvalStatus) {
      return 'awaiting_approval';
    }
    
    // Map legacy approvalStatus to workflow stages
    switch (user.approvalStatus) {
      case 'pending':
        return 'awaiting_approval';
      case 'rejected':
        return 'rejected';
      case 'suspended':
        return 'suspended';
      case 'approved':
        return 'approved';
      default:
        return 'awaiting_approval';
    }
  }
  
  /**
   * Apply agent-specific logic to workflow stage configuration
   * @param {Object} stageConfig - Base stage configuration
   * @param {Object} agent - Agent object
   * @param {string} workflowStage - Current workflow stage
   * @returns {Object} Modified stage configuration
   */
  static applyAgentLogic(stageConfig, agent, workflowStage) {
    // If agent is running and user is in knowledge base stage, mark as complete
    if (agent.status === 'running' && ['has_kb', 'adding_files'].includes(workflowStage)) {
      return getWorkflowStageConfig('complete');
    }
    
    // If agent exists but not running, and user is in knowledge base stage
    if (agent.status !== 'running' && ['has_kb', 'adding_files'].includes(workflowStage)) {
      return getWorkflowStageConfig('has_kb');
    }
    
    // If agent exists but not running, and user is approved
    if (agent.status !== 'running' && workflowStage === 'approved') {
      return getWorkflowStageConfig('has_bucket');
    }
    
    return stageConfig;
  }
  
  /**
   * Check if user should see the "No Private Agent" modal
   * @param {Object} user - User object
   * @param {Object} agent - Optional agent object
   * @returns {boolean} True if modal should be shown
   */
  static shouldShowNoAgentModal(user, agent = null) {
    // Only for Private Users (authenticated with passkey)
    if (!user || 
        user.userId === 'Public User' || 
        user.userId === 'Unknown User' || 
        user.isDeepLinkUser ||
        user.isAdmin) {
      return false;
    }
    
    // Check if user has a passkey
    if (!user.credentialID) {
      return false; // No passkey, shouldn't see modal
    }
    
    // Get workflow stage
    const workflowStage = user.workflowStage || this.determineLegacyWorkflowStage(user);
    
    // Check if user is in a workflow stage that requires an agent
    const requiresAgent = ['approved', 'has_bucket', 'has_files', 'has_kb', 'adding_files'].includes(workflowStage);
    
    return requiresAgent && !agent;
  }
  
  /**
   * Get user type classification
   * @param {Object} user - User object
   * @returns {string} User type
   */
  static getUserType(user) {
    if (!user) return 'unknown';
    
    if (user.userId === 'Public User') return 'public';
    if (user.userId === 'Unknown User') return 'unknown';
    if (user.isDeepLinkUser) return 'deep_link';
    if (user.isAdmin) return 'admin';
    if (user.credentialID) return 'private';
    
    return 'unknown';
  }
  
  /**
   * Check if user is subject to workflow steps
   * @param {Object} user - User object
   * @returns {boolean} True if user is subject to workflow
   */
  static isWorkflowUser(user) {
    const userType = this.getUserType(user);
    return userType === 'private';
  }
  
  /**
   * Get workflow progress percentage
   * @param {Object} user - User object
   * @param {Object} agent - Optional agent object
   * @returns {number} Progress percentage (0-100)
   */
  static getWorkflowProgress(user, agent = null) {
    if (!this.isWorkflowUser(user)) {
      return 0;
    }
    
    const flowStep = this.getFlowStep(user, agent);
    if (!flowStep) return 0;
    
    // Calculate progress based on step number
    const maxSteps = 7; // Complete is step 7
    return Math.round((flowStep.step / maxSteps) * 100);
  }
}

export default WorkflowUtils;
