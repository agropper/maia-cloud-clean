import express from "express";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import crypto from "crypto";

const router = express.Router();
let couchDBClient = null;

// Function to set the CouchDB client (will be called from server.js)
export const setCouchDBClient = (client) => {
  // console.log("🔍 Setting CouchDB client for passkey routes:", !!client);
  couchDBClient = client;
};

// Pass cache functions to the routes
let cacheFunctions = null;
export const setCacheFunctions = (functions) => {
  cacheFunctions = functions;
};

// Relying party configuration
const rpName = "HIEofOne.org";

// Auto-detect environment and configure passkey settings
// 
// CONFIGURATION PRIORITY (highest to lowest):
// 1. PASSKEY_RPID - Explicit passkey domain override
// 2. DOMAIN - General domain setting
// 3. NODE_ENV=production - Triggers cloud mode but requires DOMAIN to be set
// 
// NO HARDCODED FALLBACKS - If cloud environment is detected but no domain is set,
// the system will warn and fall back to localhost (which will cause passkey failures)
//
const isLocalhost = process.env.NODE_ENV !== 'production' && (!process.env.DOMAIN && !process.env.PASSKEY_RPID);
const isCloud = process.env.DOMAIN || process.env.PASSKEY_RPID || process.env.NODE_ENV === 'production';

// Environment detection (essential for debugging)
if (process.env.NODE_ENV !== 'production') {
  console.log('🔍 Environment Detection Logic:');
  console.log('  - NODE_ENV:', process.env.NODE_ENV);
  console.log('  - DOMAIN:', process.env.DOMAIN || 'not set');
  console.log('  - PASSKEY_RPID:', process.env.PASSKEY_RPID || 'not set');
  console.log('  - isLocalhost:', isLocalhost);
  console.log('  - isCloud:', isCloud);
}

// Automatic rpID configuration
const rpID = (() => {
  if (process.env.PASSKEY_RPID) return process.env.PASSKEY_RPID;
  if (process.env.DOMAIN) return process.env.DOMAIN;
  if (isCloud) {
    console.warn('⚠️ WARNING: Cloud environment detected but no DOMAIN or PASSKEY_RPID set!');
    console.warn('⚠️ Please set DOMAIN=your-domain.com or PASSKEY_RPID=your-domain.com in your environment variables.');
    console.warn('⚠️ Falling back to localhost (this will cause passkey registration to fail!)');
    return 'localhost';
  }
  return 'localhost'; // Local development
})();

// Automatic origin configuration
const origin = (() => {
  if (process.env.PASSKEY_ORIGIN) return process.env.PASSKEY_ORIGIN.replace(/\/$/, '');
  
  if (isCloud) {
    const protocol = process.env.HTTPS === 'true' ? 'https://' : 'https://'; // Cloud defaults to HTTPS
    const domain = process.env.DOMAIN;
    if (!domain) {
      console.warn('⚠️ WARNING: Cloud environment detected but no DOMAIN or PASSKEY_ORIGIN set!');
      console.warn('⚠️ Please set DOMAIN=your-domain.com or PASSKEY_ORIGIN=https://your-domain.com in your environment variables.');
      console.warn('⚠️ Falling back to localhost (this will cause passkey registration to fail!)');
      return `http://localhost:${process.env.PORT || '3001'}`;
    }
    return `${protocol}${domain}`;
  }
  
  // Local development - automatically include port
  const port = process.env.PORT || '3001';
  return `http://localhost:${port}`;
})();

// Passkey configuration (essential for debugging)
if (process.env.NODE_ENV !== 'production') {
  console.log("🔍 Passkey Configuration:");
  console.log("  - NODE_ENV:", process.env.NODE_ENV);
  console.log("  - Environment Detection:");
  console.log("    - isLocalhost:", isLocalhost);
  console.log("    - isCloud:", isCloud);
  console.log("  - rpID:", rpID);
  console.log("  - origin:", origin);
  console.log("  - Auto-detected from:");
  console.log("    - PASSKEY_RPID:", process.env.PASSKEY_RPID || 'not set');
  console.log("    - DOMAIN:", process.env.DOMAIN || 'not set');
  console.log("    - PORT:", process.env.PORT || '3001 (default)');
  console.log("    - HTTPS:", process.env.HTTPS || 'not set');
}

