/**
 * 代码库 · 第二批：定时器 / ADC / I2C / SPI
 */
import type { CodeEntry } from './codelib'

export const bank2: CodeEntry[] = [
  // ==================== 定时器 ====================
  {
    id: 'p01',
    cat: 'tim',
    title: 'PWM 输出与呼吸灯',
    brief: 'TIM PWM 配置公式 + 占空比渐变，调速/调光的地基',
    tags: ['PWM', '定时器'],
    platform: 'STM32 全系',
    code: `/* CubeMX 配置：TIM1 CH1 → PWM Generation，先算参数
   目标 PWM 频率 = 72MHz / ((PSC+1) * (ARR+1))
   例：PSC=71, ARR=999 → 72M/72/1000 = 1kHz，分辨率 1000 级 */

HAL_TIM_PWM_Start(&htim1, TIM_CHANNEL_1);

/* 设置占空比：0~999 对应 0%~100% */
__HAL_TIM_SET_COMPARE(&htim1, TIM_CHANNEL_1, 500);   // 50%

/* 呼吸灯：在时间片任务里每 10ms 渐变 */
void task_breath(void)
{
    static uint16_t duty = 0;
    static int8_t dir = 1;
    duty += dir * 10;
    if (duty >= 999) { duty = 999; dir = -1; }
    if (duty == 0)     dir = 1;
    __HAL_TIM_SET_COMPARE(&htim1, TIM_CHANNEL_1, duty);
}

/* 高级定时器 TIM1/TIM8 输出互补 PWM + 死区（电机驱动必用）：
   CubeMX 里 Broken/Dead Time 配 DeadTime 数值，
   启动用 HAL_TIMEx_PWMN_Start 启动互补通道 */`,
    points: [
      '频率与分辨率互相牵制：ARR 越大分辨率越高、频率越低，先定频率再定分辨率',
      '舵机要 50Hz（20ms 周期），电机/LED 调光用 10k~20kHz 避开可听噪声',
      '舵机脉宽 0.5~2.5ms 对应角度，ARR=19999/PSC=71 时 CCR 值即微秒数，最直观',
      '改频率时 PSC/ARR 带预装载，实际下个周期才生效，调试时别被「改了没反应」骗到',
    ],
    linkCircuit: 'c38',
  },
  {
    id: 'p02',
    cat: 'tim',
    title: '定时中断：系统心跳与超时管理',
    brief: '用基础定时器产生 1ms 中断，维护系统时基和软定时器',
    tags: ['定时中断', 'HAL_GetTick'],
    platform: 'STM32 全系',
    code: `/* CubeMX：TIM6 配 1ms（72MHz/72/1000），NVIC 打开中断 */
HAL_TIM_Base_Start_IT(&htim6);

volatile uint32_t g_ms = 0;

void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim)
{
    if (htim->Instance == TIM6) g_ms++;
}

uint32_t millis(void) { return g_ms; }

/* 通用软定时器：注册回调，不占主循环 */
typedef void (*soft_cb)(void);
typedef struct { uint32_t period, last; uint8_t en; soft_cb cb; } soft_timer_t;

static soft_timer_t g_timers[8];
static uint8_t g_cnt = 0;

void soft_timer_add(uint32_t period_ms, soft_cb cb)
{
    g_timers[g_cnt] = (soft_timer_t){ period_ms, millis(), 1, cb };
    g_cnt++;
}

/* 放主循环：轮询触发（回调在主循环上下文执行，安全） */
void soft_timer_poll(void)
{
    for (uint8_t i = 0; i < g_cnt; i++) {
        if (g_timers[i].en && millis() - g_timers[i].last >= g_timers[i].period) {
            g_timers[i].last = millis();
            g_timers[i].cb();
        }
    }
}`,
    points: [
      '不修改 HAL_GetTick 依赖的 SysTick，另开 TIM6 做业务心跳，避免优先级纠缠',
      '回调在主循环执行而非中断里，可以直接调用 printf 等非重入函数',
      '超时判断统一用 millis() 差值，全工程禁止 HAL_Delay（阻塞 = 单任务自杀）',
      '需要精确节拍（如 DHT11 微秒级时序）另配 µs 级定时器或 DWT->CYCCNT',
    ],
    linkProject: 'p01',
  },
  {
    id: 'p03',
    cat: 'tim',
    title: '输入捕获：测频率与脉宽',
    brief: '用输入捕获测量外部脉冲频率/占空比，超声波测距的核心',
    tags: ['输入捕获', '超声波'],
    platform: 'STM32 全系',
    code: `/* CubeMX：TIM3 CH1 输入捕获，上升沿，PSC=71 → 计数 1µs/格，ARR=0xFFFF */
HAL_TIM_IC_Start_IT(&htim3, TIM_CHANNEL_1);

volatile uint32_t freq_hz = 0;
volatile uint32_t pulse_us = 0;
static uint32_t rise1 = 0, period_cnt = 0;

void HAL_TIM_IC_CaptureCallback(TIM_HandleTypeDef *htim)
{
    if (htim->Channel == HAL_TIM_ACTIVE_CHANNEL_1) {
        uint32_t cap = HAL_TIM_ReadCapturedValue(htim, TIM_CHANNEL_1);
        static uint8_t first = 1;
        if (first) { rise1 = cap; first = 0; return; }

        uint32_t diff = cap - rise1;          /* 无符号减法自动处理 ARR 回绕 */
        rise1 = cap;
        if (diff == 0) return;
        freq_hz = 1000000u / diff;            /* 两个上升沿间隔 = 周期(µs) */
    }
}

/* 测占空比：同定时器 CH2 配下降沿捕获同一引脚，
   脉宽 = 下降沿时刻 - 上升沿时刻（同通道切换极性法亦可行） */

/* 超声波 HC-SR04 例：Echo 引脚接捕获口，
   距离 cm = pulse_us * 0.0343 / 2 */
`,
    points: [
      '两个捕获值相减用无符号数，ARR 回绕自动抵消——这是面试高频考点',
      '待测频率远低于定时器分辨率时误差变大：超低频信号改用「数门限时间内的脉冲数」',
      'HC-SR04 的 Echo 脉宽即距离，捕获比 EXTI 计数精确且不受主循环抖动影响',
      '输入捕获通道可配成「直接+间接」组合测周期+占空比，CubeMX 里 CH1/CH2 同引脚',
    ],
    linkCircuit: 'c57',
  },
  {
    id: 'p04',
    cat: 'tim',
    title: '编码器模式：电机测速',
    brief: '定时器编码器接口硬件计数，正交 AB 相直接读角度与转速',
    tags: ['编码器', '电机'],
    platform: 'STM32 全系',
    code: `/* CubeMX：TIM4 → Combined Channels: Encoder Mode TI1 and TI1
   编码器 A→CH1(PB6) B→CH2(PB7)，ARR=0xFFFF，TI12 四倍频 */
HAL_TIM_Encoder_Start(&htim4, TIM_CHANNEL_ALL);

/* 读取累计位置（处理 16 位回绕） */
int32_t encoder_read(void)
{
    static uint16_t last = 0;
    static int32_t  total = 0;
    uint16_t now = __HAL_TIM_GET_COUNTER(&htim4);
    int16_t diff = (int16_t)(now - last);      /* 强转 int16 自动处理回绕 */
    last = now;
    total += diff;
    return total;                              /* 单位：四倍频计数 */
}

/* 测速：10ms 任务里取差分 */
void task_speed(void)
{
    static int32_t last_pos = 0;
    int32_t pos = encoder_read();
    int32_t cps = (pos - last_pos) * 100;      /* 每秒计数 */
    last_pos = pos;
    /* rpm = cps * 60 / (4 * PPR * 减速比) */
}`,
    points: [
      '(int16_t)(now-last) 强转是回绕处理的精髓，正反转都正确',
      '定时器编码器模式是硬件计数，主循环再忙也不丢脉冲——比 EXTI 数数可靠得多',
      '四倍频计数 = 4×PPR；换算转速别忘乘减速比',
      '小车走直线偏差大？先查两轮编码器计数差，多数是机械不对称而非程序 bug',
    ],
    linkProject: 'p01',
  },

  // ==================== ADC ====================
  {
    id: 'a01',
    cat: 'adc',
    title: 'ADC 单通道采样 + 均值滤波',
    brief: '阻塞采样的标准写法，12 位值转电压，均值滤波压噪声',
    tags: ['ADC', '滤波'],
    platform: 'STM32 全系',
    code: `/* CubeMX：ADC1 IN0，12 位分辨率，采样时间拉长抗阻尼（≥ 55.5 cycles） */
uint16_t adc_read_avg(uint8_t n)
{
    uint32_t sum = 0;
    for (uint8_t i = 0; i < n; i++) {
        HAL_ADC_Start(&hadc1);
        HAL_ADC_PollForConversion(&hadc1, 10);
        sum += HAL_ADC_GetValue(&hadc1);
        HAL_ADC_Stop(&hadc1);
    }
    return (uint16_t)(sum / n);
}

void task_adc(void)
{
    uint16_t raw = adc_read_avg(8);            /* 8 次均值 */
    float volt = raw * 3.3f / 4095.0f;         /* 12 位满量程 3.3V */
    /* 若前端有分压：volt *= (R1+R2)/R2 */
}`,
    points: [
      '信号源内阻大（电位器/NTC）必须拉长采样时间，否则读数偏低且跳变',
      '均值滤波对白噪声有效（√N 提升），对周期性干扰（50Hz 工频）应改「20ms 整周期采样」',
      'VREF 不准满盘皆输：精密测量要用内部 VREFINT 自校准或外接基准源',
      'ADC 输入超过 VDD 会闩锁烧片——分压电阻保命，必要时加钳位二极管',
    ],
    linkCircuit: 'c44',
  },
  {
    id: 'a02',
    cat: 'adc',
    title: 'ADC 多通道 DMA 扫描',
    brief: '一次配置多通道循环采样进内存数组，CPU 零开销取最新值',
    tags: ['ADC', 'DMA'],
    platform: 'STM32 全系',
    code: `/* CubeMX：ADC1 勾选 IN0/IN1/IN2，Scan Conversion + Continuous + DMA Circular
   Rank 顺序即数组顺序 */
#define ADC_CH 3
volatile uint16_t adc_raw[ADC_CH];

HAL_ADC_Start_DMA(&hadc1, (uint32_t *)adc_raw, ADC_CH);

void task_read_sensor(void)
{
    /* adc_raw[] 随时是最新值，直接用 */
    float v0 = adc_raw[0] * 3.3f / 4095.0f;    /* 通道 0 电压 */
    float v1 = adc_raw[1] * 3.3f / 4095.0f;
    float v2 = adc_raw[2] * 3.3f / 4095.0f;
    /* 想要「某时刻快照」时开传输完成中断 HAL_ADC_ConvCpltCallback 处理 */
}`,
    points: [
      'Continuous + DMA Circular 让 ADC 不停自采，CPU 只读数组，实时系统首选',
      '多通道必须开 Scan 模式；Rank 顺序和数组下标一一对应，注释写清楚',
      '数据 buffer 声明 volatile，防止编译器优化掉「看似没变」的读取',
      '采样率 = 时钟 / (采样时间+12.5) × 通道数，精确控制节奏时反过来推配置',
    ],
    linkProject: 'p02',
  },
  {
    id: 'a03',
    cat: 'adc',
    title: 'NTC 测温：B 值公式计算',
    brief: '从 ADC 原始值到摄氏温度的完整换算链，含查表替代方案',
    tags: ['NTC', '温度', '公式'],
    platform: '通用',
    code: `/* 电路：3.3V — R_pull(10k) — [ADC点] — NTC(10k,B=3950) — GND
   即 NTC 在下臂（低端接法） */
#define R_PULL    10000.0f
#define B_VAL     3950.0f
#define T0_K      298.15f        /* 25°C 的开尔文温度 */
#define R25       10000.0f
#define ADC_MAX   4095.0f

float ntc_temperature(uint16_t raw)
{
    float v   = raw * 3.3f / ADC_MAX;
    /* NTC 在下臂：V/R25 关系推导，注意上拉在上的分压方向 */
    float r_ntc = R_PULL * v / (3.3f - v);        /* NTC 阻值 */
    /* B 值公式：1/T = 1/T0 + (1/B) * ln(R/R25) */
    float t_k = 1.0f / (1.0f / T0_K + logf(r_ntc / R25) / B_VAL);
    return t_k - 273.15f;                          /* 摄氏度 */
}

/* 精度要求高（±0.1°C）时不用公式，用厂家 R-T 分度表 + 线性插值：
   temp = t_low + (r - r_low) * (t_high - t_low) / (r_high - r_low) */`,
    points: [
      '分压方向搞反是第一大坑：先画电路确认 NTC 在上臂还是下臂，公式跟着变',
      'B 值公式在中段（0~50°C）够用；结冰/高温段用分度表插值更准',
      'NTC 自热会抬升读数：把采样电流限到 ~0.1mA 级（10k 挡位天然满足）',
      '导线电阻串联进 NTC 会造成系统性偏高，长线测温用 3 线制或直接换 DS18B20',
    ],
    linkCircuit: 'c46',
  },
  {
    id: 'a04',
    cat: 'adc',
    title: '电池电压监测与低电保护',
    brief: '分压采样 + 滑动窗口 + 迟回比较，避免临界电压反复报警',
    tags: ['电源', 'ADC'],
    platform: '通用',
    code: `/* 2S 锂电 8.4~6.4V，经 30k/10k 分压到 ADC（比例 1/4） */
#define V_FULL   8.4f
#define V_WARN_H 7.0f      /* 报警阈值（进入） */
#define V_WARN_L 6.9f      /* 解除阈值（迟回 0.1V） */

float battery_voltage(void)
{
    static float filt = 0;
    float v = adc_raw[2] * 3.3f / 4095.0f * 4.0f;   /* 还原满量程 */
    filt = filt * 0.9f + v * 0.1f;                   /* 一阶低通，抗瞬时压降 */
    return filt;
}

/* 迟回比较：状态保持，杜绝 7.0V 附近报警闪 */
uint8_t battery_low(void)
{
    static uint8_t low = 0;
    float v = battery_voltage();
    if (!low && v < V_WARN_H) low = 1;
    if (low && v > V_WARN_L) low = 0;    /* 解除要比进入略高，形成迟回 */
    return low;
}`,
    points: [
      '电机启动瞬时压降可达 1V——不滤波直接比较会导致「一启动就低电报警」',
      '迟回（施密特）比较是消除临界抖动的通用手法，温控/充电指示同理',
      '锂电池放电平台中间段平缓，电压百分比要按放电曲线分段映射才准',
      '严格项目用库仑计（如 CW2015）替代电压法，精度从 ±10% 提到 ±3%',
    ],
    linkCircuit: 'c45',
  },

  // ==================== I2C ====================
  {
    id: 'i01',
    cat: 'i2c',
    title: '硬件 I2C 读写 MPU6050',
    brief: 'HAL I2C 三板斧：Mem_Read / Mem_Write / 设备扫描',
    tags: ['I2C', 'MPU6050', 'HAL'],
    platform: 'STM32 全系',
    code: `#define MPU_ADDR (0x68 << 1)     /* HAL 用 8 位地址：7 位地址左移 1 */

/* 探测总线上的设备（调试必备） */
void i2c_scan(void)
{
    for (uint8_t a = 1; a < 127; a++) {
        if (HAL_I2C_IsDeviceReady(&hi2c1, a << 1, 3, 100) == HAL_OK)
            printf("found: 0x%02X\\r\\n", a);
    }
}

/* 写寄存器 */
void mpu_write(uint8_t reg, uint8_t val)
{
    HAL_I2C_Mem_Write(&hi2c1, MPU_ADDR, reg, I2C_MEMADD_SIZE_8BIT, &val, 1, 100);
}

/* 读寄存器 */
uint8_t mpu_read(uint8_t reg)
{
    uint8_t v = 0;
    HAL_I2C_Mem_Read(&hi2c1, MPU_ADDR, reg, I2C_MEMADD_SIZE_8BIT, &v, 1, 100);
    return v;
}

/* 初始化 + 读三轴加速度（int16 大端） */
void mpu_init(void)
{
    mpu_write(0x6B, 0x00);       /* PWR_MGMT_1: 退出睡眠 */
    HAL_Delay(100);
    mpu_write(0x1B, 0x00);       /* 陀螺 ±250dps */
    mpu_write(0x1C, 0x00);       /* 加速度 ±2g */
}

void mpu_read_accel(int16_t *xyz)
{
    uint8_t b[6];
    HAL_I2C_Mem_Read(&hi2c1, MPU_ADDR, 0x3B, I2C_MEMADD_SIZE_8BIT, b, 6, 100);
    xyz[0] = (int16_t)((b[0] << 8) | b[1]);
    xyz[1] = (int16_t)((b[2] << 8) | b[3]);
    xyz[2] = (int16_t)((b[4] << 8) | b[5]);
}`,
    points: [
      'HAL 地址 = 7 位地址左移 1，写错直接 NACK——0x68 vs 0xD0 老坑',
      '上电先 IsDeviceReady/扫描，一次定位「接线松 / 上拉缺失 / 地址错」',
      'I2C 总线必须 4.7k 上拉；跑 400kHz 时可减到 2.2k，线长则加大',
      '多字节读一次 burst 读完，逐字节读会读到「撕裂」的中间态数据',
    ],
    linkCircuit: 'c42',
  },
  {
    id: 'i02',
    cat: 'i2c',
    title: '软件 I2C（GPIO 模拟）',
    brief: '任意引脚模拟 I2C，硬件 I2C 坏死/引脚冲突时的救命方案',
    tags: ['软件I2C', 'GPIO'],
    platform: '通用',
    code: `/* 引脚开漏输出 + 外部上拉（或内部上拉，速度慢些） */
#define SCL_H()  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_SET)
#define SCL_L()  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_RESET)
#define SDA_H()  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_7, GPIO_PIN_SET)
#define SDA_L()  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_7, GPIO_PIN_RESET)
#define SDA_R()  HAL_GPIO_ReadPin(GPIOB, GPIO_PIN_7)
#define DLY()    delay_us(2)          /* ~250kHz，用 DWT 定制微秒延时 */

void i2c_start(void)
{
    SDA_H(); SCL_H(); DLY();
    SDA_L(); DLY();                   /* SCL 高时 SDA 下跳 = START */
    SCL_L();
}

void i2c_stop(void)
{
    SDA_L(); DLY(); SCL_H(); DLY();
    SDA_H(); DLY();                   /* SCL 高时 SDA 上跳 = STOP */
}

uint8_t i2c_write_byte(uint8_t b)
{
    for (int i = 7; i >= 0; i--) {
        (b & (1 << i)) ? SDA_H() : SDA_L();
        DLY(); SCL_H(); DLY(); SCL_L();
    }
    SDA_H();                          /* 释放 SDA 等 ACK */
    DLY(); SCL_H(); DLY();
    uint8_t ack = !SDA_R();           /* 低电平 = ACK */
    SCL_L();
    return ack;
}`,
    points: [
      'SDA 换向时机：发送后释放 SDA 再拉 SCL 读 ACK，顺序错了读到自己的电平',
      '软件 I2C 出错后可能卡在总线中间态，实现「9 个时钟发 STOP」的总线恢复函数',
      '速度别贪快：上拉弱 + 线电容大时先降速验证，稳了再提频',
      '同一路总线挂多设备时，软件 I2C 的引脚会被多任务并发使用——加互斥锁',
    ],
    linkCircuit: 'c42',
  },
  {
    id: 'i03',
    cat: 'i2c',
    title: 'OLED(SSD1306) 驱动框架',
    brief: '页寻址显存 + 本地 framebuffer，字符/图形双API',
    tags: ['OLED', '显示'],
    platform: 'STM32 + SSD1306',
    code: `#define OLED_ADDR  (0x3C << 1)
static uint8_t oled_buf[8][128];      /* 8 页 × 128 列显存，1bit/像素 */

/* 写命令/数据：控制字节 0x00=命令 0x40=数据 */
void oled_cmd(uint8_t c)
{
    uint8_t b[2] = { 0x00, c };
    HAL_I2C_Master_Transmit(&hi2c1, OLED_ADDR, b, 2, 100);
}

void oled_flush(void)                 /* 把显存整帧刷到屏幕 */
{
    for (uint8_t p = 0; p < 8; p++) {
        oled_cmd(0xB0 + p);           /* 页地址 */
        oled_cmd(0x00); oled_cmd(0x10); /* 列低/高半字节 */
        uint8_t tmp[129] = { 0x40 };
        for (uint8_t c = 0; c < 128; c++) tmp[c + 1] = oled_buf[p][c];
        HAL_I2C_Master_Transmit(&hi2c1, OLED_ADDR, tmp, 129, 100);
    }
}

/* 画点：列 x∈[0,128)，行 y∈[0,64) */
void oled_pixel(uint8_t x, uint8_t y, uint8_t on)
{
    if (x >= 128 || y >= 64) return;
    if (on) oled_buf[y / 8][x] |=  (1 << (y % 8));
    else    oled_buf[y / 8][x] &= ~(1 << (y % 8));
}

/* 显示字符：把字库点阵按字节写入对应页（8x16 字库每列两页） */`,
    points: [
      '先写显存后统一 flush，比逐点写屏快一个数量级，且无闪烁',
      'SSD1306 是页寻址：一个字节 = 一列 8 个像素，位序竖排——画图函数要按这个展开',
      '整帧 1KB 走 I2C 约 25ms，要 30fps 动画就上 SPI 版 OLED（SSD1309/SH1106）',
      '字库放 const 数组进 flash，ASCII 95 个 8x16 字库约 3KB，别堆 RAM',
    ],
    linkProject: 'p02',
  },

  // ==================== SPI ====================
  {
    id: 's01',
    cat: 'spi',
    title: 'SPI 读写 W25Q64 Flash',
    brief: 'SPI Flash 标准操作：读 ID / 页编程 / 扇区擦除',
    tags: ['SPI', 'Flash'],
    platform: 'STM32 + W25Qxx',
    code: `/* CubeMX：SPI1 全双工主模式 8bit，CPOL=1 CPHA=1（模式3，W25Q 常用）
   片选 CS 用普通 GPIO 手动控制 */
#define CS_L() HAL_GPIO_WritePin(GPIOA, GPIO_PIN_4, GPIO_PIN_RESET)
#define CS_H() HAL_GPIO_WritePin(GPIOA, GPIO_PIN_4, GPIO_PIN_SET)

static uint8_t spi_xfer(uint8_t d)
{
    uint8_t r;
    HAL_SPI_TransmitReceive(&hspi1, &d, &r, 1, 100);
    return r;
}

uint16_t flash_read_id(void)
{
    CS_L();
    spi_xfer(0x90); spi_xfer(0); spi_xfer(0); spi_xfer(0);
    uint16_t id = (spi_xfer(0xFF) << 8) | spi_xfer(0xFF);
    CS_H();
    return id;                        /* W25Q64 = 0xEF16 */
}

/* 写使能 → 扇区擦除（最小 4KB）→ 页编程（一次最多 256B） */
void flash_write(uint32_t addr, const uint8_t *buf, uint16_t len)
{
    for (uint16_t off = 0; off < len; off += 256) {
        uint16_t chunk = (len - off > 256) ? 256 : (len - off);
        CS_L(); spi_xfer(0x06); CS_H();                 /* Write Enable */

        CS_L();
        spi_xfer(0x02);                                  /* Page Program */
        spi_xfer((addr >> 16) & 0xFF); spi_xfer((addr >> 8) & 0xFF); spi_xfer(addr & 0xFF);
        for (uint16_t i = 0; i < chunk; i++) spi_xfer(buf[off + i]);
        CS_H();
        flash_wait_busy();                               /* 等待写入完成 */
        addr += chunk;
    }
}

void flash_wait_busy(void)
{
    CS_L(); spi_xfer(0x05);
    while (spi_xfer(0xFF) & 0x01) ;    /* 读状态寄存器 BIT0 */
    CS_H();
}`,
    points: [
      'Flash 只能 1→0 写，0→1 必须擦——所以写之前先擦除，擦除最小单位 4KB',
      '页编程不能跨页边界：一次最多 256 字节且地址对齐页首，跨页要拆',
      '擦写寿命约 10 万次——频繁记录数据要加磨损均衡（或上 LittleFS）',
      '掉电写入中断会留脏数据，重要参数区加「双区备份 + CRC」',
    ],
    linkCircuit: 'c52',
  },
  {
    id: 's02',
    cat: 'spi',
    title: 'SPI + DMA 高速传输',
    brief: '刷屏、传输大块数据时的 CPU 解放方案',
    tags: ['SPI', 'DMA'],
    platform: 'STM32 全系',
    code: `/* 初始化后：
   HAL_SPI_Transmit_DMA(&hspi1, buf, len) 立即返回，
   完成后进 HAL_SPI_TxCpltCallback */

static uint8_t lcd_buf[1024];
volatile uint8_t lcd_busy = 0;

void lcd_send_async(void)
{
    lcd_busy = 1;
    CS_L();
    HAL_SPI_Transmit_DMA(&hspi1, lcd_buf, sizeof(lcd_buf));
}

void HAL_SPI_TxCpltCallback(SPI_HandleTypeDef *hspi)
{
    if (hspi->Instance == SPI1) {
        CS_H();
        lcd_busy = 0;       /* 通知主循环可以准备下一帧 */
    }
}

/* 主循环流水线：上一帧 DMA 在跑，CPU 同时准备下一帧 */
while (1) {
    if (!lcd_busy) {
        render_frame(lcd_buf);   /* CPU 填显存 */
        lcd_send_async();        /* DMA 后台发送 */
    }
    /* 同时做采样/控制等其他任务 */
}`,
    points: [
      'DMA 传输期间 buf 不能改（除非双缓冲）——准备「下一帧缓冲」再切换',
      'CS 时机：DMA 模式下 CS 要在完成回调里拉高，不能像阻塞版随函数返回拉高',
      'SPI 时钟高时（>25MHz）注意 PCB 走线：线短、共地、必要时降速',
      'TxCplt 回调在中断上下文执行，里面只置标志，别干重活',
    ],
    linkProject: 'p02',
  },
]
