import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import App from './App.vue';
import { initializeDemo } from './services/demo';
import './style.scss';
const router = createRouter({ history: createWebHashHistory(), routes: [{ path: '/:pathMatch(.*)*', component: App }] });
void initializeDemo().then(() => createApp(App).use(createPinia()).use(router).mount('#app'));
