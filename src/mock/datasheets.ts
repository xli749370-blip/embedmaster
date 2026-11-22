/**
 * 数据手册索引 —— 所涉及元件与芯片的官方手册一站速查
 * compSheets: 按 components.ts 的词条 id 关联（详情页自动挂载）
 * chipSheets: 主控芯片/常用芯片手册（数据手册索引页集中展示）
 */

export interface Sheet {
  name: string
  url: string
  note?: string
}

export const compSheets: Record<string, Sheet[]> = {
  'd-rect': [
    { name: '1N4007（Vishay）', url: 'https://www.vishay.com/docs/88503/1n4001.pdf', note: '1N4001~4007 家族通用' },
  ],
  'd-schottky': [
    { name: '1N5817~1N5822（Vishay）', url: 'https://www.vishay.com/docs/88576/1n5817.pdf' },
  ],
  'd-zener': [
    { name: 'BZX55 系列（Vishay）', url: 'https://www.vishay.com/docs/85616/bzx55.pdf' },
  ],
  'd-tvs': [
    { name: 'SMAJ 系列（Littelfuse）', url: 'https://www.littelfuse.com/products/tvs-diodes/400w/smaj.aspx' },
  ],
  'd-led': [
    { name: 'LED 选型页（Vishay）', url: 'https://www.vishay.com/en/leds/' },
  ],
  'd-bridge': [
    { name: 'DB105~DB107（onsemi）', url: 'https://www.onsemi.com/pdf/datasheet/db105-d.pdf' },
  ],
  'd-optocoupler': [
    { name: 'PC817（Sharp）', url: 'https://global.sharp/products/device/lineup/data/pdf/datasheet/pc817x_e.pdf' },
  ],
  't-npn': [
    { name: 'P2N2222A（onsemi）', url: 'https://www.onsemi.com/pdf/datasheet/p2n2222a-d.pdf' },
    { name: 'S8050 检索', url: 'https://www.alldatasheet.com/view.jsp?Searchword=S8050', note: '国产料官网不稳定，走手册库检索' },
  ],
  't-pnp': [
    { name: 'S8550 检索', url: 'https://www.alldatasheet.com/view.jsp?Searchword=S8550' },
  ],
  't-darlington': [
    { name: 'TIP122（ST）', url: 'https://www.st.com/resource/en/datasheet/tip122.pdf' },
    { name: 'ULN2003A（TI）', url: 'https://www.ti.com/lit/ds/symlink/uln2003a.pdf' },
  ],
  't-nmos-small': [
    { name: '2N7002（Nexperia）', url: 'https://assets.nexperia.com/documents/data-sheet/2N7002.pdf' },
    { name: 'AO3400 检索', url: 'https://www.alldatasheet.com/view.jsp?Searchword=AO3400' },
  ],
  't-pmos-power': [
    { name: 'AO3401 检索', url: 'https://www.alldatasheet.com/view.jsp?Searchword=AO3401' },
    { name: 'SI2301 检索', url: 'https://www.alldatasheet.com/view.jsp?Searchword=SI2301' },
  ],
  't-nmos-power': [
    { name: 'BSS138（onsemi）', url: 'https://www.onsemi.com/pdf/datasheet/bss138-d.pdf' },
    { name: 'IRLZ44N 检索', url: 'https://www.alldatasheet.com/view.jsp?Searchword=IRLZ44N' },
  ],
  'p-ldo': [
    { name: 'AMS1117（Advanced Monolithic）', url: 'https://www.advanced-monolithic.com/Pdf/ds1117.pdf' },
    { name: 'RT9013（Richtek）', url: 'https://www.richtek.com/assets/product_file/RT9013/DS9013-1.pdf' },
  ],
  'p-buck': [
    { name: 'TPS5430（TI）', url: 'https://www.ti.com/lit/ds/symlink/tps5430.pdf' },
    { name: 'MP1584 检索', url: 'https://www.alldatasheet.com/view.jsp?Searchword=MP1584' },
  ],
  'p-tp4056': [
    { name: 'TP4056（SparkFun 存档）', url: 'https://cdn.sparkfun.com/datasheets/Prototyping/TP4056.pdf' },
  ],
  'p-ptc': [
    { name: 'PTC 自恢复保险丝选型（Littelfuse）', url: 'https://www.littelfuse.com/products/polyswitch-resettable-ptcs.aspx' },
  ],
  's-ntc': [
    { name: 'NTC B 值公式应用笔记（Ametherm）', url: 'https://www.ametherm.com/thermistor/ntc-thermistor-beta' },
  ],
  's-hall': [
    { name: 'SS49E 检索', url: 'https://www.alldatasheet.com/view.jsp?Searchword=SS49E' },
  ],
  's-tcrt5000': [
    { name: 'TCRT5000（Vishay）', url: 'https://www.vishay.com/docs/83760/tcrt5000.pdf' },
  ],
  's-photoresistor': [
    { name: 'BPW34 光电二极管（Vishay）', url: 'https://www.vishay.com/docs/81521/bpw34.pdf' },
  ],
  's-hcsr04': [
    { name: 'HC-SR04（SparkFun 存档）', url: 'https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf' },
  ],
  's-ds18b20': [
    { name: 'DS18B20（Analog Devices）', url: 'https://www.analog.com/media/en/technical-documentation/data-sheets/ds18b20.pdf' },
  ],
  'l-74hc14': [
    { name: '74HC/HCT14（Nexperia）', url: 'https://assets.nexperia.com/documents/data-sheet/74HC_HCT14.pdf' },
  ],
  'l-levelshift': [
    { name: 'TXS0108E（TI）', url: 'https://www.ti.com/lit/ds/symlink/txs0108e.pdf' },
  ],
  'l-rs485': [
    { name: 'MAX485 家族（Analog Devices）', url: 'https://www.analog.com/media/en/technical-documentation/data-sheets/max1487-max491.pdf' },
  ],
  'l-can': [
    { name: 'TJA1050（NXP）', url: 'https://www.nxp.com/docs/en/data-sheet/TJA1050.pdf' },
    { name: 'SN65HVD230（TI）', url: 'https://www.ti.com/lit/ds/symlink/sn65hvd230.pdf' },
  ],
  'l-esp8266': [
    { name: 'ESP8266EX（Espressif）', url: 'https://www.espressif.com/sites/default/files/documentation/0a-esp8266ex_datasheet_en.pdf' },
  ],
  'e-stepper': [
    { name: 'A4988（Pololu 存档）', url: 'https://www.pololu.com/file/0J450/a4988_DMOS_microstepping_driver_with_translator.pdf' },
  ],
}

