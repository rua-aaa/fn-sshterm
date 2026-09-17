<template>
  <div ref="termEl" class="xterm-host"></div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

const props = defineProps({
  modelValue: { type: String, default: '' },
  dark: { type: Boolean, default: true },
  options: { type: Object, default: () => ({}) },
});

const emit = defineEmits(['ready', 'data', 'resize']);

const termEl = ref(null);
let term = null;
let fitAddon = null;
let ro = null;

const lightTheme = {
  background: '#ffffff',
  foreground: '#1f2937',
  cursor: '#2c6dee',
  selectionBackground: 'rgba(44,110,238,0.25)',
  black: '#111827',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#f9fafb',
};

const darkTheme = {
  background: '#0f1216',
  foreground: '#d1d5db',
  cursor: '#5b9dff',
  selectionBackground: 'rgba(91,157,255,0.28)',
  black: '#0b0d10',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc15',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#f3f4f6',
};

const write = (text) => {
  if (term && text) term.write(text);
};

const clear = () => term && term.clear();

const focus = () => term && term.focus();

const fit = () => {
  if (fitAddon) {
    try {
      fitAddon.fit();
      if (term) emit('resize', { cols: term.cols, rows: term.rows });
    } catch {}
  }
};

const getSize = () => ({
  cols: term ? term.cols : 80,
  rows: term ? term.rows : 24,
});

const api = {
  write,
  clear,
  focus,
  fit,
  getSize,
  getTerm: () => term,
};

defineExpose(api);

watch(
  () => props.dark,
  (val) => {
    if (term) term.options.theme = val ? darkTheme : lightTheme;
  }
);

watch(
  () => props.modelValue,
  (val) => write(val)
);

onMounted(() => {
  term = new Terminal({
    allowProposedApi: true,
    cursorBlink: true,
    convertEol: false,
    fontFamily: '"Cascadia Code", Consolas, "JetBrains Mono", Menlo, monospace',
    fontSize: 13,
    lineHeight: 1.25,
    scrollback: 5000,
    theme: props.dark ? darkTheme : lightTheme,
    ...props.options,
  });
  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon());
  term.open(termEl.value);
  fit();

  term.onData((data) => emit('data', data));
  term.onResize(({ cols, rows }) => emit('resize', { cols, rows }));

  ro = new ResizeObserver(() => fit());
  ro.observe(termEl.value);

  // MUST expose write/clear/fit/getSize — parent calls termApi.write()
  emit('ready', { ...api, term, fitAddon });
});

onBeforeUnmount(() => {
  if (ro) ro.disconnect();
  if (term) {
    term.dispose();
    term = null;
  }
});
</script>

<style scoped>
.xterm-host {
  width: 100%;
  height: 100%;
  border-radius: 6px;
  overflow: hidden;
  background: transparent;
}
.xterm-host :deep(.xterm) {
  padding: 8px 4px 8px 8px;
  height: 100%;
}
.xterm-host :deep(.xterm-viewport) {
  background: transparent !important;
}
</style>
