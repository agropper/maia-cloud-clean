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
  console.log("🔍 Setting CouchDB client for passkey routes:", !!client);
  couchDBClient = client;
};

// Relying party configuration
const rpName = "HIEofOne.org";
const rpID = process.env.PASSKEY_RPID || process.env.DOMAIN || (process.env.NODE_ENV === 'production' ? 'maia-cloud-clean-kjho4.ondigitalocean.app' : 'localhost');
const origin = process.env.PASSKEY_ORIGIN || (process.env.HTTPS === 'true' ? 'https://' : 'http://') + (process.env.DOMAIN || (process.env.NODE_ENV === 'production' ? 'maia-cloud-clean-kjho4.ondigitalocean.app' : 'localhost')) + (process.env.PORT ? ':' + process.env.PORT : '');

// Log configuration for debugging
console.log("🔍 Passkey Configuration:");
console.log("  - NODE_ENV:", process.env.NODE_ENV);
console.log("  - rpID:", rpID);
console.log("  - origin:", origin);
console.log("  - ORIGIN env var:", process.env.ORIGIN);

// Add a function to log config on each request for debugging
const logPasskeyConfig = () => {
  console.log("🔍 [REQUEST] Passkey Config - rpID:", rpID, "origin:", origin, "NODE_ENV:", process.env.NODE_ENV);
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
      res.json({
        available: !existingUser,
        message: existingUser
          ? "User ID already exists"
          : "User ID is available",
      });
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
    console.log("🔍 Registration request received");
    const { userId, displayName } = req.body;

    if (!userId || !displayName) {
      console.log("❌ Missing userId or displayName in request");
      return res.status(400).json({ error: "User ID and display name are required" });
    }

    console.log("🔍 Checking if user exists:", userId);

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
      console.log("❌ User already exists:", userId);
      return res.status(400).json({ error: "User ID already exists" });
    }

    console.log("🔍 Generating registration options for:", userId);

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

    console.log("🔍 Registration options generated successfully");

    // Store challenge in session or temporary storage
    // For now, we'll store it in the user document
    const userDoc = {
      _id: userId,
      userId,
      displayName,
      domain: rpID,
      challenge: options.challenge,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    console.log("🔍 Attempting to save user document");

    // Store user document with challenge for verification
    try {
      await couchDBClient.saveDocument("maia_users", userDoc);
      console.log("✅ User document saved successfully");
    } catch (error) {
      console.error("❌ Failed to save user document:", error.message);
      // If database doesn't exist, create it first
      if (error.message.includes("error happened in your connection")) {
        try {
          console.log("🔍 Creating maia_users database...");
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
        updatedAt: new Date().toISOString(),
      };

      // Save the updated user document to Cloudant
      await couchDBClient.saveDocument("maia_users", updatedUser);

      console.log("✅ Passkey registration successful for user:", userId);

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
      req.session.userId = updatedUser.userId;
      req.session.username = updatedUser.userId;
      req.session.displayName = updatedUser.displayName;
      req.session.authenticatedAt = new Date().toISOString();

      console.log(`✅ Session created for user: ${updatedUser.userId}`);
      
      // GroupFilter: Log user sign in and group chat count
      try {
        const allChats = await couchDBClient.getAllChats();
        const groupChats = allChats.filter(chat => chat.type === 'group_chat');
        const userGroupChats = groupChats.filter(chat => chat.currentUser === updatedUser.userId);
        console.log(`GroupFilter: SIGN_IN - User: ${updatedUser.userId} - Group chats visible: ${userGroupChats.length}`);
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

      res.json({
        success: true,
        message: "Authentication successful",
        user: {
          userId: updatedUser.userId,
          displayName: updatedUser.displayName,
        },
      });
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
      userId: userDoc.userId,
      displayName: userDoc.displayName,
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
      // User is authenticated, get current user info
      const userDoc = await couchDBClient.getDocument("maia_users", req.session.userId);
      if (userDoc) {
        // Echo current user to backend console
        console.log(`Current user: ${userDoc.userId}`);
        
        res.json({
          authenticated: true,
          user: {
            userId: userDoc.userId,
            displayName: userDoc.displayName,
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
    console.error("❌ Error checking auth status:", error);
    res.status(500).json({ error: "Failed to check authentication status" });
  }
});

// Logout route to clear session
router.post("/logout", async (req, res) => {
  try {
    console.log(`🚨 BACKEND LOGOUT ENDPOINT HIT at ${new Date().toISOString()}`);
    
    if (req.session) {
      const userId = req.session.userId;
      console.log(`👋 User signed out: ${userId}`);
      
      // GroupFilter: Log user sign out and group chat count before destroying session
      try {
        const allChats = await couchDBClient.getAllChats();
        const groupChats = allChats.filter(chat => chat.type === 'group_chat');
        const userGroupChats = groupChats.filter(chat => chat.currentUser === userId);
        console.log(`GroupFilter: SIGN_OUT - User: ${userId} - Group chats visible: ${userGroupChats.length}`);
      } catch (error) {
        console.error("GroupFilter: Error getting group chats:", error);
      }
      
      req.session.destroy((err) => {
        if (err) {
          console.error("❌ Error destroying session:", err);
          return res.status(500).json({ error: "Failed to logout" });
        }
        console.log(`✅ Session destroyed for user: ${userId}`);
        
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
