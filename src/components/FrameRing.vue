/**
 * 头像框材质环（全站唯一渲染入口）
 *
 * 设计分层（由内到外）：
 *   1. 环体主材 —— 多段明暗渐变（金属高光带 / 宝石切面反光）+ 刻面纹理（宝石/余烬）
 *   2. 倒角斜面 —— inset 高光与暗边，让环像个真实的金属倒角，而不是贴片
 *   3. 内嵌暗边 —— 头像沉进镶座里，产生深度
 *   4. 外领环 —— Ⅱ 一圈、Ⅲ 两圈；用「真元素 + border」画，和主体之间留空气缝，
 *      任何背景色上都成立（box-shadow 的透明层做不出真缝隙）
 *   5. 静态高光弧 + 旋转扫光 —— 镜面反光，转动时环会「走光」
 *   6. Ⅲ 阶额外：宝石钉 ×4、星芒 ×2、外扩光晕、呼吸
 *
 * 所有尺寸按 --u = size/48 缩放，28px 的导航头像与 72px 的大头像用同一套参数。
 */
<script setup lang="ts">
import { computed } from 'vue'
import { frameById, framePad, frameTexture } from '@/mock/achievements'

const props = withDefaults(
  defineProps<{
    frame: string
    /** 阶数 1/2/3 */
    tier?: number
    /** 直径 px */
    size?: number
  }>(),
  { tier: 1, size: 40 },
)

const f = computed(() => frameById(props.frame))
const plain = computed(() => !props.frame || props.frame === 'none')
const t = computed(() => (props.tier >= 3 ? 3 : props.tier >= 2 ? 2 : 1))
const pad = computed(() => (plain.value ? 0 : framePad(props.size, t.value)))
const cut = computed(() => props.size - pad.value * 2)
const u = computed(() => props.size / 48)
const tint = computed(() => f.value.tint || '#94a3b8')

const bodyStyle = computed(() => {
  const tex = frameTexture(props.frame, props.size)
  return {
    backgroundImage: tex ? `${tex},${f.value.css}` : f.value.css,
    backgroundBlendMode: tex ? 'overlay, normal' : 'normal',
  }
})

const rootStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  '--u': u.value,
  '--pad': `${pad.value}px`,
  '--t': tint.value,
  '--tg': `${tint.value}77`,
  '--tg2': `${tint.value}99`,
  '--tg3': `${tint.value}66`,
}))
</script>

<template>
  <div v-if="plain" class="fring" :style="rootStyle">
    <div class="fring-body fring-body--plain"><div class="fring-cut" :style="{ width: `${cut}px`, height: `${cut}px` }"><slot /></div></div>
  </div>
  <div v-else class="fring" :data-tier="t" :style="rootStyle">
    <div class="fring-body" :style="bodyStyle">
      <div class="fring-cut" :style="{ width: `${cut}px`, height: `${cut}px` }"><slot /></div>
    </div>

    <!-- Ⅲ：外扩光晕 -->
    <div v-if="t >= 3" class="fring-halo" />

    <!-- 镶座领环：Ⅱ 一圈 / Ⅲ 两圈（外圈更细，形成层次） -->
    <div v-if="t >= 2" class="fring-collar a" />
    <template v-if="t >= 3">
      <div class="fring-collar b" />
    </template>

    <!-- 镜面反光：静态高光弧 + 旋转扫光 -->
    <template v-if="t >= 2">
      <div class="fring-arc" />
      <div class="fring-sweep" />
    </template>

    <!-- Ⅲ：宝石钉与星芒 -->
    <template v-if="t >= 3">
      <div class="fring-stud n" />
      <div class="fring-stud e" />
      <div class="fring-stud s" />
      <div class="fring-stud w" />
      <div class="fring-spark s1" />
      <div class="fring-spark s2" />
    </template>
  </div>
</template>
