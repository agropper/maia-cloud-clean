import type { AppState, ValidationResult, UploadedFile } from '../types'
import { convertJSONtoMarkdown, processTimeline, validateFile, estimateTokenCount, parseTranscriptFromMarkdown, extractTextFromPDF, detectFileType, processRTFFile } from '../utils'
import { useTranscript } from '../composables/useTranscript'

const showAuth = (appState: AppState, writeMessage: (message: string, type: string) => void) => {
  appState.isAuthorized = true
  writeMessage('Authorized', 'success')
}

const showJWT = async (
  jwt: string,
  writeMessage: (message: string, type: string) => void,
  appState: AppState,
  closeSession: () => void,
  showPopup: () => void
) => {
  if (!appState.uri) {
    // writeMessage('No URI found in Querystring or LocalStorage', 'error')
    return
  }

  appState.jwt = jwt
  writeMessage('Loading Patient Timeline...', 'success')
  appState.isLoading = true

  try {
    // Initial request to start the process
    const processResponse = await fetch(appState.uri, {
      headers: {
        Authorization: `Bearer ${appState.jwt}`
      }
    })

    let processID = await processResponse.json()
    const pollingUri = appState.uri + '?process=' + processID.process

    // Modified polling function that checks response status first
    const pollForData = async (maxAttempts = 30, interval = 2000): Promise<string> => {
      let attempts = 0

      while (attempts < maxAttempts) {
        try {
          // Use a HEAD request first to check status without triggering a 404 error
          const checkResponse = await fetch(pollingUri, {
            method: 'HEAD',
            headers: {
              Authorization: `Bearer ${appState.jwt}`
            }
          })

          if (checkResponse.ok) {
            // If HEAD request succeeds, make the actual GET request
            const response = await fetch(pollingUri, {
              headers: {
                Authorization: `Bearer ${appState.jwt}`
              }
            })
            return await response.text()
          }

          // If we get here, the resource isn't ready yet
          await new Promise((resolve) => setTimeout(resolve, interval))
          attempts++

          if (attempts % 5 === 0) {
            writeMessage(`Still waiting for data... (${attempts}/${maxAttempts})`, 'info')
          }
        } catch (error) {
          // If HEAD request isn't supported, fall back to original behavior
          console.warn('HEAD request not supported, falling back to GET')
          const response = await fetch(pollingUri, {
            headers: {
              Authorization: `Bearer ${appState.jwt}`
            }
          })

          if (response.ok) {
            return await response.text()
          }
        }
      }

      throw new Error('Timeout waiting for data')
    }

    // Rest of the function remains the same
    const data = await pollForData()
    const { timeline, hasError } = processTimeline(data, writeMessage)

    if (hasError) {
      appState.popupContent = 'Timeline size is too large. You may want to edit it manually.'
      appState.popupContentFunction = closeSession
      showPopup()
      return
    }

    if (Array.isArray(timeline)) {
      appState.timelineChunks = timeline
      appState.hasChunkedTimeline = true
      appState.timeline = timeline[0].content

      const bytes = new TextEncoder().encode(timeline[0].content).length
      const tokens = estimateTokenCount(timeline[0].content)
      appState.chatHistory = [
        {
          role: 'system',
          content: `Timeline context (${timeline[0].dateRange.start} to ${timeline[0].dateRange.end}) [${bytes} bytes, ~${tokens} tokens]:\n\n${timeline[0].content}`
        }
      ]
    } else {
      appState.timeline = timeline
      appState.hasChunkedTimeline = false
      appState.timelineChunks = []

      const bytes = new TextEncoder().encode(timeline).length
      const tokens = estimateTokenCount(timeline)
      appState.chatHistory = [
        {
          role: 'system',
          content: `Timeline context: [${bytes} bytes, ~${tokens} tokens]\n\n${timeline}`
        }
      ]
    }

    appState.isLoading = false
    writeMessage('Patient Timeline Loaded', 'success')
  } catch (error) {
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
    }
    writeMessage(`Error: ${errorMessage}`, 'error')
  } finally {
    appState.isLoading = false
  }
}

