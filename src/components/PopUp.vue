<template>
  <div v-if="isVisible" class="popup-overlay" @click="closePopup">
    <div class="popup-container" @click.stop>
      <!-- Header -->
      <div class="popup-header">
        <h3 class="popup-title">File Content</h3>
        <button @click="closePopup" class="popup-close-btn">Close</button>
      </div>
      
      <!-- Content Area -->
      <div class="popup-content">
        <!-- PDF viewer -->
        <div v-if="isPDF" class="pdf-viewer-container">
          <div v-if="isLoading" class="pdf-loading-overlay">
            <q-spinner-dots size="40px" color="primary" />
            <p>Loading PDF...</p>
          </div>
          
          <div v-if="pdfError" class="pdf-error-overlay">
            <q-icon name="error_outline" size="48px" color="warning" />
            <h3>PDF Could Not Be Displayed</h3>
            <p>{{ pdfErrorMessage }}</p>
            <div class="pdf-error-content">
              <h4>Extracted Text Content:</h4>
              <pre class="pdf-error-text">{{ currentFile?.content || 'No content available' }}</pre>
            </div>
          </div>
          
          <div v-else ref="pdfContainer" class="pdf-content"></div>
        </div>

        <!-- Markdown / non-PDF content -->
        <div v-else class="text-content">
          <VueMarkdown :source="content" />
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { useTranscript } from '../composables/useTranscript'
import type { PropType } from 'vue'
import type { AppState, UploadedFile } from '../types'
import VueMarkdown from 'vue-markdown-render'
import { QIcon, QSpinnerDots } from 'quasar'
// PDF.js legacy build for better bundler compatibility
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf'

const { generateTimeline } = useTranscript()

export default {
  name: 'PopupComponent',
  components: {
    VueMarkdown,
    QIcon,
    QSpinnerDots
  },
  props: {
    appState: {
      type: Object as PropType<AppState>,
      required: true
    },
    content: {
      type: String,
      default: ''
    },
    onClose: {
      type: Function,
      default: () => {}
    },
    buttonText: {
      type: String,
      default: 'OK'
    },
    currentFile: {
      type: Object as PropType<UploadedFile | null>,
      default: null
    }
  },
  data() {
    return {
      isVisible: false as boolean,
      displayMode: 'auto' as 'auto' | 'pdf' | 'text', // Track how to display the file
      isLoading: false as boolean,
      pdfError: false as boolean,
      pdfErrorMessage: '' as string,
      // PDF rendering properties
      pdfDocument: null as any
    }
  },
  computed: {
    isPDF(): boolean {
      // Use displayMode if set, otherwise auto-detect
      if (this.displayMode === 'pdf') return true
      if (this.displayMode === 'text') return false
      return !!(this.currentFile && this.currentFile.type === 'pdf')
    }
  },
  mounted() {
    // Use locally served worker to avoid CSP issues
    // @ts-ignore
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'
    
    // Set up event listeners
    document.addEventListener('keydown', this.handleKeydown)
  },
  beforeUnmount() {
    // Clean up event listeners
    document.removeEventListener('keydown', this.handleKeydown)
    
    // Clean up PDF document
    if (this.pdfDocument) {
      this.pdfDocument.destroy()
      this.pdfDocument = null
    }
  },
  watch: {
    isVisible(val: boolean) {
      if (val && this.isPDF) {
        this.$nextTick(() => this.loadPDF())
      }
    },
    currentFile: {
      handler() {
        // Reset display mode when file changes
        this.displayMode = 'auto'
        if (this.isVisible && this.isPDF) {
          this.$nextTick(() => this.loadPDF())
        }
      },
      deep: true
    }
  },
  methods: {
    openPopup() {
      this.isVisible = true
    },
    closePopup() {
      this.isVisible = false
      this.onClose()
    },
    async loadPDF() {
      if (!this.currentFile) return
      
      this.isLoading = true
      this.pdfError = false
      this.pdfErrorMessage = ''
      
      try {
        // Use locally served worker to avoid CSP issues
        // @ts-ignore
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'
        
        // For debugging, let's use the URL-based approach first
        let pdf
        
        if (this.currentFile.fileUrl) {
          console.log('Loading PDF from URL:', this.currentFile.fileUrl)
          // @ts-ignore
          const task = pdfjsLib.getDocument({ url: this.currentFile.fileUrl })
          pdf = await task.promise
        } else if (this.currentFile.originalFile instanceof File) {
          // Fresh File object - use arrayBuffer()
          console.log('Loading PDF from File object')
          const buf = await this.currentFile.originalFile.arrayBuffer()
          // @ts-ignore
          const task = pdfjsLib.getDocument({ data: buf })
          pdf = await task.promise
        } else {
          throw new Error('No PDF source available')
        }

        console.log('PDF loaded successfully, pages:', pdf.numPages)
        
        // Simple rendering approach - render first 10 pages
        const container = document.querySelector('.pdf-content') as HTMLDivElement
        if (!container) return
        
        // Clear any existing content
        container.innerHTML = ''
        
        const maxPages = Math.min(pdf.numPages, 10)
        
        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
          console.log(`Rendering page ${pageNum}`)
          const page = await pdf.getPage(pageNum)
          const naturalViewport = page.getViewport({ scale: 1.0 })
          const naturalWidth = naturalViewport.width
          const naturalHeight = naturalViewport.height
          
          // Use conservative scale
          const actualScale = Math.min(1.0, 800 / naturalWidth, 600 / naturalHeight)
          const viewport = page.getViewport({ scale: actualScale })
          
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.style.width = `${viewport.width}px`
          canvas.style.height = `${viewport.height}px`
          canvas.style.display = 'block'
          canvas.style.margin = '0 auto 16px auto'
          canvas.style.maxWidth = '100%'
          canvas.style.height = 'auto'
          
          // @ts-ignore
          await page.render({ canvasContext: ctx, viewport }).promise
          container.appendChild(canvas)
          
          console.log(`Page ${pageNum} rendered successfully`)
        }
        
        this.isLoading = false
        console.log('PDF rendering completed')
        
      } catch (error) {
        this.isLoading = false
        this.pdfError = true
        this.pdfErrorMessage = error instanceof Error ? error.message : 'Failed to load PDF'
        console.error('PDF loading error:', error)
      }
    },

    saveMarkdown() {
      const url = URL.createObjectURL(
        new Blob([generateTimeline(this.appState.timeline, this.appState.timelineChunks)], {
          type: 'text/markdown'
        })
      )
      const a = document.createElement('a')
      const currentDate = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      a.href = url
      a.download = 'timeline-' + currentDate + '.md'
      a.click()
      URL.revokeObjectURL(url)
      this.$q.notify({
        message: 'Content Saved to Markdown File',
        color: 'green',
        position: 'top'
      })
    },
    copyToClipboard() {
      navigator.clipboard
        .writeText(generateTimeline(this.appState.timeline, this.appState.timelineChunks))
        .then(() => {
          this.$q.notify({
            message: 'Content copied to clipboard',
            color: 'green',
            position: 'top'
          })
        })
        .catch(() => {
          this.$q.notify({
            message: 'Failed to copy content',
            color: 'red',
            position: 'top'
          })
        })
    }
  }
}
</script>

