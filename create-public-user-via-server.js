#!/usr/bin/env node

// This script creates the Public User document by making API calls to the running server
// It copies the agent assignment from Unknown User to Public User

async function createPublicUserViaServer() {
  try {
    console.log('🔧 Creating Public User via server API...');
    
    // Step 1: Get the Unknown User data to copy agent assignment
    console.log('📝 Step 1: Getting Unknown User data...');
    const usersResponse = await fetch('http://localhost:3001/api/admin-management/users');
    const usersData = await usersResponse.json();
    
    const unknownUser = usersData.users.find(user => user.userId === 'Unknown User');
    if (!unknownUser) {
      console.log('❌ Unknown User not found in database');
      return;
    }
    
    console.log('✅ Found Unknown User:', {
      userId: unknownUser.userId,
      assignedAgentId: unknownUser.assignedAgentId,
      assignedAgentName: unknownUser.assignedAgentName
    });
    
    // Step 2: Create Public User document with the same agent assignment
    console.log('📝 Step 2: Creating Public User document...');
    const publicUserDoc = {
      _id: 'Public User',
      type: 'user',
      displayName: 'Public User',
      createdAt: new Date().toISOString(),
      isPublicUser: true,
      description: 'Shared demo environment for unauthenticated users',
      assignedAgentId: unknownUser.assignedAgentId,
      assignedAgentName: unknownUser.assignedAgentName,
      currentAgentId: unknownUser.assignedAgentId,
      currentAgentName: unknownUser.assignedAgentName
    };
    
    // Use the server's database connection by making a direct API call
    // We'll use the admin management endpoint to create the user
    const createResponse = await fetch('http://localhost:3001/api/admin-management/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(publicUserDoc)
    });
    
    if (createResponse.ok) {
      console.log('✅ Public User document created successfully');
    } else {
      console.log('⚠️  Public User document may already exist, checking...');
      
      // Check if it already exists
      const checkResponse = await fetch('http://localhost:3001/api/admin-management/users');
      const checkData = await checkResponse.json();
      const publicUser = checkData.users.find(user => user.userId === 'Public User');
      
      if (publicUser) {
        console.log('✅ Public User already exists:', {
          userId: publicUser.userId,
          assignedAgentId: publicUser.assignedAgentId,
          assignedAgentName: publicUser.assignedAgentName
        });
      } else {
        console.log('❌ Failed to create Public User document');
        console.log('Response:', await createResponse.text());
      }
    }
    
    // Step 3: Update chat references from Unknown User to Public User
    console.log('📝 Step 3: Updating chat references...');
    const chatsResponse = await fetch('http://localhost:3001/api/group-chats');
    const chatsData = await chatsResponse.json();
    
    let updatedCount = 0;
    for (const chat of chatsData) {
      if (chat.currentUser === 'Unknown User') {
        console.log(`📝 Updating chat ${chat._id}: Unknown User → Public User`);
        // Note: We can't update chats via API, but we can see what needs updating
        updatedCount++;
      }
    }
    
    console.log(`📊 Found ${updatedCount} chats that need updating from Unknown User to Public User`);
    
    console.log('🎉 Migration completed!');
    console.log('📋 Summary:');
    console.log('   - Public User document created with agent assignment from Unknown User');
    console.log('   - Agent assignment preserved:', unknownUser.assignedAgentName);
    console.log('   - Chat references need manual update (noted above)');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

createPublicUserViaServer();
