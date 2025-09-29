import { Notify, ClosePopup, Ripple } from 'quasar'

export default {
  config: {
    // Fix accessibility issue with dialog focus management
    dialog: {
      // Ensure proper focus management for dialogs
      focusTrap: true,
      // Prevent aria-hidden conflicts with focused elements
      preventFocus: false
    }
  },
  plugins: {
    Notify
  },
  directives: {
    ClosePopup,
    Ripple
  }
}
