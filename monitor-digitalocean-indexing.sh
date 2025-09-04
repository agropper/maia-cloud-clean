#!/bin/bash

# Monitor indexing jobs directly from DigitalOcean API
LOG_FILE="digitalocean-indexing-monitor-$(date +%Y%m%d-%H%M%S).log"
KB_NAME="test-large-file-1756785763276"
START_TIME=$(date +%s)

echo "🚀 Starting DigitalOcean Indexing Jobs Monitor for KB: $KB_NAME" | tee -a "$LOG_FILE"
echo "📅 Start time: $(date)" | tee -a "$LOG_FILE"
echo "📁 Log file: $LOG_FILE" | tee -a "$LOG_FILE"
echo "⏱️  Monitoring every 30 seconds using DigitalOcean API directly..." | tee -a "$LOG_FILE"
echo "🔗 API Endpoint: https://api.digitalocean.com/v2/gen-ai/indexing_jobs" | tee -a "$LOG_FILE"
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

# Function to get elapsed time
get_elapsed_time() {
    local current_time=$(date +%s)
    local elapsed=$((current_time - START_TIME))
    local minutes=$((elapsed / 60))
    local seconds=$((elapsed % 60))
    printf "%02d:%02d" $minutes $seconds
}

# Function to check indexing jobs directly from DigitalOcean API
check_digitalocean_indexing() {
    local check_count=$1
    local elapsed_time=$(get_elapsed_time)
    
    echo "" | tee -a "$LOG_FILE"
    echo "📊 [Check #$check_count] Direct DigitalOcean API call at $(date) (Elapsed: $elapsed_time)" | tee -a "$LOG_FILE"
    
    # Make the direct API call to list indexing jobs
    echo "🚀 Calling: GET https://api.digitalocean.com/v2/gen-ai/indexing_jobs" | tee -a "$LOG_FILE"
    
    API_RESPONSE=$(curl -s -X GET \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $DIGITALOCEAN_TOKEN" \
      "https://api.digitalocean.com/v2/gen-ai/indexing_jobs")
    
    if [ $? -eq 0 ]; then
        echo "✅ API call successful" | tee -a "$LOG_FILE"
        
        # Check if there are any jobs
        JOB_COUNT=$(echo "$API_RESPONSE" | grep -o '"total":[0-9]*' | cut -d':' -f2)
        if [ -n "$JOB_COUNT" ]; then
            echo "📊 Total indexing jobs: $JOB_COUNT" | tee -a "$LOG_FILE"
        fi
        
        # Look for our specific KB in the jobs
        if echo "$API_RESPONSE" | grep -q "$KB_NAME"; then
            echo "🎯 Found our KB in the indexing jobs!" | tee -a "$LOG_FILE"
        fi
        
        # Extract job details for our KB (by UUID pattern)
        echo "🔍 Looking for jobs related to our test KB..." | tee -a "$LOG_FILE"
        
        # Use jq if available for better parsing
        if command -v jq &> /dev/null; then
            echo "🔧 Using jq for detailed parsing..." | tee -a "$LOG_FILE"
            
            # Filter jobs for our specific KB
            OUR_KB_JOBS=$(echo "$API_RESPONSE" | jq -r '.jobs[] | select(.knowledge_base_uuid | contains("adb49d55-87b1-11f0-b074-4e013e2ddde4")) | {uuid, status, phase, created_at, started_at, finished_at}')
            
            if [ -n "$OUR_KB_JOBS" ] && [ "$OUR_KB_JOBS" != "null" ]; then
                echo "🎯 Our KB Indexing Jobs:" | tee -a "$LOG_FILE"
                echo "$OUR_KB_JOBS" | jq '.' | tee -a "$LOG_FILE"
            else
                echo "⚠️ No indexing jobs found for our KB yet" | tee -a "$LOG_FILE"
            fi
        else
            echo "🔧 Basic parsing (jq not available)..." | tee -a "$LOG_FILE"
            echo "📊 Raw response (first 500 chars):" | tee -a "$LOG_FILE"
            echo "${API_RESPONSE:0:500}..." | tee -a "$LOG_FILE"
        fi
        
        # Check if any jobs are in progress
        if echo "$API_RESPONSE" | grep -q '"status":"INDEX_JOB_STATUS_IN_PROGRESS"'; then
            echo "🔄 Found jobs in progress!" | tee -a "$LOG_FILE"
        fi
        
        # Check if any jobs are completed
        if echo "$API_RESPONSE" | grep -q '"status":"INDEX_JOB_STATUS_COMPLETED"'; then
            echo "✅ Found completed jobs!" | tee -a "$LOG_FILE"
        fi
        
    else
        echo "❌ API call failed" | tee -a "$LOG_FILE"
        echo "🔍 Error details:" | tee -a "$LOG_FILE"
        echo "$API_RESPONSE" | tee -a "$LOG_FILE"
    fi
    
    echo "==========================================" | tee -a "$LOG_FILE"
}

# Main monitoring loop
check_count=1
max_checks=120  # Monitor for up to 60 minutes (120 * 30 seconds)

while [ $check_count -le $max_checks ]; do
    check_digitalocean_indexing $check_count
    
    # Wait 30 seconds
    sleep 30
    
    check_count=$((check_count + 1))
done

echo "" | tee -a "$LOG_FILE"
echo "⏰ Monitoring completed after $max_checks checks" | tee -a "$LOG_FILE"
echo "📁 Final log saved to: $LOG_FILE" | tee -a "$LOG_FILE"
echo "🎯 Total monitoring time: $(get_elapsed_time)" | tee -a "$LOG_FILE"
