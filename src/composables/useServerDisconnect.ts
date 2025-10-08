import { ref } from 'vue'

// Global server disconnect handling
const consecutiveErrors = ref(0)
const maxConsecutiveErrors = 2

export const useServerDisconnect = () => {
  const handleServerError = () => {
    consecutiveErrors.value++
    
    if (consecutiveErrors.value >= maxConsecutiveErrors) {
      console.error('[SERVER] Server appears to be down - closing tab')
      window.close()
    }
  }
  
  const resetErrorCount = () => {
    consecutiveErrors.value = 0
  }
  
  const fetchWithDisconnectHandling = async (url: string, options?: RequestInit): Promise<Response> => {
    try {
      const response = await fetch(url, options)
      resetErrorCount()
      return response
    } catch (error) {
      handleServerError()
      throw error
    }
  }
  
  return {
    handleServerError,
    resetErrorCount,
    fetchWithDisconnectHandling
  }
}