// Configuration summary and recommendations
console.log("📋 Configuration Summary:");
if (isCloud && rpID === 'localhost') {
  console.log("❌ PROBLEM: Cloud environment detected but using localhost rpID!");
  console.log("❌ This will cause passkey registration to fail!");
  console.log("💡 SOLUTION: Set DOMAIN=your-domain.com or PASSKEY_RPID=your-domain.com");
} else if (isCloud) {
  console.log("✅ Cloud environment configured correctly");
  console.log("✅ rpID:", rpID);
  console.log("✅ origin:", origin);
} else {
  console.log("✅ Local development environment");
  console.log("✅ rpID:", rpID);
  console.log("✅ origin:", origin);
}

// Add a function to log config on each request for debugging
const logPasskeyConfig = () => {
};

// Check if user ID is available
router.post("/check-user", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Check if user exists in Cloudant
    try {
      const existingUser = await couchDBClient.getDocument(
        "maia_users",
        userId
      );
      
      if (existingUser) {
        // User exists - check if they have a valid passkey
        const hasValidPasskey = !!(existingUser.credentialID && 
          existingUser.credentialID !== 'test-credential-id-wed271' && 
          existingUser.credentialPublicKey && 
          existingUser.counter !== undefined);
        
        
        res.json({
          available: !hasValidPasskey, // Available if no valid passkey
          message: hasValidPasskey 
            ? "User ID already exists with valid passkey"
            : "User ID exists but can register new passkey",
          hasValidPasskey: hasValidPasskey,
          canRegister: !hasValidPasskey
        });
      } else {
        // User doesn't exist - available for new registration
        res.json({
          available: true,
          message: "User ID is available",
          hasValidPasskey: false,
          canRegister: true
        });
      }
    } catch (error) {
      console.log("🔍 Database error:", error.message);
      // If database doesn't exist or document not found, user ID is available
      if (
        error.message.includes("not found") ||
        error.message.includes("does not exist") ||
        error.message.includes("error happened in your connection")
      ) {
        res.json({
          available: true,
          message: "User ID is available (database not initialized)",
          hasValidPasskey: false,
          canRegister: true
        });
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error("❌ Error checking user ID:", error);
    res.status(500).json({ error: "Failed to check user ID availability" });
  }
});

