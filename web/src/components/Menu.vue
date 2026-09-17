<template>
  <div class="menu-wrap h-100 flex flex-column flex-nowrap">
    <ul class="flex-1">
      <li v-for="item in router.options.routes" :key="item.path">
        <router-link :to="item.path">
          <el-icon size="16">
            <component :is="item.meta.icon" />
          </el-icon>
          <span>{{ item.meta.title }}</span>
        </router-link>
      </li>
    </ul>
    <div class="foot">
      <p>基于 fnpackup 交互风格</p>
      <p class="mono">{{ wsHint }}</p>
      <p class="tiny">建议 Chrome 直连 :1070</p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { wsUrl } from '@/api/api';
const router = useRouter();
const wsHint = computed(() => {
  try {
    return wsUrl().replace(/^wss?:\/\//, 'ws ');
  } catch {
    return 'ws :1070 /ws/ssh';
  }
});
</script>

<style scoped>
.menu-wrap {
  width: 16rem;
  flex-shrink: 0;
  border-right: 1px solid var(--main-border-color);
  background: transparent;
}
ul {
  padding: 0.8rem;
}
li a {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.85rem 0.8rem;
  border-radius: 6px;
  font-size: 1.3rem;
  color: var(--text-main);
}
li a.router-link-active,
li a:hover {
  background-color: var(--menu-active);
  color: #2173df;
  font-weight: 500;
}
html.dark li a.router-link-active,
html.dark li a:hover {
  background-color: #1a1e23;
  color: #6ea0ff;
}
.foot {
  padding: 1rem 1.2rem 1.4rem;
  font-size: 1.1rem;
  color: var(--text-sub);
  line-height: 1.6;
}
.foot .tiny {
  font-size: 1rem;
  opacity: 0.8;
}
</style>
