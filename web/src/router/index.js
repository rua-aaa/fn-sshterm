import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    name: 'Sessions',
    component: () => import('@/views/sessions/Index.vue'),
  },
  {
    path: '/profiles',
    name: 'Profiles',
    component: () => import('@/views/profiles/Index.vue'),
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