// Helper function to update user record with file metadata
const updateUserFileMetadata = async (userId: string, fileMetadata: {
  fileName: string
  bucketKey: string
  bucketPath: string
  fileSize: number
  fileType: string
  uploadedAt: string
}) => {
  try {
    const response = await fetch('/api/user-file-metadata', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        fileMetadata
      }),
    })
    
    if (!response.ok) {
      console.error(`❌ Failed to update user file metadata for ${userId}`)
    }
  } catch (error) {
    console.error(`❌ Error updating user file metadata:`, error)
  }
}

const uploadTranscriptFile = async (
  file: File,
  appState: AppState,
  writeMessage: (message: string, type: string) => void,
  currentUser?: any
) => {
  // If currentUser is not provided, try to get it from AppStateManager
  if (!currentUser) {
    try {
      const { appStateManager } = await import('../utils/AppStateManager.js');
      currentUser = appStateManager.getStateProperty('currentUser');
    } catch (error) {
      console.warn(`Failed to get currentUser from AppStateManager:`, error);
    }
  }
  
  appState.isLoading = true
  try {
    const content = await file.text()
    
    // Parse the transcript content to validate it's a proper transcript
    const chatHistory = parseTranscriptFromMarkdown(content)
    
    if (chatHistory.length === 0) {
      writeMessage('No conversation found in transcript file', 'error')
      return
    }
    
    // Add to uploaded files for badge display
    const uploadedFile: UploadedFile = {
      id: `file-${Date.now()}-${Math.random()}`,
      name: file.name,
      size: file.size,
      type: 'transcript',
      content: content,
      originalFile: file,
      uploadedAt: new Date()
    }
    appState.uploadedFiles.push(uploadedFile)
    
    // Save file to user's bucket folder immediately upon import
    try {
      // CRITICAL: Must have authenticated user for file upload
      if (!currentUser || !currentUser.userId) {
        throw new Error('Authentication required to upload files. Please sign in.');
      }
      
      const userId = currentUser.userId;
      const userFolder = `${userId}/`;
      
      const uploadResponse = await fetch('/api/upload-to-bucket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          content: uploadedFile.content,
          fileType: 'text/markdown',
          userFolder: userFolder
        }),
      })
      
      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json()
        console.log(`✅ Transcript saved to bucket: ${file.name} in folder ${userFolder}`)
        
        // Update the uploaded file with bucket info
        uploadedFile.bucketKey = uploadResult.fileInfo.bucketKey
        uploadedFile.bucketPath = uploadResult.fileInfo.userFolder
        
        // Update user record with file metadata
        await updateUserFileMetadata(userId, {
          fileName: file.name,
          bucketKey: uploadResult.fileInfo.bucketKey,
          bucketPath: uploadResult.fileInfo.userFolder,
          fileSize: file.size,
          fileType: 'transcript',
          uploadedAt: new Date().toISOString()
        })
      } else {
        console.error(`❌ Failed to save transcript to bucket: ${file.name}`)
      }
    } catch (error) {
      console.error(`❌ Error saving transcript to bucket:`, error)
    }
    
    // Don't add to chat history - just make available as context
    writeMessage(`Transcript loaded successfully with ${chatHistory.length} messages`, 'success')
  } catch (error) {
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
    }
    console.error('Error loading transcript:', error)
    writeMessage(`Error: ${errorMessage}`, 'error')
  } finally {
    appState.isLoading = false
  }
}

