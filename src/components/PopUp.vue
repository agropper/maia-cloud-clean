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
      isVisible: false as boolean
    }
  },
  computed: {
    isPDF(): boolean {
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

        // Prefer rendering from the original File to avoid URL/CSP issues
        const hasFile = !!this.currentFile.originalFile
        let pdf
        if (hasFile) {
          const buf = await (this.currentFile!.originalFile as File).arrayBuffer()
          // @ts-ignore
          const task = pdfjsLib.getDocument({ data: buf })
          pdf = await task.promise
        } else if (this.currentFile.fileUrl) {
          // @ts-ignore
          const task = pdfjsLib.getDocument({ url: this.currentFile.fileUrl })
          pdf = await task.promise
        } else {
          throw new Error('No PDF source available')
        }

        container.removeChild(loading)

        const maxPages = 10
        const totalPages = Math.min(pdf.numPages, maxPages)
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
        const msg = document.createElement('div')
        msg.textContent = 'Failed to display PDF.'
        msg.style.color = '#c00'
        msg.style.padding = '8px'
        container?.appendChild(msg)
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
