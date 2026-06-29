import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'
import MainView from '@renderer/views/MainView.vue'

// Electron'da file:// protokolü nedeniyle hash history kullanılır.
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'main',
    component: MainView
  }
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes
})