const uploadPDFFile = async (
  file: File,
  appState: AppState,
  writeMessage: (message: string, type: string) => void,
  currentUser?: any
) => {
  // If currentUser is not provided, try to get it from AppStateManager
  if (!currentUser) {
    try {
      const { appStateManager } = await import('../utils/AppStateManager.js');
      currentUser = appStateManager.getStateProperty('currentUser');
    } catch (error) {
      console.warn(`Failed to get currentUser from AppStateManager:`, error);
    }
  }
  
  appState.isLoading = true
  try {
    // Check file size (limit to 50MB to prevent memory issues)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 50MB.`)
    }

    // Use FormData for more efficient file upload
    const formData = new FormData()
    formData.append('pdfFile', file)
    
    // Send to server for PDF parsing
    const response = await fetch('/api/parse-pdf', {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to parse PDF')
    }

    const result = await response.json()
    
    const uploadedFile: UploadedFile = {
      id: `file-${Date.now()}-${Math.random()}`,
      name: file.name,
      size: file.size,
      type: 'pdf',
      content: result.text, // Raw PDF text for display
      transcript: result.markdown || null, // PDF conversion to text is not necessary for larger AIs and knowledge bases
      originalFile: file,
      uploadedAt: new Date()
    }
    
    appState.uploadedFiles.push(uploadedFile)
    
    // Save file to user's bucket folder immediately upon import
    try {
      // CRITICAL: Must have authenticated user for file upload
      if (!currentUser || !currentUser.userId) {
        const errorMsg = 'CRITICAL: PDF upload attempted without authenticated user';
        console.error('🚨 [SECURITY]', errorMsg, {
          currentUser: currentUser,
          fileName: file.name,
          timestamp: new Date().toISOString()
        });
        
        // Send alert to admin (backend will handle this)
        await fetch('/api/admin-alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            severity: 'CRITICAL',
            category: 'SECURITY_VIOLATION',
            message: 'PDF upload attempted without authenticated user',
            details: {
              fileName: file.name,
              timestamp: new Date().toISOString(),
              currentUserState: currentUser ? 'partial' : 'null'
            }
          })
        }).catch(err => console.error('Failed to send admin alert:', err));
        
        throw new Error('Authentication required to upload files. Please sign in.');
      }
      
      const resolvedUserId = currentUser.userId;
      const userFolder = `${resolvedUserId}/`;
      
      // Ensure user has a bucket folder if they're authenticated (not Public User)
      if (resolvedUserId !== 'Public User' && currentUser?.isAuthenticated) {
        try {
          const bucketResponse = await fetch('/api/bucket/ensure-user-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: resolvedUserId })
          })
          
          if (bucketResponse.ok) {
            const bucketData = await bucketResponse.json()
            if (!bucketData.folderExists) {
              console.log(`✅ Created bucket folder for user: ${resolvedUserId}`)
            }
          } else {
            console.warn(`⚠️ Failed to ensure bucket folder for user ${resolvedUserId}: ${bucketResponse.status}`)
          }
        } catch (bucketError) {
          console.warn(`⚠️ Error ensuring bucket folder for user ${resolvedUserId}:`, bucketError)
        }
      }
      
      // Store PDF as binary (not base64) for proper text extraction and indexing
      const fileReader = new FileReader()
      fileReader.onload = async () => {
        try {
          const arrayBuffer = fileReader.result as ArrayBuffer
          
          // Convert ArrayBuffer to base64 for JSON transport (but will be decoded on server)
          const uint8Array = new Uint8Array(arrayBuffer)
          let binary = ''
          for (let i = 0; i < uint8Array.byteLength; i++) {
            binary += String.fromCharCode(uint8Array[i])
          }
          const base64Binary = btoa(binary)
          
          const uploadResponse = await fetch('/api/upload-to-bucket', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fileName: file.name,
              content: base64Binary,
              fileType: 'application/pdf',
              userFolder: userFolder,
              isBinary: true  // Flag to indicate binary data
            }),
          })
          
          if (uploadResponse.ok) {
            const uploadResult = await uploadResponse.json()
            
            // Update the uploaded file with bucket info
            uploadedFile.bucketKey = uploadResult.fileInfo.bucketKey
            uploadedFile.bucketPath = uploadResult.fileInfo.userFolder
            
            // Update user record with file metadata
            await updateUserFileMetadata(resolvedUserId, {
              fileName: file.name,
              bucketKey: uploadResult.fileInfo.bucketKey,
              bucketPath: uploadResult.fileInfo.userFolder,
              fileSize: file.size,
              fileType: 'pdf',
              uploadedAt: new Date().toISOString()
            })
            
            // Verify file was saved in correct location
            if (userFolder !== 'root' && uploadResult.fileInfo.userFolder === 'root') {
              throw new Error(`❌ FILE SAVED IN WRONG LOCATION: Expected folder '${userFolder}' but file was saved in 'root' folder`)
            }
            if (userFolder === 'root' && uploadResult.fileInfo.userFolder !== 'root') {
              throw new Error(`❌ FILE SAVED IN WRONG LOCATION: Expected folder 'root' but file was saved in '${uploadResult.fileInfo.userFolder}' folder`)
            }
          } else {
            console.error(`❌ Failed to save PDF to bucket: ${file.name}`)
          }
        } catch (bucketError) {
          console.error(`❌ Error saving PDF to bucket:`, bucketError)
        }
      }
      fileReader.readAsArrayBuffer(file)  // Read as binary, not base64 data URL
    } catch (error) {
      console.error(`❌ Error preparing PDF for bucket upload:`, error)
    }
    
    // Don't add to chat history - just make available as context
    writeMessage(`PDF file processed successfully (${result.pages} pages, ${result.characters} characters)`, 'success')
  } catch (error) {
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
    }
    console.error('Error loading PDF:', error)
    writeMessage(`Error: ${errorMessage}`, 'error')
  } finally {
    appState.isLoading = false
  }
}

