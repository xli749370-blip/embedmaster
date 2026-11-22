/**
 * 全站通用头像组件
 * - avatar：'preset:xxx'（系统预设内联 SVG）/ 'data:...'、'http...'（自定义上传或网络图）/ ''（首字母兜底）
 * - frame：头像框 id，'none' 或空 = 无框
 * - level：头像框阶数（Ⅰ/Ⅱ/Ⅲ）。不传则按当前用户已领取的成就自动推导，
 *   所以接入进阶后，所有已有调用点都会自动显示正确阶数，无需逐个传参
 *
 * 环的材质、领环、反光、宝石钉全部由 FrameRing 负责，这里只管头像内容本身。
 */
<script setup lang="ts">
import { computed } from 'vue'
import { presetById } from '@/mock/achievements'
import { currentFrameTier } from '@/composables/useAchievements'
import FrameRing from '@/components/FrameRing.vue'

const props = withDefaults(
  defineProps<{
    avatar?: string
    frame?: string
    name?: string
    /** 直径 px */
    size?: number
    /** 覆盖阶数（装扮页预览用），不传则自动推导 */
    level?: number
  }>(),
  { avatar: '', frame: 'none', name: '', size: 40 },
)

const hasFrame = computed(() => !!props.frame && props.frame !== 'none')
const preset = computed(() => {
  const id = props.avatar?.startsWith('preset:') ? props.avatar.slice(7) : props.avatar
  return presetById(id || '')
})
const isImg = computed(() => /^(data:|https?:)/.test(props.avatar || ''))
const tier = computed(() => (hasFrame.value ? (props.level ?? currentFrameTier(props.frame)) || 1 : 0))
const initial = computed(() => (props.name || 'U').slice(0, 1).toUpperCase())
</script>

<template>
  <FrameRing
    :frame="hasFrame ? props.frame : 'none'"
    :tier="tier || 1"
    :size="size"
    :class="tier >= 3 ? 'frame-breathe' : ''"
  >
    <span
      class="grid h-full w-full place-items-center overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-accent-500 font-extrabold text-white"
      :style="{ fontSize: `${Math.round(size * 0.42)}px` }"
    >
      <span v-if="preset" class="contents" v-html="preset.svg" />
      <img v-else-if="isImg" :src="avatar" alt="" class="h-full w-full object-cover" />
      <template v-else>{{ initial }}</template>
    </span>
  </FrameRing>
</template>
