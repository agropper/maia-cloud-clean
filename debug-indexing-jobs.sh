#!/bin/bash

# Debug script to call DigitalOcean API directly and log the request/response
DEBUG_LOG_FILE="debug-indexing-jobs-$(date +%Y%m%d-%H%M%S).log"

echo "🔍 DEBUG: Calling DigitalOcean Indexing Jobs API" | tee -a "$DEBUG_LOG_FILE"
echo "📅 Time: $(date)" | tee -a "$DEBUG_LOG_FILE"
echo "📁 Log file: $DEBUG_LOG_FILE"
echo "==========================================" | tee -a "$DEBUG_LOG_FILE"

# Check if we have the DigitalOcean token
if [ -z "$DIGITALOCEAN_TOKEN" ]; then
    echo "❌ DIGITALOCEAN_TOKEN environment variable not set" | tee -a "$DEBUG_LOG_FILE"
    echo "🔍 Trying to read from .env file..." | tee -a "$DEBUG_LOG_FILE"
    
    if [ -f ".env" ]; then
        export $(cat .env | grep -v '^#' | xargs)
        echo "✅ Loaded environment variables from .env" | tee -a "$DEBUG_LOG_FILE"
    else
        echo "❌ No .env file found" | tee -a "$DEBUG_LOG_FILE"
        exit 1
    fi
fi

if [ -z "$DIGITALOCEAN_TOKEN" ]; then
    echo "❌ Still no DIGITALOCEAN_TOKEN available" | tee -a "$DEBUG_LOG_FILE"
    exit 1
fi

echo "🔑 Using DigitalOcean token: ${DIGITALOCEAN_TOKEN:0:10}..." | tee -a "$DEBUG_LOG_FILE"

# Log the API call details
echo "" | tee -a "$DEBUG_LOG_FILE"
echo "🚀 MAKING API CALL:" | tee -a "$DEBUG_LOG_FILE"
echo "   Method: GET" | tee -a "$DEBUG_LOG_FILE"
echo "   URL: https://api.digitalocean.com/v2/gen-ai/indexing_jobs" | tee -a "$DEBUG_LOG_FILE"
echo "   Headers:" | tee -a "$DEBUG_LOG_FILE"
echo "     Content-Type: application/json" | tee -a "$DEBUG_LOG_FILE"
echo "     Authorization: Bearer ${DIGITALOCEAN_TOKEN:0:10}..." | tee -a "$DEBUG_LOG_FILE"
echo "" | tee -a "$DEBUG_LOG_FILE"

# Make the API call
echo "📡 Executing curl command..." | tee -a "$DEBUG_LOG_FILE"

API_RESPONSE=$(curl -s -X GET \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DIGITALOCEAN_TOKEN" \
  "https://api.digitalocean.com/v2/gen-ai/indexing_jobs")

CURL_EXIT_CODE=$?

echo "✅ Curl command completed with exit code: $CURL_EXIT_CODE" | tee -a "$DEBUG_LOG_FILE"
echo "" | tee -a "$DEBUG_LOG_FILE"

# Log the response
echo "📊 API RESPONSE:" | tee -a "$DEBUG_LOG_FILE"
echo "==========================================" | tee -a "$DEBUG_LOG_FILE"

if [ $CURL_EXIT_CODE -eq 0 ]; then
    echo "✅ API call successful" | tee -a "$DEBUG_LOG_FILE"
    echo "" | tee -a "$DEBUG_LOG_FILE"
    
    # Pretty print the JSON response if jq is available
    if command -v jq &> /dev/null; then
        echo "🔧 Pretty-printed response using jq:" | tee -a "$DEBUG_LOG_FILE"
        echo "$API_RESPONSE" | jq '.' | tee -a "$DEBUG_LOG_FILE"
    else
        echo "🔧 Raw response (jq not available):" | tee -a "$DEBUG_LOG_FILE"
        echo "$API_RESPONSE" | tee -a "$DEBUG_LOG_FILE"
    fi
    
    echo "" | tee -a "$DEBUG_LOG_FILE"
    
    # Basic analysis of the response
echo "🔍 RESPONSE ANALYSIS:" | tee -a "$DEBUG_LOG_FILE"
echo "==========================================" | tee -a "$DEBUG_LOG_FILE"
    
    # Check if there are any jobs
JOB_COUNT=$(echo "$API_RESPONSE" | grep -o '"total":[0-9]*' | cut -d':' -f2)
if [ -n "$JOB_COUNT" ]; then
    echo "📊 Total indexing jobs: $JOB_COUNT" | tee -a "$DEBUG_LOG_FILE"
else
    echo "📊 No 'total' field found in response" | tee -a "$DEBUG_LOG_FILE"
fi
    
    # Check if there are jobs array
if echo "$API_RESPONSE" | grep -q '"jobs"'; then
    echo "✅ Found 'jobs' array in response" | tee -a "$DEBUG_LOG_FILE"
    
    # Count jobs in the array
    JOBS_IN_ARRAY=$(echo "$API_RESPONSE" | grep -o '"uuid"' | wc -l)
    echo "📊 Jobs found in array: $JOBS_IN_ARRAY" | tee -a "$DEBUG_LOG_FILE"
    
    # Look for specific statuses
    if echo "$API_RESPONSE" | grep -q '"status":"INDEX_JOB_STATUS_IN_PROGRESS"'; then
        echo "🔄 Found jobs in progress" | tee -a "$DEBUG_LOG_FILE"
    fi
    
    if echo "$API_RESPONSE" | grep -q '"status":"INDEX_JOB_STATUS_COMPLETED"'; then
        echo "✅ Found completed jobs" | tee -a "$DEBUG_LOG_FILE"
    fi
    
    if echo "$API_RESPONSE" | grep -q '"status":"INDEX_JOB_STATUS_FAILED"'; then
        echo "❌ Found failed jobs" | tee -a "$DEBUG_LOG_FILE"
    fi
    
    if echo "$API_RESPONSE" | grep -q '"status":"INDEX_JOB_STATUS_PENDING"'; then
        echo "⏳ Found pending jobs" | tee -a "$DEBUG_LOG_FILE"
    fi
    
else
    echo "⚠️ No 'jobs' array found in response" | tee -a "$DEBUG_LOG_FILE"
fi
    
    # Look for our specific test KB UUID
if echo "$API_RESPONSE" | grep -q "adb49d55-87b1-11f0-b074-4e013e2ddde4"; then
    echo "🎯 Found our test KB UUID in the response!" | tee -a "$DEBUG_LOG_FILE"
else
    echo "⚠️ Our test KB UUID not found in response" | tee -a "$DEBUG_LOG_FILE"
fi
    
else
    echo "❌ API call failed" | tee -a "$DEBUG_LOG_FILE"
    echo "🔍 Error details:" | tee -a "$DEBUG_LOG_FILE"
    echo "$API_RESPONSE" | tee -a "$DEBUG_LOG_FILE"
fi

echo "" | tee -a "$DEBUG_LOG_FILE"
echo "==========================================" | tee -a "$DEBUG_LOG_FILE"
echo "✅ Debug session completed" | tee -a "$DEBUG_LOG_FILE"
echo "📁 Full log saved to: $DEBUG_LOG_FILE"
