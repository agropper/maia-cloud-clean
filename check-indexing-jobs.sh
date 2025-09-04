#!/bin/bash

# Check indexing jobs directly from DigitalOcean API
LOG_FILE="indexing-progress-proper-20250902-001257.log"

echo "" | tee -a "$LOG_FILE"
echo "🔍 DIRECT DIGITALOCEAN API CALL - $(date)" | tee -a "$LOG_FILE"
echo "==========================================" | tee -a "$LOG_FILE"

# Check if we have the DigitalOcean token
if [ -z "$DIGITALOCEAN_TOKEN" ]; then
    echo "❌ DIGITALOCEAN_TOKEN environment variable not set" | tee -a "$LOG_FILE"
    echo "🔍 Trying to read from .env file..." | tee -a "$LOG_FILE"
    
    if [ -f ".env" ]; then
        export $(cat .env | grep -v '^#' | xargs)
        echo "✅ Loaded environment variables from .env" | tee -a "$LOG_FILE"
    else
        echo "❌ No .env file found" | tee -a "$LOG_FILE"
        exit 1
    fi
fi

if [ -z "$DIGITALOCEAN_TOKEN" ]; then
    echo "❌ Still no DIGITALOCEAN_TOKEN available" | tee -a "$LOG_FILE"
    exit 1
fi

echo "🔑 Using DigitalOcean token: ${DIGITALOCEAN_TOKEN:0:10}..." | tee -a "$LOG_FILE"

# Make the direct API call to list indexing jobs
echo "🚀 Calling DigitalOcean API: GET /v2/gen-ai/indexing_jobs" | tee -a "$LOG_FILE"

API_RESPONSE=$(curl -s -X GET \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DIGITALOCEAN_TOKEN" \
  "https://api.digitalocean.com/v2/gen-ai/indexing_jobs")

if [ $? -eq 0 ]; then
    echo "✅ API call successful" | tee -a "$LOG_FILE"
    echo "📊 Response:" | tee -a "$LOG_FILE"
    echo "$API_RESPONSE" | tee -a "$LOG_FILE"
    
    # Parse the response to extract key information
    echo "" | tee -a "$LOG_FILE"
    echo "🔍 Parsing response..." | tee -a "$LOG_FILE"
    
    # Check if there are any jobs
    JOB_COUNT=$(echo "$API_RESPONSE" | grep -o '"total":[0-9]*' | cut -d':' -f2)
    if [ -n "$JOB_COUNT" ]; then
        echo "📊 Total indexing jobs: $JOB_COUNT" | tee -a "$LOG_FILE"
    else
        echo "📊 No 'total' field found in response" | tee -a "$LOG_FILE"
    fi
    
    # Check if there are jobs array
    if echo "$API_RESPONSE" | grep -q '"jobs"'; then
        echo "✅ Found 'jobs' array in response" | tee -a "$LOG_FILE"
        
        # Extract job details
        echo "" | tee -a "$LOG_FILE"
        echo "📋 Indexing Jobs Details:" | tee -a "$LOG_FILE"
        
        # Use jq if available, otherwise basic parsing
        if command -v jq &> /dev/null; then
            echo "🔧 Using jq for detailed parsing..." | tee -a "$LOG_FILE"
            echo "$API_RESPONSE" | jq '.' | tee -a "$LOG_FILE"
        else
            echo "🔧 Basic parsing (jq not available)..." | tee -a "$LOG_FILE"
            
            # Extract basic job information
            echo "$API_RESPONSE" | grep -o '"uuid":"[^"]*"' | while read -r line; do
                UUID=$(echo "$line" | cut -d'"' -f4)
                echo "   📊 Job UUID: $UUID" | tee -a "$LOG_FILE"
            done
            
            # Extract status information
            echo "$API_RESPONSE" | grep -o '"status":"[^"]*"' | while read -r line; do
                STATUS=$(echo "$line" | cut -d'"' -f4)
                echo "   📊 Status: $STATUS" | tee -a "$LOG_FILE"
            done
            
            # Extract token information
            echo "$API_RESPONSE" | grep -o '"tokens":[0-9]*' | while read -r line; do
                TOKENS=$(echo "$line" | cut -d':' -f2)
                echo "   📊 Tokens: $TOKENS" | tee -a "$LOG_FILE"
            done
        fi
    else
        echo "⚠️ No 'jobs' array found in response" | tee -a "$LOG_FILE"
        echo "🔍 Response structure:" | tee -a "$LOG_FILE"
        echo "$API_RESPONSE" | grep -o '"[^"]*"' | sort | uniq | tee -a "$LOG_FILE"
    fi
    
else
    echo "❌ API call failed" | tee -a "$LOG_FILE"
    echo "🔍 Error details:" | tee -a "$LOG_FILE"
    echo "$API_RESPONSE" | tee -a "$LOG_FILE"
fi

echo "==========================================" | tee -a "$LOG_FILE"
echo "✅ Direct API check completed" | tee -a "$LOG_FILE"
