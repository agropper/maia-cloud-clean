<template>
  <div v-if="isVisible" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.5); display: flex; justify-content: center; align-items: center; z-index: 9999;" @click="closePopup">
    <div style="background: white; border-radius: 8px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3); width: 80vw; max-width: 1000px; height: 85vh;" @click.stop>
      <div style="padding: 15px; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0;">File Content</h3>
        <button @click="closePopup" style="padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500; background-color: #007bff; color: white;">Close</button>
      </div>
      
      <OverlayScrollbarsComponent style="height: calc(85vh - 70px);">
        <!-- PDF viewer -->
        <div v-if="isPDF" ref="pdfContainer" style="width: 100%; height: 100%; padding: 16px; box-sizing: border-box;"></div>

        <!-- Markdown / non-PDF content -->
        <div v-else style="min-height: 100%; padding: 20px; box-sizing: border-box;">
          <VueMarkdown :source="content" />
        </div>
      </OverlayScrollbarsComponent>
    </div>
  </div>
</template>

<script lang="ts">
import { useTranscript } from '../composables/useTranscript'
import type { PropType } from 'vue'
import type { AppState, UploadedFile } from '../types'
import VueMarkdown from 'vue-markdown-render'
import { OverlayScrollbarsComponent } from 'overlayscrollbars-vue'
// PDF.js legacy build for better bundler compatibility
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf'

const { generateTimeline } = useTranscript()

export default {
  name: 'PopupComponent',
  components: {
    VueMarkdown,
    OverlayScrollbarsComponent
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
      displayMode: 'auto' as 'auto' | 'pdf' | 'text' // Track how to display the file
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
      const container = this.$refs.pdfContainer as HTMLDivElement | undefined
      if (!container || !this.currentFile) return
      
      try {
        container.innerHTML = ''
        const loading = document.createElement('div')
        loading.textContent = 'Loading PDF…'
        loading.style.padding = '8px'
        container.appendChild(loading)


        


        // Handle both fresh File objects and database-loaded objects
        let pdf
        
        if (this.currentFile.originalFile instanceof File) {
          // Fresh File object - use arrayBuffer()
  
          const buf = await this.currentFile.originalFile.arrayBuffer()
          // @ts-ignore
          const task = pdfjsLib.getDocument({ data: buf })
          pdf = await task.promise
        } else if (this.currentFile.originalFile && typeof this.currentFile.originalFile === 'object' && this.currentFile.originalFile.base64) {
          // Database-loaded file with base64 data - reconstruct the PDF
  
          try {
            const base64 = this.currentFile.originalFile.base64
            console.log('🔍 [PDF FAILS] PopUp.loadPDF - currentFile structure:', {
              hasOriginalFile: !!this.currentFile.originalFile,
              originalFileKeys: Object.keys(this.currentFile.originalFile || {}),
              base64Length: base64?.length || 0,
              base64Preview: base64?.substring(0, 50) || 'none',
              currentFileContent: this.currentFile.content?.substring(0, 50) || 'none'
            });
            console.log('🔍 [PDF DEBUG] Attempting to decode base64:', {
              base64Length: base64.length,
              base64Type: typeof base64,
              base64Preview: base64.substring(0, 100),
              base64End: base64.substring(Math.max(0, base64.length - 100)),
              isValidBase64: /^[A-Za-z0-9+/]*={0,2}$/.test(base64),
              currentFileStructure: {
                hasOriginalFile: !!this.currentFile.originalFile,
                originalFileKeys: Object.keys(this.currentFile.originalFile || {}),
                originalFileType: typeof this.currentFile.originalFile
              }
            })
            
            // Check if base64 is suspiciously short (likely corrupted)
            if (base64.length < 1000) {
              console.warn('🔍 [PDF] Base64 data is suspiciously short, likely corrupted. File size:', this.currentFile.size, 'Base64 length:', base64.length)
              throw new Error('PDF binary data appears to be corrupted - showing extracted text instead')
            }
            
            const binaryString = atob(base64)
            const bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i)
            }
            // @ts-ignore
            const task = pdfjsLib.getDocument({ data: bytes })
            pdf = await task.promise
          } catch (base64Error) {
            console.error('🔍 [PDF] Base64 decoding failed:', base64Error)
            console.error('🔍 [PDF DEBUG] Full currentFile structure:', this.currentFile)
            throw new Error('PDF binary not available - showing extracted text instead')
          }
        } else if (this.currentFile.fileUrl) {
          // @ts-ignore
  
          const task = pdfjsLib.getDocument({ url: this.currentFile.fileUrl })
          pdf = await task.promise
        } else {
          // For database-loaded files without base64 data (old format)
          // Fall back to showing extracted text content
          console.error('🔍 [PDF] No PDF binary data available - structure:', this.currentFile)
          throw new Error('PDF binary not available - showing extracted text instead')
        }

        // Remove loading message
        if (container.contains(loading)) {
          container.removeChild(loading)
        }

        const maxPages = 10
        const totalPages = Math.min(pdf.numPages, maxPages)
        
        // Render pages
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
          const page = await pdf.getPage(pageNum)
          const viewport = page.getViewport({ scale: 1.25 })
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.style.display = 'block'
          canvas.style.margin = '0 auto 16px auto'
          // @ts-ignore
          await page.render({ canvasContext: ctx, viewport }).promise
          container.appendChild(canvas)
        }
        
      } catch (e) {
        console.error('PDF loading error:', e)
        
        // Check if this is a database-loaded file that should show text instead
        if (e.message && e.message.includes('PDF binary not available')) {
          // Switch to text view for database files
          this.displayMode = 'text'
          return
        }
        
        // Only show error if container still exists and doesn't have content
        if (container && container.children.length === 0) {
          const msg = document.createElement('div')
          msg.textContent = 'Failed to display PDF. Showing extracted text instead.'
          msg.style.color = '#c00'
          msg.style.padding = '8px'
          container.appendChild(msg)
          
          // Also show the extracted text content
          const textContent = document.createElement('div')
          textContent.style.padding = '16px'
          textContent.style.borderTop = '1px solid #ddd'
          textContent.style.marginTop = '16px'
          textContent.innerHTML = `<h4>Extracted Text Content:</h4><pre style="white-space: pre-wrap; font-size: 12px;">${this.currentFile.content || 'No content available'}</pre>`
          container.appendChild(textContent)
        }
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
:root {
  --os-size: 24px; /* scrollbar thickness */
}
</style>
