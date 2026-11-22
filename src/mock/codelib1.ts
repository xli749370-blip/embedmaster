/**
 * 代码库 · 第一批：工程模板 / GPIO / 串口
 * 全部代码基于 STM32 HAL 库（F1/F4 通用），可直接落进 Cube 工程
 */
import type { CodeEntry } from './codelib'

export const bank1: CodeEntry[] = [
  // ==================== 工程模板 ====================
  {
    id: 't01',
    cat: 'template',
    title: '工程目录组织规范',
    brief: '单片机项目从小到大的标准目录结构，模块化、可移植、好维护',
    tags: ['CubeMX', 'Keil', '模块化'],
    platform: '通用',
    code: `Project/
├── Core/                  // CubeMX 生成的主干（main.c / it.c / gpio.c...）
│   ├── Inc/  Src/
├── Drivers/               // HAL 库 + CMSIS（不要手改）
├── Modules/               // 自己的功能模块，一模块一对文件
│   ├── bsp_led.c/.h       // 板级驱动：与硬件绑定的最底层
│   ├── bsp_uart.c/.h
│   ├── drv_mpu6050.c/.h   // 器件驱动：只依赖 bsp 接口，不碰寄存器细节
│   └── app_ctrl.c/.h      // 应用逻辑：调度与算法，不直接摸外设
├── Middlewares/           // FreeRTOS / 文件系统等第三方
└── MDK-ARM/               // 工程文件

分层规则（面试和实战都常考）：
  app  →  drv  →  bsp  →  HAL
  上层只调用下一层接口；bsp 换板只改 bsp，
  drv 换器件只换 drv，app 逻辑完全不动。`,
    points: [
      '一模块一对 .c/.h，.h 里只放对外接口声明，变量全部 static 藏进 .c',
      '禁止在 main.c 里写业务逻辑，main 只做初始化和调度',
      '中断服务函数只做「搬运数据 + 置标志」，处理逻辑放到主循环或任务',
      '编译前先用编辑器全局搜索确认没有跨层调用（如 app 直接读 GPIO 寄存器）',
    ],
    linkProject: 'p01',
  },
  {
    id: 't02',
    cat: 'template',
    title: 'printf 重定向到串口',
    brief: '让 printf 直接从串口输出调试信息，含浮点支持与 Keil 微库说明',
    tags: ['UART', 'printf', '调试'],
    platform: 'STM32 全系',
    code: `#include <stdio.h>

/* 方法一：重写 fputc（Keil 微库 / GCC 均适用） */
int fputc(int ch, FILE *f)
{
    HAL_UART_Transmit(&huart1, (uint8_t *)&ch, 1, 0xFFFF);
    return ch;
}

/* 方法二：GCC（STM32CubeIDE）需要补 _write */
int _write(int fd, char *ptr, int len)
{
    HAL_UART_Transmit(&huart1, (uint8_t *)ptr, len, 0xFFFF);
    return len;
}

/* 使用前初始化串口 115200-8-N-1，然后即可：
   printf("hello, v=%.2f\\r\\n", 3.14f); */`,
    points: [
      'Keil 勾选 Use MicroLIB，否则 printf 可能卡死在半主机模式',
      'GCC 下默认不支持 %f：链接参数加 -u _printf_float，或改用整数放大打印',
      'printf 是阻塞发送，高频打印会拖慢实时性——正式版用宏关掉或换 DMA',
      '多任务环境（FreeRTOS）里 printf 要加互斥锁，否则打印内容会串行错乱',
    ],
    linkProject: 'p01',
  },
  {
    id: 't03',
    cat: 'template',
    title: '分级日志宏（LOG 模块）',
    brief: 'ERROR/WARN/INFO/DEBUG 四级日志，一个宏开关控制全站输出',
    tags: ['调试', '宏'],
    platform: '通用',
    code: `/* log.h —— 放进 Modules/ */
#pragma once
#include <stdio.h>

#define LOG_LEVEL  2      /* 0关 1仅ERROR 2+WARN 3+INFO 4全开 */

#define LOG(lv, fmt, ...) \\
    do { if (lv <= LOG_LEVEL) \\
        printf("[%s][%s:%d] " fmt "\\r\\n", \\
            (lv==1?"E":lv==2?"W":lv==3?"I":"D"), \\
            __func__, __LINE__, ##__VA_ARGS__); \\
    } while (0)

#define LOG_E(fmt, ...) LOG(1, fmt, ##__VA_ARGS__)
#define LOG_W(fmt, ...) LOG(2, fmt, ##__VA_ARGS__)
#define LOG_I(fmt, ...) LOG(3, fmt, ##__VA_ARGS__)
#define LOG_D(fmt, ...) LOG(4, fmt, ##__VA_ARGS__)

/* 用法：
   LOG_E("mpu init fail, id=%02X", id);
   输出: [E][mpu_init:42] mpu init fail, id=00 */`,
    points: [
      'do-while(0) 包裹保证宏在 if-else 里不炸语法',
      '##__VA_ARGS__ 兼容空参数，__func__/__LINE__ 自动带出处',
      '发布版把 LOG_LEVEL 改 1 或 0，一行改全局，编译器自动裁剪死代码',
      'printf 打印本身耗时，1kHz 控制环里严禁打日志',
    ],
  },
  {
    id: 't04',
    cat: 'template',
    title: '主循环骨架：时间片轮询框架',
    brief: '裸机项目最实用的调度骨架：1ms 心跳 + 时间片任务表',
    tags: ['裸机', '架构'],
    platform: '通用',
    code: `/* 用任意定时器产生 1ms 心跳，维护一个毫秒计数 */
volatile uint32_t g_ms = 0;
void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim)
{
    if (htim == &htim6) g_ms++;
}
uint32_t millis(void) { return g_ms; }

/* 任务表：周期 + 上次执行时刻 + 函数 */
typedef struct {
    uint32_t period_ms;
    uint32_t last;
    void (*task)(void);
} slice_task_t;

void task_key(void)     { /* 按键扫描 10ms 一次 */ }
void task_sensor(void)  { /* 传感器采样 20ms 一次 */ }
void task_ctrl(void)    { /* 控制环 5ms 一次 */ }
void task_report(void)  { /* 上报打印 1000ms 一次 */ }

static slice_task_t tasks[] = {
    { 5,    0, task_ctrl   },
    { 10,   0, task_key    },
    { 20,   0, task_sensor },
    { 1000, 0, task_report },
};

int main(void)
{
    /* HAL_Init / SystemClock / MX_..._Init() */
    while (1) {
        uint32_t now = millis();
        for (uint32_t i = 0; i < sizeof(tasks)/sizeof(tasks[0]); i++) {
            if (now - tasks[i].last >= tasks[i].period_ms) {
                tasks[i].last = now;      /* 注意：now-last 用无符号减法，回绕安全 */
                tasks[i].task();
            }
        }
    }
}`,
    points: [
      '无符号减法 now-last 天然抗毫秒回绕，不要写成 now > last + period',
      '单次任务耗时要远小于最小周期，否则时间片会被拖长（实测打 IO 翻转量波形）',
      '这个框架能覆盖 80% 的裸机项目，上 RTOS 的动机要明确（需要抢占/阻塞）',
    ],
    linkProject: 'p02',
  },

  // ==================== GPIO ====================
  {
    id: 'g01',
    cat: 'gpio',
    title: 'GPIO 输出：LED / 蜂鸣器',
    brief: 'HAL_GPIO_WritePin / TogglePin 的标准用法与推挽-开漏选择',
    tags: ['HAL', '推挽', '开漏'],
    platform: 'STM32 全系',
    code: `/* 输出电平：多数开发板 LED 低电平点亮 */
HAL_GPIO_WritePin(GPIOC, GPIO_PIN_13, GPIO_PIN_RESET);  // 亮
HAL_GPIO_WritePin(GPIOC, GPIO_PIN_13, GPIO_PIN_SET);    // 灭
HAL_GPIO_TogglePin(GPIOC, GPIO_PIN_13);                 // 翻转

/* 读输入：按键（上拉输入，按下为低） */
if (HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_0) == GPIO_PIN_RESET) {
    /* pressed */
}

/* CubeMX 配置速查：
   推挽输出 GPIO_MODE_OUTPUT_PP —— LED/蜂鸣器/继电器（能主动拉高拉低）
   开漏输出 GPIO_MODE_OUTPUT_OD —— I2C/电平转换/线与（只能拉低，靠外部上拉出高）
   上拉输入 GPIO_MODE_INPUT +_PULLUP —— 按键对地
   需要高速翻转（>2MHz）时在 GPIO 配置里选 High speed */`,
    points: [
      '蜂鸣器/继电器属于感性负载，GPIO 必须经三极管/MOS 驱动，不能直推',
      '开漏输出读回引脚电平要配成输入模式或开 IDR，OD 模式写 SET 不代表引脚是高',
      'STM32 部分引脚是 5V 容忍（FT），接 5V 信号前查数据手册 FT 标记',
    ],
    linkCircuit: 'c36',
  },
  {
    id: 'g02',
    cat: 'gpio',
    title: '按键扫描状态机（消抖）',
    brief: '不阻塞、不延时，三状态机实现可靠消抖，支持长按连发',
    tags: ['状态机', '消抖', '裸机'],
    platform: '通用',
    code: `/* 每 10ms 调用一次（配合时间片框架），返回事件 */
typedef enum { KEY_NONE = 0, KEY_SHORT, KEY_LONG } key_event_t;

typedef enum { KS_IDLE, KS_DOWN, KS_REPEAT } key_state_t;

#define KEY_LONG_MS   800    /* 长按阈值 */
#define KEY_REPEAT_MS 150    /* 连发间隔 */

key_event_t key_scan(void)
{
    static key_state_t st = KS_IDLE;
    static uint16_t cnt = 0;
    /* 假设低电平按下 */
    uint8_t pressed = (HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_0) == GPIO_PIN_RESET);

    switch (st) {
    case KS_IDLE:
        if (pressed) { st = KS_DOWN; cnt = 0; }   /* 首次检测到按下 */
        break;
    case KS_DOWN:
        if (!pressed) { st = KS_IDLE; return KEY_SHORT; }  /* 松开=短按 */
        if (++cnt >= KEY_LONG_MS / 10) { st = KS_REPEAT; cnt = 0; return KEY_LONG; }
        break;
    case KS_REPEAT:
        if (!pressed) { st = KS_IDLE; break; }
        if (++cnt >= KEY_REPEAT_MS / 10) { cnt = 0; return KEY_LONG; } /* 持续连发 */
        break;
    }
    return KEY_NONE;
}`,
    points: [
      '核心思想：抖动是 ±5ms 的高频跳变，用「连续 N 次采样一致」代替 HAL_Delay(20) 阻塞',
      '扫描周期 10ms 时，状态机天然滤掉 <10ms 抖动，无需额外计数',
      '短按在松开瞬间确认，避免按下立刻触发导致误操作',
      '矩阵键盘是本例的扩展：行扫列读，代码结构完全相同',
    ],
    linkCircuit: 'c40',
  },
  {
    id: 'g03',
    cat: 'gpio',
    title: '外部中断 EXTI：回调与防抖',
    brief: 'HAL_GPIO_EXTI_Callback 的正确写法，中断里该做什么不该做什么',
    tags: ['EXTI', '中断'],
    platform: 'STM32 全系',
    code: `/* CubeMX 里把引脚配成 EXTI 模式，选上升/下降沿，NVIC 使能 */
volatile uint8_t g_key_evt = 0;
volatile uint32_t g_last_tick = 0;

void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin)
{
    if (GPIO_Pin == KEY0_Pin) {
        uint32_t now = HAL_GetTick();
        if (now - g_last_tick < 50) return;   /* 50ms 内重复触发视为抖动，直接丢 */
        g_last_tick = now;
        g_key_evt = 1;                        /* 只置标志，处理放主循环 */
    }
}

/* 主循环里消费事件 */
if (g_key_evt) { g_key_evt = 0; /* do something */ }`,
    points: [
      '中断服务函数原则：快进快出。只做置标志/存数据，绝不 HAL_Delay、printf、长计算',
      'HAL 的 EXTI 回调是所有引脚共用的，必须先判断 GPIO_Pin 再分发',
      '共享变量加 volatile；多字节共享数据用关中断 __disable_irq() 临界区保护',
      '编码器/光电门这类高速脉冲别用 EXTI 数数，改用定时器编码器模式硬件计数',
    ],
    linkCircuit: 'c37',
  },

  // ==================== 串口 ====================
  {
    id: 'u01',
    cat: 'uart',
    title: '串口阻塞收发（入门标准写法）',
    brief: 'HAL_UART_Transmit / Receive 的超时用法与一收一发回显',
    tags: ['UART', 'HAL'],
    platform: 'STM32 全系',
    code: `uint8_t tx[] = "EmbedMaster UART\\r\\n";
HAL_UART_Transmit(&huart1, tx, sizeof(tx) - 1, 100);   /* 100ms 超时 */

/* 收一个字节（阻塞，适合低速命令行场景） */
uint8_t rx;
if (HAL_UART_Receive(&huart1, &rx, 1, 100) == HAL_OK) {
    HAL_UART_Transmit(&huart1, &rx, 1, 100);   /* 回显 */
}

/* 更推荐：注册型接收，收到自动进回调，CPU 不空等 */
uint8_t byte;
HAL_UART_Receive_IT(&huart1, &byte, 1);

void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
    if (huart->Instance == USART1) {
        /* 把 byte 塞进环形缓冲，然后重新挂接收 */
        HAL_UART_Receive_IT(&huart1, &byte, 1);
    }
}`,
    points: [
      '阻塞 Receive 等数据时会占死 CPU，只适合上电自检、单次交互',
      'Receive_IT 每次完成只收一次，必须在回调里重新挂起，漏挂 = 串口假死',
      '波特率与上位机不一致是「乱码」第一嫌疑：先核对 115200-8-N-1',
      '发送函数不能在中断里用长超时阻塞版，中断里要么短包要么改 DMA/标志位',
    ],
    linkCircuit: 'c48',
  },
  {
    id: 'u02',
    cat: 'uart',
    title: 'DMA + 空闲中断：不定长接收',
    brief: '串口接收的工业级方案：DMA 搬运，IDLE 中断判定帧结束',
    tags: ['DMA', 'IDLE', '不定长'],
    platform: 'STM32 全系',
    code: `#define RX_BUF_SIZE 256
uint8_t rx_buf[RX_BUF_SIZE];
volatile uint16_t rx_len = 0;
volatile uint8_t  rx_flag = 0;

/* 初始化：开 DMA 循环/正常模式接收 + 使能 IDLE 中断 */
void uart_dma_start(void)
{
    HAL_UART_Receive_DMA(&huart1, rx_buf, RX_BUF_SIZE);
    __HAL_UART_ENABLE_IT(&huart1, UART_IT_IDLE);
}

/* 空闲中断：总线空闲一帧结束 */
void USART1_IRQHandler(void)      /* CubeMX 已生成，加入以下判断 */
{
    if (__HAL_UART_GET_FLAG(&huart1, UART_FLAG_IDLE)) {
        __HAL_UART_CLEAR_IDLEFLAG(&huart1);
        HAL_UART_DMAStop(&huart1);
        rx_len = RX_BUF_SIZE - __HAL_DMA_GET_COUNTER(huart1.hdmarx);
        rx_flag = 1;
        HAL_UART_Receive_DMA(&huart1, rx_buf, RX_BUF_SIZE);  /* 重启接收 */
    }
}

/* 主循环消费 */
if (rx_flag) {
    rx_flag = 0;
    /* 此时 rx_buf[0..rx_len-1] 就是完整一帧 */
    frame_parse(rx_buf, rx_len);
}`,
    points: [
      'IDLE 标志 = 总线一个字节时长无新数据，天然适合「不定长帧」边界判定',
      '__HAL_DMA_GET_COUNTER 剩余计数反推长度，不用逐字节数',
      'DMA 缓冲区在正常模式下要重启，循环模式则只需记下读取位置',
      '高速连续帧场景注意「停-启间隙丢数据」，改为双缓冲或循环模式读指针法',
    ],
    linkProject: 'p02',
  },
  {
    id: 'u03',
    cat: 'uart',
    title: '环形缓冲区（FIFO）',
    brief: '中断与主循环之间的标准数据桥梁，无锁单生产者单消费者',
    tags: ['数据结构', '中断'],
    platform: '通用',
    code: `#define FIFO_SIZE 128            /* 必须是 2 的幂 */
typedef struct {
    uint8_t  buf[FIFO_SIZE];
    volatile uint16_t head;          /* 写指针：中断里动 */
    volatile uint16_t tail;          /* 读指针：主循环动 */
} fifo_t;

fifo_t g_uart_fifo;

/* 中断里调用：写 */
void fifo_put(fifo_t *f, uint8_t d)
{
    uint16_t next = (f->head + 1) & (FIFO_SIZE - 1);   /* 用位与取模，要求 2^n */
    if (next != f->tail) {         /* 不满才写 */
        f->buf[f->head] = d;
        f->head = next;
    }
    /* 满则丢弃（也可选择覆盖最旧数据） */
}

/* 主循环调用：读 */
int fifo_get(fifo_t *f, uint8_t *d)
{
    if (f->head == f->tail) return 0;                  /* 空 */
    *d = f->buf[f->tail];
    f->tail = (f->tail + 1) & (FIFO_SIZE - 1);
    return 1;
}`,
    points: [
      '牺牲 1 字节区分满/空：next==tail 视为满，永远不写满',
      '单写单读场景无需关中断——head/tail 各只有一个主人，16 位读写本身原子',
      '容量取 2 的幂才能用 & 取模；否则用 % 但注意性能',
      '串口中断塞 FIFO、主循环取走解析——这是所有协议解析的地基',
    ],
    linkProject: 'p02',
  },
  {
    id: 'u04',
    cat: 'uart',
    title: '协议帧解析器：帧头+长度+CRC',
    brief: '状态机逐字节解析，抗粘包断包，带 CRC 校验',
    tags: ['协议', '状态机', 'CRC'],
    platform: '通用',
    code: `/* 帧格式: 0xAA 0x55 | LEN(1B) | PAYLOAD... | CRC8(1B) */
#define FH0 0xAA
#define FH1 0x55
#define MAX_PAYLOAD 32

typedef enum { PS_H0, PS_H1, PS_LEN, PS_DATA, PS_CRC } parse_state_t;

static uint8_t crc8(const uint8_t *p, uint8_t n)
{
    uint8_t c = 0;
    while (n--) {
        c ^= *p++;
        for (int i = 0; i < 8; i++)
            c = (c & 0x80) ? (c << 1) ^ 0x07 : (c << 1);
    }
    return c;
}

/* 每来一个字节调一次（从串口 FIFO 取出后） */
void frame_feed(uint8_t b)
{
    static parse_state_t st = PS_H0;
    static uint8_t payload[MAX_PAYLOAD], len, idx;

    switch (st) {
    case PS_H0:  if (b == FH0) st = PS_H1; break;
    case PS_H1:  st = (b == FH1) ? PS_LEN : (b == FH0 ? PS_H1 : PS_H0); break;
    case PS_LEN:
        if (b <= MAX_PAYLOAD) { len = b; idx = 0; st = (len ? PS_DATA : PS_CRC); }
        else st = PS_H0;                          /* 非法长度，丢帧 */
        break;
    case PS_DATA:
        payload[idx++] = b;
        if (idx >= len) st = PS_CRC;
        break;
    case PS_CRC:
        st = PS_H0;
        if (b == crc8(payload, len))
            frame_dispatch(payload, len);          /* 校验通过，交给应用 */
        break;                                     /* 失败静默丢弃，靠重传/心跳恢复 */
    }
}`,
    points: [
      '状态机逐字节解析对粘包/断包免疫，比「等满 N 字节再处理」健壮得多',
      '帧头第二字节失配时注意回退（b==FH0 时保持 PS_H1），否则 0xAA0xAA55 会被拆错',
      'CRC8 一字节数据表 256 项换速度；BLE/Modbus 常用 CRC16，思路相同',
      '通信链路一定要设计「失败后的恢复手段」：重传、心跳超时、帧率统计',
    ],
    linkProject: 'p02',
  },
]
