import { createRouter, createWebHistory } from 'vue-router'
import ProxyView from './views/ProxyView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/proxy' },
    { path: '/proxy', name: 'proxy', component: ProxyView },
    // Heavier views are split into their own chunks.
    { path: '/repeater', name: 'repeater', component: () => import('./views/RepeaterView.vue') },
    { path: '/decoder', name: 'decoder', component: () => import('./views/DecoderView.vue') },
    { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/proxy' },
  ],
})