// Generate registration options
router.post("/register", async (req, res) => {
  try {
    logPasskeyConfig(); // Log config on each request
    const { userId, displayName, adminSecret } = req.body;

    if (!userId || !displayName) {
      console.log("❌ Missing userId or displayName in request");
      return res.status(400).json({ error: "User ID and display name are required" });
    }


    // Check if user already exists
    let existingUser;
    try {
      existingUser = await couchDBClient.getDocument("maia_users", userId);
    } catch (error) {
      // If database doesn't exist, that's fine - user can register
      if (error.message.includes("error happened in your connection")) {
        existingUser = null;
      } else {
        throw error;
      }
    }

    if (existingUser) {
      
      // If user already has a passkey, check for admin replacement or reset flag
      if (existingUser.credentialID) {
        // Check if user has an active passkey reset flag
        if (existingUser.passkeyResetFlag && existingUser.passkeyResetExpiry) {
          const resetExpiry = new Date(existingUser.passkeyResetExpiry);
          const now = new Date();
          
          if (now < resetExpiry) {
            console.log("✅ User has active passkey reset flag, allowing registration:", userId);
            // Continue with registration (replace existing passkey)
          } else {
            // Reset flag has expired, clear it and deny registration
            const clearedUser = {
              ...existingUser,
              passkeyResetFlag: undefined,
              passkeyResetExpiry: undefined,
              updatedAt: new Date().toISOString()
            };
            await couchDBClient.saveDocument("maia_users", clearedUser);
            console.log("❌ Passkey reset flag expired for user:", userId);
            return res.status(400).json({ 
              error: "Passkey reset window has expired. Contact admin to reset again.",
              hasExistingPasskey: true,
              resetExpired: true,
              userId: userId
            });
          }
        }
        // Special case: Allow admin to replace passkey (admin has already been verified in admin panel)
        else if (userId === 'admin') {
          console.log("✅ Admin passkey replacement allowed (admin already verified)");
          // Continue with registration (replace existing passkey)
        } else if (adminSecret && adminSecret === process.env.ADMIN_SECRET) {
          // Admin override: Allow admin to reset any user's passkey
          console.log("✅ Admin override: Allowing passkey reset for user:", userId);
          // Continue with registration (replace existing passkey)
        } else {
          console.log("❌ User already has a passkey:", userId);
          return res.status(400).json({ 
            error: "User already has a registered passkey. Contact admin to reset it.",
            hasExistingPasskey: true,
            userId: userId
          });
        }
      } else {
        // If user exists but doesn't have a passkey, allow registration
        console.log("✅ User exists but no passkey, allowing registration:", userId);
      }
    }


    // Generate registration options
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: Buffer.from(userId, 'utf8'),
      userName: displayName,
      userDisplayName: displayName,
      attestation: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
        authenticatorAttachment: "platform",
      },
    });


    // Store challenge in session or temporary storage
    // For now, we'll store it in the user document
    const userDoc = existingUser ? {
      ...existingUser,
      challenge: options.challenge,
      updatedAt: new Date().toISOString(),
    } : {
      _id: userId,
      userId,
      displayName,
      domain: rpID,
      type: 'user', // Add type field for proper filtering
      challenge: options.challenge,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };


    // Store user document with challenge for verification
    try {
              await couchDBClient.saveDocument("maia_users", userDoc);
      console.log("✅ User document saved successfully");
    } catch (error) {
      console.error("❌ Failed to save user document:", error.message);
      // If database doesn't exist, create it first
      if (error.message.includes("error happened in your connection")) {
        try {
      await couchDBClient.createDatabase("maia_users");
          await couchDBClient.saveDocument("maia_users", userDoc);
          console.log("✅ Database created and user document saved");
        } catch (createError) {
          console.error("❌ Failed to create database:", createError);
          // For now, continue without database storage
        }
      } else {
        console.error("❌ Database error:", error);
        throw error;
      }
    }

    console.log("✅ Registration options sent successfully");
    res.json(options);
  } catch (error) {
    console.error("❌ Error generating registration options:", error);
    res.status(500).json({ error: "Failed to generate registration options" });
  }
});

