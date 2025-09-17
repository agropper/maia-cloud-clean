#!/usr/bin/env node

/**
 * Test script for creating a DigitalOcean agent
 * Usage: node test-agent-creation.js <patient-name> [knowledge-base-id]
 * 
 * Example: node test-agent-creation.js "John Doe"
 * Example: node test-agent-creation.js "Jane Smith" "kb-uuid-here"
 */

const API_BASE_URL = 'http://localhost:3001';

async function createAgent(patientName, knowledgeBaseId = null) {
  try {
    // Convert patient name to lowercase pattern (same as app)
    const cleanPatientName = patientName.toLowerCase().replace(/[^a-z0-9]/g, '');
    console.log(`🤖 Creating agent for patient: ${patientName} (${cleanPatientName})`);
    if (knowledgeBaseId) {
      console.log(`📚 With knowledge base: ${knowledgeBaseId}`);
    }
    
    const requestBody = {
      patientName: patientName,
      ...(knowledgeBaseId && { knowledgeBaseId })
    };
    
    console.log(`📤 Request body:`, JSON.stringify(requestBody, null, 2));
    
    const response = await fetch(`${API_BASE_URL}/api/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Request failed: ${response.status} ${response.statusText}`);
      console.error(`❌ Error details: ${errorText}`);
      return;
    }
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`✅ Agent created successfully!`);
      console.log(`📋 Agent details:`);
      console.log(`   Name: ${result.agent.name}`);
      console.log(`   UUID: ${result.agent.uuid}`);
      console.log(`   Description: ${result.agent.description}`);
      console.log(`   Model UUID: ${result.agent.model_uuid}`);
      console.log(`   Region: ${result.agent.region}`);
      console.log(`   Created: ${result.agent.created_at}`);
    } else {
      console.error(`❌ Agent creation failed: ${result.message}`);
    }
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: node test-agent-creation.js <patient-name> [knowledge-base-id]');
  console.log('');
  console.log('Examples:');
  console.log('  node test-agent-creation.js "John Doe"');
  console.log('  node test-agent-creation.js "Jane Smith" "kb-uuid-here"');
  process.exit(1);
}

const patientName = args[0];
const knowledgeBaseId = args[1] || null;

createAgent(patientName, knowledgeBaseId);
