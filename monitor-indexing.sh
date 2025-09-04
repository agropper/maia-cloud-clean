#!/bin/bash

# Monitor indexing progress and save to file
LOG_FILE="indexing-progress-$(date +%Y%m%d-%H%M%S).log"
KB_NAME="test-large-file-1756785763276"
START_TIME=$(date +%s)

echo "🚀 Starting indexing progress monitor for KB: $KB_NAME" | tee -a "$LOG_FILE"
echo "📅 Start time: $(date)" | tee -a "$LOG_FILE"
echo "📁 Log file: $LOG_FILE" | tee -a "$LOG_FILE"
echo "⏱️  Monitoring every 30 seconds..." | tee -a "$LOG_FILE"
echo "==========================================" | tee -a "$LOG_FILE"

# Function to get elapsed time
get_elapsed_time() {
    local current_time=$(date +%s)
    local elapsed=$((current_time - START_TIME))
    local minutes=$((elapsed / 60))
    local seconds=$((elapsed % 60))
    printf "%02d:%02d" $minutes $seconds
}

# Function to check indexing status
check_status() {
    local check_count=$1
    local elapsed_time=$(get_elapsed_time)
    
    echo "" | tee -a "$LOG_FILE"
    echo "📊 [Check #$check_count] Status check at $(date) (Elapsed: $elapsed_time)" | tee -a "$LOG_FILE"
    
    # Get the KB list to find our test KB
    echo "🔍 Fetching knowledge base list..." | tee -a "$LOG_FILE"
    KB_RESPONSE=$(curl -s -X GET "http://localhost:3001/api/knowledge-bases" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        echo "✅ Successfully fetched KB list" | tee -a "$LOG_FILE"
        
        # Try to find our test KB by name
        KB_UUID=$(echo "$KB_RESPONSE" | grep -o '"uuid":"[^"]*"' | head -1 | cut -d'"' -f4)
        
        if [ -n "$KB_UUID" ]; then
            echo "🔍 Found KB UUID: $KB_UUID" | tee -a "$LOG_FILE"
            
            # Get detailed KB info
            echo "🔍 Fetching detailed KB information..." | tee -a "$LOG_FILE"
            KB_DETAILS=$(curl -s -X GET "http://localhost:3001/api/knowledge-bases/$KB_UUID/indexing-status" 2>/dev/null)
            
            if [ $? -eq 0 ]; then
                echo "✅ Successfully fetched KB details" | tee -a "$LOG_FILE"
                echo "📊 Response: $KB_DETAILS" | tee -a "$LOG_FILE"
            else
                echo "❌ Failed to fetch KB details" | tee -a "$LOG_FILE"
            fi
        else
            echo "❌ Could not extract KB UUID from response" | tee -a "$LOG_FILE"
            echo "🔍 Raw response: $KB_RESPONSE" | tee -a "$LOG_FILE"
        fi
    else
        echo "❌ Failed to fetch KB list" | tee -a "$LOG_FILE"
    fi
    
    echo "==========================================" | tee -a "$LOG_FILE"
}

# Main monitoring loop
check_count=1
max_checks=120  # Monitor for up to 60 minutes (120 * 30 seconds)

while [ $check_count -le $max_checks ]; do
    check_status $check_count
    
    # Wait 30 seconds
    sleep 30
    
    check_count=$((check_count + 1))
done

echo "" | tee -a "$LOG_FILE"
echo "⏰ Monitoring completed after $max_checks checks" | tee -a "$LOG_FILE"
echo "📁 Final log saved to: $LOG_FILE" | tee -a "$LOG_FILE"
echo "🎯 Total monitoring time: $(get_elapsed_time)" | tee -a "$LOG_FILE"
