/**
 * Admin Alert System
 * Handles critical errors, security violations, and system warnings
 */

let cacheManager = null;
let couchDBClient = null;
let addUpdateToAllAdmins = null;

/**
 * Initialize the alert system with required dependencies
 */
export function initializeAlertSystem(cache, couch, updateFunc) {
  cacheManager = cache;
  couchDBClient = couch;
  addUpdateToAllAdmins = updateFunc;
}

/**
 * Send an alert to administrators
 * @param {Object} options - Alert options
 * @param {string} options.severity - 'CRITICAL', 'WARNING', 'INFO'
 * @param {string} options.category - Category of alert (e.g., 'SECURITY_VIOLATION', 'DATA_CORRUPTION')
 * @param {string} options.message - Human-readable message
 * @param {Object} options.details - Contextual data about the alert
 */
export async function sendAdminAlert({
  severity,
  category,
  message,
  details
}) {
  const timestamp = new Date().toISOString();
  
  // 1. Log to console with appropriate severity
  const logPrefix = severity === 'CRITICAL' ? '🚨' : 
                   severity === 'WARNING' ? '⚠️' : 'ℹ️';
  console.error(`${logPrefix} [ADMIN ALERT] [${category}] ${message}`, details);
  
  // 2. Store in database for admin dashboard (if available)
  if (cacheManager && couchDBClient) {
    try {
      const alertDoc = {
        _id: `alert-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        type: 'admin_alert',
        severity,
        category,
        message,
        details,
        timestamp,
        resolved: false
      };
      
      await cacheManager.saveDocument(couchDBClient, 'maia_users', alertDoc);
      console.log(`✅ [ADMIN ALERT] Saved alert to database: ${alertDoc._id}`);
    } catch (dbError) {
      console.error('❌ [ADMIN ALERT] Failed to save alert to database:', dbError.message);
    }
  }
  
  // 3. Send real-time notification to active admin sessions
  if (addUpdateToAllAdmins) {
    try {
      const updateData = {
        severity,
        category,
        message,
        details,
        timestamp
      };
      addUpdateToAllAdmins('admin_alert', updateData);
      console.log(`📡 [ADMIN ALERT] Sent real-time notification to admin sessions`);
    } catch (pollingError) {
      console.error('❌ [ADMIN ALERT] Failed to send alert to admin sessions:', pollingError.message);
    }
  }
  
  // 4. Email notification (future implementation)
  // TODO: Implement email alerts when SMTP is configured
  // if (process.env.ADMIN_EMAIL && process.env.SMTP_HOST) {
  //   await sendEmailAlert(severity, category, message, details);
  // }
}

/**
 * Alert categories for consistent categorization
 */
export const AlertCategory = {
  SECURITY_VIOLATION: 'SECURITY_VIOLATION',
  DATA_CORRUPTION: 'DATA_CORRUPTION',
  API_FAILURE: 'API_FAILURE',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR'
};

/**
 * Alert severity levels
 */
export const AlertSeverity = {
  CRITICAL: 'CRITICAL',  // Immediate action required
  WARNING: 'WARNING',    // Should be investigated
  INFO: 'INFO'          // Informational only
};

