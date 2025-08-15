import { API_BASE_URL } from '../utils/apiBase'
import type { ChatHistoryItem, UploadedFile } from '../types'

export interface GroupChat {
  id: string
  currentUser: string
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

export const useGroupChat = () => {
  const saveGroupChat = async (
    chatHistory: ChatHistoryItem[],
    uploadedFiles: UploadedFile[],
    currentUser: string,
    connectedKB: string
  ): Promise<SaveGroupChatResponse> => {
    try {
      const response = await fetch(`${API_BASE_URL}/save-group-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatHistory,
          uploadedFiles,
          currentUser,
          connectedKB
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

  return {
    saveGroupChat,
    loadGroupChat,
    loadSharedChat
  }
}