const uploadMarkdownFile = async (
  file: File,
  appState: AppState,
  writeMessage: (message: string, type: string) => void,
  currentUser?: any
) => {
  // If currentUser is not provided, try to get it from AppStateManager
  if (!currentUser) {
    try {
      const { appStateManager } = await import('../utils/AppStateManager.js');
      currentUser = appStateManager.getStateProperty('currentUser');
    } catch (error) {
      console.warn(`Failed to get currentUser from AppStateManager:`, error);
    }
  }
  
  appState.isLoading = true
  try {
    const content = await file.text()
    
    const uploadedFile: UploadedFile = {
      id: `file-${Date.now()}-${Math.random()}`,
      name: file.name,
      size: file.size,
      type: 'markdown',
      content: content,
      originalFile: file,
      uploadedAt: new Date()
    }
    appState.uploadedFiles.push(uploadedFile)
    
    // Save file to user's bucket folder immediately upon import
    try {
      // CRITICAL: Must have authenticated user for file upload
      if (!currentUser || !currentUser.userId) {
        throw new Error('Authentication required to upload files. Please sign in.');
      }
      
      const userId = currentUser.userId;
      const userFolder = `${userId}/`;
      
      const uploadResponse = await fetch('/api/upload-to-bucket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          content: uploadedFile.content,
          fileType: 'text/markdown',
          userFolder: userFolder
        }),
      })
      
      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json()
        console.log(`✅ Markdown file saved to bucket: ${file.name} in folder ${userFolder}`)
        
        // Update the uploaded file with bucket info
        uploadedFile.bucketKey = uploadResult.fileInfo.bucketKey
        uploadedFile.bucketPath = uploadResult.fileInfo.userFolder
        
        // Update user record with file metadata
        await updateUserFileMetadata(userId, {
          fileName: file.name,
          bucketKey: uploadResult.fileInfo.bucketKey,
          bucketPath: uploadResult.fileInfo.userFolder,
          fileSize: file.size,
          fileType: 'markdown',
          uploadedAt: new Date().toISOString()
        })
      } else {
        console.error(`❌ Failed to save markdown file to bucket: ${file.name}`)
      }
    } catch (error) {
      console.error(`❌ Error saving markdown file to bucket:`, error)
    }
    
    // Don't add to chat history - just make available as context
    writeMessage('Markdown file loaded successfully', 'success')
  } catch (error) {
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
    }
    console.error('Error loading markdown:', error)
    writeMessage(`Error: ${errorMessage}`, 'error')
  } finally {
    appState.isLoading = false
  }
}

