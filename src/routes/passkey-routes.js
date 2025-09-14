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

// Log environment detection for debugging
console.log('  - NODE_ENV:', process.env.NODE_ENV);
console.log('  - DOMAIN:', process.env.DOMAIN || 'not set');
console.log('  - PASSKEY_RPID:', process.env.PASSKEY_RPID || 'not set');
console.log('  - isLocalhost:', isLocalhost);
console.log('  - isCloud:', isCloud);

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

// Log configuration for debugging
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

// Configuration summary and recommendations
if (isCloud && rpID === 'localhost') {
} else if (isCloud) {
} else {
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
      
      // If user already has a passkey, check for admin replacement
      if (existingUser.credentialID) {
        // Special case: Allow admin to replace passkey (admin has already been verified in admin panel)
        if (userId === 'admin') {
          // Continue with registration (replace existing passkey)
        } else if (adminSecret && adminSecret === process.env.ADMIN_SECRET) {
          // Admin override: Allow admin to reset any user's passkey
          // Continue with registration (replace existing passkey)
        } else {
          return res.status(400).json({ 
            error: "User already has a registered passkey. Contact admin to reset it.",
            hasExistingPasskey: true,
            userId: userId
          });
        }
      } else {
        // If user exists but doesn't have a passkey, allow registration
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
    } catch (error) {
      console.error("❌ Failed to save user document:", error.message);
      // If database doesn't exist, create it first
      if (error.message.includes("error happened in your connection")) {
        try {
      await couchDBClient.createDatabase("maia_users");
          await couchDBClient.saveDocument("maia_users", userDoc);
        } catch (createError) {
          console.error("❌ Failed to create database:", createError);
          // For now, continue without database storage
        }
      } else {
        console.error("❌ Database error:", error);
        throw error;
      }
    }

    res.json(options);
  } catch (error) {
    console.error("❌ Error generating registration options:", error);
    res.status(500).json({ error: "Failed to generate registration options" });
  }
});

// Verify registration response
router.post("/register-verify", async (req, res) => {
  try {
    const { userId, response } = req.body;

    if (!userId || !response) {
      return res
        .status(400)
        .json({ error: "User ID and response are required" });
    }


    // Get the user document with the stored challenge
    let userDoc;
    try {
              userDoc = await couchDBClient.getDocument("maia_users", userId);
    } catch (error) {
      console.error("❌ Error getting user document:", error);
      return res.status(404).json({
        error: "User registration not found. Please try registering again.",
      });
    }

    if (!userDoc || !userDoc.challenge) {
      return res.status(400).json({
        error: "No registration challenge found. Please try registering again.",
      });
    }


    // Verify the registration response
    console.log("  - expectedOrigin:", origin);
    console.log("  - expectedRPID:", rpID);
    console.log("  - challenge present:", !!userDoc.challenge);
    
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: userDoc.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });


    if (verification.verified) {
      
      // Update user document with credential information
      // Convert Uint8Array to base64 string for storage
      const updatedUser = {
        ...userDoc,
        credentialID: verification.registrationInfo.credential.id,
        credentialPublicKey: isoBase64URL.fromBuffer(verification.registrationInfo.credential.publicKey),
        counter: verification.registrationInfo.credential.counter,
        transports: response.response.transports || [],
        challenge: undefined, // Remove the challenge
        updatedAt: new Date().toISOString(),
      };

      // Save the updated user document to Cloudant
      await couchDBClient.saveDocument("maia_users", updatedUser);


      res.json({
        success: true,
        message: "Passkey registration successful",
        user: {
          userId: updatedUser.userId,
          displayName: updatedUser.displayName,
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
      return res.status(404).json({ error: "User not found" });
    }

    if (!userDoc.credentialID) {
      return res.status(400).json({ error: "User has no registered passkey" });
    }

    // Generate authentication options
    // In v13, credentialID should be stored as a base64url string
    if (typeof userDoc.credentialID !== "string") {
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

      
      // Explicitly save the session
      req.session.save((err) => {
        if (err) {
          console.error('❌ [passkey] Error saving session:', err);
        } else {
        }
      });
      
      // GroupFilter: Log user sign in and group chat count
      try {
        const allChats = await couchDBClient.getAllChats();
        const userChats = allChats.filter(chat => {
          if (typeof chat.currentUser === 'string') {
            return chat.currentUser === updatedUser.userId;
          } else if (typeof chat.currentUser === 'object' && chat.currentUser !== null) {
            return chat.currentUser.userId === updatedUser.userId || chat.currentUser.displayName === updatedUser.userId;
          }
          return false;
        });
        console.log(`GroupFilter: SIGN_IN - User: ${updatedUser.userId} - Chats visible: ${userChats.length}`);
      } catch (error) {
        console.error("GroupFilter: Error getting group chats:", error);
      }
      
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
          userId: updatedUser.userId,
          displayName: updatedUser.displayName,
        },
      };
      
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
        console.log('🔍 [passkey] Deep link user detected:', {
          userId: req.session.userId,
          sessionType: req.session.sessionType,
          deepLinkId: req.session.deepLinkId
        });
        
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
        console.log('🔍 [passkey] Current user:', {
          userId: req.session.userId,
          userName: req.session.userName,
          sessionType: req.session.sessionType,
          deepLinkId: req.session.deepLinkId
        });
        
        // Session is managed in-memory only (maia_sessions database removed)
        
        res.json({
          authenticated: true,
          user: {
            userId: userDoc._id, // Use _id instead of userId
            displayName: userDoc.displayName || userDoc._id,
          },
        });
      } else {
        // Session exists but user document not found, clear session
        req.session.destroy();
        res.json({ authenticated: false, message: "User not found" });
      }
    } else {
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
    
    if (req.session) {
      const userId = req.session.userId;
      
      // GroupFilter: Log user sign out and group chat count before destroying session
      try {
        const allChats = await couchDBClient.getAllChats();
        const userChats = allChats.filter(chat => {
          if (typeof chat.currentUser === 'string') {
            return chat.currentUser === userId;
          } else if (typeof chat.currentUser === 'object' && chat.currentUser !== null) {
            return chat.currentUser.userId === userId || chat.currentUser.displayName === userId;
          }
          return false;
        });
        console.log(`GroupFilter: SIGN_OUT - User: ${userId} - Chats visible: ${userChats.length}`);
      } catch (error) {
        console.error("GroupFilter: Error getting group chats:", error);
      }
      
      req.session.destroy(async (err) => {
        if (err) {
          console.error("❌ Error destroying session:", err);
          return res.status(500).json({ error: "Failed to logout" });
        }
        
        // Session management is now in-memory only (maia_sessions database removed)
        
        // Send a message to the browser console after session destruction
        res.json({ 
          success: true, 
          message: "Logged out successfully",
          consoleMessage: `🔍 Backend Logout: Session destroyed for ${userId} | Now: No session`
        });
      });
    } else {
      res.json({ success: true, message: "No active session" });
    }
  } catch (error) {
    console.error("❌ Error during logout:", error);
    res.status(500).json({ error: "Failed to logout" });
  }
});

export default router;
