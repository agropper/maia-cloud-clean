import { estimateTokenCount } from '../utils'
import type { AppState, ChatHistoryItem } from '../types'

const getTimelineStats = (timeline: string) => {
  const bytes = new TextEncoder().encode(timeline).length
  const tokens = estimateTokenCount(timeline)
  return `Timeline context: [${bytes} bytes, ~${tokens} tokens]`
}

export const postData = async (uri: string, data: any): Promise<any> => {
  try {
    const response = await fetch(uri, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      // Check if it's an agent selection required error
      if (response.status === 400) {
        try {
          const errorData = await response.json();
          if (errorData.requiresAgentSelection) {
            // Create a custom error with the requiresAgentSelection flag
            const error = new Error(errorData.message || 'Agent selection required');
            (error as any).requiresAgentSelection = true;
            throw error;
          }
        } catch (parseError) {
          // If we can't parse the error response, fall through to generic error
        }
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
};

export const sendQuery = async (
  uri: string,
  chatHistory: ChatHistoryItem[],
  appState: AppState,
  currentUser?: any,
  onAgentSelectionRequired?: () => void
): Promise<ChatHistoryItem[]> => {
  const startTime = Date.now()
  
  try {
    const chatHistoryToSend = chatHistory.map(msg => ({
      role: msg.role,
      content: msg.content,
      ...(msg as any).name && { name: (msg as any).name }
    }));

    // Calculate context size and tokens for frontend logging
    let contextSize = 0
    let totalTokens = 0
    
    // Add timeline context
    if (appState.timeline) {
      const timelineBytes = new TextEncoder().encode(appState.timeline).length
      const timelineTokens = estimateTokenCount(appState.timeline)
      contextSize += timelineBytes
      totalTokens += timelineTokens
    }
    
    // Add uploaded files context
    if (appState.uploadedFiles && appState.uploadedFiles.length > 0) {
      const filesContext = appState.uploadedFiles.map(file => 
        `File: ${file.name} (${file.type})\nContent:\n${file.content}`
      ).join('\n\n')
      const filesBytes = new TextEncoder().encode(filesContext).length
      const filesTokens = estimateTokenCount(filesContext)
      contextSize += filesBytes
      totalTokens += filesTokens
    }
    
    // Add user query tokens
    const queryTokens = estimateTokenCount(appState.currentQuery || '')
    totalTokens += queryTokens
    
    // Add chat history tokens
    const historyTokens = estimateTokenCount(chatHistoryToSend.map(msg => msg.content).join('\n'))
    totalTokens += historyTokens

    // Log which agent and knowledge base will be used for this query
    const aiProvider = uri.includes('personal-chat') ? 'Personal AI' :
                      uri.includes('anthropic-chat') ? 'Anthropic' :
                      uri.includes('gemini-chat') ? 'Gemini' :
                      uri.includes('chatgpt-chat') ? 'ChatGPT' :
                      uri.includes('deepseek-r1-chat') ? 'DeepSeek R1' : 'AI'
    
    const userInfo = currentUser?.displayName || currentUser?.userId || 'Unknown User'
    console.log(`🎯 QUERY DETAILS: User: ${userInfo} | AI: ${aiProvider} | Endpoint: ${uri}`)
    
    const response = await postData(uri, {
      chatHistory: chatHistoryToSend,
      newValue: appState.currentQuery || '',
      timeline: appState.timeline,
      uploadedFiles: appState.uploadedFiles.map(file => ({
        id: file.id,
        name: file.name,
        type: file.type,
        content: file.content
      })),
      currentUser: currentUser // Pass the current user identity to the backend
    });

    const responseTime = Date.now() - startTime
    const contextKB = Math.round(contextSize / 1024 * 100) / 100
    
    console.log(`🤖 ${aiProvider}: ${totalTokens} tokens, ${contextKB}KB context, ${appState.uploadedFiles?.length || 0} files`)
    console.log(`✅ ${aiProvider} response: ${responseTime}ms`)
    console.log(`📋 Check server logs for actual agent and knowledge base used`)

    return response;
  } catch (error: any) {
    const responseTime = Date.now() - startTime
    const aiProvider = uri.includes('personal-chat') ? 'Personal AI' :
                      uri.includes('anthropic-chat') ? 'Anthropic' :
                      uri.includes('gemini-chat') ? 'Gemini' :
                      uri.includes('chatgpt-chat') ? 'ChatGPT' :
                      uri.includes('deepseek-r1-chat') ? 'DeepSeek R1' : 'AI'
    
    // Check if this is an agent selection required error
    if (error.requiresAgentSelection && onAgentSelectionRequired) {
      console.log(`🔍 Agent selection required for ${aiProvider}:`, error.message)
      onAgentSelectionRequired();
      return []; // Return empty array to prevent further processing
    }
    
    console.error(`❌ ${aiProvider} error (${responseTime}ms):`, error)
    throw error;
  }
};