export interface ChipSheet {
  name: string
  cat: string
  sheets: Sheet[]
}

/** 主控与常用芯片手册（数据手册索引页展示） */
export const chipSheets: ChipSheet[] = [
  {
    name: 'STM32F103（Cortex-M3）',
    cat: 'STM32',
    sheets: [
      { name: '数据手册 STM32F103x8/xB', url: 'https://www.st.com/resource/en/datasheet/stm32f103c8.pdf' },
      { name: '参考手册 RM0008（寄存器全集）', url: 'https://www.st.com/resource/en/reference_manual/rm0008-stm32f101xx-stm32f102xx-stm32f103xx-stm32f105xx-and-stm32f107xx-advanced-armbased-32bit-mcus-stmicroelectronics.pdf' },
      { name: 'Cortex-M3 内核手册（ARM）', url: 'https://developer.arm.com/documentation/100165/latest/' },
    ],
  },
  {
    name: 'STM32F4（Cortex-M4F）',
    cat: 'STM32',
    sheets: [
      { name: '数据手册 STM32F411xC/xE', url: 'https://www.st.com/resource/en/datasheet/stm32f411ce.pdf' },
      { name: '参考手册 RM0383', url: 'https://www.st.com/resource/en/reference_manual/rm0383-stm32f411xce-advanced-armbased-32bit-mcus-stmicroelectronics.pdf' },
    ],
  },
  {
    name: 'ESP32（双核 Xtensa）',
    cat: 'ESP32',
    sheets: [
      { name: '数据手册', url: 'https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf' },
      { name: '技术参考手册 TRM（寄存器全集）', url: 'https://www.espressif.com/sites/default/files/documentation/esp32_technical_reference_manual_en.pdf' },
      { name: 'ESP-IDF API 参考（在线）', url: 'https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/index.html' },
    ],
  },
  {
    name: 'ESP32-S3 / C3',
    cat: 'ESP32',
    sheets: [
      { name: 'ESP32-S3 数据手册', url: 'https://www.espressif.com/sites/default/files/documentation/esp32-s3_datasheet_en.pdf' },
      { name: 'ESP32-C3 数据手册（RISC-V）', url: 'https://www.espressif.com/sites/default/files/documentation/esp32-c3_datasheet_en.pdf' },
    ],
  },
  {
    name: 'MPU6050（六轴 IMU）',
    cat: '传感器/外设',
    sheets: [
      { name: '产品规格 MPU-6000/6050（TDK InvenSense）', url: 'https://invensense.tdk.com/wp-content/uploads/2015/02/MPU-6000-Datasheet-V1.pdf' },
      { name: '寄存器手册 Register Map', url: 'https://invensense.tdk.com/wp-content/uploads/2015/02/MPU-6000-Register-Map1.pdf' },
    ],
  },
  {
    name: 'SSD1306（OLED 控制器）',
    cat: '传感器/外设',
    sheets: [
      { name: 'SSD1306 数据手册', url: 'https://cdn-shop.adafruit.com/datasheets/SSD1306.pdf' },
    ],
  },
  {
    name: 'W25Q64（SPI Flash）',
    cat: '传感器/外设',
    sheets: [
      { name: 'W25Q64JV 手册检索', url: 'https://www.alldatasheet.com/view.jsp?Searchword=W25Q64JV', note: 'Winbond 官网下载入口易变，走手册库检索' },
    ],
  },
]

/** 手册查询方法论（索引页展示） */
export const sheetTips: string[] = [
  '优先官网：ST/TI/Espressif/NXP 等官网 PDF 才是权威版本，第三方转载可能缺页或过版',
  '看三样东西：特性表（第一页）判断够不够用、绝对最大额定值（Absolute Maximum）划安全边界、典型应用电路（Typical Application）直接抄',
  '选型时用「参数对比表」页：多型号横向对比比逐份读手册快十倍',
  '寄存器细节查参考手册（Reference Manual/TRM），数据手册只给外设概览——两份配合读',
  '国产料官网不稳时，用 alldatasheet 等手册库检索；下载后注意核对版本号和日期',
]
