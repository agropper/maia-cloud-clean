import { API_BASE_URL } from '../utils/apiBase'
import type { ChatHistoryItem, UploadedFile } from '../types'

export interface GroupChat {
  id: string
  shareId: string
  currentUser: string | { userId: string; displayName: string }
  connectedKB: string
  createdAt: string
  updatedAt: string
  participantCount: number
  messageCount: number
  chatHistory: ChatHistoryItem[]
  uploadedFiles: UploadedFile[]
  isShared: boolean
}

export interface SaveGroupChatResponse {
  success: boolean
  chatId: string
  shareId: string
  message: string
}

// Helper function to safely convert ArrayBuffer to base64
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const uint8Array = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
};

export const useGroupChat = () => {
  // Helper function to convert File objects to base64 for storage
  const processFilesForStorage = async (files: UploadedFile[]): Promise<any[]> => {
    return Promise.all(files.map(async (file) => {
      if (file.type === 'pdf') {
        if (file.originalFile instanceof File) {
          try {
            // Fresh PDF file - convert File object to base64 using a proper binary-safe method
            const arrayBuffer = await file.originalFile.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            
            // Convert to base64 using a binary-safe approach
            const base64 = arrayBufferToBase64(arrayBuffer);
            
            
            return {
              ...file,
              originalFile: {
                name: file.originalFile.name,
                size: file.originalFile.size,
                type: file.originalFile.type,
                base64: base64
              }
            };
          } catch (error) {
            console.warn(`⚠️ Failed to convert PDF to base64: ${file.name}`, error);
            return { ...file, originalFile: null };
          }
        } else if (file.originalFile && typeof file.originalFile === 'object' && file.originalFile.base64) {
          // Database-loaded PDF file with existing base64 data - preserve it
          return file; // Return as-is, already has the correct structure
        } else {
          // PDF file without base64 data - this shouldn't happen, but handle gracefully
          console.warn(`⚠️ PDF file ${file.name} has no base64 data available`);
          return { ...file, originalFile: null };
        }
      }
      
      // For non-PDF files, remove originalFile to avoid serialization issues
      return { ...file, originalFile: null };
    }));
  };

  const saveGroupChat = async (
    chatHistory: ChatHistoryItem[],
    uploadedFiles: UploadedFile[],
    currentUser: string,
    connectedKB: string,
    displayName?: string
  ): Promise<SaveGroupChatResponse> => {
    try {
      // Process files before sending to server
      const processedFiles = await processFilesForStorage(uploadedFiles);
      
      const response = await fetch(`${API_BASE_URL}/save-group-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatHistory,
          uploadedFiles: processedFiles,
          currentUser,
          connectedKB,
          displayName
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to save group chat:', error)
      throw error
    }
  }

  const loadGroupChat = async (chatId: string): Promise<GroupChat> => {
    try {
      const response = await fetch(`${API_BASE_URL}/load-group-chat/${chatId}`)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to load group chat:', error)
      throw error
    }
  }

  const loadSharedChat = async (shareId: string): Promise<GroupChat> => {
    try {
      const response = await fetch(`${API_BASE_URL}/shared/${shareId}`)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to load shared chat:', error)
      throw error
    }
  }

  const getAllGroupChats = async (): Promise<GroupChat[]> => {
    try {
      
      const response = await fetch(`${API_BASE_URL}/group-chats`)
      
      if (!response.ok) {
        console.error(`❌ [useGroupChat] HTTP error! status: ${response.status}`);
        const errorText = await response.text();
        console.error(`❌ [useGroupChat] Error response body:`, errorText);
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('❌ [useGroupChat] Failed to load all group chats:', error);
      console.error('❌ [useGroupChat] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      throw error
    }
  }

  const updateGroupChat = async (
    chatId: string,
    chatHistory: ChatHistoryItem[],
    uploadedFiles: UploadedFile[],
    currentUser: string,
    connectedKB: string,
    displayName?: string
  ): Promise<SaveGroupChatResponse> => {
    try {
      // Process files before sending to server
      const processedFiles = await processFilesForStorage(uploadedFiles);
      
      const response = await fetch(`${API_BASE_URL}/group-chats/${chatId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatHistory,
          uploadedFiles: processedFiles,
          currentUser,
          connectedKB,
          displayName
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to update group chat:', error)
      throw error
    }
  }

  const deleteGroupChat = async (chatId: string): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/group-chats/${chatId}`, {
        method: 'DELETE'
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
    } catch (error) {
      console.error('Failed to delete group chat:', error)
      throw error
    }
  }

  return {
    saveGroupChat,
    loadGroupChat,
    loadSharedChat,
    getAllGroupChats,
    updateGroupChat,
    deleteGroupChat
  }
}
