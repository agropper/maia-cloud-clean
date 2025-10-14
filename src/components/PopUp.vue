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
          <!-- Vue PDF Viewer (new implementation with text selection) -->
          <VuePdfViewer 
            v-if="useVuePdfViewer"
            :file="currentFile"
            class="vue-pdf-viewer-container"
          />
          
          <!-- Original PDF.js implementation (fallback) -->
          <div v-else>
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
            
            <div v-else ref="pdfContainer" class="pdf-content">
              <!-- PDF pages will be rendered here with text layers -->
            </div>
          </div>
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
// Vue PDF Viewer for proper text selection
import VuePdfViewer from './VuePdfViewer.vue'

// Check what's available in pdfjsLib for text layer functionality
console.log('Available PDF.js exports:', Object.keys(pdfjsLib))
console.log('TextLayer available:', !!pdfjsLib.TextLayer)
console.log('renderTextLayer available:', !!pdfjsLib.renderTextLayer)

const { generateTimeline } = useTranscript()

export default {
  name: 'PopupComponent',
  components: {
    VueMarkdown,
    QIcon,
    QSpinnerDots,
    VuePdfViewer
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
      useVuePdfViewer: true as boolean, // Enable Vue PDF Viewer by default
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
        
        // Debug: Log the currentFile properties
        console.log('Current file properties:', this.currentFile)
        console.log('Has fileUrl:', !!this.currentFile.fileUrl)
        console.log('Has bucketKey:', !!(this.currentFile as any).bucketKey)
        console.log('Has originalFile:', !!this.currentFile.originalFile)
        
        // For debugging, let's use the URL-based approach first
        let pdf
        
        if (this.currentFile.fileUrl) {
          console.log('Loading PDF from URL:', this.currentFile.fileUrl)
          // @ts-ignore
          const task = pdfjsLib.getDocument({ url: this.currentFile.fileUrl })
          pdf = await task.promise
        } else if ((this.currentFile as any).bucketKey) {
          // For debugging, use the hardcoded file URL you specified via proxy
          const hardcodedBucketKey = 'fri1/archived/GROPPER_ADRIAN_09_24_25_1314.PDF'
          const proxyUrl = `/api/proxy-pdf/${hardcodedBucketKey}`
          console.log('Loading PDF from proxy URL:', proxyUrl)
          // @ts-ignore
          const task = pdfjsLib.getDocument({ url: proxyUrl })
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
        
        const maxPages = Math.min(pdf.numPages, 3)
        
        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
          console.log(`Rendering page ${pageNum}`)
          const page = await pdf.getPage(pageNum)
          const naturalViewport = page.getViewport({ scale: 1.0 })
          const naturalWidth = naturalViewport.width
          const naturalHeight = naturalViewport.height
          
          // Calculate optimal scale with high-DPI support
          const devicePixelRatio = window.devicePixelRatio || 1
          const containerWidth = 800 // Approximate container width
          const baseScale = Math.min(containerWidth / naturalWidth, 1.0)
          const actualScale = baseScale * devicePixelRatio
          const viewport = page.getViewport({ scale: actualScale })
          
          console.log(`Page ${pageNum} scaling: baseScale=${baseScale.toFixed(2)}, devicePixelRatio=${devicePixelRatio}, actualScale=${actualScale.toFixed(2)}`)
          
          // Create page container
          const pageContainer = document.createElement('div')
          pageContainer.className = 'pdf-page-container'
          pageContainer.style.position = 'relative'
          pageContainer.style.margin = '0 auto 16px auto'
          pageContainer.style.maxWidth = '100%'
          
          // Create canvas
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          
          // Set canvas size for high-DPI rendering
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          
          // Set display size (scaled down for display)
          const displayWidth = viewport.width / devicePixelRatio
          const displayHeight = viewport.height / devicePixelRatio
          canvas.style.width = `${displayWidth}px`
          canvas.style.height = `${displayHeight}px`
          canvas.style.display = 'block'
          canvas.style.maxWidth = '100%'
          canvas.style.height = 'auto'
          
          console.log(`Page ${pageNum} canvas: ${canvas.width}x${canvas.height} (display: ${displayWidth.toFixed(0)}x${displayHeight.toFixed(0)})`)
          
          // Create text layer container (matches display size, not high-DPI canvas size)
          const textLayerDiv = document.createElement('div')
          textLayerDiv.className = 'text-layer'
          textLayerDiv.style.position = 'absolute'
          textLayerDiv.style.top = '0'
          textLayerDiv.style.left = '0'
          textLayerDiv.style.width = `${displayWidth}px`
          textLayerDiv.style.height = `${displayHeight}px`
          textLayerDiv.style.overflow = 'hidden'
          textLayerDiv.style.opacity = '1.0'
          textLayerDiv.style.lineHeight = '1.0'
          textLayerDiv.style.pointerEvents = 'auto'
          
          // Render canvas
          // @ts-ignore
          await page.render({ canvasContext: ctx, viewport }).promise
          
          // Render text layer
          try {
            const textContent = await page.getTextContent()
            console.log(`Page ${pageNum} text content:`, textContent)
            
            // Create display viewport for text layer (not high-DPI viewport)
            const displayViewport = page.getViewport({ scale: baseScale })
            console.log(`Page ${pageNum} display viewport: ${displayViewport.width}x${displayViewport.height}`)
            
            // Use PDF.js TextLayer class (should be available in legacy build)
            if (pdfjsLib.TextLayer) {
              console.log('Using PDF.js TextLayer class')
              const textLayer = new pdfjsLib.TextLayer({
                textLayerDiv,
                pageIndex: pageNum - 1,
                viewport: displayViewport
              })
              textLayer.setTextContent(textContent)
              textLayer.render()
              console.log(`Text layer rendered for page ${pageNum} using TextLayer class`)
            } else if (pdfjsLib.renderTextLayer) {
              console.log('Using PDF.js renderTextLayer function')
              pdfjsLib.renderTextLayer({
                textContent: textContent,
                container: textLayerDiv,
                viewport: displayViewport,
                textDivs: []
              })
              console.log(`Text layer rendered for page ${pageNum} using renderTextLayer`)
            } else {
              console.log('No PDF.js text layer functions available, creating simple text layer')
              // Fallback: create simple text layer manually with display viewport
              this.createSimpleTextLayer(textLayerDiv, textContent, displayViewport)
            }
          } catch (textError) {
            console.warn(`Failed to render text layer for page ${pageNum}:`, textError)
          }
          
          // Add elements to page container
          pageContainer.appendChild(canvas)
          pageContainer.appendChild(textLayerDiv)
          container.appendChild(pageContainer)
          
          console.log(`Page ${pageNum} rendered successfully with text layer`)
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

    createSimpleTextLayer(textLayerDiv: HTMLElement, textContent: any, viewport: any) {
      // Simple fallback text layer implementation
      textLayerDiv.innerHTML = ''
      
      if (textContent && textContent.items) {
        textContent.items.forEach((item: any, index: number) => {
          const span = document.createElement('span')
          span.textContent = item.str
          span.style.position = 'absolute'
          span.style.color = 'rgba(255, 0, 0, 0.5)' // Red for debugging
          span.style.whiteSpace = 'pre'
          span.style.cursor = 'text'
          span.style.transformOrigin = '0% 0%'
          
          // Position the text based on the item's transform using display viewport
          if (item.transform) {
            const transform = item.transform
            // Use the transform coordinates directly (they're already scaled for the display viewport)
            const left = transform[4]
            const top = transform[5]
            const fontSize = Math.abs(transform[0])
            
            span.style.left = `${left}px`
            span.style.top = `${top}px`
            span.style.fontSize = `${fontSize}px`
            span.style.fontFamily = item.fontName || 'sans-serif'
            
            // Debug first few items
            if (index < 5) {
              console.log(`Text item ${index}: "${item.str}" at (${left.toFixed(1)}, ${top.toFixed(1)}) size ${fontSize.toFixed(1)}px`)
            }
          }
          
          // Add hover effect
          span.addEventListener('mouseenter', () => {
            span.style.backgroundColor = 'rgba(255, 255, 0, 0.3)'
          })
          span.addEventListener('mouseleave', () => {
            span.style.backgroundColor = 'transparent'
          })
          
          textLayerDiv.appendChild(span)
        })
      }
      
      console.log('Simple text layer created with', textContent?.items?.length || 0, 'text items using display viewport')
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

/* Vue PDF Viewer container */
.vue-pdf-viewer-container {
  width: 100%;
  height: 100%;
  min-height: 500px;
}

/* PDF page container styling */
.pdf-page-container {
  position: relative;
  margin: 0 auto 16px auto;
  max-width: 100%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  background: white;
}

/* PDF.js Text Layer styling */
.text-layer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  opacity: 0.2;
  line-height: 1.0;
  pointer-events: auto;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
  user-select: text;
}

.text-layer span {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: text;
  transform-origin: 0% 0%;
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
}

.text-layer span:hover {
  background-color: rgba(255, 255, 0, 0.3);
}

.text-layer span::selection {
  background-color: rgba(0, 123, 255, 0.3);
}

/* PDF.js specific text layer classes */
.textLayer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  opacity: 0.2;
  line-height: 1.0;
  pointer-events: auto;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
  user-select: text;
}

.textLayer > span {
  color: transparent;
  position: absolute;
  white-space: pre;
  cursor: text;
  transform-origin: 0% 0%;
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
}

.textLayer > span:hover {
  background-color: rgba(255, 255, 0, 0.3);
}

.textLayer > span::selection {
  background-color: rgba(0, 123, 255, 0.3);
}

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
