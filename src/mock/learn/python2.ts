/**
 * Python 大全 · 下卷：第四章 嵌入式实战 / 第五章 工程素养
 */
export const pythonPart2 = {
  chapters: [
    { id: 'py4', title: '嵌入式实战', brief: '把 Python 变成嵌入式开发的瑞士军刀：串口、MQTT、数据处理、可视化、打包。' },
    { id: 'py5', title: '工程素养', brief: '测试、类型注解、并发——从"能跑的脚本"到"可靠的工具"。' },
  ],
  sections: [
    /* ================= 第四章 ================= */
    {
      id: 'py13', chapter: 'py4',
      title: '串口通信 pyserial：上位机的手',
      doc: `pyserial 是 Python 连接硬件的桥头堡。核心四步：枚举端口 → 打开配置 → 读写 → 关闭。
**配置三要素**：波特率、超时（timeout，读阻塞上限秒）、write_timeout。**read(n) 超时返回实际读到的**，不是报错——循环读要靠返回值判断。
**行读取**：readline() 等 \\n；多数单片机用 \\r\\n，要 strip。**二进制**：read(size) + bytes 方法。
**帧同步套路**（配合生成器一节）：缓冲累加 → 找帧头 → 按长度取帧 → 校验。
**枚举串口**：serial.tools.list_ports.comports()——做端口下拉框。`,
      code: `import serial, serial.tools.list_ports

ports = [p.device for p in serial.tools.list_ports.comports()]
ser = serial.Serial(ports[0], 115200, timeout=0.1)   # 100ms 超时

ser.write(b"AT\\r\\n")
resp = ser.readline().decode(errors="ignore").strip()

buf = b""
def poll():
    global buf
    buf += ser.read(128)                 # 非阻塞累积
    while b"\\xAA" in buf:                # 帧头同步
        i = buf.index(b"\\xAA")
        if len(buf) - i >= 8:            # 帧长足够
            frame, buf = buf[i+8:], buf[i+8:]
            handle(frame[:8])`,
      pitfalls: [
        'Windows 下串口被其他软件（串口助手）占用，PermissionError——先关别的程序。',
        'timeout 不设或设 None，read 永久阻塞卡死界面。',
        '热插拔后句柄失效 SerialException——重开逻辑 + try 包住每次读写。',
      ],
      quiz: [
        { q: 'serial.Serial(timeout=0.5) 中 timeout 的语义？', options: ['写超时', 'read 阻塞最长 0.5 秒，到期返回已读到的部分', '连接超时', '重试间隔'], answer: 1, explain: 'read 到期即返（可能少于 n 字节）；None 永久阻塞，0 立即返回。' },
        { q: 'readline() 读到 b"AT+OK\\r\\n" 后通常？', options: ['直接用', 'decode + strip 再解析', 'hexlify', '不用处理'], answer: 1, explain: 'bytes→str，再去掉行尾空白，才能 strcmp/startswith。' },
      ],
      extend: '项目库 p07 的 PC 端数据小工具与代码库"AT 指令引擎"的 Python 版都以本节为底座。',
    },
    {
      id: 'py14', chapter: 'py4',
      title: 'MQTT 物联网 paho：设备与云的桥',
      doc: `MQTT 是物联网消息总线：发布/订阅模型，主题分层 \`home/room1/temp\`，通配符 \`+\` 单层、\`#\` 多层。
paho-mqtt 流程：Client → 连接（可选用户名密码/TLS）→ **loop_start() 后台线程收发** → publish / on_message 回调 → 断开。
**QoS**：0 至多一次、1 至少一次（可能重复）、2 恰好一次（慢）。传感器上报 QoS0/1 足够。
**遗嘱（LWT）**：连接异常掉线时代发的消息——设备"下线通知"的标准做法。
**保留消息**：retain=True，新订阅者立即收到最后一条——状态同步利器。`,
      code: `import paho.mqtt.client as mqtt

def on_connect(c, u, flags, rc):
    c.subscribe("home/+/cmd", qos=1)     # 单层通配
def on_message(c, u, msg):
    print(msg.topic, msg.payload.decode())

cli = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
cli.on_connect, cli.on_message = on_connect, on_message
cli.connect("broker.local", 1883, keepalive=60)
cli.loop_start()                          # 后台网络线程
cli.publish("home/room1/temp", "23.5", qos=1)`,
      pitfalls: [
        '忘 loop_start()/loop_forever()，消息永远发不出去也不收。',
        'on_message 里做耗时处理阻塞网络线程——塞队列丢给别的线程/进程。',
        '主题通配符用在 publish（非法）——通配符只能订阅。',
      ],
      quiz: [
        { q: '订阅 "sensor/+/temp" 能匹配？', options: ['sensor/room1/temp', 'sensor/temp', 'sensor/a/b/temp', '全部'], answer: 0, explain: '+ 恰好一层；# 匹配多层且只能放末尾。' },
        { q: '设备异常断线时让 broker 代发 "offline"，靠？', options: ['retain', '遗嘱消息 LWT', 'QoS2', 'keepalive'], answer: 1, explain: 'will_set 预设遗嘱；retain 让后订阅者也能看到当前在线状态。' },
      ],
      extend: '项目库 p07 的"WiFi 上云"阶段用的正是 MQTT + 遗嘱 + 保留消息三件套，Python 端与本节代码同构。',
    },
    {
      id: 'py15', chapter: 'py4',
      title: '数据处理 NumPy：传感器数据加工厂',
      doc: `NumPy 的 ndarray 是**同类型连续内存**数组，向量化运算比 for 快 10~100 倍。
核心操作：\`np.array(list)\` 创建；\`a.mean()/std()/max()\` 统计；切片视图（不拷贝！）；布尔掩码 \`a[a > 100]\` 一步过滤。
**传感数据处理三板斧**：
1. 滑动均值：\`np.convolve(x, np.ones(N)/N, "valid")\`。
2. 去野点：中位数 \`np.median\` 或 3σ 过滤。
3. FFT 频谱：\`np.fft.rfft\` 看振动/噪声频率成分。
**CSV 进出**：\`np.loadtxt("log.csv", delimiter=",", skiprows=1)\`；大数据用 pandas（基于 numpy）。`,
      code: `import numpy as np

raw = np.loadtxt("adc_log.csv", delimiter=",", skiprows=1)
v = raw[:, 1] * 3.3 / 4095               # 第 2 列转电压

smooth = np.convolve(v, np.ones(16) / 16, mode="valid")
outlier = np.abs(v - v.mean()) > 3 * v.std()
clean = v[~outlier]                       # 3σ 去野点

spec = np.abs(np.fft.rfft(clean))         # 幅度谱
print("主频:", np.argmax(spec) * 10, "Hz")`,
      pitfalls: [
        '把 for 循环逐元素算写成 Python 循环——放弃向量化等于放弃 NumPy。',
        '切片是视图：修改切片会改原数组，需要独立时 .copy()。',
        '整数数组溢出静默回绕（定宽 int32）——要大数用 int64/float。',
      ],
      quiz: [
        { q: 'a[a > 100] 的含义？', options: ['取下标 100', '布尔掩码：返回所有大于 100 的元素', '报错', '把 >100 的置 100'], answer: 1, explain: '布尔数组当索引 = 过滤，这是 NumPy 最常用的"查询"。' },
        { q: 'np.convolve(x, np.ones(16)/16, "valid") 实现的是？', options: ['FFT', '滑动均值滤波', '中位数滤波', '微分'], answer: 1, explain: '与全 1 核卷积即滑动平均；valid 模式只输出完全重叠区。' },
      ],
      extend: '「代码库」算法类的滑动均值/一阶低通（C 版）与 NumPy 版对照，能看清"向量化"到底省了什么。',
    },
    {
      id: 'py16', chapter: 'py4',
      title: '可视化 matplotlib：让数据开口说话',
      doc: `matplotlib 两层用法：**pyplot 快画**（脚本/调试）与 **Figure/Axes 面向对象**（工具/报告，推荐）。
常用图形：plot 折线（时序）、scatter 散点（相关性）、hist 直方图（分布）、bar 柱状、imshow 热图（矩阵/频谱）。
**实时曲线**（串口调试最爱）：\`FuncAnimation\` 或循环里 \`line.set_data(); ax.relim(); ax.autoscale_view(); plt.pause(0.01)\`。
**必配要素**：xlabel/ylabel、title、legend 多线、grid。保存 \`fig.savefig("out.png", dpi=150)\`。
中文显示：\`plt.rcParams["font.sans-serif"] = ["SimHei"]\` + \`axes.unicode_minus=False\`。`,
      code: `import matplotlib.pyplot as plt
plt.rcParams["font.sans-serif"] = ["SimHei"]

fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(7, 6))
ax1.plot(t, raw, alpha=0.4, label="原始")
ax1.plot(t, smooth, label="滑动均值")
ax1.legend(); ax1.set_xlabel("时间 s"); ax1.set_ylabel("电压 V")
ax2.hist(clean - clean.mean(), bins=50)
ax2.set_title("噪声分布")
fig.tight_layout(); fig.savefig("report.png", dpi=150)`,
      pitfalls: [
        '交互模式 plt.show() 阻塞脚本——自动化里用 savefig + plt.close(fig)。',
        '在循环里 plt.plot() 叠加不清空，图越来越卡——用 set_data 更新同一条线。',
        '中文字体没设置显示方块；Linux 服务器无 SimHei 需装字体或用英文。',
      ],
      quiz: [
        { q: '实时刷新曲线的正确姿势？', options: ['循环里新建 figure', '复用 Line2D 用 set_data 更新', '每帧 savefig', '加内存'], answer: 1, explain: '新建 figure 每次都产生窗口对象，泄漏且卡死；set_data + relim 才是 60fps 路线。' },
        { q: '看一组传感器噪声的分布形态，用？', options: ['plot', 'hist', 'scatter', 'bar'], answer: 1, explain: '直方图看分布；散点看两变量相关；折线看时序。' },
      ],
      extend: '「学习周报」页的图表设计与本节的"必配要素"一致——好图 = 一眼看到结论。',
    },
    {
      id: 'py17', chapter: 'py4',
      title: '打包与分发：从脚本到工具',
      doc: `写好的脚本要给别人用，三条路：
1. **PyInstaller**：\`pyinstaller -F -w tool.py\` 打成单文件 exe（-w 不带黑窗）——发同事最省事，体积 10~40MB。
2. **入口点 + setuptools**：正式包写 pyproject.toml，\`pip install -e .\` 本地可编辑安装，\`pip install dist/xxx.whl\` 分发。
3. **zipapp / uv run**：轻量脚本分发。
**配置外置**：路径、端口、key 放 config.toml/环境变量（python-dotenv），别硬编码。
**日志**：logging 替代 print——级别、时间戳、文件输出、轮转（RotatingFileHandler）全套内置。`,
      code: `# pyproject.toml（节选）
# [project.scripts]
# mytool = "mypkg.cli:main"     # 装完直接敲 mytool

import logging
from logging.handlers import RotatingFileHandler
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[RotatingFileHandler("tool.log", maxBytes=1_000_000, backupCount=3)],
)

# 打包
# pip install pyinstaller
# pyinstaller -F -w --add-data "config.toml;." tool.py`,
      pitfalls: [
        'PyInstaller 打包后读不到资源文件——用 sys._MEIPASS 解析随包路径，别用相对路径裸读。',
        'config.toml 没打进去——--add-data 记得带，路径分隔符 Windows 是分号。',
        '把 API Key 硬编码并连 exe 一起发——key 泄漏，密钥永远走配置/环境变量。',
      ],
      quiz: [
        { q: 'PyInstaller -F 的含义？', options: ['快速模式', '打成单文件可执行', '含调试', '强制覆盖'], answer: 1, explain: '-F/--onefile 单文件；-w 隐藏控制台；--add-data 带资源。' },
        { q: '脚本给别人跑三天就丢日志，正确改造？', options: ['print 更多', 'logging + RotatingFileHandler', '截图', '数据库'], answer: 1, explain: 'logging 有级别/时间戳/轮转，是 print 的全面上位替代。' },
      ],
      extend: '「树联 app」的脚本嫁接能力正好可以挂上 PyInstaller 产物——本节成果直接融进你的调度软件。',
    },

    /* ================= 第五章 ================= */
    {
      id: 'py18', chapter: 'py5',
      title: '测试 pytest：脚本也配拥有质量',
      doc: `pytest 的哲学：**测试就是 assert**。文件 test_*.py，函数 test_*，跑 pytest 即可。
**夹具 fixture**：@pytest.fixture 提供可复用的"测试环境"（串口对象、临时文件），测试函数按名注入。
**参数化**：@pytest.mark.parametrize 一套断言跑 N 组数据——边界值全覆盖。
**串口/硬件测试思路**：无硬件时 mock（monkeypatch 替换 Serial）；有硬件时标记 @pytest.mark.hardware，平时 CI 跳过。
**TDD 简版**：先写失败的测试 → 最小实现 → 重构。解析器、CRC、状态机这类纯逻辑最值得测——bug 一抓一个准。`,
      code: `# test_parser.py
import pytest
from parser import parse_frame, CRCError

def test_normal():
    assert parse_frame(b"\\xAA\\x02\\x01\\xFE")["len"] == 2

@pytest.mark.parametrize("bad", [b"", b"\\x55", b"\\xAA"])
def test_rejects_bad(bad):
    with pytest.raises((ValueError, CRCError)):
        parse_frame(bad)

@pytest.fixture
def fake_ser(monkeypatch):
    monkeypatch.setattr("serial.Serial", lambda *a, **k: FakePort())
    return FakePort()`,
      pitfalls: [
        '测试里用 print "验证"——没有断言的测试永远绿，是自欺。',
        '测试之间共享全局状态（上个用例改的配置影响下个）——fixture 每次新建。',
        '只测正常路径——边界与异常路径（空输入/超长/非法 CRC）才是 bug 老巢。',
      ],
      quiz: [
        { q: 'pytest 通过什么判定用例成败？', options: ['返回值', 'assert 语句与预期异常', 'print 输出', 'exit 码'], answer: 1, explain: 'assert 失败即失败；pytest.raises 验证"应该抛异常"的路径。' },
        { q: 'parametrize 的价值？', options: ['提速', '同一断言覆盖多组数据/边界', '并行', '随机测试'], answer: 1, explain: '数据驱动测试：新增边界只需加一行参数。' },
      ],
      extend: '项目库每个项目的"检查点"都能转成 pytest 用例——把验收自动化是进阶标志。',
    },
    {
      id: 'py19', chapter: 'py5',
      title: '类型注解与 mypy：动态语言的护栏',
      doc: `注解不改变运行时行为，但换来三样东西：**IDE 补全起飞**、**静态检查抓低级错**、**团队接口即文档**。
基本语法：\`def f(x: int, tag: str = "a") -> list[str]:\`；变量 \`count: int = 0\`。
容器泛型：\`dict[str, int]\`、\`list[tuple[int, float]]\`；可选 \`int | None\`（新写法）或 Optional[int]。
\`typing.Protocol\` = 显式鸭子类型（结构化接口）；\`TypedDict\` 给 dict 定字段；\`Literal["on","off"]\` 限定取值。
**mypy**：\`mypy pkg/ --strict\` 从宽到严渐进收紧；CI 里挂上，低级错（None 传播、类型拼错）在提交前就死掉。`,
      code: `from typing import Literal, TypedDict

class Reading(TypedDict):
    ts: float
    temp: float

def average(readings: list[Reading]) -> float:
    if not readings:
        return 0.0
    return sum(r["temp"] for r in readings) / len(readings)

Mode = Literal["idle", "run", "fault"]
def set_mode(m: Mode) -> None: ...
set_mode("runn")        # mypy: 字面量拼写错误直接标红`,
      pitfalls: [
        '注解当运行时强制——它只是提示，传错类型 Python 照跑（mypy 才抓）。',
        '可变默认参数/可变类属性加了注解就以为安全了——那依然是引用共享问题。',
        '过度 Any 化：到处 Any 等于没注解——unknown 逐个消灭。',
      ],
      quiz: [
        { q: '类型注解在运行时起强制作用吗？', options: ['是', '否，需要 mypy 等工具静态检查', 'debug 下是', '类属性是'], answer: 1, explain: 'CPython 默认不校验注解；运行时强制要靠 pydantic/beartype 这类库。' },
        { q: 'Protocol 的意义？', options: ['网络协议', '结构化接口：有这些方法就算实现，无需显式继承', '加密', '文档'], answer: 1, explain: '既保留鸭子类型的松耦合，又获得静态检查——比 ABC 更 Python。' },
      ],
      extend: '「嵌入式语言基础」讲"类型系统三派"时用 Python(动态)/C(静态弱)/Rust(静态强) 对照——本节是动态语言补护栏的实践。',
    },
    {
      id: 'py20', chapter: 'py5',
      title: '并发三兄弟：threading / asyncio / multiprocessing',
      doc: `选型一句话：**I/O 等待多 → threading 或 asyncio；CPU 算力重 → multiprocessing**。
- **threading**：真线程但 GIL 让同一时刻只有一个线程执行 Python 字节码——适合"等多路 I/O"（多个串口、网络）；共享数据要 Lock；\`queue.Queue\` 是线程安全队列（收发解耦标配）。
- **asyncio**：单线程事件循环 + 协程，成千上万并发连接也轻松；\`async/await\` 语法；**绝不能在协程里写阻塞调用**（time.sleep/read）——用异步版（asyncio.sleep 等）。
- **multiprocessing**：多进程绕开 GIL，真并行；进程间通信 Queue/Pipe。
UI 里最常见套路：后台线程干活 + 队列回传 + 主线程刷新界面。`,
      code: `import threading, queue

q: queue.Queue[bytes] = queue.Queue()

def reader(ser):                     # 生产者线程
    while True:
        q.put(ser.read(64))          # 阻塞读，塞队列

def main():
    threading.Thread(target=reader, args=(ser,), daemon=True).start()
    while True:
        data = q.get()               # 主线程消费
        handle(data)

# asyncio 版（网络 I/O）
# async def poll(): await asyncio.sleep(0.1); await ws.send(...)`,
      pitfalls: [
        '线程里更新 GUI/主线程数据——必须经队列回主线程，直接改必出竞态。',
        'asyncio 里混入阻塞调用，整个事件循环卡死——排查"协程不动了"先查这个。',
        '多线程共享 dict/list 直接读写——用 queue 或 Lock，"Python 反正慢没事"是错觉。',
      ],
      quiz: [
        { q: 'CPU 密集型任务（图像处理）该用？', options: ['threading', 'asyncio', 'multiprocessing', '加锁'], answer: 2, explain: 'GIL 限制线程无法并行执行字节码，CPU 密集只能靠多进程绕开。' },
        { q: 'GUI + 串口收数的标准架构？', options: ['串口线程直接改界面', '串口线程 → Queue → 主线程/界面线程消费', '开十个线程', '轮询'], answer: 1, explain: '生产者-消费者把并发面收窄到一个线程安全队列，界面只管消费刷新。' },
      ],
      extend: '「树联 app」的多任务联动与这里的生产者-消费者同构；项目库 p07 上位机用了 threading + queue 的完整实现。',
    },
  ],
} as const
