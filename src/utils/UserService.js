/**
 * Centralized User Management Service
 * Provides consistent user object structure and management across the application
 */

export class UserService {
  /**
   * Create a standardized user object
   * @param {string} userId - The user identifier
   * @param {string} displayName - The display name (defaults to userId if not provided)
   * @param {Object} additionalProps - Additional properties to include
   * @returns {Object} Standardized user object
   */
  static createUserObject(userId, displayName = null, additionalProps = {}) {
    const isPublicUser = userId === 'Public User';
    const isAuthenticated = !isPublicUser && userId !== 'Unknown User';
    
    return {
      userId: userId,
      displayName: displayName || userId,
      isAuthenticated: isAuthenticated,
      isPublicUser: isPublicUser,
      ...additionalProps
    };
  }

  /**
   * Create a Public User object
   * @returns {Object} Public User object
   */
  static createPublicUser() {
    return this.createUserObject('Public User', 'Public User');
  }

  /**
   * Create an authenticated user object
   * @param {string} userId - The user identifier
   * @param {string} displayName - The display name
   * @param {Object} additionalProps - Additional properties
   * @returns {Object} Authenticated user object
   */
  static createAuthenticatedUser(userId, displayName = null, additionalProps = {}) {
    return this.createUserObject(userId, displayName, {
      isAuthenticated: true,
      isPublicUser: false,
      ...additionalProps
    });
  }

  /**
   * Create a deep link user object
   * @param {string} userId - The user identifier
   * @param {string} displayName - The display name
   * @param {string} email - The email
   * @param {string} shareId - The share ID
   * @returns {Object} Deep link user object
   */
  static createDeepLinkUser(userId, displayName, email, shareId) {
    return this.createUserObject(userId, displayName, {
      email: email,
      isDeepLinkUser: true,
      shareId: shareId,
      isAuthenticated: true,
      isPublicUser: false
    });
  }

  /**
   * Get the user ID from a user object (handles various structures)
   * @param {Object} userObject - The user object
   * @returns {string} The user ID
   */
  static getUserId(userObject) {
    if (!userObject) return 'Public User';
    return userObject.userId || userObject.username || 'Public User';
  }

  /**
   * Check if a user object represents an authenticated user
   * @param {Object} userObject - The user object
   * @returns {boolean} True if authenticated
   */
  static isAuthenticated(userObject) {
    if (!userObject) return false;
    return userObject.isAuthenticated === true || 
           (userObject.userId && userObject.userId !== 'Public User' && userObject.userId !== 'Unknown User');
  }

  /**
   * Check if a user object represents the Public User
   * @param {Object} userObject - The user object
   * @returns {boolean} True if Public User
   */
  static isPublicUser(userObject) {
    if (!userObject) return true;
    return userObject.isPublicUser === true || 
           userObject.userId === 'Public User' || 
           userObject.userId === 'Unknown User';
  }

  /**
   * Normalize a user object to the standard structure
   * @param {Object} userObject - The user object to normalize
   * @returns {Object} Normalized user object
   */
  static normalizeUserObject(userObject) {
    if (!userObject) return this.createPublicUser();
    
    const userId = this.getUserId(userObject);
    const displayName = userObject.displayName || userObject.username || userId;
    
    return this.createUserObject(userId, displayName, {
      email: userObject.email,
      isDeepLinkUser: userObject.isDeepLinkUser,
      shareId: userObject.shareId,
      ...userObject
    });
  }
}

export default UserService;
