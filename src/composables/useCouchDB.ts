import { API_BASE_URL } from '../utils/apiBase'
import type { ChatHistoryItem, UploadedFile } from '../types'

export interface SavedChat {
  id: string
  patientId: string
  userId?: string // Optional - null/undefined for unauthenticated users
  createdAt: string
  updatedAt: string
  participantCount: number
  messageCount: number
  chatHistory: ChatHistoryItem[]
  uploadedFiles: UploadedFile[]
}

export interface SaveChatResponse {
  success: boolean
  chatId: string
  message: string
}

export const useCouchDB = () => {
  const saveChat = async (
    chatHistory: ChatHistoryItem[],
    uploadedFiles: UploadedFile[],
    patientId: string = 'demo_patient_001',
    userId?: string
  ): Promise<SaveChatResponse> => {
    try {
      const response = await fetch(`${API_BASE_URL}/save-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatHistory,
          uploadedFiles,
          patientId,
          userId
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to save chat:', error)
      throw error
    }
  }

  const loadChats = async (patientId: string = 'demo_patient_001', userId?: string): Promise<SavedChat[]> => {
    try {
      const url = userId 
        ? `${API_BASE_URL}/load-chats/${patientId}?userId=${userId}`
        : `${API_BASE_URL}/load-chats/${patientId}`;
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to load chats:', error)
      throw error
    }
  }

  const loadChat = async (chatId: string): Promise<SavedChat> => {
    try {
      const response = await fetch(`${API_BASE_URL}/load-chat/${chatId}`)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to load chat:', error)
      throw error
    }
  }

  const deleteChat = async (chatId: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/delete-chat/${chatId}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to delete chat:', error)
      throw error
    }
  }

  const formatChatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatChatLabel = (chat: SavedChat): string => {
    const date = formatChatDate(chat.createdAt)
    return `Chat ${date} (${chat.participantCount} participants)`
  }

  return {
    saveChat,
    loadChats,
    loadChat,
    deleteChat,
    formatChatDate,
    formatChatLabel
  }
} 