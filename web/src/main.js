import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './assets/style.css';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import 'element-plus/theme-chalk/dark/css-vars.css';
import zhCn from 'element-plus/es/locale/lang/zh-cn';

const app = createApp(App);
app.use(router);
app.use(ElementPlus, { size: 'default', locale: zhCn });

// theme: light / dark / system, aligned with fnpackup fnos-theme-mode style
const applyTheme = () => {
  const saved = localStorage.getItem('sshterm-theme') || 'system';
  const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved === 'system' ? (isSystemDark ? 'dark' : 'light') : saved;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.setAttribute('data-theme', theme);
};
applyTheme();
window.__sshtermApplyTheme = applyTheme;
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

app.mount('#app');
