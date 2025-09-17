#!/usr/bin/env node

/**
 * Simple test script for creating a DigitalOcean agent with hardcoded model UUID
 * Usage: node test-agent-simple.js <patient-name>
 * 
 * Example: node test-agent-simple.js "John Doe"
 */

const API_BASE_URL = 'http://localhost:3001';

async function createAgent(patientName) {
  try {
    console.log(`🤖 Creating agent for patient: ${patientName}`);
    
    // Use the model UUID for OpenAI GPT-oss-120b from the available models
    const modelUuid = '18bc9b8f-73c5-11f0-b074-4e013e2ddde4'; // OpenAI GPT-oss-120b
    
    const requestBody = {
      patientName: patientName,
      model_uuid: modelUuid
    };
    
    console.log(`📤 Request body:`, JSON.stringify(requestBody, null, 2));
    
    const response = await fetch(`${API_BASE_URL}/api/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log(`📡 Response status: ${response.status} ${response.statusText}`);
    console.log(`📡 Response headers:`, Object.fromEntries(response.headers.entries()));
    
    const responseText = await response.text();
    console.log(`📡 Response body:`, responseText);
    
    if (!response.ok) {
      console.error(`❌ Request failed: ${response.status} ${response.statusText}`);
      console.error(`❌ Error details: ${responseText}`);
      return;
    }
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`❌ JSON parse error:`, parseError.message);
      console.error(`❌ Raw response:`, responseText);
      return;
    }
    
    console.log(`✅ Agent created successfully!`);
    console.log(`📋 Agent details:`, JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: node test-agent-simple.js <patient-name>');
  console.log('');
  console.log('Example: node test-agent-simple.js "John Doe"');
  process.exit(1);
}

const patientName = args[0];
createAgent(patientName);
