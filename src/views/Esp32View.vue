<script setup lang="ts">
/**
 * ESP32 中枢 —— 对标 STM32 的第二平台
 * 家族对比 / 与 STM32 差异 / 开发环境 / 外设映射 / 学习路径 / 相关资源
 */
import AppIcon from '@/components/AppIcon.vue'

const family = [
  { name: 'ESP32 经典款', core: '双核 Xtensa LX6 @240MHz', ram: '520K + 外挂PSRAM', radio: 'WiFi + BLE4.2', flash: '4~16MB SPI', use: '经典物联网，教程最多' },
  { name: 'ESP32-S3', core: '双核 LX7 @240MHz', ram: '512K + 8/16M PSRAM', radio: 'WiFi + BLE5', flash: '8~16MB', use: 'AI语音/摄像头，当前主力' },
  { name: 'ESP32-C3', core: '单核 RISC-V @160MHz', ram: '400K', radio: 'WiFi + BLE5', flash: '4MB', use: '低成本轻量节点，RISC-V 入门' },
  { name: 'STM32F103 对照', core: '单核 M3 @72MHz', ram: '20K', radio: '无（需外挂模块）', flash: '64~128K', use: '实时控制/传统工业' },
  { name: 'STM32F411 对照', core: '单核 M4F @100MHz', ram: '128K', radio: '无', flash: '128~512K', use: '高性能实时控制' },
]

const diff = [
  { item: '定位', stm32: '裸机/RTOS 实时控制', esp: '联网智能终端（自带射频）' },
  { item: '启动方式', stm32: 'Flash 直接运行，上电即跑', esp: '片外 Flash 经 Cache 映射，首次启动稍慢' },
  { item: '开发框架', stm32: 'HAL/CubeMX + Keil/CubeIDE', esp: 'ESP-IDF(CMake) / Arduino / MicroPython' },
  { item: '中断函数', stm32: '普通 C 函数即可', esp: 'ISR 需 IRAM_ATTR（放指令 RAM）' },
  { item: '无线能力', stm32: '无，需 ESP8266/模组扩展', esp: 'WiFi/BLE 协议栈官方内置' },
  { item: 'PWM 外设', stm32: 'TIM（通用/高级+死区）', esp: 'LEDC（灯调）+ MCPWM（电机，带死区）' },
  { item: '模拟外设', stm32: 'ADC + 运放/比较器（部分型号）', esp: 'ADC（注意 ADC2 与 WiFi 冲突）+ DAC' },
  { item: '调试方式', stm32: 'SWD + Keil/JLink 断点', esp: 'JTAG（S3 内置USB-JTAG）/ esp-monitor 回溯' },
]

const apiMap = [
  { hal: 'HAL_GPIO_WritePin', idf: 'gpio_set_level', note: 'gpio_config 一次配齐模式/上拉/中断' },
  { hal: 'TIM PWM (TIM_PWM_Start)', idf: 'ledc_channel_config / ledc_set_duty', note: '电机级用 MCPWM' },
  { hal: 'HAL_ADC_PollForConversion', idf: 'adc_oneshot_read + adc_cali', note: '务必开出厂校准' },
  { hal: 'HAL_UART_Receive_DMA + IDLE', idf: 'uart_driver_install 事件队列', note: '驱动自带缓冲，不用手搓' },
  { hal: 'HAL_I2C_Mem_Read', idf: 'i2c_master_write_read_device', note: 'v5.x 新 API' },
  { hal: 'HAL_TIM_Base_Start_IT(1ms)', idf: 'esp_timer / FreeRTOS vTaskDelayUntil', note: '软定时器 esp_timer 周期回调' },
  { hal: 'Flash (W25Q64 驱动)', idf: 'NVS / SPIFFS / LittleFS', note: '片内 Flash 分区表管理' },
  { hal: '—（无）', idf: 'esp_wifi / esp_mqtt / esp_http_client', note: '联网三件套，STM32 需外挂模组' },
]

const path = [
  { title: '① 环境与点灯', desc: '装 ESP-IDF，跑通 hello world 与 GPIO/按键', to: '/learn/lang', link: '先过语言基础 →' },
  { title: '② 外设迁移', desc: 'LEDC/ADC/UART/I2C 逐个对照 HAL 迁移手感', to: '/codelib', link: '代码库「ESP32」分类 →' },
  { title: '③ 联网上云', desc: 'WiFi 事件驱动 → HTTP → MQTT，物联网三连', to: '/codelib', link: 'e07~e09 三连 →' },
  { title: '④ 完整项目', desc: '环境监测站：从面包板到 72h 长跑的全链路', to: '/projects', link: '项目库 p07 →' },
]

const res = [
  { label: '代码库 · ESP32 分册（10 模块）', to: '/codelib' },
  { label: '项目库 · p07 环境监测站', to: '/projects' },
  { label: '数据手册 · ESP32 家族', to: '/datasheets' },
  { label: '理论底座 · 计算机底层认知', to: '/learn/computer' },
]
</script>

