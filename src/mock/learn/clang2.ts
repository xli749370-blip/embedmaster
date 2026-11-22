/**
 * C 语言大全 · 下卷：第四章 预处理器与构建 / 第五章 嵌入式 C 专项 / 第六章 非嵌入式通用
 */
import type { LearnCourse } from './index'

export const clangPart2 = {
  chapters: [
    { id: 'ch4', title: '预处理器与构建', brief: '编译器看不见的另半边世界：宏、条件编译、编译四阶段与构建系统。' },
    { id: 'ch5', title: '嵌入式 C 专项', brief: '寄存器、中断、状态机、环形缓冲——把 C 用在"贴着硬件"的地方。' },
    { id: 'ch6', title: '非嵌入式通用 C', brief: '面向 PC/服务器方向的通用 C 能力，标注 [通用]，按需选修。' },
  ],
  sections: [
    /* ================= 第四章 ================= */
    {
      id: 'c-em15', chapter: 'ch4', track: 'emb',
      title: '宏：带参宏与它的坑',
      doc: `宏是**预处理阶段的文本替换**，不检查类型。规则：
- **带参宏每个参数加括号**，整体再加一层：\`#define SQ(x) ((x) * (x))\`——否则 \`SQ(a+1)\` 展开成 \`a+1*a+1\`。
- **参数在宏里只出现一次最好**：\`SQ(i++)\` 会把 i 自增两次（副作用翻倍）。
- 多语句宏用 \`do { } while (0)\` 包裹——保证在 if/else 里 behaves 像一条语句。
- **#undef** 可取消定义；宏名全大写是惯例。
- \`sizeof\`、\`offsetof\`（求结构体成员偏移）是宏的正当用途。`,
      code: `#define SQ(x)   ((x) * (x))
#define MAX(a,b) ((a) > (b) ? (a) : (b))
#define SETBIT(reg, n)  do { (reg) |= (1u << (n)); } while (0)

int i = 3;
int s = SQ(i++);        /* (i++)*(i++)：i 变 5，结果未定义！ */

#include <stddef.h>
uint32_t off = offsetof(struct pkt, len);  /* len 在结构体中的偏移 */`,
      pitfalls: [
        '参数不加括号，传表达式时因优先级产生错误结果。',
        '带自增/函数调用的参数传入带参宏，副作用重复执行。',
        '多行宏不用 do{}while(0)，放在 if/else 中时 else 配对错乱。',
      ],
      quiz: [
        { q: '#define DOUBLE(x) x+x，调用 DOUBLE(3)*2 展开为？', options: ['12', '9', '18', '6'], answer: 1, explain: '文本替换成 3+3*2 = 9；正确定义应为 ((x)+(x))，展开 (3+3)*2 = 12。' },
        { q: '多语句宏为什么包 do { } while (0)？', options: ['提高速度', '使其在 if/else 中作为单条语句安全使用', '节省空间', '习惯而已'], answer: 1, explain: 'while(0) 后不加分号问题，if (x) MACRO(); else ... 不会把 else 撕开。' },
      ],
      extend: '代码库"分级 LOG 宏"模块演示了条件编译 + 变参宏 + do{}while(0) 的标准组合。',
    },
    {
      id: 'c-em16', chapter: 'ch4', track: 'emb',
      title: '条件编译与多平台适配',
      doc: `条件编译让同一份代码适配多芯片/多配置：
- \`#ifdef/#ifndef/#if defined(A) || defined(B)\` 控制编译哪些分支。
- 典型场景：调试开关（DEBUG 打印整块去掉）、芯片型号适配（STM32F1/F4 引不同头文件）、功能裁剪（省 flash）。
- **#error**：配置错误时立即终止编译，比运行时炸好一万倍——"配置检查前移"。
- 注意区分：\`#if 0\` 注释代码（别留太多）、\`#pragma once\`（非标准的守卫替代）。
链接器层面还有弱符号：\`__attribute__((weak))\` 允许用户覆盖默认实现（HAL 回调就是它）。`,
      code: `#define USE_DEBUG  1

#if USE_DEBUG
  #define LOG(...) printf(__VA_ARGS__)
#else
  #define LOG(...)            /* 发布版自动清空 */
#endif

#if defined(STM32F1) && !defined(STM32F4)
  #include "stm32f1xx.h"
#elif defined(STM32F4)
  #include "stm32f4xx.h"
#else
  #error "请先在编译选项中定义目标芯片型号！"
#endif`,
      pitfalls: [
        '用 #if USE_DEBUG 却忘了定义 USE_DEBUG——未定义宏在 #if 里当 0，调试代码静默消失。',
        '同一功能在 #ifdef 里写两份几乎相同的代码，改一处漏一处——尽量只隔离"差异点"。',
        '宏配置散落各处，应集中在一个 config.h 统一管理。',
      ],
      quiz: [
        { q: '#if 中引用了未定义的宏 FOO，等价于？', options: ['编译报错', '#if 0（假）', '#if 1（真）', '随机'], answer: 1, explain: '预处理把未定义标识符当 0——这正是"调试开关忘定义"事故的机制。' },
        { q: '#error 指令的作用时机？', options: ['运行时报错', '预处理阶段直接终止编译并提示', '链接报错', '输出日志继续'], answer: 1, explain: '配置检查在编译期完成——"尽早失败"是工程铁律。' },
      ],
      extend: '代码库"工程模板"的 config.h 展示了调试开关、日志级别、功能裁剪的集中式配置范式。',
    },
    {
      id: 'c-em17', chapter: 'ch4', track: 'emb',
      title: '编译四阶段：从 .c 到 .bin',
      doc: `gcc 编译一条命令背后有四个阶段，理解它们才能看懂链接错误：
1. **预处理**（-E）：展开宏、#include、条件编译 → .i（仍是 C）。
2. **编译**（-S）：C → 汇编 → .s；语法错误、类型错误在这报。
3. **汇编**（-c）：汇编 → 目标文件 .o（机器码 + 符号表）；"未定义引用"还没爆。
4. **链接**：把所有 .o + 库拼成可执行/elf；**undefined reference / multiple definition 都在这里**——它们是"符号"问题不是语法问题。
静态库(.a)在链接时抽取用到的 .o；动态库(.so)运行时加载。嵌入式的 .ld 链接脚本决定代码放哪、栈多大——中断向量表放 flash 开头就是它规定的。`,
      code: `gcc -E main.c -o main.i    /* 1 预处理 */
gcc -S main.i -o main.s    /* 2 编译为汇编 */
gcc -c main.s -o main.o    /* 3 汇编为目标文件 */
gcc main.o uart.o -T stm32.ld -o fw.elf   /* 4 链接 */

arm-none-eabi-objdump -d fw.elf   /* 反汇编看真相 */
arm-none-eabi-size fw.elf         /* text(data+code)/bss 占用 */`,
      pitfalls: [
        'undefined reference 却觉得"我明明定义了"——多半是没把 .c 加进构建，或 C++ 混编没 extern "C"。',
        '头文件里的 inline/模板在 C 里写错位置，编译过链接挂。',
        '不看 size 输出，flash 超了才发现——编译完先 size 一下是肌肉记忆。',
      ],
      quiz: [
        { q: 'undefined reference to `uart_init` 发生在哪个阶段？', options: ['预处理', '编译', '汇编', '链接'], answer: 3, explain: '符号解析只在链接阶段；编译阶段只要声明存在就放行。' },
        { q: '想知道固件占了多少 flash/RAM，看什么？', options: ['文件大小', 'size 输出的 text/bss', '行数', 'bin 的行数'], answer: 1, explain: 'text≈flash 占用（代码+已初始化数据），bss≈RAM 占用（零初始化全局+栈外空间）。' },
      ],
      extend: '「计算机底层认知」第 7 章（从源码到芯片）把四阶段与 CPU 执行串成完整链路。',
    },
    {
      id: 'c-em18', chapter: 'ch4', track: 'emb',
      title: 'Makefile 与构建系统入门',
      doc: `Makefile 描述"目标：依赖 + 命令"，make 只重建**改过的部分**：
\`\`\`
target: deps
<TAB>command
\`\`\`
三个自动变量必须会：\`$@\` 目标名、\`$<\` 第一个依赖、\`$^\` 全部依赖。模式规则 \`%.o: %.c\` 一条规则管所有 .c。
**变量**：\`CFLAGS = -Wall -O2 -std=c11\`；\`?= 追加 +=\`。**伪目标**：\`.PHONY: clean all\` 防同名文件干扰。
嵌入式实际多用 CMake/IDE 生成，但**看懂 Makefile 是底线**——报错时你要知道它到底在跑什么命令。`,
      code: `CFLAGS = -Wall -O2 -mcpu=cortex-m4 -mthumb
OBJS = $(SRCS:.c=.o)

all: fw.elf
%.o: %.c
\t$(CC) $(CFLAGS) -c $< -o $@
fw.elf: $(OBJS)
\t$(CC) $^ -T stm32.ld -o $@
.PHONY: clean
clean:
\trm -f $(OBJS) fw.elf`,
      pitfalls: [
        '命令行前必须是 TAB 不是空格——"missing separator"九成是这个。',
        '头文件依赖没声明，改 .h 不触发重编，链接出的固件新旧混杂——用 -MMD 自动生成 .d 依赖。',
        'clean 写成非伪目标且目录里有 clean 文件，make clean 会"无事可做"。',
      ],
      quiz: [
        { q: 'Makefile 自动变量 $< 的含义？', options: ['全部依赖', '第一个依赖', '目标名', '上次的命令'], answer: 1, explain: '$< 是第一个前置依赖（模式规则里就是那个 .c），$@ 是目标，$^ 是全部依赖。' },
        { q: '改了 a.h 但 make 没重编相关 .c，最可能原因？', options: ['make 坏了', '依赖关系里没写 a.h（缺 .d 自动依赖）', '编译器缓存', '权限问题'], answer: 1, explain: 'make 只看显式声明的依赖；.h 不在规则里就不会触发重编。' },
      ],
      extend: 'ESP32 的 idf.py 底层是 CMake + Ninja，工程库 p07 里展示了组件化 CMakeLists 的结构。',
    },

    /* ================= 第五章 ================= */
    {
      id: 'c-em19', chapter: 'ch5', track: 'emb',
      title: '寄存器操作：读改写与原子性',
      doc: `裸机的核心动作是"读改写"寄存器：\`REG |= BIT;\` 展开为 读→改→写 三步。**三步之间若被中断插队，且中断也改同一寄存器，写回就会覆盖中断的修改**——这是隐形 bug 之王。
对策按优先级：
1. 用芯片的**原子置位/清零寄存器**（STM32 的 BSRR：写 1 置位/清零，单条指令完成，无读改写）。
2. 临界区：关中断 → 读改写 → 开中断。
3. 把"主循环与中断都碰的寄存器"尽量留给中断独占。
**位带**（STM32 F1/F4）：把一个位映射成独立地址，读写那个地址就是读写位，天然原子。`,
      code: `/* 危险：中断里也改 REG 时，读改写互相覆盖 */
REG |= BIT(3);

/* 方案 1：BSRR 原子操作（STM32） */
GPIOA->BSRR = BIT(3);          /* 置位 */
GPIOA->BSRR = BIT(3) << 16;    /* 清零 */

/* 方案 2：临界区 */
uint32_t prim = __get_PRIMASK();
__disable_irq();
REG |= BIT(3);
if (!prim) __enable_irq();`,
      pitfalls: [
        '以为 |= 是一条指令——它至少三条，中断可插在任意两条之间。',
        '临界区里直接 __enable_irq()，把"进入前本来就关中断"的状态破坏了——保存再恢复。',
        '临界区太长，中断响应延迟超标——只包住真正共享的几行。',
      ],
      quiz: [
        { q: 'GPIOA->BSRR = BIT(3) 与 GPIOA->ODR |= BIT(3) 的本质区别？', options: ['没区别', 'BSRR 写 1 即生效（原子），ODR |= 需读改写（可被中断打断）', 'BSRR 更慢', 'ODR 只能读'], answer: 1, explain: 'BSRR 是硬件设计的"无读改写"接口——这就是为什么 HAL 用它实现原子翻转。' },
        { q: '进入临界区前为什么要保存 PRIMASK？', options: ['习惯', '恢复调用者之前的中断状态，支持临界区嵌套', '提高速度', '没意义'], answer: 1, explain: '如果调用前中断本来就关着，退出时无条件开中断会破坏保护——保存/恢复才是嵌套安全的。' },
      ],
      extend: '代码库"GPIO 寄存器直操"模块给出了 BSRR/位带的完整对照实现，配合 c19 案例练手。',
    },
    {
      id: 'c-em20', chapter: 'ch5', track: 'emb',
      title: '中断安全：共享数据与临界区',
      doc: `主循环与中断共享的数据 = 并发问题。规则按数据大小分级：
- **8/16/32 位对齐标量**：单条指令读写，天然原子，直接共享（但要 volatile）。
- **多字节结构体/数组/64 位**：读写可被撕裂（读到一半被改）——必须临界区，或"关中断快照"：先把数据拷进局部，再出临界区慢慢处理。
- **复合操作**：\`cnt++\` 是 读+改+写 三步，即使 cnt 是 32 位也不原子—— ++/-- 同样要保护。
**排队化**思想最好：中断只把数据塞进环形缓冲/队列，主循环慢慢消化——共享面缩到队列一个点，天然安全（FreeRTOS 的 FromISR API 就是这套）。`,
      code: `/* 撕裂风险：64 位时间戳 */
extern volatile uint64_t g_tick;   /* SysTick 里 ++ */

uint64_t safe_get(void) {
  uint32_t prim = __get_PRIMASK();
  __disable_irq();
  uint64_t t = g_tick;             /* 两条指令读取，中间不能被撕 */
  if (!prim) __enable_irq();
  return t;
}

/* 更优：中断只压队列，主循环出队处理 */`,
      pitfalls: [
        '以为 volatile 能保证原子——它只防优化，不防撕裂。',
        '在中断里调用非可重入函数（printf/malloc），重入即坏。',
        '临界区里调用可能阻塞的函数（等待标志），直接死锁。',
      ],
      quiz: [
        { q: 'volatile uint32_t cnt; 中断里 cnt++，主循环也 cnt++，问题在哪？', options: ['没问题', 'cnt++ 非原子，读改写被互相打断会丢更新', 'cnt 要改 64 位', 'volatile 反而有害'], answer: 1, explain: '++ 是三步操作，两个上下文并发执行会互相覆盖——需要临界区或改用队列/原子指令。' },
        { q: '"关中断快照"手法适用于？', options: ['读多字节共享数据', '提高中断优先级', '省电', '加速编译'], answer: 0, explain: '先把可能被撕裂的共享数据拷贝到局部（临界区内完成），出临界区后安全使用。' },
      ],
      extend: '代码库 rtos 分类的"队列与信号量"模块展示了把"共享数据"变成"数据流"的标准解法。',
    },
    {
      id: 'c-em21', chapter: 'ch5', track: 'emb',
      title: '结构体对齐与内存布局',
      doc: `编译器会在结构体成员之间**插空**（padding），使每个成员落在自身大小的整数倍地址上——CPU 访问对齐数据更快，部分硬件甚至直接总线错误。
\`struct {uint8_t a; uint32_t b; uint8_t c;}\` 实占 12 字节不是 6！重排成员（小的扎堆）可省内存。
**取消对齐**：\`__attribute__((packed))\`——解析通信协议时必须用，否则成员偏移和协议字节序对不上。
**offsetof** 求成员偏移，配合"结构体首地址强转"是寄存器映射的惯用招（STM32 头文件的 GPIO_TypeDef 就这么用）。
**union** 共用内存：寄存器值整体读写与按位字段操作自由切换。`,
      code: `struct raw { uint8_t a; uint32_t b; };          /* 8 字节（3 pad） */
struct __attribute__((packed)) pkt {             /* 协议解析用 */
  uint8_t  head;
  uint32_t len;      /* 无 pad：偏移 1 */
  uint8_t  crc;
};                                               /* 6 字节 */

#define GPIOA ((GPIO_TypeDef *) 0x40020000)      /* 寄存器块映射 */
GPIOA->ODR |= 1;`,
      pitfalls: [
        '跨平台/跨编译器时结构体布局不同，直接 memcmp/memcpy 传输会错位——协议一律 packed + 显式序列化。',
        'packed 成员地址不对齐，取地址后按普通指针访问在 Cortex-M0 上 HardFault。',
        '把指向 packed 成员的指针传给要求对齐的库函数。',
      ],
      quiz: [
        { q: 'struct {char a; int b; short c;}（无 packed）在 32 位机占多少字节？', options: ['7', '8', '12', '4'], answer: 2, explain: 'a 占 1+3pad，b 占 4，c 占 2+2pad 凑整体对齐 → 12 字节。重排成 int/short/char 可缩到 8。' },
        { q: '解析"1 字节头 + 4 字节长度 + 数据"的协议帧，正确姿势？', options: ['普通结构体强转指针', 'packed 结构体或逐字节 memcpy 组装', 'union 覆盖', 'sprintf'], answer: 1, explain: '要么 packed 让偏移与协议一致，要么逐字段组装——普通结构体有 pad 会错位。' },
      ],
      extend: '「电路训练场」RS485/Modbus 案例的帧解析与代码库"协议帧解析器"都按 packed + 校验的流程实现。',
    },
    {
      id: 'c-em22', chapter: 'ch5', track: 'emb',
      title: '状态机：嵌入式的万能模式',
      doc: `凡是"同一件事在不同时刻要做不同反应"的逻辑，都用**有限状态机（FSM）**：明确状态集合 + 事件 + 转移规则。
写法三段式：
1. enum 列状态；2. switch(state) 分派处理；3. 每个状态里处理事件并迁移。
好处：**任何时刻系统行为可预测**，新需求 = 加状态/加转移，不动老逻辑；调试时打印 state 一眼定位卡在哪。
按键（按下/长按/连击）、通信协议（等帧头/收长度/收数据/校验）、设备流程（初始化/自检/运行/故障）全是状态机。
**分层**：外层流程状态机 + 内层协议状态机，各管各的。`,
      code: `typedef enum { K_IDLE, K_DOWN, K_LONG } kstate_t;
kstate_t st = K_IDLE;
uint16_t t = 0;

void key_poll(void) {                       /* 10ms 调一次 */
  uint8_t press = !HAL_GPIO_ReadPin(KEY);
  switch (st) {
    case K_IDLE: if (press) { st = K_DOWN; t = 0; } break;
    case K_DOWN:
      if (!press) { short_press(); st = K_IDLE; }
      else if (++t >= 100) { st = K_LONG; }
      break;
    case K_LONG:
      if (!press) { st = K_IDLE; }
      break;
  }
}`,
      pitfalls: [
        '用 if-else 嵌套堆逻辑，不定义状态——三个月后自己都看不懂转移关系。',
        '状态枚举加新值但某分支没覆盖又不写 default，跑飞。',
        '转移逻辑里直接做耗时动作（延时等待），阻塞整个轮询——状态机要"来事件快进快出"。',
      ],
      quiz: [
        { q: '按键"长按后不重复触发短按"，上面代码靠什么保证？', options: ['延时去抖', '进入 K_LONG 后不再迁移到 short_press 分支', '硬件消抖', '看门狗'], answer: 1, explain: 'K_LONG 状态下松手只回 IDLE，不再触发 short_press——状态本身就是记录。' },
        { q: '状态机最 debug 友好的做法？', options: ['单步汇编', '打印/记录状态与事件序列', '多加延时', '加大栈'], answer: 1, explain: '日志里 "EVT_RX → ST_RECV → ST_CHECK" 一串，协议卡在哪一目了然。' },
      ],
      extend: '代码库"按键状态机消抖"与"协议帧解析器"两个模块分别是输入类与通信类状态机的完整实现。',
    },
    {
      id: 'c-em23', chapter: 'ch5', track: 'emb',
      title: '环形缓冲区：中断与主循环的桥梁',
      doc: `FIFO（先入先出）是嵌入式数据流的标配：中断往里写，主循环往外读，两个下标互不阻塞。
实现要点：
- **head 写指针（生产者改），tail 读指针（消费者改）**——各自只改自己的下标，天然免锁。
- 判空 head==tail；判满 (head+1)%size == tail（牺牲一格），或额外维护 count（要临界区）。
- 容量取 2 的幂，\`% size\` 可写成 \`& (size-1)\`，更快。
- 数据结构放全局/静态，**size 按最大突发流量算**（如串口 115200 下 10ms 突发 ≈ 116 字节，取 256）。`,
      code: `#define FIFO_SZ 256u                 /* 2 的幂 */
static uint8_t  rb[FIFO_SZ];
static volatile uint16_t rh, rt;     /* 读下标（主循环改）/写下标（中断改） */

uint8_t rb_pop(void) {               /* 主循环：出队 */
  uint8_t v = rb[rt];
  rt = (rt + 1) & (FIFO_SZ - 1);
  return v;
}
void rb_push(uint8_t b) {            /* 中断：入队 */
  uint16_t next = (rh + 1) & (FIFO_SZ - 1);
  if (next != rt) { rb[rh] = b; rh = next; }   /* 满则丢弃 */
}
uint16_t rb_used(void) { return (rh - rt) & (FIFO_SZ - 1); }`,
      pitfalls: [
        '容量不是 2 的幂还用 & 掩码——直接错位。',
        'push 在关中断区调用自己又开中断，破坏保护。',
        'used()/free() 在 push/pop 并发时只是"近似值"，用它做阻塞判断会偶发出错——单字节模式按空/满判断。',
      ],
      quiz: [
        { q: '环形缓冲"牺牲一格"判满的公式？', options: ['head == tail', '(head+1)%size == tail', 'head+tail == size', 'head > tail'], answer: 1, explain: 'head 追上 tail 前一格即满；空是 head==tail——用"空满不同判据"省掉 count 变量及其锁。' },
        { q: '为什么 head/tail 声明 volatile 就能单生产者单消费者免锁？', options: ['volatile 原子', '各自只写自己的下标，对方只读，且 volatile 保证读最新', '编译器加锁', '不是，必须关中断'], answer: 1, explain: 'SRSW（单读单写）模式下每个下标只有一个写者，写宽度 ≤32 位原子；volatile 保证可见性。' },
      ],
      extend: '代码库"DMA+空闲中断不定长接收"与"环形缓冲 FIFO"模块是本节的完整工程版，配合 c52 串口案例。',
    },
    {
      id: 'c-em24', chapter: 'ch5', track: 'emb',
      title: '可移植性与防御式编程',
      doc: `让代码跨芯片/跨编译器都稳：
- **定宽类型** uint8_t/int32_t 代替 int/long；大小用 \`sizeof\` 不手写。
- **字符集**：char 只做文本，字节数据用 uint8_t。
- **断言**：\`assert(ptr)\` 调试期抓非法参数；发布版用自定义 \`if (!ptr) return -1;\`。
- **防御式判断**：对外接口第一件事检查参数（指针非空、长度合理、枚举在范围内）。
- **编译警告零容忍**：-Wall -Wextra 全开，每条警告都当 bug 修。
- **静态分析**：clang-tidy/cppcheck 抓"未初始化、越界、泄漏"，比肉眼可靠。
- 版本管理 + 统一风格（.clang-format）——团队协作的地基。`,
      code: `int parse(const uint8_t *p, uint16_t len) {
  if (!p || len < 4)      return -1;   /* 防御 */
  if (p[0] != 0xAA)       return -2;
  uint16_t plen = p[1] | (p[2] << 8);
  if (plen > len - 4)     return -3;   /* 长度防越界 */
  /* ... */
  return 0;
}
_Static_assert(sizeof(float) == 4, "float 必须是 4 字节");`,
      pitfalls: [
        '相信"我们平台 float 一定是 4 字节"——static_assert 把假设钉死，换平台立刻暴露。',
        '警告"先放着"——-Wuninitialized 级别的告警往往就是真 bug。',
        '防御检查只写一半（查了指针忘了长度）。',
      ],
      quiz: [
        { q: '_Static_assert(sizeof(int)==4) 在 int 为 2 字节的平台上？', options: ['正常通过', '编译期报错', '运行期报错', '被忽略'], answer: 1, explain: '静态断言在编译期判定——假设不成立直接不让编译，符合"尽早失败"。' },
        { q: '对外接口参数校验的顺序建议？', options: ['随机', '先判空/长度等"快速失败"项，再业务校验', '只查一个', '不查'], answer: 1, explain: 'guard clause 早退，主逻辑不被防御代码淹没。' },
      ],
      extend: '代码库所有模块的入参检查 + 错误码风格就是本节标准；配合 CMake 的 -Wall -Werror 体验零警告工程。',
    },

    /* ================= 第六章（非嵌入式通用） ================= */
    {
      id: 'c-ge01', chapter: 'ch6', track: 'general',
      title: '[通用] 标准库精要：stdio / stdlib / string',
      doc: `PC/服务器方向 C 的日常三库：
**stdio**：printf 家族的格式语法（%d %s %5.2f %-10s %ld）要熟练；fopen/fread/fwrite/fclose 文本与二进制模式（"r"/"rb"）区别；缓冲机制（行缓冲/全缓冲）——printf 不加 \\n 可能"消失"在缓冲里。
**stdlib**：malloc/free/calloc/realloc；strtol/strtod（**带错误检查的转换**，比 atoi 可靠）；qsort/bsearch 通用排序二分；exit/atexit。
**string**：strcpy/strcat 都是不设防的（用 strncpy/strncat 或 snprintf）；memcmp 比较任意内存；memmove 处理重叠区域（memcpy 不保证）。
**snprintf 是最值得养成的习惯**：格式化 + 长度上限一步到位。`,
      code: `char buf[64];
int n = snprintf(buf, sizeof(buf), "temp=%.2f,hum=%d%%", t, h);
if (n < 0 || (size_t)n >= sizeof(buf)) { /* 截断处理 */ }

long v = strtol(s, &end, 10);            /* 带校验的转换 */
if (end == s) { /* 没解析到数字 */ }

qsort(arr, n, sizeof(arr[0]), cmp_fn);   /* 通用排序 */`,
      pitfalls: [
        'gets/sprintf/strcpy 三大不安全函数——永远用 fgets/snprintf/strncpy 替代。',
        'qsort 的比较函数返回值符号写反，"排序"变"乱序"。',
        'printf("%s", NULL) 未定义行为——先判空。',
      ],
      quiz: [
        { q: 'printf 输出"消失"最可能因为？', options: ['代码错误', '全缓冲下没换行也没 fflush，还留在缓冲区', '终端坏', '优化'], answer: 1, explain: 'stdout 指向文件/管道时是全缓冲，程序异常退出（不 flush）就丢——或显式 fflush(stdout)。' },
        { q: '把字符串转成带错误检查的长整数用？', options: ['atoi', 'strtol', 'sprintf', 'sscanf'], answer: 1, explain: 'strtol 提供 endptr 与 errno 检查；atoi 出错静默返回 0。' },
      ],
      extend: '与嵌入式章节对照：单片机上这些库被裁剪/重定向（printf 走串口），原理一致实现不同。',
    },
    {
      id: 'c-ge02', chapter: 'ch6', track: 'general',
      title: '[通用] 文件 I/O 与命令行参数',
      doc: `文件操作完整姿势：
\`FILE *f = fopen(path, "rb")\` → 判 NULL → 读写 → \`fclose\`。二进制读 fread 返回**成功项数**，用它判断是否读完。
文本处理经典循环：fgets 行读 → sscanf/strtok 解析 → 处理。
**命令行**：main(int argc, char *argv[])，argv[0] 是程序名，参数从 argv[1]；参数本质是字符串，数字要 strtol 转。
**错误处理**：errno + perror("open") 输出可读错误；打开失败千万别继续用 NULL 的 FILE*。
大文件用 fseek/ftell 定位（或 fseeko/ftello 支持大文件）。`,
      code: `int main(int argc, char *argv[]) {
  if (argc != 2) { fprintf(stderr, "usage: %s <file>\\n", argv[0]); return 1; }
  FILE *f = fopen(argv[1], "rb");
  if (!f) { perror("open"); return 1; }
  uint8_t buf[256]; size_t n;
  while ((n = fread(buf, 1, sizeof(buf), f)) > 0) process(buf, n);
  fclose(f);
  return 0;
}`,
      pitfalls: [
        'fopen 后不判 NULL 直接读写——段错误第一来源。',
        'fgets 的行含 "\\n" 忘去掉，strcmp 比较永远不等。',
        '文本模式 vs 二进制模式（Windows 下 "\\n" 转换）——跨平台处理数据文件一律 "rb"/"wb"。',
      ],
      quiz: [
        { q: 'fread 返回值的意义？', options: ['字节数', '成功读到的"元素个数"', '错误码', '剩余大小'], answer: 1, explain: 'fread(buf, size, nmemb, f) 返回完整读到的 nmemb 个数；用它判断 EOF/短读。' },
        { q: 'argv 里的 "123" 要参与算术，正确做法？', options: ['直接用', '(int)argv[1]', 'strtol(argv[1], NULL, 10)', 'atoi 就行不用管错误'], answer: 2, explain: 'argv 是字符串，strtol 才能带错误检查地转换。' },
      ],
      extend: '工具链脚本（固件打包、crc 校验）都是这类"小而硬"的文件处理程序，写两个就熟。',
    },
    {
      id: 'c-ge03', chapter: 'ch6', track: 'general',
      title: '[通用] 手写数据结构：链表与哈希思想',
      doc: `面试与通用开发的双雄：
**单链表**：节点 struct node { int val; struct node *next; }。头插 O(1)、按位删改 O(n)。关键动作：**遍历用二级指针**可把"头节点特殊分支"消掉（Linus 式优雅）：
\`struct node **pp = &head; while (*pp != target) pp = &(*pp)->next; *pp = target->next;\`
**哈希思想**：数组 + 哈希函数 + 链地址法解决冲突。C 里没有现成 map，理解"哈希 = 下标计算 + 冲突处理"就能手搓简易版。
**双向链表**： intrusive（侵入式，节点内嵌 list_head）是 Linux 内核风格——通用、零额外分配，嵌入式也能用。`,
      code: `struct node { int val; struct node *next; };

void remove(struct node **pp, struct node *t) {
  while (*pp && *pp != t) pp = &(*pp)->next;
  if (*pp) { *pp = t->next; free(t); }   /* 头/中/尾一套代码 */
}

/* 简易哈希 */
uint32_t h = 0; for (char *s = str; *s; s++) h = h * 31 + *s;
struct node *slot = buckets[h % NBUCKET];`,
      pitfalls: [
        '删除节点时只写 head = head->next，漏掉"删中间"分支——二级指针写法天然统一。',
        '哈希扩容忘 rehash，负载率上去后性能塌方。',
        '链表操作断链（改 next 顺序错误）——画图！先画指针再写代码。',
      ],
      quiz: [
        { q: '二级指针遍历删节点的最大好处？', options: ['更快', '统一处理"删头/删中间/删尾"，无特殊分支', '省内存', '支持并发'], answer: 1, explain: '&(*pp)->next 把"前驱的 next 字段地址"抽象出来，头节点也是一个 next。' },
        { q: '链地址法哈希中，冲突的元素去哪？', options: ['下一个空槽', '同一下标的链表尾部', '丢弃', '扩容'], answer: 1, explain: '同桶挂链；查到桶后沿链比较键。' },
      ],
      extend: 'Linux 内核的 list_head / hlist_head 是工业级实现，读懂它链表就毕业了。',
    },
    {
      id: 'c-ge04', chapter: 'ch6', track: 'general',
      title: '[通用] 进阶话题：union、位域与泛型技巧',
      doc: `**union**：多成员共享同一块内存，大小 = 最大成员。用途：类型双关（寄存器 32 位值 ↔ 4 字节拆分）、协议变体、节省内存。注意读取"非最后写入成员"是实现定义行为——嵌入式里对硬件这样做是惯例，通用代码要小心。
**位域**：struct { uint32_t en:1; mode:3; } 按位分配——可读性好，但**布局由实现定义**，跨平台协议解析不要用位域（用掩码）。
**泛型技巧**：void* + 元素大小（qsort 模式）；宏函数模拟重载；_Generic（C11）按类型选择表达式。
**函数式小技巧**：typedef 回调 + 数据指针（context 参数），C 也能写出高阶感。`,
      code: `union reg {
  uint32_t all;
  struct { uint32_t mode:4; uint32_t en:1; uint32_t rsv:27; };
} r;
r.all = readl(REG); r.en = 1; writel(REG, r.all);

/* _Generic：按类型分派 */
#define TYPEOF(x) _Generic((x), int: "int", double: "double", default: "other")`,
      pitfalls: [
        '位域跨字节序平台直接传输——布局不保证，协议层禁用。',
        'union 写 float 读 uint32_t 在通用 C 里是未定义（嵌入式靠硬件约定），严格场景用 memcpy。',
        '宏泛型膨胀后不可调试——复杂泛型换 void*+size 方案。',
      ],
      quiz: [
        { q: 'union { uint32_t u; float f; } 写 f 读 u，按严格 C 标准？', options: ['合法', '未定义（类型双关违规）', '恒为 0', '编译错误'], answer: 1, explain: '严格标准下读非活跃成员未定义；嵌入式约定俗成可用，通用代码用 memcpy 安全。' },
        { q: '为什么协议解析不用位域？', options: ['慢', '成员布局与位序由实现定义，跨平台不可靠', '费内存', '编译不支持'], answer: 1, explain: '位域的分配顺序/对齐是编译器私事；协议要求逐字节确定——用掩码。' },
      ],
      extend: 'STM32 头文件里大量 union+位域的寄存器定义（如 TIM->CCMR1），读芯片手册时对照体验。',
    },
  ],
} as const
