<template>
  <div class="app-root flex flex-column flex-nowrap h-100">
    <div class="head">
      <Head />
    </div>
    <div class="body flex-1 relative">
      <div class="absolute-fill">
        <router-view />
      </div>
    </div>
  </div>
</template>

<script setup>
import Head from './components/Head.vue';
</script>

<style scoped>
.app-root {
  position: fixed;
  inset: 0;
  padding: 0.8rem;
  gap: 0.8rem;
  background: transparent;
}
.head {
  height: 4.8rem;
  flex-shrink: 0;
  border-radius: var(--radius-xl);
  background: var(--panel-bg);
  border: 1px solid var(--main-border-color);
  overflow: hidden;
}
.body {
  min-height: 0;
}
</style>