<style scoped>
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.8);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.popup-container {
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  position: relative;
  width: 90vw;
  height: 90vh;
  max-width: 90vw;
  max-height: 90vh;
}

.popup-header {
  padding: 15px 20px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.popup-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #2c3e50;
}

.popup-close-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  background-color: #1976d2;
  color: white;
  transition: background-color 0.2s;
}

.popup-close-btn:hover {
  background-color: #1565c0;
}

.popup-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.pdf-viewer-container {
  flex: 1;
  min-height: 0;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
  background-color: #f8f9fa;
  position: relative;
  max-width: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.pdf-content {
  padding: 16px;
  overflow-y: auto;
  overflow-x: hidden;
  flex: 1;
  min-height: 0;
  max-width: 100%;
  box-sizing: border-box;
  height: 100%;
}

.pdf-virtual-container {
  position: relative;
  width: 100%;
}

.pdf-page-container {
  position: absolute;
  width: 100%;
}

.pdf-page {
  position: relative;
  margin: 0 auto 16px auto;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  background: white;
}

.pdf-canvas {
  display: block;
  margin: 0;
  max-width: 100%;
  height: auto;
}

/* Text layer and annotation layer styles will be added when PDF.js exports are available */

.pdf-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #f8f9fa;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  z-index: 10;
}

.pdf-loading-overlay p {
  margin: 16px 0 0 0;
  color: #7f8c8d;
  font-size: 1.1rem;
}

.pdf-error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #f8f9fa;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  z-index: 10;
  padding: 20px;
  overflow-y: auto;
}

.pdf-error-overlay h3 {
  margin: 16px 0 8px 0;
  color: #2c3e50;
  font-size: 1.5rem;
}

.pdf-error-overlay p {
  margin: 0 0 24px 0;
  color: #7f8c8d;
  font-size: 1.1rem;
}

.pdf-error-content {
  text-align: left;
  max-width: 100%;
  width: 100%;
}

.pdf-error-content h4 {
  margin: 0 0 12px 0;
  color: #2c3e50;
  font-size: 1.1rem;
}

.pdf-error-text {
  background-color: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 12px;
  font-size: 12px;
  white-space: pre-wrap;
  word-wrap: break-word;
  max-height: 300px;
  overflow-y: auto;
  margin: 0;
}

.text-content {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

/* Responsive design */
@media (max-width: 768px) {
  .popup-overlay {
    padding: 10px;
  }
  
  .popup-container {
    width: 95vw;
    height: 95vh;
    max-width: 95vw;
    max-height: 95vh;
  }
  
  .popup-header {
    padding: 12px 16px;
  }
  
  .popup-title {
    font-size: 1.1rem;
  }
  
  .popup-close-btn {
    padding: 6px 12px;
    font-size: 13px;
  }
  
  .pdf-viewer-container {
    min-height: 400px;
  }
  
  .text-content {
    padding: 16px;
  }
}
</style>
