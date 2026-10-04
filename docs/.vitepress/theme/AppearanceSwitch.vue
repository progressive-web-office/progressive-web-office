<script lang="ts" setup>
// The appearance in three positions — as the system, light, dark — in place
// of the two of the default theme, as the application offers it.
import { onMounted, ref } from 'vue';
import { useData } from 'vitepress';

type Mode = 'auto' | 'light' | 'dark';
const KEY = 'vitepress-theme-appearance';

const { lang } = useData();
const mode = ref<Mode>('auto');

const read = (): Mode => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
};

onMounted(() => {
  mode.value = read();
  // As the system: follow it when it changes, the page open.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (read() === 'auto') document.documentElement.classList.toggle('dark', e.matches);
  });
});

function choose(next: Mode): void {
  const old = read();
  mode.value = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* storage unavailable: the choice lasts for this page */
  }
  // The colour mode of the theme (VueUse) follows its key when told so.
  window.dispatchEvent(new CustomEvent('vueuse-storage', { detail: { key: KEY, oldValue: old, newValue: next, storageArea: localStorage } }));
  const dark = next === 'dark' || (next === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

const LABELS: Record<string, Record<Mode, string>> = {
  en: { auto: 'As the system', light: 'Light', dark: 'Dark' },
  fr: { auto: 'Comme le système', light: 'Clair', dark: 'Sombre' },
  zh: { auto: '跟随系统', light: '浅色', dark: '深色' },
};
const label = (m: Mode): string => (LABELS[lang.value.slice(0, 2)] ?? LABELS.en)[m];
// Feather-style outlines: a screen, a sun, a moon.
const ICONS: Record<Mode, string> = {
  auto: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  dark: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
};
const MODES: Mode[] = ['auto', 'light', 'dark'];
</script>

<template>
  <div class="appearance-switch" role="radiogroup" :aria-label="lang.startsWith('fr') ? 'Apparence' : lang.startsWith('zh') ? '外观' : 'Appearance'">
    <button
      v-for="m in MODES"
      :key="m"
      type="button"
      role="radio"
      :aria-checked="mode === m"
      :title="label(m)"
      :aria-label="label(m)"
      :class="{ active: mode === m }"
      @click="choose(m)"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="ICONS[m]" />
    </button>
  </div>
</template>

<style scoped>
.appearance-switch {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--vp-input-border-color);
  border-radius: 12px;
  background: var(--vp-input-switch-bg-color);
}
.appearance-switch button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 20px;
  border-radius: 9px;
  color: var(--vp-c-text-2);
}
.appearance-switch button:hover {
  color: var(--vp-c-text-1);
}
.appearance-switch button.active {
  background: var(--vp-c-bg);
  color: var(--vp-c-brand-1);
  box-shadow: var(--vp-shadow-1);
}
.appearance-switch button:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 1px;
}
.appearance-switch svg {
  width: 14px;
  height: 14px;
}
</style>
