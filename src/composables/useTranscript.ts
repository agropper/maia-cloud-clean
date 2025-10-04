import type { AppState, ChatHistory, TimelineChunk } from '../types'

import { useChatLogger } from './useChatLogger'

interface TranscriptSection {
  type: 'conversation' | 'context' | 'timeline' | 'audit' | 'session' | 'signature' | 'uploadedFiles'
  content: string
}

const formatDate = (date: string | number | Date) => {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function useTranscript() {
  const { systemEvents, generateAuditTrail, logSystemEvent } = useChatLogger()

  const generateSessionInfo = (appState: AppState): string => {
    return `### Session Information\n
- Date: ${formatDate(new Date())}
- User: ${appState.userName}
- Total Messages: ${appState.chatHistory.filter((msg) => msg.role !== 'system').length}`
  }

  const generateConversation = (chatHistory: ChatHistory): string => {
    return (
      `### Conversation\n\n` +
      chatHistory
        .map((msg) => {
          // Find the active context at the time this message was logged
          const contextSwitch = systemEvents.value
            .filter((event) => event.type === 'context_switch')
            .reverse()
            .find((event) => true) // Get the most recent context switch

          const contextInfo =
            contextSwitch && msg.role !== 'system' && contextSwitch.metadata.activeChunkIndex !== undefined
              ? ` [Context: Epoch ${contextSwitch.metadata.activeChunkIndex + 1}]`
              : ''
          // console.log(msg)
          return msg.role !== 'system'
            ? `##### ${msg.role}${contextInfo}:\n${msg.content}`
            : `##### ${msg.role}${contextInfo}:\n${typeof msg.content === 'string' ? msg.content.split('\n')[0] : ''}`
        })
        .join('\n\n')
    )
  }

  const generateEpochs = (timelineChunks: TimelineChunk[]): string => {
    return (
      `### Epochs\n\n` +
      timelineChunks
        .map(
          (chunk) =>
            `#### Epoch ${chunk.epoch}\n` +
            `- Date Range: ${chunk.dateRange.start} to ${chunk.dateRange.end}\n` +
            `- Token Count: ${chunk.tokenCount.toLocaleString()}`
        )
        .join('\n\n')
    )
  }

  const generateTimeline = (timeline: string, timelineChunks: TimelineChunk[]): string => {
    if (timelineChunks.length === 0) {
      return `### Complete Timeline\n\n${timeline}`
    } else {
      return `### Complete Timeline\n\n${timelineChunks.map((chunk) => chunk.content).join('\n\n')}`
    }
  }

  const generateAuditSection = (): string => {
    const audit = generateAuditTrail()
    return (
      `### Audit Trail\n\n` +
      audit.map((entry) => `- ${formatDate(entry.timestamp)}: ${entry.content}`).join('\n')
    )
  }

  const generateSignature = (username: string): string => {
    return `### Signature\n\nSigned by: ${username}\nDate: ${new Date().toDateString()}`
  }

  const generateUploadedFiles = (uploadedFiles: any[]): string => {
    if (!uploadedFiles || uploadedFiles.length === 0) {
      return ''
    }

    return (
      `### Uploaded Files (Context)\n\n` +
      uploadedFiles
        .map((file) => {
          const fileSize = file.size ? ` (${(file.size / 1024).toFixed(1)}KB)` : ''
          return `- **${file.name}**${fileSize} - ${file.type}`
        })
        .join('\n')
    )
  }

  const generateTranscript = (appState: AppState, includeSystem: boolean = false): string => {
    console.log('[SAVE] generateTranscript called with:', {
      includeSystem,
      messageCount: appState.chatHistory.length,
      hasChunkedTimeline: appState.hasChunkedTimeline,
      userName: appState.userName,
      uploadedFilesCount: appState.uploadedFiles?.length || 0
    });
    
    logSystemEvent(
      'Generating transcript',
      {
        includeSystem,
        messageCount: appState.chatHistory.length,
        hasChunkedTimeline: appState.hasChunkedTimeline
      },
      appState
    )

    console.log('[SAVE] Starting to generate transcript sections...');
    
    console.log('[SAVE] Generating session info...');
    const sessionContent = generateSessionInfo(appState);
    console.log('[SAVE] Session info generated, length:', sessionContent.length);
    
    console.log('[SAVE] Generating uploaded files...');
    const uploadedFilesContent = generateUploadedFiles(appState.uploadedFiles);
    console.log('[SAVE] Uploaded files generated, length:', uploadedFilesContent.length);
    
    console.log('[SAVE] Generating conversation...');
    const conversationContent = generateConversation(appState.chatHistory);
    console.log('[SAVE] Conversation generated, length:', conversationContent.length);
    
    console.log('[SAVE] Generating epochs...');
    const epochsContent = generateEpochs(appState.timelineChunks);
    console.log('[SAVE] Epochs generated, length:', epochsContent.length);
    
    console.log('[SAVE] Generating audit section...');
    const auditContent = generateAuditSection();
    console.log('[SAVE] Audit section generated, length:', auditContent.length);
    
    console.log('[SAVE] Generating signature...');
    const signatureContent = generateSignature(appState.userName);
    console.log('[SAVE] Signature generated, length:', signatureContent.length);

    const sections: TranscriptSection[] = [
      {
        type: 'session',
        content: sessionContent
      },
      {
        type: 'uploadedFiles',
        content: uploadedFilesContent
      },
      {
        type: 'conversation',
        content: conversationContent
      },
      {
        type: 'context',
        content: epochsContent
      },
      {
        type: 'audit',
        content: auditContent
      },
      {
        type: 'signature',
        content: signatureContent
      }
    ]

    if (includeSystem) {
      console.log('[SAVE] Generating timeline...');
      const timelineContent = generateTimeline(appState.timeline, appState.timelineChunks);
      console.log('[SAVE] Timeline generated, length:', timelineContent.length);
      sections.push({
        type: 'timeline',
        content: timelineContent
      })
    }

    console.log('[SAVE] Assembling final transcript from', sections.length, 'sections...');
    const finalTranscript = sections.map((section) => section.content).join('\n\n') + '\n';
    console.log('[SAVE] Final transcript assembled, total length:', finalTranscript.length);
    
    return finalTranscript;
  }

  return {
    generateTranscript,
    generateTimeline,
    generateUploadedFiles
  }
}
