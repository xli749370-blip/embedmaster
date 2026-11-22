<script setup lang="ts">
/**
 * 内联 SVG 图标组件
 * 不依赖任何图标库运行时（避免联网拉取），全部路径内置，离线可用。
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    name: string
    size?: number | string
    strokeWidth?: number
  }>(),
  { size: 18, strokeWidth: 1.8 },
)

/** 图标路径表：fill 型图标单独标记 */
const ICONS: Record<string, { d: string[]; circle?: Array<[number, number, number]>; rect?: Array<[number, number, number, number, number?]>; fill?: boolean }> = {
  home: { d: ['M3 10.5 12 3l9 7.5', 'M5 9.6V21h14V9.6'] },
  book: { d: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 3H20v18H6.5A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3z'] },
  quiz: { d: ['M9.5 6h10.5', 'M9.5 12h10.5', 'M9.5 18h10.5', 'M4 6l1.4 1.4L7.5 5', 'M4 12l1.4 1.4L7.5 11', 'M4 18l1.4 1.4L7.5 17'] },
  user: { d: ['M4.5 21c0-3.9 3.4-6.2 7.5-6.2s7.5 2.3 7.5 6.2'], circle: [[12, 8, 4]] },
  search: { d: ['M20 20l-3.6-3.6'], circle: [[11, 11, 7]] },
  'arrow-right': { d: ['M4.5 12h15', 'M13.5 6l6 6-6 6'] },
  'arrow-left': { d: ['M19.5 12h-15', 'M10.5 18l-6-6 6-6'] },
  'chevron-right': { d: ['M9.5 6l6 6-6 6'] },
  'chevron-down': { d: ['M6 9.5l6 6 6-6'] },
  check: { d: ['M4.5 12.5l5 5L20 6.5'] },
  x: { d: ['M6 6l12 12', 'M18 6L6 18'] },
  bookmark: { d: ['M6.5 3.5h11v17l-5.5-4.2-5.5 4.2v-17z'] },
  clock: { d: ['M12 7.5v5l3.4 2'], circle: [[12, 12, 9]] },
  layers: { d: ['M12 3.2l8.6 4.6-8.6 4.6L3.4 7.8 12 3.2z', 'M3.4 13.6L12 18.2l8.6-4.6'] },
  cpu: { d: ['M4 9.2h3', 'M4 14.8h3', 'M17 9.2h3', 'M17 14.8h3', 'M9.2 4v3', 'M14.8 4v3', 'M9.2 17v3', 'M14.8 17v3'], rect: [[7, 7, 10, 10, 2]] },
  play: { d: ['M8.5 5.5l10 6.5-10 6.5v-13z'] },
  refresh: { d: ['M20 12a8 8 0 1 1-2.4-5.7', 'M20 4.2v4.6h-4.6'] },
  menu: { d: ['M4 7h16', 'M4 12h16', 'M4 17h16'] },
  logout: { d: ['M15 17l5-5-5-5', 'M20 12H9.5', 'M12.5 4.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h6.5'] },
  chart: { d: ['M4 20V10.5', 'M10 20V4.5', 'M16 20v-6.5', 'M22 20H2'] },
  trophy: { d: ['M8.5 4h7v5a3.5 3.5 0 0 1-7 0V4z', 'M8.5 5.5H5.5V7a3 3 0 0 0 3 3', 'M15.5 5.5h3V7a3 3 0 0 1-3 3', 'M10 20h4', 'M12 12.6V20'] },
  sparkles: { d: ['M12 3.2l1.8 4.2 4.2 1.8-4.2 1.8L12 15.2l-1.8-4.2L6 9.2l4.2-1.8L12 3.2z', 'M18.6 15.4l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9z'] },
  zap: { d: ['M13.4 2.5L4.8 14h5.4l-1.2 7.5L18.6 10h-5.4l1.2-7.5z'] },
  target: { d: [], circle: [[12, 12, 9], [12, 12, 5], [12, 12, 1.4]] },
  external: { d: ['M14 4.5h5.5V10', 'M19.5 4.5L11 13', 'M18 14.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5'] },
  code: { d: ['M9.5 8l-4.5 4 4.5 4', 'M14.5 8l4.5 4-4.5 4'] },
  grid: { d: [], rect: [[4, 4, 6.5, 6.5, 1.4], [13.5, 4, 6.5, 6.5, 1.4], [4, 13.5, 6.5, 6.5, 1.4], [13.5, 13.5, 6.5, 6.5, 1.4]] },
  filter: { d: ['M4 5.5h16l-6.2 7.2V19l-3.6 1.8v-8.1L4 5.5z'] },
  'check-circle': { d: ['M8.2 12.4l2.6 2.6 5-5.4'], circle: [[12, 12, 9]] },
  'x-circle': { d: ['M9.2 9.2l5.6 5.6', 'M14.8 9.2l-5.6 5.6'], circle: [[12, 12, 9]] },
  info: { d: ['M12 11.2v5.4', 'M12 7.9h.01'], circle: [[12, 12, 9]] },
  alert: { d: ['M12 9.2v4.2', 'M12 16.8h.01', 'M10.3 3.9L2.6 17.2A2 2 0 0 0 4.3 20.2h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'] },
  save: { d: ['M18.5 21H5.5A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3h9L20 8.5v11A1.5 1.5 0 0 1 18.5 21z', 'M8 3v5.5h7', 'M8 21v-6h8v6'] },
  rotate: { d: ['M3.5 12a8.5 8.5 0 1 0 2.6-6.1', 'M3.5 4.5v4.6h4.6'] },
  bolt: { d: ['M11 3.5v6h4.2L9 20.5v-6H5.2L11 3.5z'] },
  compass: { d: ['M15.6 8.4l-2 5.2-5.2 2 2-5.2 5.2-2z'], circle: [[12, 12, 9]] },
  flag: { d: ['M5 21V4.5', 'M5 4.5h9.5l-1.4 3.4 1.4 3.4H5'] },
  edit: { d: ['M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5z', 'M14.5 5.5l3 3'] },
  sun: { d: ['M12 4V2.5', 'M12 21.5V20', 'M4 12H2.5', 'M21.5 12H20', 'M6 6l-1-1', 'M19 19l-1-1', 'M6 18l-1 1', 'M19 5l-1 1'], circle: [[12, 12, 4]] },
  moon: { d: ['M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z'] },
  download: { d: ['M12 3.5v11', 'M7.5 10.5L12 15l4.5-4.5', 'M4 20.5h16'] },
  upload: { d: ['M12 15.5v-11', 'M7.5 9L12 4.5 16.5 9', 'M4 20.5h16'] },
}

const icon = computed(() => ICONS[props.name] ?? ICONS.info)
const px = computed(() => (typeof props.size === 'number' ? `${props.size}px` : props.size))
</script>

<template>
  <svg
    :width="px"
    :height="px"
    viewBox="0 0 24 24"
    fill="none"
    :stroke-width="strokeWidth"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="shrink-0"
  >
    <circle v-for="(c, i) in icon.circle || []" :key="`c${i}`" :cx="c[0]" :cy="c[1]" :r="c[2]" />
    <rect
      v-for="(r, i) in icon.rect || []"
      :key="`r${i}`"
      :x="r[0]"
      :y="r[1]"
      :width="r[2]"
      :height="r[3]"
      :rx="r[4] ?? 0"
    />
    <path v-for="(d, i) in icon.d" :key="`p${i}`" :d="d" />
  </svg>
</template>
