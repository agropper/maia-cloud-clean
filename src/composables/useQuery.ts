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
  onAgentSelectionRequired?: () => void,
  currentAgent?: any,
  assignedAgent?: any
): Promise<ChatHistoryItem[]> => {
  const startTime = Date.now()
  
  // Debug logging removed
  
  // Defensive check for appState
  if (!appState) {
    console.error('❌ [sendQuery] appState is undefined');
    throw new Error('AppState is undefined');
  }
  
  if (!appState.selectedAI) {
    console.error('❌ [sendQuery] appState.selectedAI is undefined');
    throw new Error('AppState.selectedAI is undefined');
  }
  
  try {
    // Add the user's message to chat history with correct display name
    const userDisplayName = currentUser?.displayName || currentUser?.userId || 'Public User'
    
    const updatedChatHistory = [
      ...chatHistory,
      {
        role: 'user' as const,
        content: appState.currentQuery || '',
        name: userDisplayName
      }
    ]
    

    const chatHistoryToSend = updatedChatHistory.map(msg => ({
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
        `File: ${file.name} (${file.type})\nContent:\n${file.type === 'pdf' ? (file.transcript || file.content) : file.content}`
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
    // Safety check to prevent includes error
    const uriString = typeof uri === 'string' ? uri : String(uri || '');
    const aiProvider = uriString.includes('personal-chat') ? 'Personal AI' :
                      uriString.includes('anthropic-chat') ? 'Anthropic' :
                      uriString.includes('gemini-chat') ? 'Gemini' :
                      uriString.includes('chatgpt-chat') ? 'ChatGPT' :
                      uriString.includes('deepseek-r1-chat') ? 'DeepSeek R1' : 'AI'
    
    const userInfo = currentUser?.displayName || currentUser?.userId || 'Public User'
    
    
    const response = await postData(uri, {
      chatHistory: chatHistoryToSend,
      newValue: appState.currentQuery || '',
      timeline: appState.timeline,
      uploadedFiles: appState.uploadedFiles.map(file => ({
        id: file.id,
        name: file.name,
        type: file.type,
        content: file.type === 'pdf' ? (file.transcript || file.content) : file.content
      }))
      // SECURITY: currentUser removed from request body - backend should get user from session
    });
    

    const responseTime = Date.now() - startTime
    const contextKB = Math.round(contextSize / 1024 * 100) / 100
    
    // Add essential console messages to browser console
    const contextSizeKB = contextKB;
    const uploadedFilesCount = appState.uploadedFiles?.length || 0;
    
    // Debug messages removed
    
    const agentName = assignedAgent?.name || currentAgent?.name || 'No Agent';
    const knowledgeBases = assignedAgent?.knowledgeBases?.map(kb => kb.name || kb).join(', ') || 
                          currentAgent?.knowledgeBases?.map(kb => kb.name || kb).join(', ') || 'None';
    
    console.log(`[*] AI Query: ${totalTokens} tokens, ${contextSizeKB}KB context, ${uploadedFilesCount} files`);
    console.log(`[*] Current user: ${userInfo}, Agent: ${agentName}, Connected KBs: [${knowledgeBases}]`);
    console.log(`[*] AI Response time: ${responseTime}ms`);

    return response;
  } catch (error: any) {
    const responseTime = Date.now() - startTime
    const uriString = typeof uri === 'string' ? uri : String(uri || '');
    const aiProvider = uriString.includes('personal-chat') ? 'Personal AI' :
                      uriString.includes('anthropic-chat') ? 'Anthropic' :
                      uriString.includes('gemini-chat') ? 'Gemini' :
                      uriString.includes('chatgpt-chat') ? 'ChatGPT' :
                      uriString.includes('deepseek-r1-chat') ? 'DeepSeek R1' : 'AI'
    
    
    // Check if this is an agent selection required error
    if (error.requiresAgentSelection && onAgentSelectionRequired) {
      onAgentSelectionRequired();
      return []; // Return empty array to prevent further processing
    }
    
    console.error(`❌ ${aiProvider} error (${responseTime}ms):`, error)
    throw error;
  }
};
