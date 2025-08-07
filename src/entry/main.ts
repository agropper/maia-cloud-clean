import '@quasar/extras/material-icons/material-icons.css'
import 'quasar/src/css/index.sass'
import '@/css/quasar.variables.sass'
import '@/css/main.scss'

import App from '@/entry/App.vue'
import { Quasar } from 'quasar'
import { createApp } from 'vue'
import quasarUserOptions from '@/quasar-user-options'

createApp(App).use(Quasar, quasarUserOptions).mount('#app')
