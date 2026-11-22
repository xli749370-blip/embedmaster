/**
 * 代码库 · 第三批：FreeRTOS / 算法 / 通信协议 / 调试
 */
import type { CodeEntry } from './codelib'

export const bank3: CodeEntry[] = [
  // ==================== FreeRTOS ====================
  {
    id: 'r01',
    cat: 'rtos',
    title: '任务划分与优先级设计',
    brief: '多任务怎么拆、优先级怎么排——RTOS 项目最容易踩的坑',
    tags: ['FreeRTOS', '架构'],
    platform: 'FreeRTOS',
    code: `/* 划分原则：按「频率 + 实时性 + 耦合」拆任务，不按功能堆砌 */
void control_task(void *arg)        /* 高频硬实时：控制环 */
{
    TickType_t last = xTaskGetTickCount();
    for (;;) {
        pid_step();                 /* 5ms 周期，读取传感器→计算→输出 */
        vTaskDelayUntil(&last, pdMS_TO_TICKS(5));   /* 绝对周期，不漂移 */
    }
}

void sensor_task(void *arg)         /* 中频：采集与滤波 */
{
    for (;;) {
        read_sensors();
        xQueueSend(q_sensor, &g_frame, 0);          /* 交给控制任务 */
        vTaskDelay(pdMS_TO_TICKS(20));
    }
}

void ui_task(void *arg)             /* 低频：显示/上报，可让出 CPU */
{
    for (;;) {
        oled_flush();
        vTaskDelay(pdMS_TO_TICKS(200));
    }
}

int main(void)
{
    /* 优先级排序：硬实时 > 通信 > 人机交互 > 空闲
       数字越大优先级越高（FreeRTOS 惯例） */
    xTaskCreate(control_task, "ctrl", 256, NULL, 4, NULL);
    xTaskCreate(sensor_task,  "sen",  256, NULL, 3, NULL);
    xTaskCreate(ui_task,      "ui",   256, NULL, 1, NULL);
    vTaskStartScheduler();
}`,
    points: [
      'vTaskDelayUntil 是绝对时刻，vTaskDelay 是相对间隔——周期任务用前者防漂移',
      '栈大小单位是「字」（word）不是字节：256 = 1KB，栈溢出表现为诡异跑飞',
      'configCHECK_FOR_STACK_OVERFLOW=2 + 钩子函数，上线前必开',
      '同优先级时间片轮转默认开启；不希望被打断的关键段用 taskENTER_CRITICAL',
    ],
    linkProject: 'p03',
  },
  {
    id: 'r02',
    cat: 'rtos',
    title: '队列与信号量：生产者-消费者',
    brief: '任务间传数据的标准姿势，告别裸全局变量+标志位',
    tags: ['Queue', 'Semaphore'],
    platform: 'FreeRTOS',
    code: `QueueHandle_t q_cmd;

typedef struct { uint8_t type; int16_t value; } cmd_t;

void sender_task(void *arg)
{
    cmd_t c = { 1, 100 };
    /* 阻塞最多 10ms，队列满则放弃——避免高优任务被拖死 */
    if (xQueueSend(q_cmd, &c, pdMS_TO_TICKS(10)) != pdPASS) {
        /* drop & count：丢帧要统计，不能静默 */
    }
}

void receiver_task(void *arg)
{
    cmd_t c;
    for (;;) {
        if (xQueueReceive(q_cmd, &c, portMAX_DELAY) == pdPASS) {
            handle_cmd(&c);       /* 队列自带阻塞，不用轮询 */
        }
    }
}

/* 中断里发送：用 FromISR 版本，并检查唤醒请求 */
void uart_irq(void)
{
    cmd_t c = { 2, 42 };
    BaseType_t woken = pdFALSE;
    xQueueSendFromISR(q_cmd, &c, &woken);
    portYIELD_FROM_ISR(woken);
}

/* 二值信号量：事件通知（中断→任务）
   xSemaphoreTake/Give 与队列用法一致 */`,
    points: [
      '队列是拷贝传值：小数据直接传，大数据传指针（注意内存生命周期）',
      '中断里必须用 FromISR 后缀 API，并处理 portYIELD_FROM_ISR',
      '互斥量（Mutex）用于资源互斥、二值信号量用于事件同步——别混用',
      '优先级反转用互斥量+优先级继承解决；队列满/空的处理策略要明确设计',
    ],
    linkProject: 'p03',
  },
  {
    id: 'r03',
    cat: 'rtos',
    title: '软件定时器与事件组',
    brief: '定时回调交给定时器服务任务，多条件同步用事件组一次搞定',
    tags: ['Timer', 'EventGroup'],
    platform: 'FreeRTOS',
    code: `/* 软件定时器：单次/周期两种模式 */
void led_blink_cb(TimerHandle_t t) { HAL_GPIO_TogglePin(GPIOC, GPIO_PIN_13); }

TimerHandle_t h = xTimerCreate("blink", pdMS_TO_TICKS(500),
                               pdTRUE, NULL, led_blink_cb);   /* 周期模式 */
xTimerStart(h, 0);

/* 事件组：等待多个事件齐备再动作（如「自检全通过才解锁电机」） */
EventGroupHandle_t eg;
#define EVT_BARO_OK  (1 << 0)
#define EVT_IMU_OK   (1 << 1)
#define EVT_GPS_OK   (1 << 2)
#define EVT_ALL (EVT_BARO_OK | EVT_IMU_OK | EVT_GPS_OK)

/* 各自检任务完成后置位 */
void baro_task(void *arg)
{
    if (baro_selftest()) xEventGroupSetBits(eg, EVT_BARO_OK);
    vTaskDelete(NULL);
}

/* 起飞控制任务：阻塞等三个事件全到 */
void fly_task(void *arg)
{
    EventBits_t b = xEventGroupWaitBits(eg, EVT_ALL,
                                        pdFALSE, pdTRUE, portMAX_DELAY);
    if ((b & EVT_ALL) == EVT_ALL) motor_arm();     /* 解锁 */
}`,
    points: [
      '软件定时器回调运行在定时器服务任务上下文：不能阻塞、不能等队列满',
      '事件组适合「多对一同步」；一对一传数据用队列/任务通知更轻',
      'xEventGroupWaitBits 第四参 pdTRUE=与逻辑全齐、pdFALSE=或逻辑任一',
      '定时器命令走队列有延迟（tick 级），要求 ns 级精确定时还得用硬件定时器',
    ],
    linkProject: 'p03',
  },
  {
    id: 'r04',
    cat: 'rtos',
    title: '任务通知：最轻量的 IPC',
    brief: '比队列快 45%、RAM 省一半，一对一高频通知首选',
    tags: ['TaskNotify', '性能'],
    platform: 'FreeRTOS',
    code: `/* 场景：ADC 中断高频唤醒控制任务 */
TaskHandle_t h_ctrl;

void HAL_ADC_ConvCpltCallback(ADC_HandleTypeDef *hadc)
{
    BaseType_t woken = pdFALSE;
    vTaskNotifyGiveFromISR(h_ctrl, &woken);     /* 相当于轻量信号量 Give */
    portYIELD_FROM_ISR(woken);
}

void control_task(void *arg)
{
    for (;;) {
        ulTaskNotifyTake(pdTRUE, portMAX_DELAY); /* pdTRUE=取后清零 */
        pid_step();                               /* 被通知后执行一次控制 */
    }
}

/* 携带 32 位数据的通知（模拟轻量邮箱）：
   xTaskNotify(h, value, eSetValueWithOverwrite);   发送
   xTaskNotifyWait(0, 0, &got, portMAX_DELAY);      接收 */`,
    points: [
      '任务通知是「一对一」的：多对一仍需队列或事件组',
      '通知不是队列——不缓冲，接收方没来得及取时新值会覆盖旧值',
      '控制环、编码器采样这类高频唤醒场景，任务通知是性能天花板',
      '通知状态在任务创建时清零，调试「收不到通知」先确认目标任务已创建',
    ],
    linkProject: 'p01',
  },

  // ==================== 算法 ====================
  {
    id: 'c01',
    cat: 'algo',
    title: 'PID 控制器（位置式 + 增量式）',
    brief: '可直接落地的完整 PID 实现，含积分限幅与输出限幅',
    tags: ['PID', '控制'],
    platform: '通用',
    code: `typedef struct {
    float kp, ki, kd;
    float integ;        /* 积分累积 */
    float prev_err;     /* 上次误差（增量式用） */
    float out_min, out_max;
} pid_t;

/* ---------- 位置式：输出 = 全量，用于舵机/位置环 ---------- */
float pid_pos(pid_t *p, float target, float feedback)
{
    float err = target - feedback;
    p->integ += err;
    /* 积分限幅：抗饱和，防超调震荡 */
    if (p->integ > 100)  p->integ = 100;
    if (p->integ < -100) p->integ = -100;
    float out = p->kp * err + p->ki * p->integ + p->kd * (err - p->prev_err);
    p->prev_err = err;
    if (out > p->out_max) out = p->out_max;
    if (out < p->out_min) out = p->out_min;
    return out;
}

/* ---------- 增量式：输出 = Δu，用于电机/步进增量 ---------- */
float pid_inc(pid_t *p, float target, float feedback)
{
    float err = target - feedback;
    float d = p->kp * (err - p->prev_err)
            + p->ki * err
            + p->kd * (err - 2 * p->prev_err + p->pprev);
    p->pprev = p->prev_err;
    p->prev_err = err;
    return d;      /* 调用侧累加到执行量 */
}

/* 调参口诀：先 P 后 I 再 D
   P：加到临界震荡后退回 60%
   I：消稳态误差，从 0 慢慢加，震荡就减半
   D：抑制超调，从 P 的 1/8 量级试起 */`,
    points: [
      '积分限幅（抗饱和）不是可选项：没有它大偏差时必超调',
      '微分项对噪声极敏感：输入先低通滤波，或用「微分先行」只微分校正量',
      '位置式直接给绝对输出，增量式抗积分饱和天生更好、切换无扰动',
      '采样周期要稳定：控制环抖动 ±50% 周期，D 项等效噪声放大一倍',
    ],
    linkProject: 'p01',
  },
  {
    id: 'c02',
    cat: 'algo',
    title: '滑动均值 + 一阶低通滤波',
    brief: '两个最常用的软件滤波，什么时候用哪个说清楚',
    tags: ['滤波', '信号处理'],
    platform: '通用',
    code: `/* ---------- 滑动窗口均值：适合缓变信号（电池电压/温度） ---------- */
#define WIN 8
float moving_avg(float new_val)
{
    static float buf[WIN];
    static uint8_t idx = 0, filled = 0;
    static float sum = 0;
    if (filled) sum -= buf[idx];       /* 减掉被覆盖的旧值，O(1) 更新 */
    buf[idx] = new_val;
    sum += new_val;
    idx = (idx + 1) % WIN;
    if (!filled && idx == WIN - 1) filled = 1;
    return sum / (filled ? WIN : idx + 1);
}

/* ---------- 一阶低通：适合高频噪声的连续信号（IMU/ADC） ---------- */
/* alpha 越小越平滑、越滞后。截止频率 f = fs * alpha / (2π(1-alpha)) */
float lpf_1st(float new_val, float alpha)
{
    static float out = 0;
    static uint8_t first = 1;
    if (first) { out = new_val; first = 0; return out; }
    out = out + alpha * (new_val - out);
    return out;
}

/* 经验：
   电池电压 → 滑动均值（无相位滞后感）
   姿态角   → 一阶低通 α=0.1~0.3
   突变检测 → 别滤波！先做阈值判断再进滤波通道 */`,
    points: [
      '均值滤波的窗长 = 延迟：WIN=8@100Hz 意味着响应慢 40ms，动态信号慎用',
      '低通的 α 与采样频率绑定：fs 变了 α 要重算，否则「换板后滤波强度变了」',
      '两个滤波都只对白噪声友好，50Hz 工频干扰要 20ms 整周期采样或陷波',
      '调试滤波效果：把 raw 和 filtered 两个值一起 printf 出来看对比',
    ],
    linkProject: 'p01',
  },
  {
    id: 'c03',
    cat: 'algo',
    title: '互补滤波姿态解算',
    brief: '加速度计+陀螺仪融合角，无矩阵运算，平衡车/无人机入门标准件',
    tags: ['IMU', '姿态', '互补滤波'],
    platform: '通用',
    code: `/* 原理：
   陀螺仪积分：短时精确，长期漂移
   加速度计：长期无漂移，动态时被运动加速度污染
   互补滤波 = 0.98 * 陀螺积分 + 0.02 * 加速度计角度，取长补短 */

#define GYRO_LSB  65.5f       /* ±500dps 量程 */
#define ACC_LSB   8192.0f     /* ±4g 量程 */
#define DT        0.005f      /* 5ms 控制周期 */

float pitch = 0, roll = 0;    /* 融合后的姿态角 */

void attitude_update(int16_t ax, int16_t ay, int16_t az,
                     int16_t gx, int16_t gy, int16_t gz)
{
    /* 1. 陀螺仪角速度 → deg/s */
    float wx = gx / GYRO_LSB;
    float wy = gy / GYRO_LSB;

    /* 2. 加速度计反解倾角（静止/缓动时可信） */
    float axf = ax / ACC_LSB, ayf = ay / ACC_LSB, azf = az / ACC_LSB;
    float acc_pitch = atan2f(-axf, sqrtf(ayf * ayf + azf * azf)) * 57.2958f;
    float acc_roll  = atan2f(ayf, azf) * 57.2958f;

    /* 3. 融合：高频信陀螺、低频信加速度 */
    pitch = 0.98f * (pitch + wy * DT) + 0.02f * acc_pitch;
    roll  = 0.98f * (roll  + wx * DT) + 0.02f * acc_roll;
}

/* 静止校准：上电采 200 帧陀螺均值作为零偏，减掉再进滤波 */`,
    points: [
      '系数 0.98 是在 200Hz/5ms 周期下的经验值；周期变了系数按 τ = DT*k/(1-k) 换算',
      '加速度计解算只在「准静态」成立——车辆加减速瞬间会严重污染，动态段降权',
      '陀螺零偏是漂移主因：上电静止采均值校准，是所有 IMU 应用的第一步',
      '要做全姿态（含大机动）再上卡尔曼/Mahony/Madgwick，入门互补滤波足够',
    ],
    linkProject: 'p01',
  },
  {
    id: 'c04',
    cat: 'algo',
    title: '限幅、映射与死区工具函数',
    brief: '写进每个项目的 util 工具箱，一次写对到处复用',
    tags: ['工具', 'C语言'],
    platform: '通用',
    code: `/* 限幅 */
float constrain(float v, float lo, float hi)
{
    return v < lo ? lo : (v > hi ? hi : v);
}

/* 线性映射：把 [ilo,ihi] 映射到 [olo,ohi]，自带输入限幅 */
float map_range(float v, float ilo, float ihi, float olo, float ohi)
{
    if (ihi == ilo) return olo;
    float t = (v - ilo) / (ihi - ilo);
    t = constrain(t, 0.0f, 1.0f);
    return olo + t * (ohi - olo);
}

/* 死区：摇杆中位漂移救星 */
float deadzone(float v, float dz)
{
    if (v > dz)  return (v - dz);          /* 重新归一，避免过死区跳变 */
    if (v < -dz) return (v + dz);
    return 0;
}

/* 慢启动斜坡：目标阶跃→输出渐变，保护机械结构 */
float ramp(float target, float cur, float step)
{
    if (cur < target) return constrain(cur + step, cur, target);
    return constrain(cur - step, target, cur);
}

/* 圆周角差：航向误差计算（-180~180，不走 359→0 的坑） */
float wrap_180(float diff)
{
    while (diff > 180)  diff -= 360;
    while (diff < -180) diff += 360;
    return diff;
}`,
    points: [
      'deadzone 里「减去死区再归一」比硬截零更顺滑，摇杆手感差异明显',
      'wrap_180 解决「从 359° 转到 1° 误差被算成 358°」的经典航向 bug',
      'ramp 用于电机/舵机目标值，避免阶跃冲击——比在控制环里限斜率更干净',
      '这些函数放进 util.c 全项目共享，单元测试一次，处处放心',
    ],
    linkProject: 'p04',
  },

  // ==================== 通信协议 ====================
  {
    id: 'm01',
    cat: 'comm',
    title: 'RS485 半双工收发切换',
    brief: '方向控制时序 + Modbus RTU 帧结构，工业现场标配',
    tags: ['RS485', 'Modbus', '半双工'],
    platform: 'STM32 + MAX485',
    code: `/* MAX485：DE/RE 并联接一个 GPIO。高=发送 低=接收 */
#define RS485_TX() HAL_GPIO_WritePin(GPIOA, GPIO_PIN_8, GPIO_PIN_SET)
#define RS485_RX() HAL_GPIO_WritePin(GPIOA, GPIO_PIN_8, GPIO_PIN_RESET)

/* 发送一帧：切方向 → DMA 发送 → 等 TC（发送完成）→ 切回 */
void rs485_send(const uint8_t *buf, uint16_t len)
{
    RS485_TX();
    HAL_Delay(1);                                  /* 让驱动稳定（可选） */
    HAL_UART_Transmit(&huart2, (uint8_t *)buf, len, 100);
    /* 必须等 TC=移位寄存器空，等 TXE 会截断最后一个字节！ */
    while (__HAL_UART_GET_FLAG(&huart2, UART_FLAG_TC) == RESET) ;
    RS485_RX();
}

/* Modbus RTU 读保持寄存器主站请求帧：
   [Addr][0x03][RegH][RegL][CntH][CntL][CRCH][CRCL] */
uint16_t crc16_modbus(const uint8_t *p, uint16_t n)
{
    uint16_t c = 0xFFFF;
    while (n--) {
        c ^= *p++;
        for (int i = 0; i < 8; i++)
            c = (c & 1) ? (c >> 1) ^ 0xA001 : (c >> 1);
    }
    return c;    /* 低字节在前发送！ */
}`,
    points: [
      '切回接收前必须等 UART_FLAG_TC 而非 TXE——485 发送截尾的十大经典坑之首',
      'Modbus CRC16 低字节先发，和常见网络 CRC 相反，抓包对不上先查这个',
      '帧间隔 3.5 字符时间是帧边界判据：连续发两帧必须留间隔',
      '总线末端接 120Ω 终端电阻；长线通信「能收不能发」先查 A/B 线是否接反',
    ],
    linkCircuit: 'c49',
  },
  {
    id: 'm02',
    cat: 'comm',
    title: 'CAN 总线收发与过滤器',
    brief: 'bxCAN 配置套路：过滤器组、标准帧收发、错误恢复',
    tags: ['CAN', 'bxCAN'],
    platform: 'STM32 bxCAN',
    code: `/* CubeMX：CAN_MASTER 位速率 1Mbps（1M/Prescaler/(1+Seg1+Seg2)） */

/* 过滤器：放行所有报文到 FIFO0（调试期最简配置） */
CAN_FilterTypeDef f = { 0 };
f.FilterActivation     = ENABLE;
f.SlaveStartFilterBank = 14;
f.FilterBank           = 0;
f.FilterMode           = CAN_FILTERMODE_IDMASK;
f.FilterScale          = CAN_FILTERSCALE_32BIT;
f.FilterIdHigh         = 0x0000;      /* 掩码全 0 = 不过滤 */
f.FilterIdLow          = 0x0000;
f.FilterMaskIdHigh     = 0x0000;
f.FilterMaskIdLow      = 0x0000;
f.FilterFIFOAssignment = CAN_RX_FIFO0;
HAL_CAN_ConfigFilter(&hcan, &f);
HAL_CAN_Start(&hcan);
HAL_CAN_ActivateNotification(&hcan, CAN_IT_RX_FIFO0_MSG_PENDING);

/* 发送：标准数据帧 */
void can_send(uint32_t id, uint8_t *data, uint8_t len)
{
    CAN_TxHeaderTypeDef h = { 0 };
    h.StdId = id; h.DLC = len;
    h.IDE = CAN_ID_STD; h.RTR = CAN_DATA_RTR;
    uint32_t mb;
    while (HAL_CAN_AddTxMessage(&hcan, &h, data, &mb) != HAL_OK) ;  /* 邮箱满则等 */
}

/* 接收回调 */
void HAL_CAN_RxFifo0MsgPendingCallback(CAN_HandleTypeDef *hcan)
{
    CAN_RxHeaderTypeDef rh;
    uint8_t d[8];
    HAL_CAN_GetRxMessage(hcan, CAN_RX_FIFO0, &rh, d);
    can_dispatch(rh.StdId, d, rh.DLC);    /* 按 ID 分发 */
}`,
    points: [
      'CAN 控制器再好也发不出去：总线两端 120Ω 终端电阻是硬要求',
      '过滤器没配置 = 收不到任何帧，表现是「发出去对端能收、自己收不到」',
      '邮箱满时 AddTxMessage 返回非 OK，要重试而非丢弃；Bus-Off 后需 HAL_CAN_Stop/Start 恢复',
      '多节点竞争靠 ID 仲裁：低 ID 优先级高，周期报文别全用高优先级 ID',
    ],
    linkCircuit: 'c50',
  },
  {
    id: 'm03',
    cat: 'comm',
    title: 'AT 指令框架（蓝牙/WiFi 模组）',
    brief: '发送-等待-应答-重试的通用 AT 引擎，ESP8266/HC05 通吃',
    tags: ['AT', 'ESP8266', '状态机'],
    platform: '通用',
    code: `/* AT 引擎核心：发送命令 → 等待期望应答 → 超时重试 */
typedef struct {
    const char *cmd;        /* 要发的命令 */
    const char *expect;     /* 期望应答子串 */
    uint16_t    timeout_ms;
    uint8_t     retry;
} at_cmd_t;

/* 从串口 FIFO 里持续收字节，维护接收行缓冲，供匹配用 */
static char rx_line[128];
static uint16_t rx_pos = 0;
volatile uint8_t line_ready = 0;

/* 返回 1=成功 0=失败（重试耗尽） */
uint8_t at_exec(const at_cmd_t *c)
{
    for (uint8_t t = 0; t <= c->retry; t++) {
        printf_uart("%s\\r\\n", c->cmd);
        uint32_t deadline = millis() + c->timeout_ms;
        while (millis() < deadline) {
            if (line_ready && strstr(rx_line, c->expect)) {
                line_ready = 0; rx_pos = 0;
                return 1;
            }
            /* 这里复用 u04 的 FIFO 逐字节取出、按 \\n 切行 */
            uart_pump_lines();
        }
    }
    return 0;
}

/* 典型初始化序列 */
const at_cmd_t at_seq[] = {
    { "AT",                       "OK",      500,  3 },
    { "ATE0",                     "OK",      500,  1 },  /* 关回显 */
    { "AT+CWMODE=1",              "OK",      1000, 1 },
    { "AT+CWJAP=\\"ssid\\",\\"pwd\\"", "WIFI GOT IP", 15000, 2 },
};`,
    points: [
      'AT 通信全程异步：绝不能发完就 HAL_Delay 死等，用超时窗口+应答匹配',
      'expect 用子串匹配应答行；错误应答（ERROR/FAIL）也要显式处理并提前退出',
      '模组冷启动会吐启动横幅（乱码/ready），解析前先丢弃非应答行',
      '透传模式下退出透传要发「+++」且前后 1s 静默，这是 ESP 系列出名的坑',
    ],
    linkProject: 'p02',
  },

  // ==================== 调试 ====================
  {
    id: 'd01',
    cat: 'debug',
    title: 'HardFault 定位三板斧',
    brief: '从跑飞到定位：fault 寄存器解析、栈回溯、常识排查表',
    tags: ['HardFault', '调试'],
    platform: 'Cortex-M',
    code: `/* 第一步：HardFault_Handler 里把现场保存下来（Keil 汇编后跳转） */
void HardFault_HandlerC(uint32_t *sp)   /* sp 指向压栈的 R0-R3,R12,LR,PC,xPSR */
{
    uint32_t pc  = sp[6];               /* 跑飞时的 PC */
    uint32_t lr  = sp[5];
    volatile uint32_t cfsr  = SCB->CFSR;   /* 故障状态寄存器 */
    volatile uint32_t hfsr  = SCB->HFSR;
    volatile uint32_t bfar  = SCB->BFAR;   /* 总线故障访问地址 */
    (void)pc; (void)lr; (void)cfsr; (void)hfsr; (void)bfar;
    /* 在这里打断点，调试器里看以上变量 */
    while (1) ;
}

/* 常见 CFSR 位速查：
   UNDEFINSTR  未定义指令（函数指针跑飞/编译选项不一致）
   INVPC/INVSTATE LR 值非法（中断里返回值被破坏）
   IMPRECISERR 不精确总线错（访问非法外设地址）
   PRECISERR   精确总线错（BFAR 给出出错地址）
   DIVBYZERO   除零 */

/* 常识排查表（90% 的 HardFault 是这些）：
   1. 空指针/野指针：结构体未初始化就解引用
   2. 栈溢出：局部大数组、递归、printf %f
   3. 函数指针未赋值 / 中断向量表没对齐
   4. 访问未使能时钟的外设寄存器
   5. memcpy/memset 长度算错越界写 */`,
    points: [
      '看 PC 值 → Keil Disassembly 窗口贴地址，直接跳到出错的汇编行',
      '栈溢出把栈加大一倍试试，好得快——多数跑飞就是栈爆',
      '调试器断在 HardFault 后，看 Call Stack 窗口能回溯到出错函数链',
      '量产版加「fault 记录到 Flash + 重启」机制，至少知道现场死在哪',
    ],
  },
  {
    id: 'd02',
    cat: 'debug',
    title: 'SWD 调试与 ITM/RTT 打印',
    brief: '不占用串口的高速调试输出，断点不影响实时性的折中',
    tags: ['SWD', 'RTT', '调试'],
    platform: 'Cortex-M',
    code: `/* 串口被业务占用？用 SEGGER RTT：一个 RAM 缓冲 + SWD 口输出 */
#include "SEGGER_RTT.h"

int main(void)
{
    /* 初始化后即可用，零引脚占用（走 SWD 调试线） */
    SEGGER_RTT_Init();
    SEGGER_RTT_printf(0, "boot ok, chip id=0x%X\\r\\n", HAL_GetDEVID());
    while (1) {
        SEGGER_RTT_printf(0, "enc=%d rpm=%d.%d\\r\\n", enc, rpm_i, rpm_f);
        HAL_Delay(100);
    }
}

/* 没有调试器硬件时——用系统心跳做「逻辑在线检测」：
   1. 一个空闲 GPIO 翻转，示波器看任务是否还活着
   2. 任务执行耗时测量：
*/
void task_profile(void (*fn)(void), const char *name)
{
    uint32_t t0 = DWT->CYCCNT;    /* Cortex-M 内核周期计数器 */
    fn();
    uint32_t dt = DWT->CYCCNT - t0;
    printf("%s cost %lu cycles (%lu us)\\r\\n", name, dt, dt / (SystemCoreClock / 1000000));
}

/* DWT 使能一次即可：CoreDebug->DEMCR |= TRACEENA; DWT->CYCCNT = 0; DWT->CTRL |= 1; */`,
    points: [
      'DWT->CYCCNT 是免费的纳秒级性能剖析器，测任何函数耗时的首选',
      'RTT 需要 J-Link；ST-Link 可用 SWO/ITM（printf 重定向到 fputc 用 ITM_SendChar）',
      'printf 占用会改变时序——「加了打印就好了」的玄学 bug 多是时序竞争暴露',
      'GPIO 翻转 + 示波器是最硬核的时序测量，优于一切软件计时（零侵入）',
    ],
    linkCircuit: 'c51',
  },
]