// Verify registration response
router.post("/register-verify", async (req, res) => {
  try {
    console.log("🔍 Registration verification request received");
    const { userId, response } = req.body;

    if (!userId || !response) {
      console.log("❌ Missing userId or response in verification request");
      return res
        .status(400)
        .json({ error: "User ID and response are required" });
    }

    console.log("🔍 Getting user document for verification:", userId);

    // Get the user document with the stored challenge
    let userDoc;
    try {
              userDoc = await couchDBClient.getDocument("maia_users", userId);
      console.log("✅ User document retrieved successfully");
    } catch (error) {
      console.error("❌ Error getting user document:", error);
      return res.status(404).json({
        error: "User registration not found. Please try registering again.",
      });
    }

    if (!userDoc || !userDoc.challenge) {
      console.log("❌ No user document or challenge found");
      return res.status(400).json({
        error: "No registration challenge found. Please try registering again.",
      });
    }

    console.log("🔍 Verifying registration response");

    // Verify the registration response
    console.log("🔍 Registration verification parameters:");
    console.log("  - expectedOrigin:", origin);
    console.log("  - expectedRPID:", rpID);
    console.log("  - challenge present:", !!userDoc.challenge);
    
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: userDoc.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    console.log("🔍 Registration verification result:", verification.verified);
    console.log("🔍 Response origin:", response.response.clientExtensionResults?.appid);
    console.log("🔍 Response type:", response.type);
    console.log("🔍 Response ID:", response.id);

    if (verification.verified) {
      console.log("🔍 Updating user document with credential information");
      console.log("🔍 Verification result structure:", Object.keys(verification.registrationInfo));
      console.log("🔍 Credential object keys:", Object.keys(verification.registrationInfo.credential));
      console.log("🔍 Credential ID:", verification.registrationInfo.credential.id);
      console.log("🔍 Credential Public Key:", verification.registrationInfo.credential.publicKey);
      console.log("🔍 Counter:", verification.registrationInfo.credential.counter);
      
      // Update user document with credential information
      // Convert Uint8Array to base64 string for storage
      const updatedUser = {
        ...userDoc,
        credentialID: verification.registrationInfo.credential.id,
        credentialPublicKey: isoBase64URL.fromBuffer(verification.registrationInfo.credential.publicKey),
        counter: verification.registrationInfo.credential.counter,
        transports: response.response.transports || [],
        challenge: undefined, // Remove the challenge
        passkeyResetFlag: undefined, // Clear the reset flag on successful registration
        passkeyResetExpiry: undefined, // Clear the reset expiry
        updatedAt: new Date().toISOString(),
      };

      // Save the updated user document to Cloudant
      await couchDBClient.saveDocument("maia_users", updatedUser);

      console.log("✅ Passkey registration successful for user:", userId);

      res.json({
        success: true,
        message: "Passkey registration successful",
        user: {
          userId: updatedUser._id, // Use _id instead of userId
          displayName: updatedUser.displayName || updatedUser._id,
        },
      });
    } else {
      console.error("❌ Registration verification failed for user:", userId);
      res.status(400).json({ error: "Registration verification failed" });
    }
  } catch (error) {
    console.error("❌ Error verifying registration:", error);
    res.status(500).json({ error: "Failed to verify registration" });
  }
});

// Generate authentication options
router.post("/authenticate", async (req, res) => {
  try {
    logPasskeyConfig(); // Log config on each request
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Get user document
    let userDoc;
    try {
      userDoc = await couchDBClient.getDocument("maia_users", userId);
    } catch (error) {
      console.error("❌ Error getting user document:", error.message);
      if (error.message.includes("error happened in your connection")) {
        return res
          .status(404)
          .json({ error: "User not found (database not initialized)" });
      }
      throw error;
    }

    if (!userDoc) {
      console.log("❌ User not found:", userId);
      return res.status(404).json({ error: "User not found" });
    }

    if (!userDoc.credentialID) {
      console.log("❌ User has no registered passkey:", userId);
      return res.status(400).json({ error: "User has no registered passkey" });
    }

    // Generate authentication options
    // In v13, credentialID should be stored as a base64url string
    if (typeof userDoc.credentialID !== "string") {
      console.log("❌ Invalid credential ID format:", typeof userDoc.credentialID);
      throw new Error("Invalid credential ID format - expected base64url string");
    }

    // Generate authentication options using SimpleWebAuthn v13
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: [
        {
          id: userDoc.credentialID,
          type: "public-key",
        },
      ],
      userVerification: "preferred",
      timeout: 60000,
      authenticatorSelection: {
        authenticatorAttachment: "platform",
      },
    });

    // Store challenge in user document
    const updatedUser = {
      ...userDoc,
      challenge: options.challenge,
      updatedAt: new Date().toISOString(),
    };

    await couchDBClient.saveDocument("maia_users", updatedUser);
    res.json(options);
  } catch (error) {
    console.error("❌ Error generating authentication options:", error);
    res
      .status(500)
      .json({ error: "Failed to generate authentication options" });
  }
});

