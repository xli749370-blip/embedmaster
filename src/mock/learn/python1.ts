/**
 * Python 大全 · 上卷：第一章 地基 / 第二章 结构与函数 / 第三章 面向对象与进阶
 * 每节五维度：doc + code + pitfalls + quiz + extend
 */
export const pythonPart1 = {
  chapters: [
    { id: 'py1', title: '地基：语法与容器', brief: 'Python 的一切皆对象——理解动态类型和四大容器，就撑起了半门语言。' },
    { id: 'py2', title: '结构与函数', brief: '推导式、函数是一等公民、模块化与异常——写出"像 Python"的代码。' },
    { id: 'py3', title: '面向对象与进阶', brief: '类、魔术方法、生成器、装饰器——Python 的优雅都在这一章。' },
  ],
  sections: [
    /* ================= 第一章 ================= */
    {
      id: 'py01', chapter: 'py1',
      title: '变量与动态类型：名字贴在对象上',
      doc: `Python 变量是**名字 → 对象的引用**，不是"盒子"。赋值 \`a = [1,2]\` 后 \`b = a\`，b 和 a 指向**同一个列表**——改 b 就改了 a。这跟 C 的拷贝语义完全相反，是新手第一坑。
**动态类型**：名字没有类型，对象才有。\`x = 5\` 之后 \`x = "hi"\` 完全合法。
**is 与 ==**：\`==\` 比值，\`is\` 比"是不是同一个对象"。小整数缓存池（-5~256）会让 \`a is b\` 偶然为真，别依赖它。
**垃圾回收**：引用计数为主，不用手动 free——但循环引用要靠分代 GC 兜底。`,
      code: `a = [1, 2, 3]
b = a              # 同一个对象！
b.append(4)
print(a)           # [1, 2, 3, 4]

c = a[:]           # 浅拷贝：新列表
c.append(5)
print(a)           # [1, 2, 3, 4]  不受影响

x = 5; y = x
x = "hi"           # y 仍是 5——重新绑定名字，不动原对象`,
      pitfalls: [
        '默认参数用可变对象 def f(x=[])：列表跨调用共享，所有调用累积——用 None 占位再在函数内创建。',
        '以为 b = a 是拷贝——列表/字典赋值是引用，要拷贝用 a[:] 或 copy.deepcopy。',
        '用 is 比较值相等，整数缓存池让它"偶尔对"，换大数就错。',
      ],
      quiz: [
        { q: 'a = [1,2]; b = a; b += [3]; print(a) 输出？', options: ['[1, 2]', '[1, 2, 3]', '报错', '不确定'], answer: 1, explain: '+= 对列表是原地扩展，a、b 同指一个列表——所以 a 也变了。' },
        { q: '默认参数 def f(x=[]) 的问题？', options: ['语法错误', '默认列表只在函数定义时创建一次，跨调用共享', '性能差', '没有问题'], answer: 1, explain: '默认值求值一次；应写 x=None 然后函数内 if x is None: x = []。' },
      ],
      extend: '与 C 语言大全 c-em06（指针本质）对照：Python 的"引用"是把指针包装得更彻底，但没有指针运算。',
    },
    {
      id: 'py02', chapter: 'py1',
      title: '数字、字符串与 f-string',
      doc: `**数字**：int 无限精度（不会溢出！）、float 双精度。整数除法 \`/\` 得 float，地板除 \`//\` 取整除，\`%\` 取余（结果符号跟除数）。
**字符串不可变**：所有"修改"都产生新串。拼接大量字符串用 \`\`\`' '.join(list)\`\`\`，循环 += 是 O(n²)。
**f-string** 是现代格式化标准：\`f"{x:.2f}"\` 两位小数、\`f"{v:>8}"\` 右对齐宽 8、\`f"{x=}"\` 调试神器（打印变量名+值）。
**常用方法**：split/join/strip/replace/startswith/find——文本处理 90% 靠这几个。
**编码**：Python3 str 是 Unicode；处理串口/文件字节用 bytes（b"..."），两者转换 encode/decode。`,
      code: `name, temp = "room1", 23.456
print(f"{name}: {temp:.1f}°C")     # room1: 23.5°C
print(f"{temp=}")                  # temp=23.456

csv = "1,2,3".split(",")           # ['1', '2', '3']
line = ",".join(csv)               # 还原

raw = b"\\xAA\\x55"                  # bytes：串口/协议数据
print(raw.hex())                   # 'aa55'
s = raw.decode("latin1")           # bytes → str`,
      pitfalls: [
        '循环里 s += x 拼接大文本，O(n²) 卡死——用列表收集后 join。',
        '0.1 + 0.2 != 0.3（浮点二进制）——金额/精确计算用 decimal 或整数分。',
        'str 与 bytes 直接混用报 TypeError——串口读到的永远是 bytes。',
      ],
      quiz: [
        { q: '10 / 3 与 10 // 3 的结果？', options: ['3, 3', '3.333, 3', '3.333, 3.333', '3, 3.333'], answer: 1, explain: '/ 永远得 float；// 地板除得整数（向负无穷取整）。' },
        { q: '串口读到 b"AT+OK\\r\\n"，转成干净字符串的方法？', options: ['str(data)', 'data.decode().strip()', 'data.split()', 'print(data)'], answer: 1, explain: '先 decode 成 str 再 strip 去掉行尾 \\r\\n——串口文本处理的标准两步。' },
      ],
      extend: '项目库 p07 的上位机脚本用 f-string 生成传感器日志；hex/bytes 转换在 Modbus 调试里天天用。',
    },
    {
      id: 'py03', chapter: 'py1',
      title: '流程控制与真值规则',
      doc: `Python 用**缩进**表示块（4 空格是惯例）。if/elif/else、while、for-in（遍历可迭代对象，不是 C 的计数循环——计数用 range）。
**真值规则**：以下都算"假"：None、False、0、0.0、""、[]、{}、()、set()。所以 \`if items:\` 就是"列表非空"——惯用且优雅。**不要**写 \`if len(items) > 0:\` 以外的 \`if items == True:\`（双重大忌）。
**for-else**：循环正常结束（没 break）执行 else——搜索场景神器。
**三元**：\`b = "偶" if x % 2 == 0 else "奇"\`。
**match**（3.10+）：结构化模式匹配，比 switch 强得多。`,
      code: `for i, item in enumerate(items, 1):   # 带序号遍历
    print(f"{i}. {item}")

for k, v in d.items():                # 同时拿键值
    print(k, v)

def find(target, seq):
    for x in seq:
        if x == target:
            return True
    else:                             # 没 break → 没找到
        return False

match cmd.split():
    case ["led", "on"]:  led(1)
    case ["led", "off"]: led(0)
    case _: print("未知命令")`,
      pitfalls: [
        '用 range(len(list)) 再 list[i]——Python 反模式，直接 for item 或 enumerate。',
        'if x == True —— 直接 if x:；== True 会把 1 也当真且啰嗦。',
        '缩进混用 Tab 与空格 → TabError，统一 4 空格。',
      ],
      quiz: [
        { q: 'if not d: （d 是 dict）何时为真？', options: ['d 是 None', 'd 是空字典', 'd 有元素', '永远为真'], answer: 1, explain: '空容器真值为 False，not d 即 True——"空则跳过"的惯用法。' },
        { q: 'for-else 的 else 何时执行？', options: ['每次循环后', '循环被 break 时', '循环正常结束（未 break）', '循环出错时'], answer: 2, explain: 'else 挂在"没被 break"上——搜索后未命中提示不用加标志变量。' },
      ],
      extend: 'match 语法在"代码库 AT 指令引擎"的 Python 上位机版里就是命令分发的主体。',
    },
    {
      id: 'py04', chapter: 'py1',
      title: '四大容器：list / tuple / dict / set',
      doc: `选型口诀：**有序可变用 list，有序不可变用 tuple，键值映射用 dict，去重与成员判断用 set**。
- **list**：append/pop 栈用法、insert O(n)、in 成员判断 O(n)。
- **dict**：O(1) 键访问；\`d.get(k, default)\` 防 KeyError；\`d.items()\` 遍历；\`collections.defaultdict(list)\` 自动初始化桶。3.7+ 保证插入有序。
- **set**：去重 \`set(lst)\`；交并差 \`a & b / a | b / a - b\`；成员判断 O(1)——"在不在"的判断量大时把 list 换 set，性能天差地别。
- **tuple**：不可变、可做 dict 键；解包 \`a, b = b, a\` 交换、\`first, *rest = lst\`。`,
      code: `d = {"led": 1, "fan": 0}
d.get("pump", 0)                # 不存在给默认，不炸
for k, v in d.items(): pass

ids = [3, 1, 3, 2, 1]
uniq = set(ids)                 # {1, 2, 3}
common = set(ids) & {1, 2, 9}   # {1, 2}

first, *rest = [10, 20, 30]     # first=10, rest=[20,30]
key = ("sensor", 1)             # 元组可哈希，可当 dict 键`,
      pitfalls: [
        '在遍历 dict 时增删键 → RuntimeError；用 list(d.keys()) 拷贝再改。',
        '大列表上反复 `x in lst` 做查找，O(n²)——先转 set。',
        '把 list 当 dict 键（不可哈希）直接 TypeError——要复合键用 tuple。',
      ],
      quiz: [
        { q: '"x in big_list" 慢，改用什么结构？', options: ['tuple', 'set', 'str', 'bytes'], answer: 1, explain: 'set 基于哈希，成员判断 O(1)；list 是线性扫描。' },
        { q: 'd.get("k", 0) 与 d["k"] 的区别？', options: ['没区别', '键不存在时 get 返回默认值不抛 KeyError', 'get 更慢不能用', 'd["k"] 返回 None'], answer: 1, explain: 'get 是"宽容读取"，d["k"] 是"严格读取"——配置解析场景 get + 默认值最稳。' },
      ],
      extend: '「嵌入式语言基础」的"数据三要素"一节从语义上解释了为什么 dict 是配置解析首选容器。',
    },

    /* ================= 第二章 ================= */
    {
      id: 'py05', chapter: 'py2',
      title: '切片与推导式：Python 的灵魂语法',
      doc: `**切片** \`seq[start:stop:step]\`：左闭右开。负数索引从尾数（-1 是最后一个）；\`[::-1]\` 反转、\`[::2]\` 抽样。切片永远是"拷贝"（对 list），越界不报错——安全。
**列表推导** \`[f(x) for x in seq if cond]\`：一行完成过滤+映射，比 for-append 快且清楚。同理有 dict/set 推导。**别为炫技写多层嵌套推导**，两层封顶，再复杂就写普通循环。
**生成器表达式** \`(f(x) for x in seq)\`：惰性，不占内存——配合 sum/max/any/all 消费：\`sum(x*x for x in range(10**7))\` 内存零额外开销。`,
      code: `nums = list(range(10))
nums[2:5]        # [2, 3, 4]
nums[::-1]       # 反转

sq = [x * x for x in nums if x % 2 == 0]   # 偶数平方
mp = {c: ord(c) for c in "abc"}            # dict 推导

total = sum(x * x for x in range(10**7))   # 生成器：不建列表
any(p > 100 for p in pressures)            # 存在即真，短路`,
      pitfalls: [
        '推导式里做复杂副作用（写文件、改全局）——推导式是"构造数据"，副作用用 for。',
        '对切片的"拷贝"误解：numpy 数组切片是视图不是拷贝，改切片动原数组。',
        'stop 理解成"个数"——它是"到哪之前"，差一错误高发。',
      ],
      quiz: [
        { q: '[1,2,3,4,5][1:4] 的结果？', options: ['[2,3,4,5]', '[2,3,4]', '[1,2,3,4]', '[2,3]'], answer: 1, explain: '左闭右开：取下标 1、2、3。' },
        { q: 'sum(x for x in range(10**8)) 相比 sum(list(range(10**8))) 的优势？', options: ['结果更准', '惰性不占内存', '语法好看', '没有优势'], answer: 1, explain: '生成器逐个产出，峰值内存 O(1)；建列表要 8 位数个元素的内存。' },
      ],
      extend: '「嵌入式语言基础」"表达的密度"一节讨论了"一行流"的可读性边界——推导式是中心议题。',
    },
    {
      id: 'py06', chapter: 'py2',
      title: '函数：参数、解包与作用域',
      doc: `**参数五种**：位置、默认值、可变位置 \`*args\`、仅关键字 \`*,\` 之后、可变关键字 \`**kwargs\`。顺序固定：\`def f(a, b=1, *args, key, **kw)\`。
**解包调用**：\`f(*list, **dict)\`——配置字典直接倒进函数，日志/命令分发常用。
**作用域 LEGB**：Local → Enclosing → Global → Builtins。函数内**赋值就创建局部变量**——想在函数内改全局必须 global（一般别这么干，传参进出更干净）。
**闭包**：内层函数记住外层变量。装饰器、回调工厂都靠它。
**函数是对象**：能赋值、能传参、能存进 dict——这就是"没有函数指针的指针语言"。`,
      code: `def connect(host, port=1883, *, timeout=5, **opts):
    print(host, port, timeout, opts)

cfg = {"host": "localhost", "port": 9000}
connect(**cfg)                    # 解包字典成关键字参数

def make_counter():
    n = 0
    def inc():
        nonlocal n               # 声明改外层变量
        n += 1
        return n
    return inc

c = make_counter(); c(); c()     # 闭包：n 被记住`,
      pitfalls: [
        '在函数内给全局变量赋值不写 global，结果创建了一个同名局部变量，"改了没生效"。',
        '*args 之后还想按位置传参——语法限制，只能关键字。',
        '闭包循环变量陷阱：lambda 里引用循环变量 i，全部捕获的是同一个 i 的最终值。',
      ],
      quiz: [
        { q: 'def f(a, *, b): 合法调用是？', options: ['f(1, 2)', 'f(1, b=2)', 'f(a=1, 2)', 'f(b=2, 1)'], answer: 1, explain: '* 之后的参数强制关键字传——防止位置参数含义模糊。' },
        { q: '闭包里要修改外层函数的局部变量，需要声明？', options: ['global', 'nonlocal', 'static', '不用声明'], answer: 1, explain: 'nonlocal 指向最近的 enclosing 作用域；global 指模块级。' },
      ],
      extend: '回调工厂 + 闭包就是装饰器的原材料——py10 装饰器一节是本节的直接续集。',
    },
    {
      id: 'py07', chapter: 'py2',
      title: '模块、包与虚拟环境',
      doc: `**模块** = 一个 .py 文件。\`import mod\` / \`from mod import func\`。**首次导入时执行模块顶层代码**（并缓存到 sys.modules）——顶层别放重活。
**包** = 带 \`__init__.py\` 的目录，组织多模块。相对导入 \`from . import utils\`。
**运行入口**：\`if __name__ == "__main__":\` 让文件既能当模块被导入、又能当脚本直接跑——模块被导入时该判断为 False。
**虚拟环境**：\`python -m venv .venv\` → 激活 → \`pip install\`。每个项目独立依赖，杜绝"我电脑上能跑"。依赖固化：\`pip freeze > requirements.txt\`。
**标准库优先**：collections、itertools、pathlib、json、logging——先找标准库再想第三方。`,
      code: `# utils.py
def crc16(data: bytes) -> int: ...

if __name__ == "__main__":
    # 直接跑本文件时自测
    assert crc16(b"\\x01") == 0x1234

# main.py
import sys
sys.path.insert(0, str(Path(__file__).parent))
from utils import crc16

# 命令行
# python -m venv .venv && .venv\\Scripts\\activate
# pip install pyserial && pip freeze > requirements.txt`,
      pitfalls: [
        '脚本文件与标准库同名（如 serial.py 里 import serial）——导入到自己！改文件名。',
        'import 放在函数里到处都是——统一顶部 import，延迟导入只在确需解循环依赖时用。',
        '全局 pip 装包，项目间依赖打架——每个项目一个 venv 是底线。',
      ],
      quiz: [
        { q: '__name__ == "__main__" 何时为真？', options: ['任何时候', '文件被导入时', '文件作为脚本直接运行时', '类实例化时'], answer: 2, explain: '被导入时 __name__ 是模块名；直接运行才是 "__main__"。' },
        { q: '创建独立项目环境的官方做法？', options: ['pip install --user', 'python -m venv', '复制 python 目录', '改 PYTHONPATH'], answer: 1, explain: 'venv 建立隔离解释器环境；conda/uv/poetry 是社区增强。' },
      ],
      extend: '项目库 p07 的上位机目录结构（app/ drivers/ tools/ + main.py）就是包组织的实操版。',
    },
    {
      id: 'py08', chapter: 'py2',
      title: '异常处理：try / except / finally',
      doc: `Python 靠异常传错误，风格是 **EAFP**（先干，出错再处理），与 C 的查错误码（LBYL）相反。
**基本结构**：try 可能出错段 → except 具体异常类型（**永远具体，别裸 except**）→ else 无异常时 → finally 必做清理。
**抛出**：\`raise ValueError("msg")\`；自定义异常继承 Exception。
**异常链**：except 里 raise NewError(...) from e 保留原始现场。
**资源管理**：文件/连接优先 \`with open(...)\`——上下文管理器自动关，比 try/finally 省心。
**吞异常是万恶之源**：except: pass 让 bug 蒸发，日志必须打。`,
      code: `import serial

try:
    ser = serial.Serial("COM3", 115200, timeout=1)
    ser.write(b"AT\\r\\n")
except serial.SerialException as e:
    print(f"串口打开失败: {e}")
    raise RuntimeError("设备不可用") from e   # 链式抛出
else:
    print("打开成功")
finally:
    print("收尾（无论成败）")

class DeviceError(Exception):
    """设备层异常基类"""`,
      pitfalls: [
        '裸 except: 或 except Exception: pass——错误被吞，排查地狱。',
        'except 写成父类（Exception）导致把 KeyboardInterrupt 也吞了。',
        '在 finally 里 return，覆盖 try 里的返回值/异常——除非有意，别这么写。',
      ],
      quiz: [
        { q: '为什么禁止 except: pass？', options: ['性能差', '异常被静默吞掉，故障无从排查', '语法不允许', '会死循环'], answer: 1, explain: '至少打日志或 re-raise；静默吞异常等于把炸药埋进代码。' },
        { q: 'with open(path) as f: 的核心价值？', options: ['更快', '异常时也保证文件关闭（自动调用 __exit__）', '可以读网络文件', '语法糖没有价值'], answer: 1, explain: '上下文管理协议保证清理逻辑必然执行——等价于 C++ RAII 思想。' },
      ],
      extend: '与 C 语言大全 c-em09 对照：C 用错误码、Python 用异常——两种错误模型的哲学差异值得琢磨。',
    },

    /* ================= 第三章 ================= */
    {
      id: 'py09', chapter: 'py3',
      title: '类与对象：从数据到行为',
      doc: `类 = 数据（属性）+ 行为（方法）的模板。\`__init__\` 构造器，\`self\` 显式代表实例——"显式"是 Python 的哲学。
**实例属性 vs 类属性**：类属性全体共享（相当于 C 的 static）；实例属性每对象一份。赋值 \`self.x =\` 永远创建实例属性。
**三大方法**：实例方法（带 self）、类方法 \`@classmethod\`（带 cls，常做"替代构造器"如 \`dict.fromkeys()\`）、静态方法 \`@staticmethod\`（纯函数，放类里只是归类）。
**封装约定**：\_single 下划线 = "内部请勿直接用"（君子协定）；\_\_double 双下划线触发名称改写（name mangling）。
**property**：把方法伪装成属性，读写出拦截——Python 版 getter/setter。`,
      code: `class Sensor:
    count = 0                          # 类属性：全体共享

    def __init__(self, addr: str):
        self.addr = addr               # 实例属性
        self._raw = 0                  # 约定内部
        Sensor.count += 1

    @property
    def celsius(self) -> float:        # 用法：s.celsius 无括号
        return self._raw * 0.0625

    @classmethod
    def from_hex(cls, hexaddr: str):   # 替代构造器
        return cls(hexaddr)

s = Sensor.from_hex("0x48")
print(s.celsius)`,
      pitfalls: [
        '类属性用可变对象（ Sensor.items = [] ），所有实例共享同一列表。',
        '把 C 风格 getter/setter 全套搬过来——Python 用 property，别写 get_xxx()。',
        '__init__ 里开线程/开串口等重活——构造应轻，用显式 start()/open()。',
      ],
      quiz: [
        { q: '@classmethod 的典型用途？', options: ['私有方法', '替代构造器/操作类级状态', '加速', '多继承'], answer: 1, explain: 'from_xxx 系列工厂方法都靠 classmethod；第一个参数 cls 指向类本身。' },
        { q: 's.celsius 看起来是属性其实是？', options: ['变量', '被 @property 包装的方法', '类属性', '宏'], answer: 1, explain: 'property 让"读计算值"的语法与读普通属性一致，同时保留拦截点。' },
      ],
      extend: '与 C 语言大全 c-em14（句柄模式）对照：Python 的 self 就是语言内置的句柄，封装思想完全同构。',
    },
    {
      id: 'py10', chapter: 'py3',
      title: '继承、魔术方法与鸭子类型',
      doc: `**继承**：class Dog(Animal)。复用父类用 \`super().__init__()\`。多继承 MRO（C3 线性化）决定查找顺序——组合优先于继承是第一设计原则。
**魔术方法**（双下划线）：\`__repr__\` 调试显示、\`__eq__\` 相等、\`__len__\` len()、\`__getitem__\` 下标访问、\`__call__\` 让实例可调用。实现它们，自定义类就能无缝接入 Python 内置语法。
**鸭子类型**："走起来像鸭子就是鸭子"——不看类型看行为。函数参数不声明类型，能调用就行；配合 isinstance 检查做防御。
**抽象基类**：\`abc.ABC + @abstractmethod\` 强制子类实现——需要"接口约束"时用。`,
      code: `class Frame:
    __slots__ = ("head", "data")       # 固定属性，省内存禁动态加

    def __init__(self, head: int, data: bytes):
        self.head, self.data = head, data

    def __repr__(self):                # 调试友好
        return f"Frame(0x{self.head:02X}, {len(self.data)}B)"

    def __eq__(self, other):
        return isinstance(other, Frame) and (self.head, self.data) == (other.head, other.data)

    def __len__(self): return len(self.data)`,
      pitfalls: [
        '只实现 __eq__ 忘了同步 __hash__，对象进 set/dict 行为异常。',
        '__repr__ 返回中文+表情投进日志文件解码报错——repr 保持 ASCII。',
        '继承 list/dict 重写方法后内置操作（+、切片）不走你的方法——用 collections.UserList 或组合。',
      ],
      quiz: [
        { q: 'print(obj) 显示友好信息，应实现？', options: ['__str__ 或 __repr__', '__init__', '__main__', '__call__'], answer: 0, explain: 'print 用 __str__（缺省回落 __repr__）；repr() 与调试器用 __repr__。' },
        { q: '"鸭子类型"的含义？', options: ['必须继承同一基类', '只看对象是否具备所需方法，不关心类型谱系', '一种设计模式', '弱类型'], answer: 1, explain: 'Python 的多态不靠继承靠行为——比 Java 的接口约束更松，配合 ABC 可收紧。' },
      ],
      extend: 'pyserial 的 Serial、paho 的 Client 全是"魔术方法 + 鸭子类型"的库设计范本——读库源码比读语法书长进快。',
    },
    {
      id: 'py11', chapter: 'py3',
      title: '迭代器与生成器：惰性的艺术',
      doc: `**可迭代对象**（有 __iter__）被 for 消费；**迭代器**（有 __iter__ + __next__）是一次性游标。for 循环的本质：iter() 拿迭代器，反复 next() 直到 StopIteration。
**生成器**：带 yield 的函数，调用不执行、next 一次执行到下一个 yield。**状态自动保存**，天然适合"流式"处理：读大文件逐行、串口逐帧、无限序列。
**yield 之后的代码在下次 next 时继续**——用这个特性写协程式生产者。
**工具三宝**：zip 并行遍历、itertools（chain/islice/count…）、yield from 委托子生成器。
**性能心法**：能用生成器流式过一遍的，不要先 list() 全装内存。`,
      code: `def read_frames(ser):
    """从串口流式吐出完整帧——大流量不占内存"""
    buf = b""
    while True:
        buf += ser.read(64)
        while b"\\r\\n" in buf:
            frame, buf = buf.split(b"\\r\\n", 1)
            if frame:
                yield frame

for frame in read_frames(ser):     # 像遍历列表一样消费
    handle(frame)

def countdown(n):
    while n:
        yield n
        n -= 1
list(zip(countdown(3), "abc"))     # [(3,'a'),(2,'b'),(1,'c')]`,
      pitfalls: [
        '生成器只能遍历一次——第二次是空的，需要多次消费先 list()（或写类实现 __iter__）。',
        '在生成器里 try/finally，若消费方中途 break，finally 仍触发（close 语义），清理代码别放错。',
        '把大文件 readlines() 全读内存再处理——逐行 for line in f 才是流式。',
      ],
      quiz: [
        { q: '生成器函数 g() 被调用时，函数体？', options: ['立即全部执行', '不执行，返回生成器对象', '执行到 return', '报错'], answer: 1, explain: '调用只造出"游标"；每次 next() 推进到下一个 yield。' },
        { q: '处理 10GB 日志文件统计错误行，正确姿势？', options: ['f.readlines() 后过滤', 'for line in f 流式判断', '读进 bytes 再 split', '加内存'], answer: 1, explain: '文件对象本身是迭代器，逐行惰性读——内存 O(1)。' },
      ],
      extend: '项目库 p07 上位机的"串口帧流解析"就是 read_frames 模式的实战增强版。',
    },
    {
      id: 'py12', chapter: 'py3',
      title: '装饰器与上下文管理器',
      doc: `**装饰器**：@语法 = 把函数包一层再替换原名。\`@log\` 等价 \`f = log(f)\`。用途：计时、重试、缓存、权限、注册路由（Flask 的 @app.route）。写法：外层收函数，内层收参数，@functools.wraps 保留元信息。
**带参装饰器**：三层嵌套——最外层收装饰器参数。
**上下文管理器**：\`with\` 背后的协议 __enter__/__exit__，进出场自动管理。除了官方库，自己写"临时改配置、测速、锁"都靠它；\`contextlib.contextmanager\` 用 yield 一个函数搞定。`,
      code: `import functools, time

def timed(fn):
    @functools.wraps(fn)               # 保留函数名与文档
    def wrap(*a, **kw):
        t0 = time.perf_counter()
        try:
            return fn(*a, **kw)
        finally:
            print(f"{fn.__name__} 耗时 {time.perf_counter()-t0:.3f}s")
    return wrap

@timed
def poll_all(): ...

from contextlib import contextmanager
@contextmanager
def suppress():
    try: yield
    except Exception as e: print("吞掉:", e)`,
      pitfalls: [
        '忘 @functools.wraps，被装饰函数的 __name__ 变成 wrap，日志和调试全乱。',
        '装饰器在 import 时就执行（包一层），别在里面做耗时初始化。',
        '__exit__ 返回 True 会吞异常——默认返回 None/False 让异常继续传播。',
      ],
      quiz: [
        { q: '@deco 定义 def f(): ... 后，f 实际是？', options: ['原函数', 'deco(f) 的返回值', '字符串', '类'], answer: 1, explain: '装饰器语法就是函数组合糖：f = deco(f)。' },
        { q: 'contextmanager 装饰的函数中，yield 之前/之后分别对应？', options: ['任意', '__enter__ / __exit__', '初始化/析构', 'read/write'], answer: 1, explain: 'yield 前是进入时动作，yield 值绑定给 as 变量，yield 后是退出清理。' },
      ],
      extend: '「代码库」Python 上位机的串口重连逻辑就是"带参装饰器 + 上下文管理器"的组合应用。',
    },
  ],
} as const
