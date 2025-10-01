import express from 'express';
import fetch from 'node-fetch';
import { cacheManager } from '../utils/CacheManager.js';
import { activeSessions, createSession, removeSession, logSessionEvent, addUpdateToSession, addUpdateToUser, addUpdateToAllAdmins, getPendingUpdates } from '../../server.js';

const router = express.Router();

// Get the CouchDB client from the main server
let couchDBClient = null;

// Function to set the client (called from main server)
export const setCouchDBClient = (client) => {
  couchDBClient = client;
};

/**
 * Verify admin password for ownership transfer operations
 */
const verifyAdminPassword = (req, res, next) => {
  const { adminPassword } = req.body;
  
  if (!adminPassword) {
    return res.status(400).json({ 
      error: 'Admin password required',
      requiresAdminAuth: true
    });
  }
  
  const expectedPassword = process.env.ADMIN_PASSWORD;
  
  if (!expectedPassword) {
    console.error('❌ ADMIN_PASSWORD environment variable not set');
    return res.status(500).json({ 
      error: 'Admin authentication not configured',
      requiresAdminAuth: true
    });
  }
  
  if (adminPassword !== expectedPassword) {
    return res.status(403).json({ 
      error: 'Invalid admin password',
      requiresAdminAuth: true
    });
  }
  
  next();
};

/**
 * Transfer KB ownership to a new user
 */