<template>
  <div class="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
    <header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
      <div class="flex-1">
        <h1 class="text-2xl font-bold text-ink-900">ESP32 平台</h1>
        <p class="mt-1.5 text-sm leading-relaxed text-ink-500">
          乐鑫 Espressif 出品的物联网 SoC：自带 WiFi/BLE、双核、RISC-V 新架构。对标 STM32 区块，这里同样提供<strong class="text-ink-900">代码库、工程库、硬件认知与学习路径</strong>的完整支撑。
        </p>
      </div>
      <img src="/img/esp32-board.jpg" alt="ESP32 开发板实物" class="h-28 w-auto rounded-xl border border-slate-200 object-cover shadow-card" />
    </header>

    <!-- 家族对比 -->
    <section class="mb-7">
      <h2 class="mb-3 flex items-center gap-2 text-base font-bold text-ink-900"><span class="h-4 w-1 rounded-full bg-brand-500" />家族选型对比</h2>
      <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white" style="background: #fff">
        <table class="w-full min-w-[640px] text-left text-xs">
          <thead>
            <tr class="border-b border-slate-100 text-ink-400">
              <th class="px-4 py-2.5 font-medium">型号</th><th class="px-3 py-2.5 font-medium">内核</th><th class="px-3 py-2.5 font-medium">RAM</th><th class="px-3 py-2.5 font-medium">无线</th><th class="px-3 py-2.5 font-medium">典型用途</th>
            </tr>
          </thead>
          <tbody class="text-ink-700">
            <tr v-for="f in family" :key="f.name" class="border-b border-slate-50 last:border-0">
              <td class="px-4 py-2.5 font-semibold">{{ f.name }}</td>
              <td class="px-3 py-2.5">{{ f.core }}</td>
              <td class="px-3 py-2.5">{{ f.ram }}</td>
              <td class="px-3 py-2.5">{{ f.radio }}</td>
              <td class="px-3 py-2.5">{{ f.use }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 与 STM32 差异 -->
    <section class="mb-7">
      <h2 class="mb-3 flex items-center gap-2 text-base font-bold text-ink-900"><span class="h-4 w-1 rounded-full bg-accent-500" />与 STM32 的核心差异</h2>
      <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white" style="background: #fff">
        <table class="w-full min-w-[560px] text-left text-xs">
          <thead>
            <tr class="border-b border-slate-100 text-ink-400">
              <th class="px-4 py-2.5 font-medium">维度</th><th class="px-3 py-2.5 font-medium">STM32</th><th class="px-3 py-2.5 font-medium">ESP32</th>
            </tr>
          </thead>
          <tbody class="text-ink-700">
            <tr v-for="d in diff" :key="d.item" class="border-b border-slate-50 last:border-0">
              <td class="px-4 py-2.5 font-semibold">{{ d.item }}</td>
              <td class="px-3 py-2.5">{{ d.stm32 }}</td>
              <td class="px-3 py-2.5">{{ d.esp }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 外设 API 对照 -->
    <section class="mb-7">
      <h2 class="mb-3 flex items-center gap-2 text-base font-bold text-ink-900"><span class="h-4 w-1 rounded-full bg-brand-500" />HAL → IDF 外设映射速查</h2>
      <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white" style="background: #fff">
        <table class="w-full min-w-[600px] text-left text-xs">
          <thead>
            <tr class="border-b border-slate-100 text-ink-400">
              <th class="px-4 py-2.5 font-medium">STM32 HAL</th><th class="px-3 py-2.5 font-medium">ESP-IDF</th><th class="px-3 py-2.5 font-medium">要点</th>
            </tr>
          </thead>
          <tbody class="text-ink-700">
            <tr v-for="m in apiMap" :key="m.hal" class="border-b border-slate-50 last:border-0">
              <td class="px-4 py-2.5 font-mono text-[11px]">{{ m.hal }}</td>
              <td class="px-3 py-2.5 font-mono text-[11px] text-brand-700">{{ m.idf }}</td>
              <td class="px-3 py-2.5 text-ink-400">{{ m.note }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 学习路径 -->
    <section class="mb-7">
      <h2 class="mb-3 flex items-center gap-2 text-base font-bold text-ink-900"><span class="h-4 w-1 rounded-full bg-accent-500" />学习路径（四步走）</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <RouterLink v-for="(p, i) in path" :key="i" :to="p.to" class="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-brand-300" style="background: #fff">
          <p class="text-sm font-semibold text-ink-900">{{ p.title }}</p>
          <p class="mt-1 text-xs leading-relaxed text-ink-500">{{ p.desc }}</p>
          <p class="mt-2 flex items-center gap-1 text-xs text-brand-700">{{ p.link }} <AppIcon name="chevron-right" :size="12" /></p>
        </RouterLink>
      </div>
    </section>

    <!-- 相关资源 -->
    <section>
      <h2 class="mb-3 flex items-center gap-2 text-base font-bold text-ink-900"><span class="h-4 w-1 rounded-full bg-brand-500" />区块内资源</h2>
      <div class="flex flex-wrap gap-2">
        <RouterLink v-for="r in res" :key="r.to + r.label" :to="r.to" class="btn border-slate-200 bg-white px-3 py-2 text-xs text-ink-600 hover:border-brand-300 hover:text-brand-700">
          <AppIcon name="bookmark" :size="13" /> {{ r.label }}
        </RouterLink>
      </div>
    </section>
  </div>
</template>
