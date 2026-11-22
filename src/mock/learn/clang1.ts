/**
 * C 语言大全 · 上卷：第一章 地基 / 第二章 指针与内存 / 第三章 函数与工程化
 * 每节五维度：doc 讲解 + code 示例 + pitfalls 避坑 + quiz 小测 + extend 延伸
 */
import type { LearnCourse } from './index'

export const clangPart1 = {
  chapters: [
    { id: 'ch1', title: '地基：类型与语法', brief: '把变量、位运算、控制流、类型转换这些"最基础的"一次性讲透——嵌入式 90% 的诡异 bug 都源于这里没吃透。' },
    { id: 'ch2', title: '指针与内存', brief: 'C 语言的灵魂。理解了指针和内存布局，单片机手册里的地址就不再是天书。' },
    { id: 'ch3', title: '函数与工程化', brief: '从"能跑"到"工程"：函数指针回调、多文件组织、模块接口设计。' },
  ],
  sections: [
    /* ================= 第一章 ================= */
    {
      id: 'c-em01', chapter: 'ch1', track: 'emb',
      title: '变量与内存：类型、大小与溢出',
      doc: `每个变量背后都是一段内存。声明 \`uint8_t x;\` 的意思是：在内存里划出一个字节，名叫 x，按无符号整数解释。
在 PC 上 \`int\` 是 4 字节，但在部分单片机上 \`int\` 可能是 2 字节——**嵌入式代码永远用 stdint.h 的定宽类型**：uint8_t / int16_t / uint32_t，不赌编译器。
**溢出**：uint8_t 存 255 再加 1，回绕成 0，不报错。延时计数、协议长度、ADC 累加，凡涉及加减都要想清楚"最大会到多少"。
**有符号陷阱**：\`int8_t\` 的 127 + 1 变成 -128（补码回绕）；无符号与有符号混算时，有符号会被**隐式转换**成无符号——\`(uint8_t)-1 > 0\` 为真！`,
      code: `#include <stdint.h>
uint8_t  cnt = 250;
cnt += 10;                    /* 回绕：cnt == 4，不报错 */

uint16_t a = 0, b = 1;
uint32_t big = a - b;         /* 无符号下溢：big == 65535 */

/* 判断溢出的安全写法 */
uint16_t sum = a + b;
if (sum < a) { /* 溢出了 */ }`,
      pitfalls: [
        '用 int/long 而不是定宽类型，换平台后数据宽度变化引发隐性问题。',
        '无符号回绕当"错误"处理——它不报错，要在逻辑里主动判断。',
        '有符号数与无符号数比较/混算，触发隐式转换，负数变天大正数。',
      ],
      quiz: [
        { q: 'uint8_t x = 200; x += 100; x 的值是？', options: ['300', '44', '0', '未定义'], answer: 1, explain: '300 - 256 = 44，无符号按 256 取模回绕，不是未定义行为。' },
        { q: '下面哪个表达式的值为真？', options: ['(int8_t)(127+1) > 0', '(uint8_t)-1 > 0', '(uint32_t)(0-1) == -1', 'sizeof(int) 恒等于 4'], answer: 1, explain: '-1 转 uint8_t 是 255 > 0 真；A 中 127+1 是 int 运算后截断为 -128 不大于 0；C 是 4294967295 == -1 的比较中 -1 也转无符号，实际相等但题目考察点在转换规则；D 平台相关。' },
      ],
      extend: '关联「电路训练场」的 ADC 电池监测案例：累加滤波器用的 uint32_t 就是在防 10 位 ADC 值累加溢出。',
    },
    {
      id: 'c-em02', chapter: 'ch1', track: 'emb',
      title: '位运算全集：嵌入式的母语',
      doc: `寄存器操作 = 位运算。六件套必须形成肌肉记忆：置位 \`|\`、清零 \`&~\`、翻转 \`^\`、判位 \`&\`、移位 \`<<\` \`>>\`。
**掩码思维**：把要操作的位画出来，其余位用掩码保护。\`REG = (REG & ~0xF0) | (val << 4)\` 是"只改高 4 位"的通用公式。
**判位**：\`if (REG & (1u << 5))\` 检查第 5 位。注意写 \`1u\` 不是 \`1\`——移位超过 31 位的有符号 1 是未定义行为。
**移位的妙用**：乘除 2 的幂（\`x >> 1\` 等价 /2）、构造掩码 \`((1u << n) - 1)\` 得到 n 个 1。`,
      code: `#define BIT(n)  (1u << (n))

REG |=  BIT(3);              /* 置位第 3 位 */
REG &= ~BIT(3);              /* 清零第 3 位 */
REG ^=  BIT(3);              /* 翻转第 3 位 */
if (REG & BIT(3)) { /* 第 3 位为 1 */ }

/* 只改 bit7..bit4 域为 val（0~15） */
REG = (REG & ~0xF0u) | ((val & 0xFu) << 4);

/* 掩码：低 n 位全 1 */
uint32_t mask = (1u << 4) - 1;   /* 0b1111 */`,
      pitfalls: [
        '对有符号数左移进符号位、右移负数——都是未定义/实现定义行为，位运算一律用无符号。',
        '判断多位的宏 if (REG & 0x3 == 1) 优先级错误，实际是 REG & (0x3==1)，要加括号 (REG & 0x3) == 1。',
        '移位位数 >= 类型宽度（如 uint8_t 左移 8 位）是未定义行为，先提升类型再移。',
      ],
      quiz: [
        { q: '把 REG 的第 2、5 位同时置 1 的正确写法？', options: ['REG |= 0x24', 'REG = 0x24', 'REG &= 0x24', 'REG ^= 0x24'], answer: 0, explain: '0x24 = 0b100100（bit5+bit2），|= 只置位不改其他位；= 会清掉所有其他位。' },
        { q: '(1u << 31) - 1 的值？', options: ['0x7FFFFFFF', '0x80000000', '0xFFFFFFFF', '未定义'], answer: 0, explain: '1u<<31 = 0x80000000，减 1 = 0x7FFFFFFF（31 个 1）。' },
      ],
      extend: '「电路训练场」c29 晶振章节演示了 RCC 寄存器使能位操作；代码库"GPIO 寄存器直操"模块是本节实战。',
    },
    {
      id: 'c-em03', chapter: 'ch1', track: 'emb',
      title: '控制流：if / switch / 循环的工程写法',
      doc: `语法都会，工程里看的是**可读性与防错**。
- 多状态判断用 \`switch\` 并**永远写 default**——状态机漏处理的状态就是 bug 温床。
- 浮点数不用 \`==\` 比较，用差值：\`fabs(a-b) < 1e-6\`。
- 循环里优先处理"边界提前返回"（guard clause），减少嵌套。
- \`for(;;)\` 与 \`while(1)\` 等价，主循环习惯用前者；**一定要有阻塞出口或看门狗意识**。
- **volatile 循环变量**：\`while(!flag);\` 里 flag 若不是 volatile，开优化后编译器会删掉这个循环。`,
      code: `/* guard clause：先挡住异常路径 */
int parse(uint8_t *buf, int len) {
  if (!buf || len <= 0)  return -1;
  if (buf[0] != HEAD)    return -2;
  /* ...主体逻辑不嵌套... */
  return 0;
}

switch (state) {
  case ST_IDLE:  break;
  case ST_RUN:   break;
  default: state = ST_IDLE;  /* 兜底回到安全态 */
}

extern volatile uint8_t flag;
while (!flag) { }        /* flag 必须 volatile */`,
      pitfalls: [
        'switch 不写 default，新增状态时漏处理静默跑飞。',
        'if (a = 5) 手滑赋值当判断——部分编译器告警，把常量放左边 if (5 == a) 可防。',
        '浮点用 == 比较，因精度误差几乎永远不相等。',
      ],
      quiz: [
        { q: 'while(!ready); 中 ready 未加 volatile，开 -O2 后最可能发生什么？', options: ['正常运行', '编译报错', '循环被优化成空，直接通过', '死机重启'], answer: 2, explain: '编译器认为单线程下 ready 不会变，把等待循环删掉——这是嵌入式最经典的优化事故。' },
        { q: 'float a=0.1; if (a == 0.1f) 的结果？', options: ['恒真', '恒假', '未定义', '取决于编译器'], answer: 3, explain: '0.1 二进制不可精确表示，double 字面量与 float 提升比较的结果由实现决定——正确做法是 fabs 差值比较。' },
      ],
      extend: '代码库"工程模板"分类的时间片轮询骨架，就是控制流 + 状态机的工程化组装。',
    },
    {
      id: 'c-em04', chapter: 'ch1', track: 'emb',
      title: '数组与字符串：连续内存的规矩',
      doc: `数组名在表达式中**退化为首元素指针**（sizeof 和 & 除外）。这意味着 \`void f(uint8_t arr[])\` 收到的只是指针，**数组长度必须额外传递**——嵌入式协议解析里最经典的越界源头。
**字符串**是 '\\0' 结尾的字符数组。strlen 是运行时数 '\\0'，sizeof 是编译期容量——\`char s[10]="hello"\` 的 strlen=5、sizeof=10。
**缓冲区操作**永远用带长度的版本：strncpy/memcpy 明确长度，并自己保证 '\\0'（strncpy 不一定补 '\\0'！）。
嵌入式里数组常放 flash：\`const uint8_t tab[] = {...}\` 不占 RAM。`,
      code: `const uint8_t font8x16[] = { /*...*/ };  /* 存 flash */

void send(uint8_t *buf, uint16_t len) {   /* 长度必须显式传 */
  for (uint16_t i = 0; i < len; i++) uart_tx(buf[i]);
}

char name[16];
strncpy(name, src, sizeof(name) - 1);
name[sizeof(name) - 1] = '\\0';            /* 手动保证结尾 */`,
      pitfalls: [
        '函数内 sizeof(arr) 得到的是指针大小（4/8），不是数组大小。',
        'strncpy 当 src 长度 >= n 时不补 \\0，后续 strlen 越界读。',
        '栈上开大数组（如 buf[1024]）在单片机上直接栈溢出——先看启动文件里栈有多大。',
      ],
      quiz: [
        { q: 'uint8_t a[10]; 函数内 sizeof(a) 的值（32 位机）？', options: ['10', '4', '40', '取决于内容'], answer: 1, explain: '数组名传参/ sizeof 在形参上退化成指针，32 位机指针 4 字节；只有对真数组本体 sizeof 才是 10。' },
        { q: 'char s[] = "abc"; sizeof(s) 与 strlen(s) 分别是？', options: ['3 和 3', '4 和 3', '3 和 4', '4 和 4'], answer: 1, explain: 'sizeof 含结尾 \\0 共 4 字节；strlen 数到 \\0 前，为 3。' },
      ],
      extend: '代码库"协议帧解析器"模块展示了带长度防御的缓冲区处理全流程。',
    },
    {
      id: 'c-em05', chapter: 'ch1', track: 'emb',
      title: '类型转换与整型提升：隐式杀手',
      doc: `C 的隐式转换规则是大量"莫名其妙"的根源，两条主线：
**整型提升**：比 int 短的类型（uint8_t/int16_t）参与运算时**先提升成 int** 再算。\`~(uint8_t)0\` 的结果不是 0xFF 而是 0xFFFFFFFF（int 是 32 位时）——先提升再按位取反。所以 \`uint8_t b = ~0u;\` 需要显式截断意识。
**算术转换**：两边类型不同，"较小"转"较大"，有符号无符号相遇**偏向无符号**。
**显式规则**：跨类型运算先 cast 到目标类型再运算：\`uint32_t t = (uint32_t)a * b;\`——不然 uint16_t * uint16_t 在 int 里就可能溢出。`,
      code: `uint8_t a = 200;
uint16_t m = a * 2;          /* a 提升为 int，200*2=400，OK */
uint8_t  n = a * 2;          /* 截断：n = 144！ */

uint16_t x = 40000, y = 40000;
uint32_t p = x * y;          /* int 内溢出（UB）后再赋值，错！ */
uint32_t q = (uint32_t)x * y; /* 先提升再乘，正确 1.6e9 */`,
      pitfalls: [
        '大数相乘先溢出再赋宽类型——必须先 cast 参与运算的那一方。',
        '~、<< 等按位操作作用在 uint8_t 上先提升为 int，写回时才截断，过程值可能与直觉不符。',
        'sizeof 返回 size_t（无符号），for (int i = 0; i < sizeof(arr); i++) 中 i 为负时会转成巨大无符号数。',
      ],
      quiz: [
        { q: 'uint8_t a=100, b=200; uint8_t c = a + b; c = ?', options: ['300', '44', '255', '编译错误'], answer: 1, explain: 'a+b 先按 int 算出 300，赋给 c 截断 300-256=44。' },
        { q: '避免 x*y 溢出（x,y 为 uint16_t）的正确写法？', options: ['uint32_t r = x * y;', 'uint32_t r = (uint32_t)x * y;', 'uint64_t r = x * y;', 'r = x * 1.0 * y;'], answer: 1, explain: '必须让乘法本身在 32 位下进行——先 cast 任意一方；A/D 都是先在 16 位(int)内溢出。' },
      ],
      extend: '传感器换算（ADC 原始值 × 系数）是本节事故高发区，项目库 p07 的温湿度换算里全部采用了先提升写法。',
    },

    /* ================= 第二章 ================= */
    {
      id: 'c-em06', chapter: 'ch2', track: 'emb',
      title: '指针本质：地址就是一切',
      doc: `指针就是"存地址的变量"。理解三个符号：\`p\` 是地址本身，\`*p\` 是地址指向的值，\`&x\` 是取 x 的地址。
**嵌入式特色**：指针可以直接指向硬件寄存器。\`volatile uint32_t * const GPIOA = (uint32_t *)0x40020014;\`——把物理地址变成 C 变量，这是"用 C 写裸机"的全部秘密。
**野指针**：未初始化、指向已释放/已出栈内存的指针，解引用是未定义行为（可能"看起来正常"）。习惯：定义即初始化，不用时置 NULL。
**void***：万能指针，只存地址不带类型信息，解引用前必须 cast。`,
      code: `uint32_t x = 42;
uint32_t *p = &x;            /* p 存 x 的地址 */
*p = 100;                    /* 通过指针改 x */

/* 指向寄存器（volatile 防优化，const 防指针本身被改） */
#define GPIOA_ODR (*(volatile uint32_t *)0x40020014)
GPIOA_ODR |= (1u << 5);

void *v = p;                 /* 万能指针 */
uint32_t y = *(uint32_t *)v; /* 用前必须 cast */`,
      pitfalls: [
        '返回局部变量的地址——函数返回后栈帧销毁，指针变野。',
        '忘 volatile：寄存器指针不加 volatile，编译器缓存值导致轮询死循环。',
        '对未初始化指针解引用，未定义行为可能碰巧正常，留到量产才炸。',
      ],
      quiz: [
        { q: '*(volatile uint32_t *)0x40020014 的含义？', options: ['读变量 0x40020014 的值', '把 0x40020014 当作地址，读该地址的 32 位值', '定义了一个常量', '非法语法'], answer: 1, explain: '强转整数为地址指针再解引用，就是"访问这个物理地址"，volatile 防止编译器优化掉访问。' },
        { q: 'int *p; *p = 5; 的问题是？', options: ['语法错误', 'p 未初始化就解引用（野指针写）', '5 类型不匹配', '没问题'], answer: 1, explain: 'p 的值是随机的，往随机地址写数据是未定义行为。' },
      ],
      extend: '「计算机底层认知」课程第 4 章从硬件视角解释了为什么地址访问要经过总线——两处对照着看。',
    },
    {
      id: 'c-em07', chapter: 'ch2', track: 'emb',
      title: '指针与数组、多级指针',
      doc: `数组名 ≈ 首元素指针，但有区别：数组名是"常量"，不能 p++；sizeof 含义不同。
**指针运算以所指类型大小为单位**：\`uint32_t *p; p+1\` 地址加 4 不是加 1——遍历缓冲区、解析协议帧全靠它。
**二级指针**：存"指针的地址"。用途：函数内修改调用者的指针（链表头插）、指针数组（argv、字符串表）。
**数组参数**：\`void f(int a[10])\` 等价 \`int *a\`，10 只是注释。想传"真数组"只能包结构体。`,
      code: `uint8_t buf[8] = {0,1,2,3,4,5,6,7};
uint8_t *p = buf;
p += 4;                     /* 指向 buf[4]，地址 +4 字节 */
uint8_t v = *p;             /* 4 */

/* 二级指针：函数内改调用者的指针 */
void alloc(uint8_t **out, uint16_t n) {
  static uint8_t pool[256];
  *out = pool;
}
uint8_t *msg;
alloc(&msg, 16);            /* 传 msg 的地址 */`,
      pitfalls: [
        '指针运算跨出数组边界（哪怕只是计算不访问）在标准里就是未定义。',
        '把二维数组当 int** 传——二维数组内存是连续的，与指针数组布局完全不同。',
        '字符串表写 char *tab[] = {...} 忘 const，浪费 RAM 还可能被误改。',
      ],
      quiz: [
        { q: 'uint32_t a[4]; uint32_t *p=a; (p+2)-(uint32_t)0x100 处的值相对 a[0] 地址偏移多少字节？', options: ['2', '8', '100', '16'], answer: 1, explain: 'p+2 按 4 字节步进，即 a[0] 地址 +8 字节（假设 p 原指 a[0]）。指针运算是类型化的。' },
        { q: '什么场景必须用二级指针做参数？', options: ['修改调用者的 int 值', '修改调用者的指针变量本身', '传递大数组', '返回结构体'], answer: 1, explain: '改 int 用 int*，改"指针变量"就要"指针的指针"——一级不够。' },
      ],
      extend: '命令行 argv 就是 char**；代码库"环形缓冲 FIFO"模块用一级指针 + 头尾下标规避了多级指针的复杂度，对比体会。',
    },
    {
      id: 'c-em08', chapter: 'ch2', track: 'emb',
      title: '内存四区：栈、堆、静态区、常量区',
      doc: `C 程序的内存分区（从低地址到高地址）：
- **常量区/代码区**（flash）：代码、const 全局、字符串字面量。
- **静态/全局区**：全局变量、static 变量——程序全程存活，启动时清零/拷贝初始化。
- **堆**：malloc/free 管理，从低往高长。嵌入式慎用：碎片化、不确定性。
- **栈**：局部变量、函数调用现场，从高往低长。**单片机栈一般只有几 KB**，大局部变量、深递归都会爆栈——症状是"莫名跑飞/HardFault"。
启动文件里 _estack/_Min_Stack_Size 决定栈大小，链接脚本决定分区布局。`,
      code: `int g_cnt;                    /* 静态区，启动清零 */
const char ver[] = "V1.0";    /* 常量区（flash） */

void task(void) {
  uint8_t buf[64];            /* 栈：任务栈要装得下 */
  static uint8_t log[128];    /* 改 static → 静态区，不占栈 */
  int *p = malloc(32);        /* 堆：嵌入式尽量避免 */
  free(p);
}`,
      pitfalls: [
        '函数里开大数组/大结构体导致栈溢出——改 static 或全局，或加大栈。',
        '字符串字面量被修改（char *s="abc"; s[0]=x）——常量区可能只读，写它 HardFault。',
        'malloc 之后忘 free 或者中断里调 malloc——不可重入，时机错乱直接坏堆。',
      ],
      quiz: [
        { q: '函数内 static uint8_t buf[256]; 相比局部数组的好处？', options: ['更快', '不占栈空间', '线程安全', '自动清零且每次进入保留'], answer: 1, explain: 'static 放静态区，首次初始化后全程存活——既避开栈大小限制，值也跨调用保留。' },
        { q: '栈溢出的典型症状？', options: ['编译不过', '运行到某函数就 HardFault/变量莫名被改', 'flash 不够', '下载失败'], answer: 1, explain: '栈底越界踩到相邻内存（或触发 MPU 保护），症状随机难查——这正是"HardFault 定位三板斧"要抓的问题。' },
      ],
      extend: '代码库"HardFault 定位三板斧"模块专门讲怎么从崩溃现场回溯到爆栈的那一行。',
    },
    {
      id: 'c-em09', chapter: 'ch2', track: 'emb',
      title: '动态内存：malloc/free 全规则',
      doc: `堆内存四条铁律：
1. **配对**：每个 malloc 必有且仅有一次 free；谁申请谁释放。
2. **判空**：malloc 返回 NULL（内存不足）必须检查。
3. **置空**：free 后立即 \`p = NULL;\`，防止悬空指针二次释放。
4. **大小用 sizeof**：\`malloc(sizeof(struct cfg) * n)\`，不手写字节数。
**内存泄漏**：只申请不释放，长跑设备几小时就耗尽。**碎片**：反复 malloc/free 不同大小，总空闲够但不连续，分配失败——嵌入式长跑设备的高发问题。
**嵌入式实践**：能静态就静态（全局/池）；确需动态用**内存池**（固定块大小，无碎片、O(1) 分配）；FreeRTOS 的 pvPortMalloc 也是池化思路。`,
      code: `cfg_t *c = malloc(sizeof(cfg_t));
if (!c) return -1;              /* 判空 */
/* ...使用... */
free(c);
c = NULL;                       /* 防悬空 */

/* 静态池替代动态分配（嵌入式首选） */
static cfg_t cfg_pool[4];
static uint8_t used[4];
cfg_t *pool_alloc(void) {
  for (int i = 0; i < 4; i++)
    if (!used[i]) { used[i] = 1; return &cfg_pool[i]; }
  return NULL;
}`,
      pitfalls: [
        'realloc 失败返回 NULL，直接 p = realloc(p, n) 会把原指针也丢了——先用临时变量接。',
        'free 同一指针两次（double free）——堆元数据被破坏，后续分配全面崩溃。',
        '结构体里嵌套指针，free 结构体前要逐层 free 内部指针，否则泄漏。',
      ],
      quiz: [
        { q: '嵌入式长跑设备最推荐哪种动态内存方案？', options: ['频繁 malloc/free', '固定大小内存池', '加大堆到 64KB', '永不释放'], answer: 1, explain: '固定块内存池无碎片、分配 O(1)、行为确定——FreeRTOS 队列底层就是这种思路。' },
        { q: 'free(p) 之后立刻要做的事？', options: ['再 malloc 一次', 'p = NULL', 'memcpy 清零', '什么都不用'], answer: 1, explain: '置 NULL 让后续误用 p 立即触发可定位的空指针错误，而不是悬空指针的随机崩溃。' },
      ],
      extend: 'FreeRTOS 篇（代码库 rtos 分类）讲了 heap_1~heap_5 五种内存方案的取舍，是本节的工程延续。',
    },
    {
      id: 'c-em10', chapter: 'ch2', track: 'emb',
      title: 'volatile / const / static 三巨头',
      doc: `这三个关键字是嵌入式 C 的"身份证"，面试和实操必考：
**volatile**：告诉编译器"这个变量随时会被外部改变（中断/DMA/硬件），每次都真读真写，不许缓存到寄存器"。三大场景：中断与主循环共享的标志、寄存器映射、多任务共享变量。
**const**：只读。const 全局数据放 flash 省 RAM；const 指针有两种方向（指向常量的值 / 常量指针），读法：从右往左。
**static**：两层含义——函数内：静态存储、值跨调用保留；文件级：限制作用域仅本文件可见（模块私有），是 C 实现"封装"的关键。`,
      code: `volatile uint8_t rx_flag = 0;     /* 中断置 1，主循环轮询 */
void EXTI0_IRQHandler(void) { rx_flag = 1; }

/* const 指针读法：从右往左 */
const int *a;        /* 指向 const int 的指针：值不可改，指向可换 */
int *const b = &x;   /* const 指针：指向不可换，值可改 */

/* static 封装：模块外看不见 */
static uint8_t s_head;            /* 文件私有 */
uint8_t fifo_pop(void) { /* 对外接口 */ }`,
      pitfalls: [
        '该加 volatile 的共享变量没加，开优化后"中断改了但主循环看不见"，偶发且难复现。',
        'volatile 不保证原子性——32 位机上的 uint8_t 读写原子，但 uint64_t/结构体不是，仍需临界区。',
        'static 局部数组在多任务中被并发使用——static 只有"一份"，不是"每任务一份"。',
      ],
      quiz: [
        { q: '中断里置位的标志变量，主循环轮询它，最关键的修饰？', options: ['const', 'static', 'volatile', 'register'], answer: 2, explain: '没有 volatile，编译器可能在主循环里只读一次就缓存，轮询失效。' },
        { q: 'int *const p 的含义？', options: ['p 指向的值不可改', 'p 本身不可改（指向固定）', '都不可改', '都可改'], answer: 1, explain: 'const 在 * 后修饰指针本身；"指向常量的指针"是 const int *p。' },
      ],
      extend: '代码库"printf 重定向"与"分级 LOG 宏"模块大量使用 static 文件私有变量做模块状态，是本节的最佳实例。',
    },

    /* ================= 第三章 ================= */
    {
      id: 'c-em11', chapter: 'ch3', track: 'emb',
      title: '函数、栈帧与传参',
      doc: `函数调用时，返回地址、参数、局部变量压入**栈帧**；返回时栈帧弹出。理解栈帧就理解了：
- 为什么**不能返回局部变量的地址**（栈帧已销毁）。
- 为什么递归太深会爆栈（每层一帧）。
- 为什么中断里不宜做重活（占用被中断者的栈空间）。
**传参**：C 全部是**传值**——函数拿到的是副本。想修改调用者的变量，传它的地址（指针/二级指针）；大结构体传参用**指针**避免整份拷贝（只读再加 const）。
**原型先行**：先声明后使用，参数类型写全 \`void f(int, char*)\` 而不是空括号——空括号表示"不检查参数"，是定时炸弹。`,
      code: `typedef struct { int x[100]; } big_t;

void fill(big_t *out, int v) {        /* 传指针，免 400B 拷贝 */
  out->x[0] = v;
}

int clamp(int v, int lo, int hi) {    /* 传值：小类型无所谓 */
  return v < lo ? lo : (v > hi ? hi : v);
}

/* 原型先行，放头文件 */
int clamp(int v, int lo, int hi);`,
      pitfalls: [
        '大结构体按值传参，一次拷贝几百字节，中断里更是灾难。',
        '函数定义在使用之后且没有原型声明，编译器按旧规则假定参数，类型错配静默通过。',
        '在函数里返回栈上数组的指针，返回值依赖已销毁的栈帧。',
      ],
      quiz: [
        { q: '想在函数内修改调用者的 uint8_t 变量，参数类型应为？', options: ['uint8_t', 'uint8_t*', 'uint8_t**', 'const uint8_t&'], answer: 1, explain: '传地址才能改原值；C 没有引用（那是 C++）。' },
        { q: '中断服务函数里为什么要"短平快"？', options: ['代码风格', '占着被打断代码的栈与时间，做久了影响实时性', '编译器限制', '省电'], answer: 1, explain: '中断用同一栈且阻塞整个系统，重活应置标志交给主循环。' },
      ],
      extend: '「计算机底层认知」第 6 章画了栈帧grow/消亡的完整图解，与本节互为表里。',
    },
    {
      id: 'c-em12', chapter: 'ch3', track: 'emb',
      title: '函数指针与回调：架构利器',
      doc: `函数指针存"代码的地址"，语法：\`返回值 (*名)(参数表)\`。它的价值是**把行为变成数据**——运行时决定"调用哪个函数"，这就是**回调**。
嵌入式三大应用：
1. **中断向量表**：本质就是函数指针数组，地址固定在 flash 起始处。
2. **驱动分层**：协议层注册 \`recv_cb(uint8_t *data, uint16_t len)\`，串口层收到数据回调它——上下层解耦，换串口不改协议层。
3. **命令表**：\`struct { char *name; void (*fn)(void); } cmd_tab[]\`，一条循环搞定 AT 指令/调试命令分发。`,
      code: `typedef void (*cmd_fn)(void);

static void cmd_led(void)  { led_toggle(); }
static void cmd_ver(void)  { printf("V1.0\\r\\n"); }

static const struct { const char *name; cmd_fn fn; } cmds[] = {
  { "led", cmd_led }, { "ver", cmd_ver },
};

void exec(const char *s) {
  for (uint32_t i = 0; i < sizeof(cmds)/sizeof(cmds[0]); i++)
    if (!strcmp(s, cmds[i].fn ? cmds[i].name : "")) { cmds[i].fn(); return; }
}`,
      pitfalls: [
        '函数指针类型与被指函数签名不一致（参数/返回值不匹配）——未定义行为，编译只给告警。',
        '回调在中断上下文执行却做了重活/调用了不可重入函数。',
        '调用前不判空：可选回调（未注册时）直接崩——调用处写 if (cb) cb(...)。',
      ],
      quiz: [
        { q: '回调机制带来的核心架构收益是？', options: ['执行更快', '上层与下层解耦，替换实现不改对方', '省 flash', '减少变量'], answer: 1, explain: '行为作为参数传入，模块间只依赖接口不依赖具体实现——这是驱动框架的通用设计。' },
        { q: '中断向量表的本质是？', options: ['一段汇编代码', '函数指针数组', '全局变量表', '链接脚本'], answer: 1, explain: '启动文件里 vectors[] 就是函数指针数组，硬件按中断号索引跳转。' },
      ],
      extend: '代码库"AT 指令引擎"模块就是命令表 + 回调的完整实战；OLED 驱动框架则是接口回调的分层示范。',
    },
    {
      id: 'c-em13', chapter: 'ch3', track: 'emb',
      title: '头文件与多文件工程组织',
      doc: `多文件工程的规矩：
- **.h 放"是什么"**：类型、宏、函数**声明**；**.c 放"怎么做"**：函数**定义**（实现）。
- 头文件必须加**包含守卫**（#ifndef XX_H），防重复包含导致重复定义。
- 头文件里**不写定义**（例外：static inline 小函数、纯宏），否则多文件包含就链接冲突。
- include 顺序习惯：自己头 → 项目头 → 库头 → 标准库。
- **extern**：在 .c 里用别的文件的全局变量，头文件里 extern 声明一次，全项目共享。`,
      code: `/* fifo.h */
#ifndef FIFO_H
#define FIFO_H
#include <stdint.h>
typedef struct { uint8_t *buf; uint16_t size, head, tail; } fifo_t;
void     fifo_init(fifo_t *f, uint8_t *buf, uint16_t size);
uint16_t fifo_write(fifo_t *f, const uint8_t *d, uint16_t n);
#endif /* FIFO_H */

/* fifo.c */
#include "fifo.h"
void fifo_init(fifo_t *f, uint8_t *buf, uint16_t size) { /* 实现 */ }`,
      pitfalls: [
        '在 .h 里定义全局变量（没 extern），被两个 .c 包含后链接报 multiple definition。',
        '守卫宏漏写或名字重复，出现"明明只包含一次却重定义"的怪象。',
        '.c 之间直接 extern 对方函数而不经头文件——签名改了一处漏一处。',
      ],
      quiz: [
        { q: '头文件包含守卫的作用？', options: ['加快编译', '防止同一头文件被重复展开导致重定义', '防止被破解', '声明依赖'], answer: 1, explain: '#ifndef/#define/#endif 让同一翻译单元里头文件内容只展开一次。' },
        { q: '全局变量 g_mode 要被 b.c 使用，正确做法？', options: ['a.c 里 extern int g_mode;', 'b.c 里 extern 声明（头文件统一声明）', '两边都定义', '复制一份'], answer: 1, explain: '定义在 .c，声明（extern）放头文件，包含使用——单一事实来源。' },
      ],
      extend: '代码库开篇的"目录分层规范"模板（app/drivers/middleware 三层）就是本节规则的完整落地。',
    },
    {
      id: 'c-em14', chapter: 'ch3', track: 'emb',
      title: '模块化设计：接口隐藏与句柄模式',
      doc: `好模块 = **数据私有 + 接口窄**。C 的实现套路：
- 所有内部状态加 **static**（文件私有），对外只暴露 init/deinit 和操作函数。
- **句柄模式**：模块内部结构体只在本 .c 可见，外部只拿到 \`handle_t\`（指针或 id）——调用者碰不到内部字段，想改实现（换芯片、换算法）不惊动任何人。
- **错误码统一**：返回 int，0 成功、负数错误码，模块头文件里 #define 出全部错误码。
- 初始化一次、使用多次；接口参数不带"内部细节"（比如让调用者传寄存器地址就是接口泄漏）。
这套思想学会了，看 HAL/FreeRTOS 的源码就跟看散文一样。`,
      code: `/* sensor.h —— 对外只有这些 */
typedef struct sensor* sensor_handle_t;
int  sensor_init(sensor_handle_t *h, uint8_t i2c_addr);
int  sensor_read(sensor_handle_t h, float *temp);
void sensor_deinit(sensor_handle_t h);

/* sensor.c */
struct sensor {                    /* 定义藏在这里，外部看不见 */
  uint8_t addr;
  float   offset;
  uint8_t init_ok;
};
int sensor_init(sensor_handle_t *h, uint8_t addr) { /* ... */ }`,
      pitfalls: [
        '把内部结构体放在头文件里，调用者直接摸字段——实现一改全场编译错。',
        '接口带实现细节参数（寄存器地址、内部下标），耦合死锁。',
        'init 没做幂等保护，被重复调用覆盖运行中状态。',
      ],
      quiz: [
        { q: '句柄（handle）模式的本质是？', options: ['提高运行速度', '把"内部数据"与"外部接口"隔离，外部只持引用', '节省内存', '支持中断'], answer: 1, explain: '外部拿到的只是不透明引用，内部布局随便改——这正是面向对象"封装"的 C 语言等价物。' },
        { q: '文件级 static 的设计价值？', options: ['节省 flash', '限制可见范围，形成模块私有状态', '提高优先级', '防止中断'], answer: 1, explain: 'static 让变量/函数只在本编译单元可见，模块边界清晰，避免全局命名空间污染。' },
      ],
      extend: '项目库 p04 机械臂的舵机驱动层就是按句柄模式封装的，跟着做一遍比看十遍有用。',
    },
  ],
} as const