const uploadTimelineFile = async (
  file: File,
  appState: AppState,
  writeMessage: (message: string, type: string) => void,
  currentUser?: any
) => {
  // Timeline files don't currently upload to bucket, so no user validation needed
  appState.isLoading = true
  try {
    const content = await file.text()
    
    const uploadedFile: UploadedFile = {
      id: `file-${Date.now()}-${Math.random()}`,
      name: file.name,
      size: file.size,
      type: 'timeline',
      content: content,
      originalFile: file,
      uploadedAt: new Date()
    }
    appState.uploadedFiles.push(uploadedFile)
    // Don't add to chat history - just make available as context
    writeMessage('Timeline file loaded successfully', 'success')
  } catch (error) {
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
    }
    console.error('Error loading timeline:', error)
    writeMessage(`Error: ${errorMessage}`, 'error')
  } finally {
    appState.isLoading = false
  }
}

const uploadRTFFile = async (
  file: File,
  appState: AppState,
  writeMessage: (message: string, type: string) => void,
  currentUser?: any
) => {
  // If currentUser is not provided, try to get it from AppStateManager
  if (!currentUser) {
    try {
      const { appStateManager } = await import('../utils/AppStateManager.js');
      currentUser = appStateManager.getStateProperty('currentUser');
    } catch (error) {
      console.warn(`Failed to get currentUser from AppStateManager:`, error);
    }
  }
  
  appState.isLoading = true
  try {
    const markdownContent = await processRTFFile(file)
    
    const uploadedFile: UploadedFile = {
      id: `file-${Date.now()}-${Math.random()}`,
      name: file.name.replace('.rtf', '.md'),
      size: file.size,
      type: 'markdown',
      content: markdownContent,
      originalFile: file,
      uploadedAt: new Date()
    }
    appState.uploadedFiles.push(uploadedFile)
    
    // Save file to user's bucket folder immediately upon import
    try {
      // CRITICAL: Must have authenticated user for file upload
      if (!currentUser || !currentUser.userId) {
        throw new Error('Authentication required to upload files. Please sign in.');
      }
      
      const userId = currentUser.userId;
      const userFolder = `${userId}/`;
      
      const uploadResponse = await fetch('/api/upload-to-bucket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: uploadedFile.name, // Use the .md filename
          content: uploadedFile.content,
          fileType: 'text/markdown',
          userFolder: userFolder
        }),
      })
      
      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json()
        console.log(`✅ RTF saved to bucket: ${uploadedFile.name} in folder ${userFolder}`)
        
        // Update the uploaded file with bucket info
        uploadedFile.bucketKey = uploadResult.fileInfo.bucketKey
        uploadedFile.bucketPath = uploadResult.fileInfo.userFolder
        
        // Update user record with file metadata
        await updateUserFileMetadata(userId, {
          fileName: uploadedFile.name,
          bucketKey: uploadResult.fileInfo.bucketKey,
          bucketPath: uploadResult.fileInfo.userFolder,
          fileSize: file.size,
          fileType: 'rtf',
          uploadedAt: new Date().toISOString()
        })
      } else {
        console.error(`❌ Failed to save RTF to bucket: ${uploadedFile.name}`)
      }
    } catch (error) {
      console.error(`❌ Error saving RTF to bucket:`, error)
    }
    
    writeMessage('RTF file processed and converted to Markdown successfully', 'success')
  } catch (error) {
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
    }
    console.error('Error processing RTF file:', error)
    writeMessage(`Error: ${errorMessage}`, 'error')
  } finally {
    appState.isLoading = false
  }
}

