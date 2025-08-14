import '@quasar/extras/material-icons/material-icons.css'
import 'quasar/src/css/index.sass'
import '@/css/quasar.variables.sass'
import '@/css/main.scss'
import 'overlayscrollbars/styles/overlayscrollbars.css'

import App from '@/entry/App.vue'
import { Quasar } from 'quasar'
import { createApp } from 'vue'
import quasarUserOptions from '@/quasar-user-options'

const app = createApp(App)
app.use(Quasar, quasarUserOptions)
app.mount('#app')
