import './assets/css/main.css'
import 'vue-sonner/style.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { initNotificationListener } from './utils/notificationListener'
import { applyColorMode } from './composables/useColorMode'

const app = createApp(App)

app.use(createPinia())
app.use(router)

applyColorMode(router)

// Initialize Echo listener
initNotificationListener();

app.mount('#app')
