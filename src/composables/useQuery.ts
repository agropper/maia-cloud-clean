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
      // Check for specific error types
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
      
      // Try to get detailed error message from response
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.message) {
          errorMessage = errorData.message;
        }
        if (errorData.errorType) {
          (errorMessage as any).errorType = errorData.errorType;
        }
        if (errorData.tokenCount) {
          (errorMessage as any).tokenCount = errorData.tokenCount;
        }
      } catch (parseError) {
        // If we can't parse the error response, use the generic message
      }
      
      const error = new Error(errorMessage);
      (error as any).status = response.status;
      throw error;
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
    console.log('🔍 [DEBUG] sendQuery called with:');
    console.log('  - uri:', uri);
    console.log('  - chatHistory length:', chatHistory.length);
    console.log('  - currentUser:', currentUser);
    console.log('  - appState.currentQuery:', appState.currentQuery);
    
    // Add the user's message to chat history with correct display name
    const userDisplayName = currentUser?.displayName || currentUser?.userId || 'Unknown User'
    console.log('🔍 [DEBUG] userDisplayName determined as:', userDisplayName);
    
    const updatedChatHistory = [
      ...chatHistory,
      {
        role: 'user' as const,
        content: appState.currentQuery || '',
        name: userDisplayName
      }
    ]
    
    console.log('🔍 [DEBUG] updatedChatHistory after adding user message:');
    console.log('  - length:', updatedChatHistory.length);
    console.log('  - last message:', updatedChatHistory[updatedChatHistory.length - 1]);

    const chatHistoryToSend = updatedChatHistory.map(msg => ({
      role: msg.role,
      content: msg.content,
      ...(msg as any).name && { name: (msg as any).name }
    }));
    
    console.log('🔍 [DEBUG] chatHistoryToSend prepared for backend:');
    console.log('  - length:', chatHistoryToSend.length);
    console.log('  - last message:', chatHistoryToSend[chatHistoryToSend.length - 1]);

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
        `File: ${file.name} (${file.type})\nContent:\n${file.type === 'pdf' && file.transcript ? file.transcript : file.content}`
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
    
    console.log('🔍 [DEBUG] About to send request to backend:');
    console.log('  - uri:', uri);
    console.log('  - chatHistoryToSend length:', chatHistoryToSend.length);
    console.log('  - currentUser:', currentUser);
    console.log('  - uploadedFiles count:', appState.uploadedFiles?.length || 0);
    console.log('  - uploadedFiles details:', appState.uploadedFiles?.map(f => ({
      name: f.name,
      type: f.type,
      contentLength: f.content?.length || 0,
      transcriptLength: f.transcript?.length || 0,
      willSendContent: f.type === 'pdf' && f.transcript ? f.transcript.length : f.content?.length || 0
    })));
    
    const response = await postData(uri, {
      chatHistory: chatHistoryToSend,
      newValue: appState.currentQuery || '',
      timeline: appState.timeline,
      uploadedFiles: appState.uploadedFiles.map(file => ({
        id: file.id,
        name: file.name,
        type: file.type,
        content: file.type === 'pdf' && file.transcript ? file.transcript : file.content
      })),
      currentUser: currentUser // Pass the current user identity to the backend
    });
    
    console.log('🔍 [DEBUG] Received response from backend:');
    console.log('  - response length:', response?.length);
    console.log('  - response type:', typeof response);
    console.log('  - last message:', response?.[response.length - 1]);
    console.log('  - full response:', response);

    const responseTime = Date.now() - startTime
    const contextKB = Math.round(contextSize / 1024 * 100) / 100
    
    console.log(`🤖 ${aiProvider}: ${totalTokens} tokens, ${contextKB}KB context, ${appState.uploadedFiles?.length || 0} files`)
    console.log(`✅ ${aiProvider} response: ${responseTime}ms`)

    return response;
  } catch (error: any) {
    const responseTime = Date.now() - startTime
    const aiProvider = uri.includes('personal-chat') ? 'Personal AI' :
                      uri.includes('anthropic-chat') ? 'Anthropic' :
                      uri.includes('gemini-chat') ? 'Gemini' :
                      uri.includes('chatgpt-chat') ? 'ChatGPT' :
                      uri.includes('deepseek-r1-chat') ? 'DeepSeek R1' : 'AI'
    
    console.log('🔍 [DEBUG] Error in sendQuery:');
    console.log('  - error:', error);
    console.log('  - error.message:', error.message);
    console.log('  - error.status:', error.status);
    console.log('  - error.response:', error.response);
    
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