const uploadTextFile = async (
  file: File,
  appState: AppState,
  writeMessage: (message: string, type: string) => void,
  currentUser?: any
) => {
  // If currentUser is not provided, try to get it from AppStateManager
  if (!currentUser) {
    try {
      const { appStateManager } = await import('../utils/AppStateManager.js');
      currentUser = appStateManager.getStateProperty('currentUser');
    } catch (error) {
      console.warn(`Failed to get currentUser from AppStateManager:`, error);
    }
  }
  
  appState.isLoading = true
  try {
    const content = await file.text()
    
    const uploadedFile: UploadedFile = {
      id: `file-${Date.now()}-${Math.random()}`,
      name: file.name,
      size: file.size,
      type: 'text',
      content: content,
      originalFile: file,
      uploadedAt: new Date()
    }
    appState.uploadedFiles.push(uploadedFile)
    
    // Save file to user's bucket folder immediately upon import
    try {
      // CRITICAL: Must have authenticated user for file upload
      if (!currentUser || !currentUser.userId) {
        throw new Error('Authentication required to upload files. Please sign in.');
      }
      
      const userId = currentUser.userId;
      const userFolder = `${userId}/`;
      
      const uploadResponse = await fetch('/api/upload-to-bucket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          content: uploadedFile.content,
          fileType: 'text/plain',
          userFolder: userFolder
        }),
      })
      
      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json()
        console.log(`✅ Text file saved to bucket: ${file.name} in folder ${userFolder}`)
        
        // Update the uploaded file with bucket info
        uploadedFile.bucketKey = uploadResult.fileInfo.bucketKey
        uploadedFile.bucketPath = uploadResult.fileInfo.userFolder
        
        // Update user record with file metadata
        await updateUserFileMetadata(userId, {
          fileName: file.name,
          bucketKey: uploadResult.fileInfo.bucketKey,
          bucketPath: uploadResult.fileInfo.userFolder,
          fileSize: file.size,
          fileType: 'text',
          uploadedAt: new Date().toISOString()
        })
      } else {
        console.error(`❌ Failed to save text file to bucket: ${file.name}`)
      }
    } catch (error) {
      console.error(`❌ Error saving text file to bucket:`, error)
    }
    
    // Don't add to chat history - just make available as context
    writeMessage('Text file loaded successfully', 'success')
  } catch (error) {
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
    }
    console.error('Error loading text file:', error)
    writeMessage(`Error: ${errorMessage}`, 'error')
  } finally {
    appState.isLoading = false
  }
}

export const uploadFile = async (
  file: File,
  appState: AppState,
  writeMessage: (message: string, type: string) => void,
  currentUser?: any
) => {
  const content = await file.text()
  const fileType = detectFileType(file.name, content)
  
  
  switch (fileType) {
    case 'transcript':
      await uploadTranscriptFile(file, appState, writeMessage, currentUser)
      break
    case 'pdf':
      await uploadPDFFile(file, appState, writeMessage, currentUser)
      break
    case 'markdown':
      await uploadMarkdownFile(file, appState, writeMessage, currentUser)
      break
    case 'timeline':
      await uploadTimelineFile(file, appState, writeMessage, currentUser)
      break
    case 'rtf':
      await uploadRTFFile(file, appState, writeMessage, currentUser)
      break
    case 'text':
      await uploadTextFile(file, appState, writeMessage, currentUser)
      break
    default:
      writeMessage('Unsupported file type', 'error')
  }
}

const saveToNosh = async (
  appState: AppState,
  writeMessage: (message: string, type: string) => void,
  showPopup: () => void,
  closeSession: () => void
) => {
  const { generateTranscript } = useTranscript()
  appState.isLoading = true
  writeMessage('Saving to Nosh...', 'success')

  try {
    const transcriptContent = generateTranscript(appState) // Generate transcript with system events

    const response = await fetch(appState.writeuri, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${appState.jwt}`
      },
      body: JSON.stringify({
        content: transcriptContent
      })
    })

    await response.json()
    writeMessage('Saved to Nosh', 'success')
    appState.isLoading = false
    appState.popupContent = 'Session saved to Nosh. Close this window to end the session.'
    appState.popupContentFunction = closeSession
    showPopup()
  } catch (error) {
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message
    }
    writeMessage(`Error: ${errorMessage}`, 'error')
    appState.isLoading = false
  }
}

export { showAuth, showJWT, saveToNosh }