router.post('/transfer-kb-ownership', verifyAdminPassword, async (req, res) => {
  try {
    const { kbId, newOwner, displayName } = req.body;
    
    if (!kbId || !newOwner || !displayName) {
      return res.status(400).json({ 
        error: 'kbId, newOwner, and displayName are required' 
      });
    }
    
    
    // Get the current KB document
    let kbDoc;
    try {
      kbDoc = await couchDBClient.getDocument("maia_knowledge_bases", kbId);
    } catch (error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: 'Knowledge base not found' });
      }
      throw error;
    }
    
    if (!kbDoc) {
      return res.status(404).json({ error: 'Knowledge base not found' });
    }
    
    // Record the transfer details
    const transferRecord = {
      _id: `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      kbId: kbId,
      kbName: kbDoc.kbName || kbDoc.name,
      previousOwner: kbDoc.owner || 'unknown',
      newOwner: newOwner,
      displayName: displayName,
      transferredBy: 'admin',
      transferredAt: new Date().toISOString(),
      adminPasswordUsed: true
    };
    
    // Update the KB document with new ownership
    const updatedKbDoc = {
      ...kbDoc,
      owner: newOwner,
      displayName: displayName,
      isProtected: true,
      updatedAt: new Date().toISOString(),
      lastTransfer: {
        from: kbDoc.owner || 'unknown',
        to: newOwner,
        at: new Date().toISOString(),
        by: 'admin'
      }
    };
    
    // Save both documents
    await couchDBClient.saveDocument("maia_knowledge_bases", updatedKbDoc);
    await couchDBClient.saveDocument("maia_kb_transfers", transferRecord);
    
    
    res.json({
      success: true,
      message: `Knowledge base ownership transferred to ${newOwner}`,
      transfer: {
        kbId: kbId,
        kbName: kbDoc.kbName || kbDoc.name,
        previousOwner: kbDoc.owner || 'unknown',
        newOwner: newOwner,
        displayName: displayName,
        transferredAt: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ [ADMIN] Error transferring KB ownership:', error);
    res.status(500).json({ error: 'Failed to transfer knowledge base ownership' });
  }
});

/**
 * Get transfer history for audit purposes
 */
router.get('/transfer-history', verifyAdminPassword, async (req, res) => {
  try {
    const transfers = await couchDBClient.getAllDocuments('maia_kb_transfers');
    
    res.json({
      success: true,
      transfers: transfers.map(transfer => ({
        id: transfer._id,
        kbId: transfer.kbId,
        kbName: transfer.kbName,
        previousOwner: transfer.previousOwner,
        newOwner: transfer.newOwner,
        displayName: transfer.displayName,
        transferredAt: transfer.transferredAt,
        transferredBy: transfer.transferredBy
      }))
    });
    
  } catch (error) {
    console.error('❌ [ADMIN] Error fetching transfer history:', error);
    res.status(500).json({ error: 'Failed to fetch transfer history' });
  }
});

/**
 * Verify admin password without performing any action
 */
router.post('/verify-admin', async (req, res) => {
  try {
    const { adminPassword } = req.body;
    
    if (!adminPassword) {
      return res.status(400).json({ 
        error: 'Admin password required',
        requiresAdminAuth: true
      });
    }
    
    const expectedPassword = process.env.ADMIN_PASSWORD;
    
    if (!expectedPassword) {
      return res.status(500).json({ 
        error: 'Admin authentication not configured',
        requiresAdminAuth: true
      });
    }
    
    if (adminPassword !== expectedPassword) {
      return res.status(403).json({ 
        error: 'Invalid admin password',
        requiresAdminAuth: true
      });
    }
    
    res.json({
      success: true,
      message: 'Admin password verified successfully'
    });
    
  } catch (error) {
    console.error('❌ [ADMIN] Error verifying admin password:', error);
    res.status(500).json({ error: 'Failed to verify admin password' });
  }
});

// Admin approval request endpoint
router.post('/request-approval', async (req, res) => {
  try {
    const { username, email, requestType, message } = req.body;
    
    if (!username || !requestType) {
      return res.status(400).json({
        success: false,
        message: 'Username and request type are required'
      });
    }

    // Determine the base URL dynamically from the request
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3001';
    const baseUrl = `${protocol}://${host}`;

    // Send email notification to admin using Resend
    const emailData = {
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: process.env.RESEND_ADMIN_EMAIL || 'agropper@healthurl.com',
      subject: `MAIA2 Admin Approval Request: ${requestType}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">🔒 MAIA2 Administrator Approval Request</h2>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #34495e; margin-top: 0;">Request Details</h3>
            <p><strong>Request Type:</strong> ${requestType}</p>
            <p><strong>Username:</strong> ${username}</p>
            <p><strong>User Email:</strong> ${email || 'No email provided'}</p>
            <p><strong>Request Date:</strong> ${new Date().toLocaleString()}</p>
          </div>
          
          <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #27ae60; margin-top: 0;">User Message</h3>
            <p>${message}</p>
          </div>
          
          <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #856404; margin-top: 0;">Action Required</h3>
            <p>Please review this request and either:</p>
            <ul>
              <li>Approve the user's access to private AI agents and knowledge bases</li>
              <li>Contact the user for additional information</li>
              <li>Deny the request with a reason</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <p style="color: #7f8c8d; font-size: 14px;">
              This is an automated notification from the MAIA2 system.
            </p>
          </div>
          
          <div style="background-color: #f1f2f6; padding: 20px; border-radius: 8px; margin: 20px 0; border-top: 3px solid #3498db;">
            <h3 style="color: #2c3e50; margin-top: 0;">🔧 Administrator Actions</h3>
            <p>To manage this user and other private AI requests:</p>
            <div style="text-align: center; margin: 20px 0;">
              <a href="${baseUrl}/admin2" 
                 style="background-color: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; margin-right: 10px;">
                Access Admin Panel
              </a>
              <a href="${baseUrl}/admin2/user/${username}" 
                 style="background-color: #e74c3c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                View User Details
              </a>
            </div>
            <p style="font-size: 14px; color: #7f8c8d;">
              <strong>Note:</strong> You must be authenticated with admin privileges to access the panel.
            </p>
          </div>
        </div>
      `
    };

    // Send email using Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY || 're_GpLZHw5L_BcL5NLwWV4WJrmoN6qWzTjiF'}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailData),
    });

    if (!resendResponse.ok) {
      const errorData = await resendResponse.text();
      console.error('Resend API error:', resendResponse.status, errorData);
      throw new Error(`Failed to send email: ${resendResponse.status}`);
    }

    const resendResult = await resendResponse.json();

        // Update user document with email and workflow stage if provided
        if (email && email.trim()) {
          try {
            if (couchDBClient) {
              const userDoc = await cacheManager.getDocument(couchDBClient, 'maia_users', username);
              if (userDoc) {
                userDoc.email = email.trim();
                userDoc.workflowStage = 'awaiting_approval'; // Update workflow stage
                await cacheManager.saveDocument(couchDBClient, 'maia_users', userDoc);
              }
            }
          } catch (userUpdateError) {
            console.error(`❌ Failed to update user ${username} workflow stage:`, userUpdateError.message);
          }
        }

        // Note: Approval request logging removed - email notification is sufficient

        res.json({
          success: true,
          message: 'Approval request sent successfully',
          emailId: resendResult.id
        });

  } catch (error) {
    console.error('❌ Error processing admin approval request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process approval request',
      error: error.message
    });
  }
});

