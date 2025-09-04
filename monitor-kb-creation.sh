#!/bin/bash

# Monitor KB creation and indexing job in real-time
DEBUG_LOG_FILE="kb-creation-monitor-$(date +%Y%m%d-%H%M%S).log"

echo "🔍 MONITORING KB CREATION AND INDEXING JOB" | tee -a "$DEBUG_LOG_FILE"
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

# Step 1: Create a new knowledge base
echo "" | tee -a "$DEBUG_LOG_FILE"
echo "🚀 STEP 1: Creating new knowledge base..." | tee -a "$DEBUG_LOG_FILE"
echo "   POST https://api.digitalocean.com/v2/gen-ai/knowledge_bases" | tee -a "$DEBUG_LOG_FILE"

# Generate a unique KB name
TIMESTAMP=$(date +%s)
KB_NAME="monitor-test-${TIMESTAMP}"

# First, get available models and find embedding models
echo "🔍 Getting available models..." | tee -a "$DEBUG_LOG_FILE"
MODELS_RESPONSE=$(curl -s -X GET \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DIGITALOCEAN_TOKEN" \
  "https://api.digitalocean.com/v2/gen-ai/models")

if [ $? -eq 0 ]; then
    echo "✅ Successfully fetched models" | tee -a "$DEBUG_LOG_FILE"
    echo "📊 Available models:" | tee -a "$DEBUG_LOG_FILE"
    echo "$MODELS_RESPONSE" | jq '.' | tee -a "$DEBUG_LOG_FILE"
    
    # Find embedding models (same logic as working server.js code)
    EMBEDDING_MODEL_ID=$(echo "$MODELS_RESPONSE" | jq -r '
      (.models // .data.models // [])[] | 
      select(.name and (
        (.name | ascii_downcase | contains("embedding")) or
        (.name | ascii_downcase | contains("gte")) or
        (.name | ascii_downcase | contains("text-embedding"))
      )) | 
      .uuid' | head -1)
    
    if [ -n "$EMBEDDING_MODEL_ID" ] && [ "$EMBEDDING_MODEL_ID" != "null" ]; then
        echo "🎯 Found embedding model ID: $EMBEDDING_MODEL_ID" | tee -a "$DEBUG_LOG_FILE"
    else
        echo "⚠️ No embedding models found, proceeding without embedding model" | tee -a "$DEBUG_LOG_FILE"
        EMBEDDING_MODEL_ID="N/A"
    fi
else
    echo "⚠️ Failed to fetch models, proceeding without embedding model" | tee -a "$DEBUG_LOG_FILE"
    EMBEDDING_MODEL_ID="N/A"
fi

# Create the KB data
if [ "$EMBEDDING_MODEL_ID" != "N/A" ] && [ "$EMBEDDING_MODEL_ID" != "null" ]; then
    KB_DATA=$(cat <<EOF
{
  "name": "$KB_NAME",
  "description": "$KB_NAME - Test KB for monitoring indexing job",
  "project_id": "90179b7c-8a42-4a71-a036-b4c2bea2fe59",
  "database_id": "881761c6-e72d-4f35-a48e-b320cd1f46e4",
  "region": "tor1",
  "embedding_model_uuid": "$EMBEDDING_MODEL_ID",
  "datasources": [
    {
      "spaces_data_source": {
        "bucket_name": "maia",
        "item_path": "wed271/",
        "region": "tor1"
      }
    }
  ]
}
EOF
)
else
    KB_DATA=$(cat <<EOF
{
  "name": "$KB_NAME",
  "description": "$KB_NAME - Test KB for monitoring indexing job",
  "project_id": "90179b7c-8a42-4a71-a036-b4c2bea2fe59",
  "database_id": "881761c6-e72d-4f35-a48e-b320cd1f46e4",
  "region": "tor1",
  "datasources": [
    {
      "spaces_data_source": {
        "bucket_name": "maia",
        "item_path": "wed271/",
        "region": "tor1"
      }
    }
  ]
}
EOF
)
fi

echo "📊 KB Data being sent:" | tee -a "$DEBUG_LOG_FILE"
echo "$KB_DATA" | jq '.' | tee -a "$DEBUG_LOG_FILE"

# Create the knowledge base
KB_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DIGITALOCEAN_TOKEN" \
  -d "$KB_DATA" \
  "https://api.digitalocean.com/v2/gen-ai/knowledge_bases")

CURL_EXIT_CODE=$?

echo "✅ KB creation request completed with exit code: $CURL_EXIT_CODE" | tee -a "$DEBUG_LOG_FILE"
echo "" | tee -a "$DEBUG_LOG_FILE"
echo "📊 KB CREATION RESPONSE:" | tee -a "$DEBUG_LOG_FILE"
echo "==========================================" | tee -a "$DEBUG_LOG_FILE"

if [ $CURL_EXIT_CODE -eq 0 ]; then
    echo "✅ KB creation successful" | tee -a "$DEBUG_LOG_FILE"
    echo "" | tee -a "$DEBUG_LOG_FILE"
    
    # Pretty print the response
    if command -v jq &> /dev/null; then
        echo "🔧 Pretty-printed KB creation response:" | tee -a "$DEBUG_LOG_FILE"
        echo "$KB_RESPONSE" | jq '.' | tee -a "$DEBUG_LOG_FILE"
        
        # Extract KB UUID and indexing job UUID from the response
        KB_UUID=$(echo "$KB_RESPONSE" | jq -r '.knowledge_base.uuid // .data.uuid // .uuid // "N/A"')
        INDEXING_JOB_UUID=$(echo "$KB_RESPONSE" | jq -r '.knowledge_base.last_indexing_job.uuid // "N/A"')
        echo "" | tee -a "$DEBUG_LOG_FILE"
        echo "🎯 Extracted KB UUID: $KB_UUID" | tee -a "$DEBUG_LOG_FILE"
        echo "🎯 Extracted Indexing Job UUID: $INDEXING_JOB_UUID" | tee -a "$DEBUG_LOG_FILE"
        
        if [ "$KB_UUID" != "N/A" ] && [ "$KB_UUID" != "null" ]; then
            echo "✅ KB UUID successfully extracted" | tee -a "$DEBUG_LOG_FILE"
            
            # Step 2: Monitor indexing job every 5 seconds for 60 seconds
            echo "" | tee -a "$DEBUG_LOG_FILE"
            echo "🚀 STEP 2: Monitoring indexing job for KB: $KB_UUID" | tee -a "$DEBUG_LOG_FILE"
            echo "⏱️  Monitoring every 5 seconds for 60 seconds..." | tee -a "$DEBUG_LOG_FILE"
            echo "==========================================" | tee -a "$DEBUG_LOG_FILE"
            
            # Use the indexing job UUID we extracted from the KB creation response
            if [ "$INDEXING_JOB_UUID" != "N/A" ] && [ "$INDEXING_JOB_UUID" != "null" ]; then
                echo "🎯 Using indexing job UUID from KB creation response: $INDEXING_JOB_UUID" | tee -a "$DEBUG_LOG_FILE"
                
                # Monitor the job every 5 seconds for 60 seconds (12 checks)
                for i in {1..12}; do
                    echo "" | tee -a "$DEBUG_LOG_FILE"
                    echo "📊 [Check #$i] Status check at $(date) (Elapsed: $((i*5)) seconds)" | tee -a "$DEBUG_LOG_FILE"
                    echo "   GET https://api.digitalocean.com/v2/gen-ai/indexing_jobs/$INDEXING_JOB_UUID" | tee -a "$DEBUG_LOG_FILE"
                    
                    # Get job status
                    JOB_STATUS_RESPONSE=$(curl -s -X GET \
                      -H "Content-Type: application/json" \
                      -H "Authorization: Bearer $DIGITALOCEAN_TOKEN" \
                      "https://api.digitalocean.com/v2/gen-ai/indexing_jobs/$INDEXING_JOB_UUID")
                    
                    if [ $? -eq 0 ]; then
                        echo "✅ Successfully fetched job status" | tee -a "$DEBUG_LOG_FILE"
                        echo "📊 Job Status Response:" | tee -a "$DEBUG_LOG_FILE"
                        echo "$JOB_STATUS_RESPONSE" | jq '.' | tee -a "$DEBUG_LOG_FILE"
                        
                        # Extract key information
                        JOB_DATA=$(echo "$JOB_STATUS_RESPONSE" | jq -r '.job')
                        if [ "$JOB_DATA" != "null" ]; then
                            STATUS=$(echo "$JOB_DATA" | jq -r '.status // "N/A"')
                            PHASE=$(echo "$JOB_DATA" | jq -r '.phase // "N/A"')
                            TOKENS=$(echo "$JOB_DATA" | jq -r '.tokens // "N/A"')
                            TOTAL_DATASOURCES=$(echo "$JOB_DATA" | jq -r '.total_datasources // "N/A"')
                            COMPLETED_DATASOURCES=$(echo "$JOB_DATA" | jq -r '.completed_datasources // "N/A"')
                            TOTAL_ITEMS_INDEXED=$(echo "$JOB_DATA" | jq -r '.total_items_indexed // "N/A"')
                            
                            echo "🔍 Key Status Info:" | tee -a "$DEBUG_LOG_FILE"
                            echo "   Status: $STATUS" | tee -a "$DEBUG_LOG_FILE"
                            echo "   Phase: $PHASE" | tee -a "$DEBUG_LOG_FILE"
                            echo "   Tokens: $TOKENS" | tee -a "$DEBUG_LOG_FILE"
                            echo "   Total Data Sources: $TOTAL_DATASOURCES" | tee -a "$DEBUG_LOG_FILE"
                            echo "   Completed Data Sources: $COMPLETED_DATASOURCES" | tee -a "$DEBUG_LOG_FILE"
                            echo "   Total Items Indexed: $TOTAL_ITEMS_INDEXED" | tee -a "$DEBUG_LOG_FILE"
                            
                            # Check if job is completed
                            if [ "$STATUS" = "INDEX_JOB_STATUS_COMPLETED" ]; then
                                echo "🎉 Indexing job completed!" | tee -a "$DEBUG_LOG_FILE"
                                break
                            fi
                        fi
                    else
                        echo "❌ Failed to fetch job status" | tee -a "$DEBUG_LOG_FILE"
                    fi
                    
                    echo "==========================================" | tee -a "$DEBUG_LOG_FILE"
                    
                    # Wait 5 seconds (except for the last iteration)
                    if [ $i -lt 12 ]; then
                        sleep 5
                    fi
                done
                
                # Step 3: Cancel the indexing job
                echo "" | tee -a "$DEBUG_LOG_FILE"
                echo "🚀 STEP 3: Cancelling indexing job..." | tee -a "$DEBUG_LOG_FILE"
                echo "   PUT https://api.digitalocean.com/v2/gen-ai/indexing_jobs/$INDEXING_JOB_UUID/cancel" | tee -a "$DEBUG_LOG_FILE"
                
                CANCEL_RESPONSE=$(curl -s -X PUT \
                  -H "Content-Type: application/json" \
                  -H "Authorization: Bearer $DIGITALOCEAN_TOKEN" \
                  "https://api.digitalocean.com/v2/gen-ai/indexing_jobs/$INDEXING_JOB_UUID/cancel")
                
                if [ $? -eq 0 ]; then
                    echo "✅ Cancel request completed successfully" | tee -a "$DEBUG_LOG_FILE"
                    echo "📊 Cancel Response:" | tee -a "$DEBUG_LOG_FILE"
                    echo "$CANCEL_RESPONSE" | jq '.' | tee -a "$DEBUG_LOG_FILE"
                else
                    echo "❌ Failed to cancel indexing job" | tee -a "$DEBUG_LOG_FILE"
                    echo "🔍 Error details:" | tee -a "$DEBUG_LOG_FILE"
                    echo "$CANCEL_RESPONSE" | tee -a "$DEBUG_LOG_FILE"
                fi
                
            else
                echo "❌ No indexing job UUID found in KB creation response" | tee -a "$DEBUG_LOG_FILE"
            fi
            
        else
            echo "❌ Could not extract KB UUID from response" | tee -a "$DEBUG_LOG_FILE"
        fi
        
    else
        echo "🔧 Raw KB creation response (jq not available):" | tee -a "$DEBUG_LOG_FILE"
        echo "$KB_RESPONSE" | tee -a "$DEBUG_LOG_FILE"
    fi
    
else
    echo "❌ KB creation failed" | tee -a "$DEBUG_LOG_FILE"
    echo "🔍 Error details:" | tee -a "$DEBUG_LOG_FILE"
    echo "$KB_RESPONSE" | tee -a "$DEBUG_LOG_FILE"
fi

echo "" | tee -a "$DEBUG_LOG_FILE"
echo "==========================================" | tee -a "$DEBUG_LOG_FILE"
echo "✅ KB creation and monitoring completed" | tee -a "$DEBUG_LOG_FILE"
echo "📁 Full log saved to: $DEBUG_LOG_FILE"
