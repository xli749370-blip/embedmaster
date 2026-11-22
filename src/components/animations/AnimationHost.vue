<script setup lang="ts">
/**
 * 动画分发器：把 anim_key 映射到具体 Konva 组件
 *
 * 窄屏适配：全部动画按 340px 设计宽度绘制。若容器更窄（手机 360px 视口
 * 内容区常只有 286~316px），用 CSS zoom 整体等比缩小，避免内容/按钮溢出或被裁切。
 * 外层 div 负责测量（不受 zoom 影响），内层 div 承担 zoom 与组件渲染。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import VoltageDivider from './VoltageDivider.vue'
import RCCircuit from './RCCircuit.vue'
import PwmWave from './PwmWave.vue'
import AdcSample from './AdcSample.vue'
import PointerMem from './PointerMem.vue'
import BitRegister from './BitRegister.vue'
import TaskSwitch from './TaskSwitch.vue'
import DataFlow from './DataFlow.vue'
import UartTiming from './UartTiming.vue'
import BusTiming from './BusTiming.vue'
import NvicNest from './NvicNest.vue'
import TimerBase from './TimerBase.vue'
import DmaTransfer from './DmaTransfer.vue'
import QueueBlock from './QueueBlock.vue'
import SpiDma from './SpiDma.vue'
import NotifyEvent from './NotifyEvent.vue'
import SchToPcb from './SchToPcb.vue'
import DmaPingpong from './DmaPingpong.vue'
import SwTimer from './SwTimer.vue'
import BurnIn from './BurnIn.vue'
import BootTimeline from './BootTimeline.vue'
import ClockTree from './ClockTree.vue'
import TailChain from './TailChain.vue'
import MemLayout from './MemLayout.vue'
import FaultStack from './FaultStack.vue'
import BitBand from './BitBand.vue'

const props = defineProps<{ animKey: string }>()

const MAP: Record<string, any> = {
  'voltage-divider': VoltageDivider,
  'rc-charge': RCCircuit,
  'pwm-wave': PwmWave,
  'adc-sample': AdcSample,
  'pointer-mem': PointerMem,
  'bit-register': BitRegister,
  'task-switch': TaskSwitch,
  'data-flow': DataFlow,
  'uart-timing': UartTiming,
  'bus-timing': BusTiming,
  'nvic-nest': NvicNest,
  'timer-base': TimerBase,
  'dma-transfer': DmaTransfer,
  'queue-block': QueueBlock,
  'spi-dma': SpiDma,
  'notify-event': NotifyEvent,
  'sch-to-pcb': SchToPcb,
  'dma-pingpong': DmaPingpong,
  'sw-timer': SwTimer,
  'burn-in': BurnIn,
  'boot-timeline': BootTimeline,
  'clock-tree': ClockTree,
  'tail-chain': TailChain,
  'mem-layout': MemLayout,
  'fault-stack': FaultStack,
  'bit-band': BitBand,
}

const comp = computed(() => MAP[props.animKey] ?? null)

/** 设计基准宽度（各动画内部按此宽度排布） */
const DESIGN_W = 340
const outerRef = ref<HTMLDivElement | null>(null)
const zoom = ref(1)
let ro: ResizeObserver | null = null

function fit() {
  const w = outerRef.value?.clientWidth || 0
  zoom.value = w > 0 && w < DESIGN_W ? Math.max(0.7, w / DESIGN_W) : 1
}

onMounted(() => {
  fit()
  ro = new ResizeObserver(fit)
  if (outerRef.value) ro.observe(outerRef.value)
})
onBeforeUnmount(() => ro?.disconnect())
</script>

<template>
  <div ref="outerRef" class="w-full">
    <div :style="zoom < 1 ? { zoom: String(zoom) } : undefined">
      <component :is="comp" v-if="comp" />
      <div v-else class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-ink-400">
        暂不支持该动画类型：{{ animKey }}
      </div>
    </div>
  </div>
</template>
