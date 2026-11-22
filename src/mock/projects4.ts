/**
 * 项目库 · 第四卷：ESP32 平台
 */
import type { Project } from './projectModel'

export const projects4: Project[] = [
  {
    id: 'p07',
    name: 'ESP32 环境监测站',
    subtitle: '温湿度/气压采集 → 本地屏显 → WiFi 上云 → 手机看数，一条物联网全链路',
    difficulty: '进阶',
    weeks: '1.5~2 周',
    cost: '约 60~90 元',
    tags: ['ESP32', 'WiFi', 'MQTT', 'I2C', '物联网'],
    stack: {
      hw: ['ESP32-WROOM-32', 'SHT30/DHT22 温湿度', 'BMP280 气压', '0.96" OLED', 'TP4056+锂电池供电'],
      sw: ['ESP-IDF v5.x', 'FreeRTOS', 'i2c_master 驱动', 'esp_wifi / esp-mqtt', 'NVS 参数存储'],
    },
    summary:
      '这是嵌入式工程师跨向物联网的「第一个完整产品」：硬件上用 I2C 挂两颗数字传感器和一块 OLED，软件上从 ESP-IDF 工程搭建走到 MQTT 上云。做完它，你会同时掌握「MCU 基本功」和「联网设备」两套体系，并且能直接迁移到 ESP32-S3/C3 等后续型号。',
    outcomes: [
      '独立搭建 ESP-IDF 开发环境，掌握 idf.py / menuconfig / monitor 全流程',
      '用 i2c_master 新版驱动读取 SHT30/BMP280 并做数据校验',
      '事件驱动的 WiFi 管理（断线重连 + 状态降级）',
      'MQTT 遥测上报与下行指令控制（灯光开关）',
      'NVS 保存配网参数与用户校准值，掉电不丢',
      '电池供电下的功耗意识（AP 模式休眠、调制解调器省电的取舍）',
    ],
    bom: [
      { item: 'ESP32 DevKitC（WROOM-32）', spec: '38pin，4MB Flash', qty: '1', note: 'S3/C3 亦可，本教程引脚按经典款' },
      { item: 'SHT30 温湿度传感器', spec: 'I2C，±0.2°C', qty: '1', note: '比 DHT22 可靠，必选 I2C 版' },
      { item: 'BMP280 气压计', spec: 'I2C，300~1100hPa', qty: '1' },
      { item: 'OLED 0.96"', spec: 'SSD1306，I2C 0x3C', qty: '1' },
      { item: 'TP4056 充电板 + 18650 电池', spec: '带保护板', qty: '1套' },
      { item: '面包板 + 杜邦线', spec: '830 孔', qty: '1套' },
      { item: 'LED + 470Ω 电阻', spec: '做下行指令执行器', qty: '1' },
    ],
    stages: [
      {
        id: 's1',
        title: '方案与认知准备',
        layer: 'common',
        goal: '把「监测站」拆成可执行的模块清单，建立物联网全链路的心智图',
        steps: [
          {
            id: 's1x1',
            title: '系统框图与数据流设计',
            kind: 'theory',
            doc: `先把产品画成一条数据流，再动手：

\`\`\`
[SHT30 温湿度]──┐
[BMP280 气压]───┼──I2C──> ESP32 ──UART日志──> PC调试
[OLED 屏显]─────┘            │
                             └──WiFi──> MQTT Broker ──> 手机/网页
\`\`\`

**模块拆解（每个都是独立可测试的单元）**
- 采集层：SHT30（0x44）、BMP280（0x76）两颗 I2C 传感器
- 呈现层：OLED 本地显示 + MQTT 云端查看
- 通信层：WiFi STA + MQTT 客户端
- 管理层：NVS 存配置、看门狗、断网降级策略

> 先想清楚「断网时怎么办」：本地照常采集屏显，数据进内存队列，恢复后带时间戳补发。这一条决定了软件架构。`,
            checks: [{ q: '画出自己版本的系统框图，标出每条总线的引脚分配' }],
          },
          {
            id: 's1x2',
            title: '开发环境搭建（ESP-IDF）',
            kind: 'practice',
            doc: `## 安装 ESP-IDF v5.x
- Windows：官方离线安装器一路下一步（自带工具链与 IDF Terminal）
- VS Code 装 ESP-IDF 插件（可选但强烈推荐：图形化 menuconfig + 一键烧录）

## 验证安装：跑通第一个工程
\`\`\`bash
# 打开「ESP-IDF Terminal」后：
idf.py create-project hello
cd hello
idf.py set-target esp32
idf.py build flash monitor
\`\`\`
monitor 里看到 hello 输出、按 reset 能重启，环境即就绪。

> 常见坑：驱动装不上装 CP2102/CH340 串口驱动；「无法打开串口」先关掉占用串口的其他软件；编译慢属正常（首次全量 3~5 分钟），后续增量秒级。`,
            checks: [{ q: 'idf.py build 无报错' }, { q: 'monitor 能看到启动日志与重启' }],
          },
        ],
      },
      {
        id: 's2',
        title: '硬件层：供电与 I2C 总线',
        layer: 'hardware',
        goal: '搭建稳定供电和可靠的 I2C 总线，理解上电时序与上拉电阻',
        steps: [
          {
            id: 's2x1',
            title: '电源架构：USB / 锂电双路',
            kind: 'hardware',
            doc: `## 双路供电方案
- USB 5V：开发调试主供电（DevKit 自带 LDO 转 3.3V）
- 18650 + TP4056：脱机运行供电，电池 3.7~4.2V 接 DevKit 的 5V/VIN 引脚（经板上 LDO 降压）

## 接线清单
| 模块 | ESP32 引脚 |
- SHT30：SDA→GPIO8（软件矩阵任意），SCL→GPIO9，VDD 3.3V
- BMP280：同总线并联，VDD 3.3V（**注意不要接 5V，会烧**）
- OLED：同总线并联（地址 0x3C 不冲突）
- LED 指示：GPIO2（板载 LED 正好复用）

## I2C 总线三查
- 上拉电阻：模块板载就有（4.7K~10K），三设备并联后总阻值可能过低——能正常通信就不动它
- 上电时序：传感器先于 MCU 上电或同时上电（同一路 3.3V 天然满足）
- 走线长度：面包板试制阶段总线短于 20cm，过长降速到 100K`,
            checks: [{ q: '三颗 I2C 设备并联到同一总线，接线复检两遍' }, { q: 'USB 上电后电源灯亮、无发热异常' }],
          },
          {
            id: 's2x2',
            title: '总线通断验证：扫描先于驱动',
            kind: 'debug',
            doc: `任何传感器开发第一步都是「总线探测」，确认 0x44/0x76/0x3C 三地址都在：

\`\`\`c
/* 用代码库 e06 的 i2c_scan()，期望输出：
found 0x3C   ← OLED
found 0x44   ← SHT30
found 0x76   ← BMP280
\`\`\`

## 排查树（少一个地址时）
- 少 0x3C：OLED 模块有的出厂是 SPI 模式——查背面 BS1 焊点
- 少 0x44：SHT30 地址脚 ADDR 接了 GND/悬空是 0x44，接 VDD 是 0x45
- 少 0x76：BMP280 的 SDO 接 GND=0x76、接 VDD=0x77
- 全部没有：SDA/SCL 接反（最常见）、没共地、内部上拉不足（加两个 4.7K）`,
            checks: [{ q: '扫描输出三个地址全部命中' }, { q: '地址不一致时能按排查树独立解决' }],
          },
        ],
      },
      {
        id: 's3',
        title: '软件层 1：采集与显示',
        layer: 'software',
        goal: '跑通「传感器→数据结构→OLED」的本地闭环，先不联网',
        steps: [
          {
            id: 's3x1',
            title: 'SHT30/BMP280 驱动封装',
            kind: 'software',
            doc: `按「模块化驱动框架」写两颗传感器的驱动（结构见代码库 e06）：

## SHT30 读取时序
- 单次高精度测量命令 0x2C 0x06 → 等 15ms → 读 6 字节（温度 2B + CRC + 湿度 2B + CRC）
- 换算：T(°C) = -45 + 175 × raw/65535；RH(%) = 100 × raw/65535
- **CRC 必查**：SHT30 的 CRC8（多项式 0x31），校验失败丢弃本次并计数

## BMP280 读取
- 读补偿参数（0x88 起的 24 字节，上电读一次存 RAM）→ 读原始值 → 按数据手册公式补偿
- 自己写公式太繁琐：menuconfig 勾选 BSP 组件或移植 esp-idf-lib，理解补偿公式的意义即可

## 数据结构（采集层输出）
\`\`\`c
typedef struct {
    float temp_c;      // 温度 °C
    float hum_pct;     // 相对湿度 %
    float pres_hpa;    // 气压 hPa
    int64_t ts_us;     // 采集时间戳
    uint8_t valid;     // 位掩码：bit0 温度 bit1 湿度 bit2 气压
} env_data_t;
\`\`\`
valid 位掩码让「单颗传感器失效」不至于毁掉整条链路——工程思维的关键一课。`,
            checks: [{ q: 'SHT30 读数与室内参考温度误差 <1°C' }, { q: '人为捂住传感器，读数在 5s 内响应' }, { q: 'CRC 错误计数在正常时为 0' }],
          },
          {
            id: 's3x2',
            title: '任务划分与周期采集',
            kind: 'software',
            doc: `## 任务表（先双核认知后写代码）
\`\`\`c
xTaskCreatePinnedToCore(task_sensor, "sen", 4096, NULL, 3, NULL, 1);  // APP_CPU
xTaskCreatePinnedToCore(task_display, "ui", 3072, NULL, 1, NULL, 1);  // APP_CPU
// 云端任务等 s4 再加（先钉 PRO_CPU 预留）
\`\`\`

## task_sensor：2s 周期
- vTaskDelayUntil 精确周期（不用 vTaskDelay，防执行耗时累积漂移）
- 读 SHT30 + BMP280 → 填 env_data_t → xQueueSend 到 display 队列，同时 memcpy 进「最新值」快照（互斥量保护，给云端任务读）

## task_display：OLED 刷新
- 收到新数据帧才刷屏（不空转）
- 布局：第一行大字温度、第二行湿度/气压、第三行 WiFi/连接状态图标
- 本地优先：断网时状态栏显示 OFFLINE，数据照常更新`,
            checks: [{ q: 'OLED 实时刷新温度/湿度/气压三行数据' }, { q: '拔掉 BMP280，温度湿度照常显示（valid 掩码生效）' }],
          },
        ],
      },
      {
        id: 's4',
        title: '软件层 2：联网与上云',
        layer: 'software',
        goal: 'WiFi 事件驱动管理 + MQTT 遥测/指令双向链路',
        steps: [
          {
            id: 's4x1',
            title: 'WiFi 连接与断线管理',
            kind: 'software',
            doc: `按代码库 e07 的事件驱动方案实现，并补上**生产级细节**：

## SSID/密码从 NVS 读取
- 首次启动 NVS 无配置：进入「配网模式」（AP 热点 + 简单网页表单，或暂用编译期写死）
- 配置写入 NVS 后重启生效——代码库 e09 的 save_wifi_cred

## 断线重连策略（工业做法）
\`\`\`c
if (id == WIFI_EVENT_STA_DISCONNECTED) {
    int delay_ms = MIN(30000, 1000 << retry);   // 指数退避 1s→2s→…→30s 封顶
    retry++;
    vTaskDelay(pdMS_TO_TICKS(delay_ms));
    esp_wifi_connect();
}
\`\`\`
- 连续失败 10 次：置离线标志，走本地降级（屏显 OFFLINE + 数据入补发队列）

## 状态机：DISCONNECTED/CONNECTING/CONNECTED/GOT_IP 四态，屏显状态栏直接读它`,
            checks: [{ q: '重启后自动连上路由器（无需手动）' }, { q: '拔路由器电源→屏显离线；恢复→30s 内自动重连' }],
          },
          {
            id: 's4x2',
            title: 'MQTT 遥测与下行控制',
            kind: 'software',
            doc: `按代码库 e08 实现 esp-mqtt 客户端，本节把业务接上：

## 上行：每 10s 遥测一帧
\`\`\`json
{"t":25.3,"h":48.2,"p":1013.2,"rssi":-58,"up":1234}
\`\`\`
- 主题 emb/env01/tele（env01 是设备 ID，来自 NVS 或 MAC 后四位）
- 信号强度 rssi 顺手上报——排障利器

## 下行：订阅 emb/env01/cmd
- {"led":1} → 点亮 GPIO2 LED 并回执 emb/env01/ack
- 未知指令回执 error 码——**协议要有回执**，否则你永远不知道设备收没收到

## 时钟同步
- 上云后用 SNTP 对时（esp_netif_sntp），补发数据的「采集时间戳」才真实
- 没有对时的物联网数据都是可疑的——这行注释写进你的代码`,
            checks: [{ q: '手机/电脑用 MQTT 客户端订阅能收到 10s 一帧遥测' }, { q: '发送 {"led":1} 设备 LED 响应且收到 ack' }, { q: '拔网线 1 分钟再插上，补发队列把断网期间数据带时间戳发出' }],
          },
        ],
      },
      {
        id: 's5',
        title: '联调、可靠性与收尾',
        layer: 'debug',
        goal: '72 小时长跑验证 + 功耗优化 + 项目复盘归档',
        steps: [
          {
            id: 's5x1',
            title: '长跑测试与看门狗',
            kind: 'debug',
            doc: `## 72 小时长跑清单
- 电表/USB 电流表记录整机电流曲线（WiFi 发射瞬间峰值 ~300mA 是正常的）
- 每小时日志一行摘要：读数、RSSI、内存最小剩余（esp_get_minimum_free_heap_size）
- 断网 10 次、断电 5 次、人为捂热传感器——恢复能力逐一验证

## 看门狗与内存哨兵
- esp_task_wdt 给采集任务加订阅：卡死自动复位重启
- 内存哨兵：剩余堆低于阈值打日志并上报（内存泄漏长跑里现形）

## 长跑常见病
- 跑几小时堆内存缓慢下降 = 泄漏（查 malloc 无 free / MQTT 事件里重复创建资源）
- 跑一天后 WiFi 假死 = 路由器踢设备，靠断线重连策略兜底`,
            checks: [{ q: '72h 长跑日志无重启记录（或重启原因可解释）' }, { q: '长跑后 minimum free heap 与开局差值 < 20KB' }],
          },
          {
            id: 's5x2',
            title: '功耗优化与项目复盘',
            kind: 'practice',
            doc: `## 功耗三板斧（电池供电续航从 8h 到 7 天的关键）
1. 调制解调器休眠：esp_wifi_set_ps(WIFI_PS_MIN_MODEM)，待机电流降一个量级
2. 深度睡眠（实时性要求低时）：esp_deep_sleep(60s) + ULP/外部唤醒，每分钟醒一次采完即睡，平均电流 <100µA
3. OLED 不用时关屏：display_off 指令

## 项目复盘模板（写进 README）
- 最终系统框图 + 实物照片
- 关键决策记录：为什么 SHT30 不用 DHT22、为什么 QoS1、为什么钉核
- 遗留问题与改进方向：转洞洞板/PCB、加 SD 卡本地存储、上 TLS 加密
- 数据与结论：平均电流实测、续航估算、丢包率统计

> 复盘的价值：三个月后接 ESP32-S3 摄像头站时，这份 README 让你半天完成 80% 架构迁移——这就是「工程库」的意义。`,
            checks: [{ q: '完成复盘 README（框图/决策/数据三要素齐全）' }, { q: '实测记录一次深度睡眠平均电流' }, { q: '能把本项目流程口述给同学听并回答提问' }],
          },
        ],
      },
    ],
  },
]
