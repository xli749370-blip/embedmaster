/**
 * 代码库 · ESP32 分册（ESP-IDF v5.x）
 * 对标 STM32 HAL：每个模块给出 IDF 惯用法 + 与 HAL 的对照要点
 */
import type { CodeEntry } from './codelib'

export const bank4: CodeEntry[] = [
  {
    id: 'e01',
    cat: 'esp32',
    title: 'ESP-IDF 工程结构与构建链',
    brief: 'CMake 组织 / menuconfig 配置 / idf.py 三板斧，与 Cube 的对照',
    tags: ['ESP-IDF', 'CMake'],
    platform: 'ESP32 / ESP32-S3 / C3',
    code: `hello_world/
├── CMakeLists.txt            # 顶层：声明项目名与版本
│     cmake_minimum_required(VERSION 3.16)
│     include($ENV{IDF_PATH}/tools/cmake/project.cmake)
│     project(hello_world)
├── main/
│   ├── CMakeLists.txt        # 组件清单：注册源文件与依赖
│   │     idf_component_register(SRCS "main.c"
│   │                          INCLUDE_DIRS "."
│   │                          REQUIRES driver nvs_flash esp_wifi)
│   └── main.c
├── sdkconfig                 # menuconfig 生成的配置（入 git）
└── components/               # 自定义组件（等价于 Modules/）

# 常用命令（对应 STM32 的 Keil/Cube 等价物）
idf.py set-target esp32s3        # 选芯片（相当于选型号）
idf.py menuconfig                # 图形化配置（相当于 CubeMX + 选项卡）
idf.py build flash monitor       # 编译+烧录+串口终端（三合一）
idf.py monitor                   # 等价于串口助手，Ctrl+] 退出
idf.py size-components           # 各组件 flash/RAM 占用分析`,
    points: [
      'menuconfig 改的都进 sdkconfig；把 sdkconfig.defaults 入库，sdkconfig 本身可不入',
      '组件依赖写错 REQUIRES 时编译能过、链接报 undefined reference——先查依赖声明',
      'idf.py monitor 里崩溃回溯自动解析成函数名，比 STM32 的 HardFault 人工排友好得多',
      '与 Cube 差异：引脚/时钟不靠代码生成器，全部运行时 API 配置——移植性更好',
    ],
    linkProject: 'p07',
  },
  {
    id: 'e02',
    cat: 'esp32',
    title: 'GPIO：输出与按键中断',
    brief: 'gpio_config 一把梭：推挽输出 + 上拉输入 + 中断回调',
    tags: ['GPIO', 'ESP-IDF'],
    platform: 'ESP32 全系',
    code: `#include "driver/gpio.h"

#define LED_PIN  GPIO_NUM_2
#define KEY_PIN  GPIO_NUM_0

/* 输出 + 输入一次配置完（对应 HAL 的 MX_GPIO_Init） */
void gpio_init(void)
{
    gpio_config_t io = {
        .pin_bit_mask = (1ULL << LED_PIN) | (1ULL << KEY_PIN),
        .mode         = GPIO_MODE_INPUT_OUTPUT,      /* 输入输出同使能，可回读 */
        .pull_up_en   = GPIO_PULLUP_ENABLE,          /* 按键用：BOOT 键低有效 */
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type    = GPIO_INTR_NEGEDGE,           /* 下降沿触发 */
    };
    gpio_config(&io);

    /* 中断服务注册：ISr 回调运行在 ISR 上下文，必须放 IRAM */
    gpio_install_isr_service(ESP_INTR_FLAG_IRAM);
    gpio_isr_handler_add(KEY_PIN, key_isr, NULL);
}

static void IRAM_ATTR key_isr(void *arg)
{
    BaseType_t woken = pdFALSE;
    static int64_t last = 0;
    int64_t now = esp_timer_get_time();
    if (now - last > 50 * 1000) {              /* 50ms 软件消抖（微秒单位） */
        last = now;
        xTaskNotifyFromISR(h_app, 1, eSetValueWithOverwrite, &woken);
    }
    portYIELD_FROM_ISR(woken);
}`,
    points: [
      'ISR 回调必须加 IRAM_ATTR：Flash 缓存未就绪时（如 flash 写入期间）调用会崩溃',
      'esp_timer_get_time() 返回微秒，比 HAL_GetTick 的毫秒精度高两个数量级',
      '与 HAL 对照：gpio_config ≈ MX_GPIO_Init；没有 BSRR 概念，电平经 IO_MUX/RTC 域',
      '部分引脚是 strapping pin（GPIO0/45/46 等），上电电平决定启动模式，外设慎用',
    ],
    linkCircuit: 'c37',
  },
  {
    id: 'e03',
    cat: 'esp32',
    title: 'LEDC PWM：呼吸灯与舵机',
    brief: 'LED Control 外设 16 通道独立 PWM，等价 HAL 的 TIM PWM',
    tags: ['PWM', 'LEDC'],
    platform: 'ESP32 全系',
    code: `#include "driver/ledc.h"

/* 配置：定时器0 @ 20kHz，10 位分辨率 → 占空比 0~1023
   频率与分辨率互相牵制：f = 80MHz / (2^duty_res * 分频)，先定频率 */
void pwm_init(void)
{
    ledc_timer_config_t t = {
        .speed_mode      = LEDC_LOW_SPEED_MODE,
        .timer_num       = LEDC_TIMER_0,
        .duty_resolution = LEDC_TIMER_10_BIT,
        .freq_hz         = 20000,
        .clk_cfg         = LEDC_AUTO_CLK,
    };
    ledc_timer_config(&t);

    ledc_channel_config_t ch = {
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel    = LEDC_CHANNEL_0,
        .timer_sel  = LEDC_TIMER_0,
        .gpio_num   = 4,
        .duty       = 0,
    };
    ledc_channel_config(&ch);
}

/* 设置占空比 0~1023 */
void pwm_set(uint32_t duty) { ledc_set_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0, duty); }
void pwm_update(void)      { ledc_update_duty(LEDC_LOW_SPEED_MODE, LEDC_CHANNEL_0); }

/* 呼吸灯：渐变 + 渐灭（LEDC 自带渐变指令更省 CPU） */
void task_breath(void) {
    static int d = 0, dir = 1;
    d += dir * 16;
    if (d >= 1023) { d = 1023; dir = -1; }
    if (d <= 0)    { d = 0;    dir = 1; }
    pwm_set(d); pwm_update();
}

/* 舵机：50Hz 需要 duty_resolution=14 位（16384），
   0.5~2.5ms 脉宽 → duty = us * 16384 / 20000 */`,
    points: [
      '改占空比要 set + update 两步：update 才把影子寄存器生效——只 set 不 update 是「改了没反应」的第一嫌疑',
      'ESP32-S3 有 LEDC 8 通道；电机级 PWM 用 MCPWM 外设（带死区/故障刹车，对标高级定时器 TIM1）',
      '与 HAL 对照：ledc_timer_config ≈ TIM 时基配置；ledc_channel_config ≈ PWM 通道+引脚复用',
      '高频 + 高分辨率冲突时报错，先降分辨率：20kHz 用 10 位，1kHz 以下才用 14 位',
    ],
    linkCircuit: 'c38',
  },
  {
    id: 'e04',
    cat: 'esp32',
    title: 'ADC 采样与电压校准',
    brief: 'esp_adc oneshot 读取 + eFuse 校准，比裸 ADC 值准一个量级',
    tags: ['ADC', '校准'],
    platform: 'ESP32 全系',
    code: `#include "esp_adc/adc_oneshot.h"
#include "esp_adc/adc_cali.h"
#include "esp_adc/adc_cali_scheme.h"

static adc_oneshot_unit_handle_t h_adc;
static adc_cali_handle_t h_cali;

void adc_init(void)
{
    adc_oneshot_unit_init_cfg_t init = { .unit_id = ADC_UNIT_1 };
    adc_oneshot_new_unit(&init, &h_adc);

    adc_oneshot_chan_cfg_t ch = {
        .atten = ADC_ATTEN_DB_12,          /* 量程 ~0~3.1V（旧称 11dB） */
        .bitwidth = ADC_BITWIDTH_12,
    };
    adc_oneshot_config_channel(h_adc, ADC_CHANNEL_3, &ch);   /* GPIO3 */

#ifdef ADC_CALI_SCHEME_CURVE_FITTING_SUPPORTED
    adc_cali_curve_fitting_config_t c = {
        .unit_id = ADC_UNIT_1, .atten = ADC_ATTEN_DB_12, .bitwidth = ADC_BITWIDTH_12,
    };
    adc_cali_create_scheme_curve_fitting(&c, &h_cali);   /* 出厂 eFuse 校准 */
#endif
}

/* 返回毫伏 */
int adc_read_mv(void)
{
    int raw = 0, mv = 0;
    adc_oneshot_read(h_adc, ADC_CHANNEL_3, &raw);
    adc_cali_raw_to_voltage(h_cali, raw, &mv);
    return mv;
}`,
    points: [
      'ADC2 与 WiFi 冲突（WiFi 工作时 ADC2 不可用）——关键采样通道一律用 ADC1',
      '衰减挡位决定量程：6dB≈0~2.2V，12dB≈0~3.1V；超过 VREF 需外部分压',
      '不做校准的 raw 值误差可达 ±6%，curve fitting 校准后 ±1% 以内——测量类项目必开',
      '噪声大：读 8~16 次取均值；要更稳用连续模式（esp_adc continuous + DMA）',
    ],
    linkCircuit: 'c44',
  },
  {
    id: 'e05',
    cat: 'esp32',
    title: 'UART 事件驱动收发',
    brief: 'uart_driver 自带环形缓冲 + 事件任务，不定长帧接收的官方姿势',
    tags: ['UART', '事件'],
    platform: 'ESP32 全系',
    code: `#include "driver/uart.h"

#define UART_PORT UART_NUM_1
#define BUF_SIZE  1024

void uart_init(void)
{
    uart_config_t cfg = {
        .baud_rate  = 115200,
        .data_bits  = UART_DATA_8_BITS,
        .parity     = UART_PARITY_DISABLE,
        .stop_bits  = UART_STOP_BITS_1,
        .flow_ctrl  = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_DEFAULT,
    };
    uart_param_config(UART_PORT, &cfg);
    uart_set_pin(UART_PORT, 17, 18, -1, -1);           /* TX/RX 任意引脚矩阵 */
    /* 驱动安装：内部自动建 RX 环形缓冲 + 事件队列（等价 DMA+IDLE 方案） */
    uart_driver_install(UART_PORT, BUF_SIZE * 2, 0, 20, &uart_queue, 0);
}

/* 专用任务里等事件（模式超时自动聚帧） */
static QueueHandle_t uart_queue;
void uart_task(void *arg)
{
    uart_event_t ev;
    uint8_t buf[256];
    for (;;) {
        if (xQueueReceive(uart_queue, &ev, portMAX_DELAY) != pdTRUE) continue;
        switch (ev.type) {
        case UART_DATA: {                    /* 一批数据到达 */
            int len = uart_read_bytes(UART_PORT, buf, sizeof(buf), pdMS_TO_TICKS(100));
            if (len > 0) frame_feed(buf, len);   /* 喂给协议解析状态机 */
            break;
        }
        case UART_FIFO_OVF:                  /* 缓冲溢出：处理不过来了 */
            uart_flush_input(UART_PORT);
            xQueueReset(uart_queue);
            stats.ovf++;
            break;
        default: break;
        }
    }
}`,
    points: [
      'uart_driver_install 已带中断+环形缓冲+事件队列，不需要像 STM32 那样手搓 DMA+IDLE',
      'UART_DATA 事件可能是一帧也可能是半帧，协议侧状态机仍要处理粘包断包',
      'FIFO_OVF 事件说明消费太慢：加大缓冲、提高任务优先级或降波特率',
      'GPIO 矩阵任意映射是 ESP32 独有优势——引脚冲突时先把 UART/LEDC 挪走',
    ],
    linkProject: 'p07',
  },
  {
    id: 'e06',
    cat: 'esp32',
    title: 'I2C 读取传感器（新驱动）',
    brief: 'i2c_master 新版 API：总线句柄 + 设备句柄，等价 HAL 的 Mem_Read',
    tags: ['I2C', 'i2c_master'],
    platform: 'ESP-IDF v5.x',
    code: `#include "driver/i2c_master.h"

static i2c_master_bus_handle_t h_bus;
static i2c_master_dev_handle_t h_dev;

void i2c_init(void)
{
    i2c_master_bus_config_t bus = {
        .i2c_port  = I2C_NUM_0,
        .sda_io_num = GPIO_NUM_8,
        .scl_io_num = GPIO_NUM_9,
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .glitch_ignore_cnt = 7,
        .flags.enable_internal_pullup = true,   /* 内部上拉仅够调试，产品加 4.7K */
    };
    i2c_new_master_bus(&bus, &h_bus);

    i2c_device_config_t dev = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address  = 0x68,                /* MPU6050 AD0=GND */
        .scl_speed_hz    = 400000,
    };
    i2c_master_bus_add_device(h_bus, &dev, &h_dev);
}

/* 读 WHO_AM_I：等价 HAL_I2C_Mem_Read */
uint8_t mpu_whoami(void)
{
    uint8_t id = 0;
    i2c_master_write_read_device(h_dev,
        (uint8_t[]){ 0x75 }, 1,        /* 寄存器地址 */
        &id, 1,                        /* 读出 1 字节 */
        -1);                           /* -1 = 等待默认超时 */
    return id;                         /* MPU6050 应返回 0x68 */
}

/* 总线扫描：探测 0x08~0x77 */
void i2c_scan(void)
{
    for (uint8_t a = 0x08; a < 0x78; a++) {
        i2c_device_config_t d = { .dev_addr_length = I2C_ADDR_BIT_LEN_7, .device_address = a };
        i2c_master_dev_handle_t tmp;
        i2c_master_bus_add_device(h_bus, &d, &tmp);
        if (i2c_master_probe(h_bus, a, -1) == ESP_OK)
            printf("found 0x%02X\\n", a);
        i2c_master_bus_rm_device(tmp);
    }
}`,
    points: [
      'v5.x 用 i2c_master_* 新 API；网上老教程的 i2c_driver_install 已弃用，混用会冲突',
      'write_read_device 一次完成「写寄存器地址+读数据」，不要拆成两次调用（会被别的设备打断）',
      'enable_internal_pullup 只适合短线调试：长线/高速必须外部 4.7K 上拉',
      'probe 比「盲读」安全，不会误触发设备的写操作——先探测再初始化',
    ],
    linkCircuit: 'c42',
  },
  {
    id: 'e07',
    cat: 'esp32',
    title: 'WiFi STA 连接（事件驱动）',
    brief: 'esp_wifi + 事件循环：连上打 IP，断线自动重连',
    tags: ['WiFi', '事件循环'],
    platform: 'ESP32 全系',
    code: `#include "esp_wifi.h"
#include "esp_event.h"
#include "nvs_flash.h"

static EventGroupHandle_t s_wifi_ev;
#define WIFI_OK BIT0

void wifi_init(void)
{
    /* NVS 必须先初始化：WiFi 驱动用它存校准数据 */
    ESP_ERROR_CHECK(nvs_flash_init());    /* 若分区损坏返回 err，需 nvs_flash_erase 后重试 */

    s_wifi_ev = xEventGroupCreate();
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &on_wifi_ev, NULL);
    esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &on_got_ip, NULL);

    wifi_config_t w = {
        .sta = { .ssid = "your-ssid", .password = "your-pass",
                 .threshold.authmode = WIFI_AUTH_WPA2_PSK },
    };
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &w));
    ESP_ERROR_CHECK(esp_wifi_start());     /* 之后事件驱动接管 */
}

static void on_wifi_ev(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    if (id == WIFI_EVENT_STA_START) esp_wifi_connect();          /* 启动后发起连接 */
    if (id == WIFI_EVENT_STA_DISCONNECTED) {
        esp_wifi_connect();                                       /* 断线重连（工业做法加退避） */
        stats.disconn++;
    }
}
static void on_got_ip(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    xEventGroupSetBits(s_wifi_ev, WIFI_OK);
}

/* 业务侧阻塞等待联网成功后再发起 MQTT/HTTP */
xEventGroupWaitBits(s_wifi_ev, WIFI_OK, pdFALSE, pdTRUE, portMAX_DELAY);`,
    points: [
      '三步曲顺序不能乱：nvs_flash_init → esp_netif/事件循环 → esp_wifi_init/start',
      '断线重连要自己写（加指数退避+尝试上限），断网状态下应用层要能降级运行',
      'power_save 默认开省电，实时性敏感场景 esp_wifi_set_ps(WIFI_PS_NONE) 关掉',
      '路由器换成 2.4GHz：ESP32 经典款不支持 5G 频段，「搜不到 WiFi」先查这个',
    ],
    linkProject: 'p07',
  },
  {
    id: 'e08',
    cat: 'esp32',
    title: 'MQTT 上报数据',
    brief: 'esp-mqtt 客户端：连接、订阅、发布完整骨架，物联网标配',
    tags: ['MQTT', 'IoT'],
    platform: 'ESP32 全系',
    code: `#include "mqtt_client.h"

static esp_mqtt_client_handle_t h_mqtt;

static void on_mqtt_ev(void *h, esp_event_base_t base, int32_t id, void *data)
{
    esp_mqtt_event_handle_t ev = data;
    switch ((esp_mqtt_event_id_t)id) {
    case MQTT_EVENT_CONNECTED:                       /* 连上即订阅 */
        esp_mqtt_client_subscribe(h_mqtt, "emb/cmd/#", 1);   /* QoS1 */
        break;
    case MQTT_EVENT_DATA: {                          /* 收到下行 */
        printf("topic=%.*s payload=%.*s\\n", ev->topic_len, ev->topic,
               ev->data_len, ev->data);
        mqtt_dispatch(ev->topic, ev->topic_len, ev->data, ev->data_len);
        break;
    }
    case MQTT_EVENT_DISCONNECTED:
        /* 客户端库自动重连；业务层置离线标志走本地缓存 */
        stats.mqtt_off++;
        break;
    default: break;
    }
}

void mqtt_start(void)
{
    esp_mqtt_client_config_t c = {
        .broker.address.hostname = "broker.example.com",
        .broker.address.port = 1883,
        .credentials.username = "dev1",
        .credentials.authentication.password = "token",
        .session.keepalive = 30,
    };
    h_mqtt = esp_mqtt_client_init(&c);
    esp_mqtt_client_register_event(h_mqtt, ESP_EVENT_ANY_ID, on_mqtt_ev, NULL);
    esp_mqtt_client_start(h_mqtt);      /* WiFi OK 之后再调用 */
}

/* 周期上报传感器数据：主题分层 emb/dev1/tele/temp */
void report(float temp, float hum)
{
    char pl[64];
    snprintf(pl, sizeof pl, "{\\"t\\":%.1f,\\"h\\":%.1f}", temp, hum);
    esp_mqtt_client_publish(h_mqtt, "emb/dev1/tele", pl, 0, 1, 0);
}`,
    points: [
      '主题命名分层：emb/设备ID/tele（遥测）、emb/设备ID/cmd（下行）——按 API 约定走',
      'QoS0 最多一次（可能丢）、QoS1 至少一次（可能重）、QoS2 恰好一次（贵）——传感器遥测用 0/1 够了',
      '发布要在 WiFi OK 之后；断网期间数据进队列缓存，恢复后补发（时间戳标记）',
      '调试神器 mosquitto_sub -t "emb/#" -v 桌面端订阅观察，先排除服务端问题',
    ],
    linkProject: 'p07',
  },
  {
    id: 'e09',
    cat: 'esp32',
    title: 'NVS 键值存储：参数掉电保存',
    brief: 'Non-Volatile Storage：配额、擦写均衡都替你做好了',
    tags: ['NVS', '持久化'],
    platform: 'ESP32 全系',
    code: `#include "nvs_flash.h"
#include "nvs.h"

void save_wifi_cred(const char *ssid, const char *pass)
{
    nvs_handle_t h;
    ESP_ERROR_CHECK(nvs_open("wifi", NVS_READWRITE, &h));
    nvs_set_str(h, "ssid", ssid);
    nvs_set_str(h, "pass", pass);
    ESP_ERROR_CHECK(nvs_commit(h));     /* 不 commit = 只在 RAM，掉电丢 */
    nvs_close(h);
}

int load_wifi_cred(char *ssid, size_t sl, char *pass, size_t pl)
{
    nvs_handle_t h;
    if (nvs_open("wifi", NVS_READONLY, &h) != ESP_OK) return -1;
    esp_err_t e1 = nvs_get_str(h, "ssid", ssid, &sl);
    esp_err_t e2 = nvs_get_str(h, "pass", pass, &pl);
    nvs_close(h);
    return (e1 == ESP_OK && e2 == ESP_OK) ? 0 : -1;
}

/* 结构体存储：先序列化成 blob */
void save_pid(const pid_t *p) {
    nvs_handle_t h;
    nvs_open("ctrl", NVS_READWRITE, &h);
    nvs_set_blob(h, "pid", p, sizeof(*p));
    nvs_commit(h); nvs_close(h);
}`,
    points: [
      'NVS 自带磨损均衡和断电保护，比裸写 SPI Flash 安全得多——参数存储一律走 NVS',
      '写入必须 commit 才落盘；频繁 commit 有 flash 磨损，参数变化时才存',
      '键总长含命名空间上限约 4000 条（默认分区 24KB），别把 NVS 当日志盘',
      'nvs_flash_init 返回 NO_FREE_PAGES/NEW_VERSION_FOUND 时 erase 后重初始化是标准处理',
    ],
    linkProject: 'p07',
  },
  {
    id: 'e10',
    cat: 'esp32',
    title: '双核任务分配与优先级',
    brief: 'PRO_CPU 跑协议栈、APP_CPU 跑业务——ESP32 的架构红利',
    tags: ['FreeRTOS', '双核'],
    platform: 'ESP32（双核款）',
    code: `/* xTaskCreatePinnedToCore：最后参数指定核心（0=PRO 1=APP） */

/* 核心分配原则：
   PRO_CPU(0)：WiFi/BT 协议栈（系统自动占用）+ 低优后台
   APP_CPU(1)：实时业务逻辑、采样、控制环 */

void app_dualcore_setup(void)
{
    /* 控制环：钉在 APP_CPU，高优先级，无浮点陷阱问题 */
    xTaskCreatePinnedToCore(ctrl_task, "ctrl", 4096, NULL,
                            5, &h_ctrl, 1);

    /* 数据上云：钉在 PRO_CPU，低优先级，让协议栈优先 */
    xTaskCreatePinnedToCore(cloud_task, "cloud", 8192, NULL,
                            2, &h_cloud, 0);

    /* 不钉核（tskNO_AFFINITY）让调度器自由分配，适合负载波动任务 */
    xTaskCreate(worker_task, "worker", 4096, NULL, 1, NULL);
}

/* 双核共享数据同样要同步：跨核读写用互斥量 */
static SemaphoreHandle_t s_mux;
s_mux = xSemaphoreCreateMutex();
/* 写侧 */ xSemaphoreTake(s_mux, portMAX_DELAY); shared.x = v; xSemaphoreGive(s_mux);
/* 读侧 */ 同样 Take/Give。

/* 看占用率：idf.py monitor 里输入 tasks 命令，列出每任务/每核的 CPU 占用 */`,
    points: [
      'app_main 本身跑在 PRO_CPU——不钉核的任务可能被协议栈抢走 CPU，实时任务务必钉 APP_CPU',
      '双核共享变量：volatile 只解决可见性，跨核需要互斥量或原子操作（stdatomic.h）',
      '每任务栈 4KB 起步：printf + JSON 序列化很吃栈，栈不足表现为任意位置崩溃',
      '浮点：ESP32 单精度硬件 FPU，但任务切换保存 FPU 寄存器有额外开销——固定大量浮点用双缓冲',
    ],
    linkProject: 'p07',
  },
]
