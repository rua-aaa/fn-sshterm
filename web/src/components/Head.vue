<template>
  <div class="head-wrap flex flex-nowrap">
    <div class="logo">
      <span class="badge">&gt;_</span>
      <span class="name">sshterm</span>
      <span class="sub">SSH xterm</span>
    </div>
    <span class="flex-1"></span>
    <div class="actions flex flex-nowrap">
      <el-button size="small" round @click="togglePage">
        {{ isProfiles ? '返回终端' : '连接配置' }}
      </el-button>
      <el-switch
        v-model="dark"
        inline-prompt
        :active-icon="Moon"
        :inactive-icon="Sunny"
        @change="toggleTheme"
        class="mgl-1"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { Moon, Sunny } from '@element-plus/icons-vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
const isProfiles = computed(() => route.path.startsWith('/profiles'));

const togglePage = () => {
  router.push(isProfiles.value ? '/' : '/profiles');
};

const saved = localStorage.getItem('sshterm-theme') || 'system';
const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const initialDark =
  saved === 'dark' || (saved === 'system' && isSystemDark) || (saved !== 'light' && isSystemDark);
const dark = ref(initialDark);

const toggleTheme = (val) => {
  localStorage.setItem('sshterm-theme', val ? 'dark' : 'light');
  if (window.__sshtermApplyTheme) window.__sshtermApplyTheme();
  document.documentElement.classList.toggle('dark', !!val);
};
</script>

<style scoped>
.head-wrap {
  height: 100%;
  line-height: 4.8rem;
  padding: 0 1.2rem;
  align-items: center;
}
.logo {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border-radius: 10px;
  background: #2c6dee;
  color: #fff;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 1.25rem;
  font-weight: 700;
}
.name {
  font-size: 1.8rem;
  color: #2c6dee;
  font-weight: 600;
}
.sub {
  font-size: 1.2rem;
  color: var(--text-sub);
  margin-left: 0.3rem;
}
.actions {
  align-items: center;
}
html.dark .name {
  color: #6ea0ff;
}
</style>