// General contact/support email endpoint
router.post('/contact-support', async (req, res) => {
  try {
    const { username, email, subject, message, messageType = 'general_question' } = req.body;
    
    if (!username || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Username, subject, and message are required'
      });
    }

    // Determine the base URL dynamically from the request
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3001';
    const baseUrl = `${protocol}://${host}`;

    // Send email notification to admin using Resend
    const emailData = {
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: process.env.RESEND_ADMIN_EMAIL || 'agropper@healthurl.com',
      subject: `MAIA2 Contact Form: ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2c3e50;">📧 MAIA2 Contact Form Submission</h2>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #34495e; margin-top: 0;">Contact Details</h3>
            <p><strong>Username:</strong> ${username}</p>
            <p><strong>User Email:</strong> ${email || 'No email provided'}</p>
            <p><strong>Message Type:</strong> ${messageType}</p>
            <p><strong>Subject:</strong> ${subject}</p>
            <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
          </div>
          
          <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #27ae60; margin-top: 0;">Message</h3>
            <p style="white-space: pre-wrap;">${message}</p>
          </div>
          
          <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #856404; margin-top: 0;">Response Required</h3>
            <p>Please review this message and respond to the user as appropriate:</p>
            <ul>
              <li>Answer their question or provide guidance</li>
              <li>Contact them directly if needed</li>
              <li>Log the interaction for future reference</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <p style="color: #7f8c8d; font-size: 14px;">
              This is an automated notification from the MAIA2 contact form.
            </p>
          </div>
          
          <div style="background-color: #f1f2f6; padding: 20px; border-radius: 8px; margin: 20px 0; border-top: 3px solid #3498db;">
            <h3 style="color: #2c3e50; margin-top: 0;">🔧 Administrator Actions</h3>
            <p>To manage this and other contact requests:</p>
            <div style="text-align: center; margin: 20px 0;">
              <a href="${baseUrl}/admin2" 
                 style="background-color: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Access Admin Panel
              </a>
            </div>
            <p style="font-size: 14px; color: #7f8c8d;">
              <strong>Note:</strong> You must be authenticated with admin privileges to access the panel.
            </p>
          </div>
        </div>
      `
    };

    // Send email using Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY || 're_GpLZHw5L_BcL5NLwWV4WJrmoN6qWzTjiF'}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailData),
    });

    if (!resendResponse.ok) {
      const errorData = await resendResponse.text();
      console.error('Resend API error:', resendResponse.status, errorData);
      throw new Error(`Failed to send email: ${resendResponse.status}`);
    }

    const resendResult = await resendResponse.json();

    res.json({
      success: true,
      message: 'Contact message sent successfully',
      emailId: resendResult.id
    });

  } catch (error) {
    console.error('❌ Error processing contact request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process contact request',
      error: error.message
    });
  }
});

// Session management API endpoints
router.get('/sessions', (req, res) => {
  try {
    res.json({
      sessions: activeSessions,
      total: activeSessions.length,
      byType: {
        private: activeSessions.filter(s => s.userType === 'private').length,
        admin: activeSessions.filter(s => s.userType === 'admin').length,
        deepLink: activeSessions.filter(s => s.userType === 'deep_link').length,
        public: activeSessions.filter(s => s.userType === 'public').length
      }
    });
  } catch (error) {
    console.error('Failed to get sessions:', error);
    res.status(500).json({ error: 'Failed to get sessions' });
  }
});

router.delete('/sessions/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = activeSessions.find(s => s.sessionId === sessionId);
    
    if (session) {
      removeSession(sessionId);
      res.json({ success: true, message: 'Session destroyed' });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  } catch (error) {
    console.error('Failed to destroy session:', error);
    res.status(500).json({ error: 'Failed to destroy session' });
  }
});

router.get('/session-logs', async (req, res) => {
  try {
    // TODO: Implement session logs retrieval from maia_session_logs database
    res.json({ 
      logs: [], 
      total: 0,
      message: 'Session logs endpoint ready - database integration pending'
    });
  } catch (error) {
    console.error('Failed to get session logs:', error);
    res.status(500).json({ error: 'Failed to get session logs' });
  }
});

// Test endpoint to create sample sessions (for development)
router.post('/sessions/test', (req, res) => {
  try {
    const testSessions = [
      {
        userId: 'ag30',
        username: 'ag30',
        userEmail: 'ag30@example.com'
      },
      {
        userId: 'admin',
        username: 'admin',
        userEmail: 'admin@example.com'
      },
      {
        userId: 'deep_link_12345',
        username: 'John Doe',
        userEmail: 'john@example.com',
        shareId: 'chat-12345'
      }
    ];
    
    testSessions.forEach((userData, index) => {
      let userType = 'private';
      if (userData.userId === 'admin') userType = 'admin';
      if (userData.userId.startsWith('deep_link_')) userType = 'deep_link';
      
      createSession(userType, userData, req);
    });
    
    res.json({ 
      success: true, 
      message: `Created ${testSessions.length} test sessions`,
      totalSessions: activeSessions.length
    });
  } catch (error) {
    console.error('Failed to create test sessions:', error);
    res.status(500).json({ error: 'Failed to create test sessions' });
  }
});

// Polling endpoint for real-time updates
router.get('/poll/updates', (req, res) => {
  try {
    const { sessionId, lastPoll } = req.query;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId parameter required' });
    }
    
    const result = getPendingUpdates(sessionId, lastPoll);
    
    console.log(`[POLLING] Session ${sessionId} polled - returning ${result.updates.length} updates`);
    
    res.json(result);
  } catch (error) {
    console.error('Failed to get pending updates:', error);
    res.status(500).json({ error: 'Failed to get pending updates' });
  }
});

// Test endpoint to add sample updates
router.post('/poll/test-update', (req, res) => {
  try {
    const { sessionId, updateType = 'test_update', updateData = {} } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId required' });
    }
    
    const update = addUpdateToSession(sessionId, updateType, {
      message: 'This is a test update',
      timestamp: new Date().toISOString(),
      ...updateData
    });
    
    res.json({ 
      success: true, 
      message: 'Test update added',
      update: update
    });
  } catch (error) {
    console.error('Failed to add test update:', error);
    res.status(500).json({ error: 'Failed to add test update' });
  }
});

export default router;