// Verify authentication response
router.post("/authenticate-verify", async (req, res) => {
  try {
    const { userId, response } = req.body;

    if (!userId || !response) {
      return res
        .status(400)
        .json({ error: "User ID and response are required" });
    }

    // Get user document with challenge
    const userDoc = await couchDBClient.getDocument("maia_users", userId);
    if (!userDoc) {
      return res.status(404).json({ error: "User not found" });
    }

    // Verify the authentication response
    // Convert base64 string back to Uint8Array for verification
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: userDoc.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        publicKey: isoBase64URL.toBuffer(userDoc.credentialPublicKey),
        id: userDoc.credentialID,
        counter: userDoc.counter || 0,
      },
    });

    if (verification.verified) {
      // Update counter
      const updatedUser = {
        ...userDoc,
        counter: verification.authenticationInfo.newCounter,
        challenge: undefined, // Remove challenge
        updatedAt: new Date().toISOString(),
      };

      await couchDBClient.saveDocument("maia_users", updatedUser);

      // Set session data for authenticated user
      req.session.userId = updatedUser._id;
      req.session.username = updatedUser._id;
      req.session.displayName = updatedUser.displayName || updatedUser._id;
      req.session.authenticatedAt = new Date().toISOString();

      console.log(`✅ Session created for user: ${updatedUser._id}`);
      
      // Set the user's assigned agent as current when they sign in
      try {
        console.log(`🔍 [AUTH] Setting assigned agent as current for user: ${updatedUser._id}`);
        
        // Get the user's assigned agent from admin management
        const assignedAgentResponse = await fetch(`http://localhost:3001/api/admin-management/users/${updatedUser._id}/assigned-agent`);
        if (assignedAgentResponse.ok) {
          const assignedAgentData = await assignedAgentResponse.json();
          if (assignedAgentData.assignedAgentId) {
            console.log(`🔍 [AUTH] Found assigned agent for ${updatedUser._id}: ${assignedAgentData.assignedAgentName} (${assignedAgentData.assignedAgentId})`);
            
            // Set this agent as the current agent for the user
            const currentAgentResponse = await fetch(`http://localhost:3001/api/current-agent`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Cookie': `maia.sid=${req.sessionID}` // Use the same session
              },
              body: JSON.stringify({
                agentId: assignedAgentData.assignedAgentId,
                agentName: assignedAgentData.assignedAgentName
              })
            });
            
            if (currentAgentResponse.ok) {
              console.log(`✅ [AUTH] Successfully set current agent for ${updatedUser._id}: ${assignedAgentData.assignedAgentName}`);
            } else {
              console.warn(`⚠️ [AUTH] Failed to set current agent for ${updatedUser._id}: ${currentAgentResponse.status}`);
            }
          } else {
            console.log(`🔍 [AUTH] No assigned agent found for ${updatedUser._id} - will show "No Agent Selected"`);
          }
        } else {
          console.warn(`⚠️ [AUTH] Failed to get assigned agent for ${updatedUser._id}: ${assignedAgentResponse.status}`);
        }
      } catch (error) {
        console.error(`❌ [AUTH] Error setting current agent for ${updatedUser._id}:`, error.message);
      }
      
      // Explicitly save the session
      req.session.save((err) => {
        if (err) {
          console.error('❌ [passkey] Error saving session:', err);
        }
      });
      
      // Group chat filtering is handled by the frontend
      
      // Set the session cookie BEFORE sending response
      res.cookie('maia.sid', req.sessionID, {
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        path: '/'
      });
      
      // Force session save
      req.session.save((err) => {
        if (err) {
          console.error(`❌ Session save error for user ${updatedUser.userId}:`, err);
        }
      });

      const responseData = {
        success: true,
        message: "Authentication successful",
        user: {
          userId: updatedUser._id, // Use _id instead of userId
          displayName: updatedUser.displayName || updatedUser._id,
        },
      };
      
      // Sending authentication response
      res.json(responseData);
    } else {
      res.status(400).json({ error: "Authentication verification failed" });
    }
  } catch (error) {
    console.error("❌ Error verifying authentication:", error);
    res.status(500).json({ error: "Failed to verify authentication" });
  }
});

// Get user info
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const userDoc = await couchDBClient.getDocument("maia_users", userId);
    if (!userDoc) {
      return res.status(404).json({ error: "User not found" });
    }

    // Don't return sensitive credential data
    res.json({
      userId: userDoc._id, // Use _id instead of userId
      displayName: userDoc.displayName || userDoc._id,
      domain: userDoc.domain,
      createdAt: userDoc.createdAt,
      updatedAt: userDoc.updatedAt,
    });
  } catch (error) {
    console.error("❌ Error getting user info:", error);
    res.status(500).json({ error: "Failed to get user info" });
  }
});

