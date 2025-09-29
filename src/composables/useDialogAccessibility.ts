import { onMounted, onUnmounted } from 'vue'

/**
 * Composable to fix Quasar dialog accessibility issues
 * Handles aria-hidden conflicts with focused elements
 */
export function useDialogAccessibility() {
  let observer: MutationObserver | null = null

  const fixDialogAccessibility = () => {
    // Find all dialog backdrops with aria-hidden="true"
    const backdrops = document.querySelectorAll('.q-dialog__backdrop[aria-hidden="true"]')
    
    backdrops.forEach(backdrop => {
      // Check if any focused element is inside this backdrop
      const focusedElement = document.activeElement
      if (focusedElement && backdrop.contains(focusedElement)) {
        // Remove aria-hidden from backdrop when it contains focused element
        backdrop.removeAttribute('aria-hidden')
        
        // Add inert attribute instead for better accessibility
        backdrop.setAttribute('inert', 'true')
        
        console.log('🔧 [Accessibility] Fixed dialog backdrop aria-hidden conflict')
      }
    })
  }

  const setupAccessibilityObserver = () => {
    // Watch for changes in dialog elements
    observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && 
            (mutation.attributeName === 'aria-hidden' || mutation.attributeName === 'class')) {
          fixDialogAccessibility()
        }
      })
    })

    // Start observing
    observer.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ['aria-hidden', 'class']
    })
  }

  const handleFocusIn = (event: FocusEvent) => {
    const target = event.target as Element
    if (target) {
      // Check if focused element is inside a dialog backdrop
      const backdrop = target.closest('.q-dialog__backdrop[aria-hidden="true"]')
      if (backdrop) {
        // Remove aria-hidden from backdrop
        backdrop.removeAttribute('aria-hidden')
        backdrop.setAttribute('inert', 'true')
        
        console.log('🔧 [Accessibility] Fixed dialog focus accessibility')
      }
    }
  }

  onMounted(() => {
    // Set up the accessibility fixes
    setupAccessibilityObserver()
    
    // Listen for focus events
    document.addEventListener('focusin', handleFocusIn)
    
    // Initial fix
    fixDialogAccessibility()
  })

  onUnmounted(() => {
    if (observer) {
      observer.disconnect()
    }
    document.removeEventListener('focusin', handleFocusIn)
  })

  return {
    fixDialogAccessibility
  }
}
