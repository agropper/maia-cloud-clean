#!/bin/bash

# Monitor indexing progress using DigitalOcean API and save to file
LOG_FILE="indexing-progress-proper-$(date +%Y%m%d-%H%M%S).log"
KB_NAME="test-large-file-1756785763276"
START_TIME=$(date +%s)

echo "🚀 Starting PROPER indexing progress monitor for KB: $KB_NAME" | tee -a "$LOG_FILE"
echo "📅 Start time: $(date)" | tee -a "$LOG_FILE"
echo "📁 Log file: $LOG_FILE" | tee -a "$LOG_FILE"
echo "⏱️  Monitoring every 30 seconds using DigitalOcean API..." | tee -a "$LOG_FILE"
echo "==========================================" | tee -a "$LOG_FILE"

# Function to get elapsed time
get_elapsed_time() {
    local current_time=$(date +%s)
    local elapsed=$((current_time - START_TIME))
    local minutes=$((elapsed / 60))
    local seconds=$((elapsed % 60))
    printf "%02d:%02d" $minutes $seconds
}

# Function to check indexing status using DigitalOcean API
check_indexing_status() {
    local check_count=$1
    local elapsed_time=$(get_elapsed_time)
    
    echo "" | tee -a "$LOG_FILE"
    echo "📊 [Check #$check_count] Status check at $(date) (Elapsed: $elapsed_time)" | tee -a "$LOG_FILE"
    
    # First, get the knowledge base list to find our test KB
    echo "🔍 Fetching knowledge base list..." | tee -a "$LOG_FILE"
    KB_RESPONSE=$(curl -s -X GET "http://localhost:3001/api/knowledge-bases" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        echo "✅ Successfully fetched KB list" | tee -a "$LOG_FILE"
        
        # Try to find our test KB by name
        KB_UUID=$(echo "$KB_RESPONSE" | grep -o '"uuid":"[^"]*"' | head -1 | cut -d'"' -f4)
        
        if [ -n "$KB_UUID" ]; then
            echo "🔍 Found KB UUID: $KB_UUID" | tee -a "$LOG_FILE"
            
            # Now get the actual indexing status using our backend endpoint
            echo "🔍 Fetching indexing status..." | tee -a "$LOG_FILE"
            INDEXING_STATUS=$(curl -s -X GET "http://localhost:3001/api/knowledge-bases/$KB_UUID/indexing-status" 2>/dev/null)
            
            if [ $? -eq 0 ]; then
                echo "✅ Successfully fetched indexing status" | tee -a "$LOG_FILE"
                echo "📊 Response: $INDEXING_STATUS" | tee -a "$LOG_FILE"
                
                # Parse the response to extract key information
                if echo "$INDEXING_STATUS" | grep -q "tokens_processed"; then
                    TOKENS=$(echo "$INDEXING_STATUS" | grep -o '"tokens_processed":[0-9]*' | cut -d':' -f2)
                    STATUS=$(echo "$INDEXING_STATUS" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
                    PHASE=$(echo "$INDEXING_STATUS" | grep -o '"phase":"[^"]*"' | cut -d'"' -f4)
                    
                    echo "🎯 INDEXING PROGRESS:" | tee -a "$LOG_FILE"
                    echo "   📊 Status: $STATUS" | tee -a "$LOG_FILE"
                    echo "   📊 Phase: $PHASE" | tee -a "$LOG_FILE"
                    echo "   📊 Tokens: $TOKENS" | tee -a "$LOG_FILE"
                    
                    # Check if indexing is complete
                    if [ "$STATUS" = "INDEX_JOB_STATUS_COMPLETED" ]; then
                        echo "🎉 INDEXING COMPLETED!" | tee -a "$LOG_FILE"
                        echo "📊 Final tokens processed: $TOKENS" | tee -a "$LOG_FILE"
                        echo "⏱️ Total time: $elapsed_time" | tee -a "$LOG_FILE"
                        return 0  # Signal completion
                    fi
                else
                    echo "⚠️ No indexing progress data found yet" | tee -a "$LOG_FILE"
                fi
            else
                echo "❌ Failed to fetch indexing status" | tee -a "$LOG_FILE"
            fi
        else
            echo "❌ Could not extract KB UUID from response" | tee -a "$LOG_FILE"
        fi
    else
        echo "❌ Failed to fetch KB list" | tee -a "$LOG_FILE"
    fi
    
    echo "==========================================" | tee -a "$LOG_FILE"
    return 1  # Continue monitoring
}

# Main monitoring loop
check_count=1
max_checks=120  # Monitor for up to 60 minutes (120 * 30 seconds)

while [ $check_count -le $max_checks ]; do
    if check_indexing_status $check_count; then
        echo "" | tee -a "$LOG_FILE"
        echo "🎉 INDEXING COMPLETED! Stopping monitor." | tee -a "$LOG_FILE"
        break
    fi
    
    # Wait 30 seconds
    sleep 30
    
    check_count=$((check_count + 1))
done

echo "" | tee -a "$LOG_FILE"
echo "⏰ Monitoring completed after $check_count checks" | tee -a "$LOG_FILE"
echo "📁 Final log saved to: $LOG_FILE" | tee -a "$LOG_FILE"
echo "🎯 Total monitoring time: $(get_elapsed_time)" | tee -a "$LOG_FILE"