// Check authentication status
router.get("/auth-status", async (req, res) => {
  try {
    if (req.session && req.session.userId) {
      // Check if this is a deep link user - they should not be authenticated on main app
      if (req.session.userId.startsWith('deep_link_')) {
        // Store deepLinkId before destroying session
        const deepLinkId = req.session.deepLinkId;
        
        // Clear the session for deep link users on main app
        req.session.destroy();
        res.json({ 
          authenticated: false, 
          message: "Deep link users should only access shared pages",
          redirectTo: deepLinkId ? `/shared/${deepLinkId}` : '/'
        });
        return;
      }
      
      // Only authenticate passkey users (not deep link users)
      let userDoc = null;
      if (cacheFunctions) {
        userDoc = cacheFunctions.getCache('users', req.session.userId);
        if (!cacheFunctions.isCacheValid('users', req.session.userId)) {
          userDoc = await couchDBClient.getDocument("maia_users", req.session.userId);
          if (userDoc) {
            cacheFunctions.setCache('users', req.session.userId, userDoc);
          }
        }
      } else {
        userDoc = await couchDBClient.getDocument("maia_users", req.session.userId);
      }
      if (userDoc) {
        // Echo current user to backend console
        console.log(`✅ [auth-status] Current user: ${userDoc._id}`);
        
        res.json({
          authenticated: true,
          user: {
            userId: userDoc._id, // Use _id instead of userId
            displayName: userDoc.displayName || userDoc._id,
          },
        });
      } else {
        console.log(`❌ [auth-status] User document not found for userId: ${req.session.userId}`);
        // Session exists but user document not found, clear session
        req.session.destroy();
        res.json({ authenticated: false, message: "User not found" });
      }
    } else {
      // Public User - no authentication required
      console.log(`✅ [auth-status] Auth Status: Public User`);
      res.json({ authenticated: false, message: "No active session" });
    }
  } catch (error) {
    console.error("❌ [auth-status] Error checking auth status:", error);
    res.status(500).json({ error: "Failed to check authentication status" });
  }
});

// Get session verification data
router.get("/session-verification", async (req, res) => {
  try {
    if (global.sessionVerification) {
      const verification = global.sessionVerification;
      
      if (verification.error) {
        res.setHeader('X-Session-Error', 'Session verification failed');
      } else {
        res.setHeader('X-Session-Verified', 'Session verified');
      }
      
      // Clear the verification data after sending
      global.sessionVerification = null;
    }
    
    res.json({ status: 'ok' });
  } catch (error) {
    console.error("❌ [session-verification] Error:", error);
    res.status(500).json({ error: "Failed to get session verification" });
  }
});

// Logout route to clear session
router.post("/logout", async (req, res) => {
  try {
    console.log(`🚨 BACKEND LOGOUT ENDPOINT HIT at ${new Date().toISOString()}`);
    
    if (req.session) {
      const userId = req.session.userId;
      console.log(`👋 User signed out: ${userId}`);
      
      // Group chat filtering is handled by the frontend
      
      req.session.destroy(async (err) => {
        if (err) {
          console.error("❌ Error destroying session:", err);
          return res.status(500).json({ error: "Failed to logout" });
        }
        console.log(`✅ Session destroyed for user: ${userId}`);
        
        // Session management is now in-memory only (maia_sessions database removed)
        console.log('[*] [Session Delete] Session destroyed (in-memory only)');
        
        // Send a message to the browser console after session destruction
        res.json({ 
          success: true, 
          message: "Logged out successfully",
          consoleMessage: `🔍 Backend Logout: Session destroyed for ${userId} | Now: No session`
        });
      });
    } else {
      console.log(`ℹ️ No active session to destroy`);
      res.json({ success: true, message: "No active session" });
    }
  } catch (error) {
    console.error("❌ Error during logout:", error);
    res.status(500).json({ error: "Failed to logout" });
  }
});

export default router;
