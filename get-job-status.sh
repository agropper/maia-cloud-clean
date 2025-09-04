#!/bin/bash

# Get the most recent indexing job and its detailed status
DEBUG_LOG_FILE="job-status-$(date +%Y%m%d-%H%M%S).log"

echo "🔍 GETTING INDEXING JOB STATUSES" | tee -a "$DEBUG_LOG_FILE"
echo "📅 Time: $(date)" | tee -a "$DEBUG_LOG_FILE"
echo "📁 Log file: $DEBUG_LOG_FILE" | tee -a "$DEBUG_LOG_FILE"
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

# Step 1: Get the list of all indexing jobs
echo "" | tee -a "$DEBUG_LOG_FILE"
echo "🚀 STEP 1: Getting list of all indexing jobs..." | tee -a "$DEBUG_LOG_FILE"
echo "   GET https://api.digitalocean.com/v2/gen-ai/indexing_jobs" | tee -a "$DEBUG_LOG_FILE"

JOBS_RESPONSE=$(curl -s -X GET \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DIGITALOCEAN_TOKEN" \
  "https://api.digitalocean.com/v2/gen-ai/indexing_jobs")

if [ $? -eq 0 ]; then
    echo "✅ Jobs list retrieved successfully" | tee -a "$DEBUG_LOG_FILE"
    
    # Analyze the jobs list to find different statuses
    echo "🔍 Analyzing jobs list for different statuses..." | tee -a "$DEBUG_LOG_FILE"
    
    if command -v jq &> /dev/null; then
        # Count jobs by status
        echo "📊 Jobs by status:" | tee -a "$DEBUG_LOG_FILE"
        echo "$JOBS_RESPONSE" | jq -r '.jobs[] | .status' | sort | uniq -c | tee -a "$DEBUG_LOG_FILE"
        
        echo "" | tee -a "$DEBUG_LOG_FILE"
        echo "📊 Jobs by phase:" | tee -a "$DEBUG_LOG_FILE"
        echo "$JOBS_RESPONSE" | jq -r '.jobs[] | .phase' | sort | uniq -c | tee -a "$DEBUG_LOG_FILE"
        
        # Specifically look for PENDING jobs which might have detailed info
        echo "" | tee -a "$DEBUG_LOG_FILE"
        echo "🔍 Looking for PENDING jobs specifically..." | tee -a "$DEBUG_LOG_FILE"
        PENDING_JOB=$(echo "$JOBS_RESPONSE" | jq -r '.jobs[] | select(.status == "INDEX_JOB_STATUS_PENDING") | .uuid' | head -1)
        if [ -n "$PENDING_JOB" ] && [ "$PENDING_JOB" != "null" ]; then
            echo "🎯 Found PENDING job: $PENDING_JOB" | tee -a "$DEBUG_LOG_FILE"
            JOB_TO_CHECK="$PENDING_JOB"
        else
            echo "⚠️ No PENDING jobs found, looking for any non-completed job..." | tee -a "$DEBUG_LOG_FILE"
            # Find a job that's not completed
            NON_COMPLETED_JOB=$(echo "$JOBS_RESPONSE" | jq -r '.jobs[] | select(.status != "INDEX_JOB_STATUS_COMPLETED") | .uuid' | head -1)
            if [ -n "$NON_COMPLETED_JOB" ] && [ "$NON_COMPLETED_JOB" != "null" ]; then
                echo "🎯 Found non-completed job: $NON_COMPLETED_JOB" | tee -a "$DEBUG_LOG_FILE"
                JOB_TO_CHECK="$NON_COMPLETED_JOB"
            else
                echo "⚠️ All jobs are completed, checking the most recent one" | tee -a "$DEBUG_LOG_FILE"
                MOST_RECENT_JOB=$(echo "$JOBS_RESPONSE" | jq -r '.jobs | sort_by(.created_at) | reverse | .[0]')
                JOB_TO_CHECK=$(echo "$MOST_RECENT_JOB" | jq -r '.uuid')
            fi
        fi
        
    else
        echo "⚠️ jq not available, using basic parsing..." | tee -a "$DEBUG_LOG_FILE"
        # Basic parsing fallback
        JOB_TO_CHECK=$(echo "$JOBS_RESPONSE" | grep -o '"uuid":"[^"]*"' | head -1 | cut -d'"' -f4)
        echo "   UUID: $JOB_TO_CHECK" | tee -a "$DEBUG_LOG_FILE"
    fi
    
    if [ -n "$JOB_TO_CHECK" ] && [ "$JOB_TO_CHECK" != "null" ]; then
        echo "" | tee -a "$DEBUG_LOG_FILE"
        echo "🚀 STEP 2: Getting detailed status for job $JOB_TO_CHECK..." | tee -a "$DEBUG_LOG_FILE"
        echo "   GET https://api.digitalocean.com/v2/gen-ai/indexing_jobs/$JOB_TO_CHECK" | tee -a "$DEBUG_LOG_FILE"
        
        # Step 2: Get detailed status for the specific job
        JOB_STATUS_RESPONSE=$(curl -s -X GET \
          -H "Content-Type: application/json" \
          -H "Authorization: Bearer $DIGITALOCEAN_TOKEN" \
          "https://api.digitalocean.com/v2/gen-ai/indexing_jobs/$JOB_TO_CHECK")
        
        if [ $? -eq 0 ]; then
            echo "✅ Job status retrieved successfully" | tee -a "$DEBUG_LOG_FILE"
            echo "" | tee -a "$DEBUG_LOG_FILE"
            echo "📊 DETAILED JOB STATUS:" | tee -a "$DEBUG_LOG_FILE"
            echo "==========================================" | tee -a "$DEBUG_LOG_FILE"
            
            if command -v jq &> /dev/null; then
                echo "🔧 Pretty-printed response:" | tee -a "$DEBUG_LOG_FILE"
                echo "$JOB_STATUS_RESPONSE" | jq '.' | tee -a "$DEBUG_LOG_FILE"
                
                # Extract key information
                echo "" | tee -a "$DEBUG_LOG_FILE"
                echo "🔍 KEY STATUS INFORMATION:" | tee -a "$DEBUG_LOG_FILE"
                echo "==========================================" | tee -a "$DEBUG_LOG_FILE"
                
                JOB_DATA=$(echo "$JOB_STATUS_RESPONSE" | jq -r '.job')
                if [ "$JOB_DATA" != "null" ]; then
                    TOKENS=$(echo "$JOB_DATA" | jq -r '.tokens // "N/A"')
                    TOTAL_DATASOURCES=$(echo "$JOB_DATA" | jq -r '.total_datasources // "N/A"')
                    COMPLETED_DATASOURCES=$(echo "$JOB_DATA" | jq -r '.completed_datasources // "N/A"')
                    TOTAL_ITEMS_INDEXED=$(echo "$JOB_DATA" | jq -r '.total_items_indexed // "N/A"')
                    TOTAL_ITEMS_FAILED=$(echo "$JOB_DATA" | jq -r '.total_items_failed // "N/A"')
                    TOTAL_ITEMS_SKIPPED=$(echo "$JOB_DATA" | jq -r '.total_items_skipped // "N/A"')
                    PHASE=$(echo "$JOB_DATA" | jq -r '.phase // "N/A"')
                    STATUS=$(echo "$JOB_DATA" | jq -r '.status // "N/A"')
                    CREATED=$(echo "$JOB_DATA" | jq -r '.created_at // "N/A"')
                    STARTED=$(echo "$JOB_DATA" | jq -r '.started_at // "N/A"')
                    FINISHED=$(echo "$JOB_DATA" | jq -r '.finished_at // "N/A"')
                    
                    echo "📊 Tokens: $TOKENS" | tee -a "$DEBUG_LOG_FILE"
                    echo "📊 Total Data Sources: $TOTAL_DATASOURCES" | tee -a "$DEBUG_LOG_FILE"
                    echo "📊 Completed Data Sources: $COMPLETED_DATASOURCES" | tee -a "$DEBUG_LOG_FILE"
                    echo "📊 Total Items Indexed: $TOTAL_ITEMS_INDEXED" | tee -a "$DEBUG_LOG_FILE"
                    echo "📊 Total Items Failed: $TOTAL_ITEMS_FAILED" | tee -a "$DEBUG_LOG_FILE"
                    echo "📊 Total Items Skipped: $TOTAL_ITEMS_SKIPPED" | tee -a "$DEBUG_LOG_FILE"
                    echo "📊 Phase: $PHASE" | tee -a "$DEBUG_LOG_FILE"
                    echo "📊 Status: $STATUS" | tee -a "$DEBUG_LOG_FILE"
                    echo "📊 Created: $CREATED" | tee -a "$DEBUG_LOG_FILE"
                    echo "📊 Started: $STARTED" | tee -a "$DEBUG_LOG_FILE"
                    echo "📊 Finished: $FINISHED" | tee -a "$DEBUG_LOG_FILE"
                    
                    # Check if we got the detailed fields we expected
                    echo "" | tee -a "$DEBUG_LOG_FILE"
                    echo "🔍 RESPONSE ANALYSIS:" | tee -a "$DEBUG_LOG_FILE"
                    echo "==========================================" | tee -a "$DEBUG_LOG_FILE"
                    
                    if [ "$TOKENS" != "N/A" ]; then
                        echo "✅ Tokens field found: $TOKENS" | tee -a "$DEBUG_LOG_FILE"
                    else
                        echo "⚠️ Tokens field missing or null" | tee -a "$DEBUG_LOG_FILE"
                    fi
                    
                    if [ "$TOTAL_DATASOURCES" != "N/A" ]; then
                        echo "✅ Total Data Sources field found: $TOTAL_DATASOURCES" | tee -a "$DEBUG_LOG_FILE"
                    else
                        echo "⚠️ Total Data Sources field missing or null" | tee -a "$DEBUG_LOG_FILE"
                    fi
                    
                    if [ "$TOTAL_ITEMS_INDEXED" != "N/A" ]; then
                        echo "✅ Total Items Indexed field found: $TOTAL_ITEMS_INDEXED" | tee -a "$DEBUG_LOG_FILE"
                    else
                        echo "⚠️ Total Items Indexed field missing or null" | tee -a "$DEBUG_LOG_FILE"
                    fi
                    
                else
                    echo "⚠️ No job data found in response" | tee -a "$DEBUG_LOG_FILE"
                fi
            else
                echo "🔧 Raw response (jq not available):" | tee -a "$DEBUG_LOG_FILE"
                echo "$JOB_STATUS_RESPONSE" | tee -a "$DEBUG_LOG_FILE"
            fi
            
        else
            echo "❌ Failed to get job status" | tee -a "$DEBUG_LOG_FILE"
            echo "🔍 Error details:" | tee -a "$DEBUG_LOG_FILE"
            echo "$JOB_STATUS_RESPONSE" | tee -a "$DEBUG_LOG_FILE"
        fi
        
    else
        echo "❌ No valid job UUID found" | tee -a "$DEBUG_LOG_FILE"
    fi
    
else
    echo "❌ Failed to get jobs list" | tee -a "$DEBUG_LOG_FILE"
    echo "🔍 Error details:" | tee -a "$DEBUG_LOG_FILE"
    echo "$JOBS_RESPONSE" | tee -a "$DEBUG_LOG_FILE"
fi

echo "" | tee -a "$DEBUG_LOG_FILE"
echo "==========================================" | tee -a "$DEBUG_LOG_FILE"
echo "✅ Job status check completed" | tee -a "$DEBUG_LOG_FILE"
echo "📁 Full log saved to: $DEBUG_LOG_FILE"
