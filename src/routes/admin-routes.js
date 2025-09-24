import express from 'express';
import fetch from 'node-fetch';

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
              <a href="${process.env.ADMIN_BASE_URL || 'http://localhost:3001'}/admin" 
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

    // Update user document with email if provided (separate from approval request logging)
    if (email && email.trim()) {
      try {
        if (couchDBClient) {
          console.log(`[EMAIL UPDATE] Attempting to update email for user ${username}: ${email}`);
          const userDoc = await couchDBClient.getDocument('maia_users', username);
          if (userDoc) {
            userDoc.email = email.trim();
            await couchDBClient.saveDocument('maia_users', userDoc);
            console.log(`[EMAIL UPDATE] ✅ Successfully updated email for user ${username}: ${email}`);
          } else {
            console.warn(`[EMAIL UPDATE] ❌ User document not found for ${username}`);
          }
        } else {
          console.warn(`[EMAIL UPDATE] ❌ CouchDB client not available`);
        }
      } catch (userUpdateError) {
        console.error(`[EMAIL UPDATE] ❌ Could not update email for user ${username}:`, userUpdateError.message);
      }
    } else {
      console.log(`[EMAIL UPDATE] No email provided for user ${username}`);
    }

    // Log the approval request in the database (optional)
    try {
      if (couchDBClient) {
        const approvalRequest = {
          _id: `approval_request_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'admin_approval_request',
          username,
          email,
          requestType,
          message,
          status: 'pending',
          requestedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          emailSent: true,
          emailId: resendResult.id
        };

        await couchDBClient.saveDocument('maia2_admin_approvals', approvalRequest);
        console.log(`[APPROVAL REQUEST] ✅ Logged approval request for ${username}`);
      }
    } catch (dbError) {
      console.warn('⚠️ Failed to log approval request to database:', dbError.message);
      // Don't fail the request if database logging fails
    }

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
              <a href="${process.env.ADMIN_BASE_URL || 'http://localhost:3001'}/admin" 
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

export default router;
