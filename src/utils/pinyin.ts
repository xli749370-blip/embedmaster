/**
 * 讲义检索的拼音扩展
 * ------------------------------------------------------------------
 * 全文索引在浏览器里做，没有现成的分词/拼音服务，所以采用
 * 「嵌入式术语拼音词典」方案：词典覆盖讲义里全部高频术语，
 * 用户输入全拼（dingshiqi）、首字母（dsq）甚至带一点前缀（dingshi）
 * 时，先展开成对应的中文术语，再走原本的全文匹配 —— 命中后照常
 * 高亮、计分、出片段，体验与直接搜中文完全一致。
 *
 * 词典按「中文术语 → 全拼（音节空格分隔）」组织，首字母缩写由
 * 音节自动推导，不需要重复维护。
 */

export interface PyEntry {
  /** 中文术语（检索时会按它做全文匹配） */
  zh: string
  /** 全拼，音节之间用空格分隔 */
  py: string
}

/** 嵌入式高频术语拼音词典：按课程主题分组，新增内容时往里补即可 */
export const PY_TERMS: PyEntry[] = [
  /* ---- 电路 / 硬件基础 ---- */
  { zh: '电压', py: 'dian ya' },
  { zh: '分压', py: 'fen ya' },
  { zh: '电阻', py: 'dian zu' },
  { zh: '电容', py: 'dian rong' },
  { zh: '去耦电容', py: 'qu ou dian rong' },
  { zh: '滤波', py: 'lv bo' },
  { zh: '滤波器', py: 'lv bo qi' },
  { zh: '充电', py: 'chong dian' },
  { zh: '放电', py: 'fang dian' },
  { zh: '时间常数', py: 'shi jian chang shu' },
  { zh: '稳压', py: 'wen ya' },
  { zh: '上拉', py: 'shang la' },
  { zh: '下拉', py: 'xia la' },
  { zh: '推挽', py: 'tui wan' },
  { zh: '开漏', py: 'kai lou' },
  { zh: '高阻', py: 'gao zu' },
  { zh: '阻抗', py: 'zu kang' },
  { zh: '引脚', py: 'yin jiao' },
  { zh: '复用', py: 'fu yong' },
  { zh: '硬件', py: 'ying jian' },
  { zh: '软件', py: 'ruan jian' },
  { zh: '固件', py: 'gu jian' },
  { zh: '芯片', py: 'xin pian' },
  { zh: '单片机', py: 'dan pian ji' },
  { zh: '开发板', py: 'kai fa ban' },
  { zh: '焊接', py: 'han jie' },
  { zh: '原理图', py: 'yuan li tu' },
  { zh: '封装', py: 'feng zhuang' },

  /* ---- C 语言 / 底层 ---- */
  { zh: '指针', py: 'zhi zhen' },
  { zh: '内存', py: 'nei cun' },
  { zh: '地址', py: 'di zhi' },
  { zh: '地址空间', py: 'di zhi kong jian' },
  { zh: '内存布局', py: 'nei cun bu ju' },
  { zh: '堆栈', py: 'dui zhan' },
  { zh: '栈', py: 'zhan' },
  { zh: '堆', py: 'dui' },
  { zh: '溢出', py: 'yi chu' },
  { zh: '数组', py: 'shu zu' },
  { zh: '字符串', py: 'zi fu chuan' },
  { zh: '结构体', py: 'jie gou ti' },
  { zh: '枚举', py: 'mei ju' },
  { zh: '回调', py: 'hui tiao' },
  { zh: '函数指针', py: 'han shu zhi zhen' },
  { zh: '宏', py: 'hong' },
  { zh: '位运算', py: 'wei yun suan' },
  { zh: '移位', py: 'yi wei' },
  { zh: '掩码', py: 'yan ma' },
  { zh: '置位', py: 'zhi wei' },
  { zh: '清零', py: 'qing ling' },
  { zh: '取反', py: 'qu fan' },
  { zh: '异或', py: 'yi huo' },
  { zh: '按位与', py: 'an wei yu' },
  { zh: '按位或', py: 'an wei huo' },
  { zh: '补码', py: 'bu ma' },
  { zh: '进制', py: 'jin zhi' },
  { zh: '十六进制', py: 'shi liu jin zhi' },
  { zh: '二进制', py: 'er jin zhi' },
  { zh: '寄存器', py: 'ji cun qi' },
  { zh: '位带', py: 'wei dai' },
  { zh: '位操作', py: 'wei cao zuo' },
  { zh: '原子操作', py: 'yuan zi cao zuo' },
  { zh: '对齐', py: 'dui qi' },
  { zh: '易失', py: 'yi shi' },
  { zh: '缓存', py: 'huan cun' },
  { zh: '闪存', py: 'shan cun' },

  /* ---- 时钟 / 电源 / 启动 ---- */
  { zh: '时钟', py: 'shi zhong' },
  { zh: '时钟树', py: 'shi zhong shu' },
  { zh: '时钟配置', py: 'shi zhong pei zhi' },
  { zh: '晶振', py: 'jing zhen' },
  { zh: '振荡', py: 'zhen dang' },
  { zh: '锁相环', py: 'suo xiang huan' },
  { zh: '倍频', py: 'bei pin' },
  { zh: '分频', py: 'fen pin' },
  { zh: '预分频', py: 'yu fen pin' },
  { zh: '主频', py: 'zhu pin' },
  { zh: '系统时钟', py: 'xi tong shi zhong' },
  { zh: '低速时钟', py: 'di su shi zhong' },
  { zh: '高速时钟', py: 'gao su shi zhong' },
  { zh: '上电', py: 'shang dian' },
  { zh: '掉电', py: 'diao dian' },
  { zh: '复位', py: 'fu wei' },
  { zh: '看门狗', py: 'kan men gou' },
  { zh: '启动', py: 'qi dong' },
  { zh: '启动流程', py: 'qi dong liu cheng' },
  { zh: '启动文件', py: 'qi dong wen jian' },
  { zh: '引导', py: 'yin dao' },
  { zh: '向量表', py: 'xiang liang biao' },
  { zh: '中断向量', py: 'zhong duan xiang liang' },
  { zh: '映射', py: 'ying she' },
  { zh: '重映射', py: 'chong ying she' },

  /* ---- 中断 / 异常 ---- */
  { zh: '中断', py: 'zhong duan' },
  { zh: '中断嵌套', py: 'zhong duan qian tao' },
  { zh: '中断服务', py: 'zhong duan fu wu' },
  { zh: '中断函数', py: 'zhong duan han shu' },
  { zh: '抢占', py: 'qiang zhan' },
  { zh: '优先级', py: 'you xian ji' },
  { zh: '子优先级', py: 'zi you xian ji' },
  { zh: '挂起', py: 'gua qi' },
  { zh: '清除', py: 'qing chu' },
  { zh: '标志位', py: 'biao zhi wei' },
  { zh: '标志', py: 'biao zhi' },
  { zh: '响应', py: 'xiang ying' },
  { zh: '延迟', py: 'yan chi' },
  { zh: '抖动', py: 'dou dong' },
  { zh: '尾链', py: 'wei lian' },
  { zh: '咬尾', py: 'yao wei' },
  { zh: '硬错误', py: 'ying cuo wu' },
  { zh: '错误', py: 'cuo wu' },
  { zh: '异常', py: 'yi chang' },
  { zh: '压栈', py: 'ya zhan' },
  { zh: '出栈', py: 'chu zhan' },
  { zh: '栈帧', py: 'zhan zhen' },

  /* ---- 定时器 ---- */
  { zh: '定时器', py: 'ding shi qi' },
  { zh: '定时', py: 'ding shi' },
  { zh: '计时', py: 'ji shi' },
  { zh: '计数器', py: 'ji shu qi' },
  { zh: '计数', py: 'ji shu' },
  { zh: '时基', py: 'shi ji' },
  { zh: '自动重装', py: 'zi dong chong zhuang' },
  { zh: '重装载', py: 'chong zhuang zai' },
  { zh: '比较匹配', py: 'bi jiao pi pei' },
  { zh: '输出比较', py: 'shu chu bi jiao' },
  { zh: '输入捕获', py: 'shu ru bu huo' },
  { zh: '捕获', py: 'bu huo' },
  { zh: '脉宽', py: 'mai kuan' },
  { zh: '占空比', py: 'zhan kong bi' },
  { zh: '溢出中断', py: 'yi chu zhong duan' },
  { zh: '软件定时器', py: 'ruan jian ding shi qi' },
  { zh: '滴答定时器', py: 'di da ding shi qi' },
  { zh: '滴答', py: 'di da' },
  { zh: '节拍', py: 'jie pai' },
  { zh: '编码器', py: 'bian ma qi' },
  { zh: '测速', py: 'ce su' },
  { zh: '舵机', py: 'duo ji' },
  { zh: '呼吸灯', py: 'hu xi deng' },

  { zh: '波形', py: 'bo xing' },
  { zh: '频率', py: 'pin lv' },
  { zh: '周期', py: 'zhou qi' },
  { zh: '脉宽调制', py: 'mai kuan tiao zhi' },
  { zh: '调制', py: 'tiao zhi' },
  { zh: '分辨率', py: 'fen bian lv' },
  { zh: '精度', py: 'jing du' },
  { zh: '误差', py: 'wu cha' },
  { zh: '校准', py: 'jiao zhun' },

  /* ---- ADC / 模拟 ---- */
  { zh: '采样', py: 'yang cai' },
  { zh: '采样率', py: 'yang cai lv' },
  { zh: '采样时间', py: 'yang cai shi jian' },
  { zh: '量化', py: 'liang hua' },
  { zh: '基准电压', py: 'ji zhun dian ya' },
  { zh: '参考电压', py: 'can kao dian ya' },
  { zh: '模拟', py: 'mo ni' },
  { zh: '数字', py: 'shu zi' },
  { zh: '通道', py: 'tong dao' },
  { zh: '轮询', py: 'lun xun' },
  { zh: '扫描', py: 'sao miao' },
  { zh: '过采样', py: 'guo yang cai' },
  { zh: '噪声', py: 'zao sheng' },
  { zh: '纹波', py: 'wen bo' },

  /* ---- 通信 ---- */
  { zh: '串口', py: 'chuan kou' },
  { zh: '串行', py: 'chuan xing' },
  { zh: '并行', py: 'bing xing' },
  { zh: '通信', py: 'tong xin' },
  { zh: '波特率', py: 'bo te lv' },
  { zh: '起始位', py: 'qi shi wei' },
  { zh: '停止位', py: 'ting zhi wei' },
  { zh: '校验位', py: 'jiao yan wei' },
  { zh: '数据位', py: 'shu ju wei' },
  { zh: '空闲', py: 'kong xian' },
  { zh: '应答', py: 'ying da' },
  { zh: '主机', py: 'zhu ji' },
  { zh: '从机', py: 'cong ji' },
  { zh: '全双工', py: 'quan shuang gong' },
  { zh: '半双工', py: 'ban shuang gong' },
  { zh: '总线', py: 'zong xian' },
  { zh: '时序', py: 'shi xu' },
  { zh: '时序图', py: 'shi xu tu' },
  { zh: '建立时间', py: 'jian li shi jian' },
  { zh: '保持时间', py: 'bao chi shi jian' },
  { zh: '上升沿', py: 'shang sheng yan' },
  { zh: '下降沿', py: 'xia jiang yan' },
  { zh: '边沿', py: 'bian yan' },
  { zh: '电平', py: 'dian ping' },
  { zh: '协议', py: 'xie yi' },
  { zh: '帧', py: 'zhen' },
  { zh: '数据帧', py: 'shu ju zhen' },
  { zh: '命令', py: 'ming ling' },
  { zh: '寻址', py: 'xun zhi' },
  { zh: '从机地址', py: 'cong ji di zhi' },
  { zh: '仲裁', py: 'zhong cai' },
  { zh: '时钟拉伸', py: 'shi zhong la shen' },

  /* ---- DMA / 存储 ---- */
  { zh: '搬运', py: 'ban yun' },
  { zh: '数据搬运', py: 'shu ju ban yun' },
  { zh: '传输', py: 'chuan shu' },
  { zh: '双缓冲', py: 'shuang huan chong' },
  { zh: '缓冲', py: 'huan chong' },
  { zh: '缓冲区', py: 'huan chong qu' },
  { zh: '循环模式', py: 'xun huan mo shi' },
  { zh: '普通模式', py: 'pu tong mo shi' },
  { zh: '乒乓', py: 'ping pang' },
  { zh: '乒乓缓冲', py: 'ping pang huan chong' },
  { zh: '流控制', py: 'liu kong zhi' },
  { zh: '请求', py: 'qing qiu' },
  { zh: '触发', py: 'chu fa' },
  { zh: '突发', py: 'tu fa' },
  { zh: '存储', py: 'cun chu' },
  { zh: '读取', py: 'du qu' },
  { zh: '写入', py: 'xie ru' },
  { zh: '搬移', py: 'ban yi' },
  { zh: '外设', py: 'wai she' },
  { zh: '流量', py: 'liu liang' },
  { zh: '带宽', py: 'dai kuan' },
  { zh: '占用', py: 'zhan yong' },
  { zh: '负担', py: 'fu dan' },

  /* ---- RTOS / 任务 ---- */
  { zh: '任务', py: 'ren wu' },
  { zh: '任务切换', py: 'ren wu qie huan' },
  { zh: '调度', py: 'diao du' },
  { zh: '调度器', py: 'diao du qi' },
  { zh: '实时', py: 'shi shi' },
  { zh: '实时系统', py: 'shi shi xi tong' },
  { zh: '阻塞', py: 'zu se' },
  { zh: '唤醒', py: 'huan xing' },
  { zh: '挂起任务', py: 'gua qi ren wu' },
  { zh: '就绪', py: 'jiu xu' },
  { zh: '就绪表', py: 'jiu xu biao' },
  { zh: '上下文', py: 'shang xia wen' },
  { zh: '上下文切换', py: 'shang xia wen qie huan' },
  { zh: '队列', py: 'dui lie' },
  { zh: '消息队列', py: 'xiao xi dui lie' },
  { zh: '信号量', py: 'xin hao liang' },
  { zh: '互斥', py: 'hu chi' },
  { zh: '互斥锁', py: 'hu chi suo' },
  { zh: '死锁', py: 'si suo' },
  { zh: '优先级反转', py: 'you xian ji fan zhuan' },
  { zh: '优先级继承', py: 'you xian ji ji cheng' },
  { zh: '事件', py: 'shi jian' },
  { zh: '事件组', py: 'shi jian zu' },
  { zh: '通知', py: 'tong zhi' },
  { zh: '任务通知', py: 'ren wu tong zhi' },
  { zh: '软件', py: 'ruan jian' },
  { zh: '临界区', py: 'lin jie qu' },
  { zh: '时间片', py: 'shi jian pian' },
  { zh: '空任务', py: 'kong ren wu' },
  { zh: '空闲任务', py: 'kong xian ren wu' },
  { zh: '堆内存', py: 'dui nei cun' },
  { zh: '栈溢出', py: 'zhan yi chu' },
  { zh: '水线', py: 'shui xian' },
  { zh: '高水线', py: 'gao shui xian' },

  { zh: '状态机', py: 'zhuang tai ji' },
  { zh: '有限状态机', py: 'you xian zhuang tai ji' },
  { zh: '事件驱动', py: 'shi jian qu dong' },
  { zh: '前后台', py: 'qian hou tai' },
  { zh: '裸机', py: 'luo ji' },
  { zh: '架构', py: 'jia gou' },
  { zh: '分层', py: 'fen ceng' },
  { zh: '解耦', py: 'jie ou' },
  { zh: '模块化', py: 'mo kuai hua' },

  /* ---- 调试 / 量产 ---- */
  { zh: '调试', py: 'tiao shi' },
  { zh: '断点', py: 'duan dian' },
  { zh: '单步', py: 'dan bu' },
  { zh: '仿真', py: 'fang zhen' },
  { zh: '烧录', py: 'shao lu' },
  { zh: '下载', py: 'xia zai' },
  { zh: '老化', py: 'lao hua' },
  { zh: '老化测试', py: 'lao hua ce shi' },
  { zh: '量产', py: 'liang chan' },
  { zh: '测试', py: 'ce shi' },
  { zh: '工装', py: 'gong zhuang' },
  { zh: '日志', py: 'ri zhi' },
  { zh: '打印', py: 'da yin' },
  { zh: '版本', py: 'ban ben' },
  { zh: '固件升级', py: 'gu jian sheng ji' },
  { zh: '跳转', py: 'tiao zhuan' },
]

/** 音节 → 首字母（"ding shi qi" → "dsq"） */
function initialsOf(py: string): string {
  return py
    .split(' ')
    .map((s) => s.charAt(0))
    .join('')
}

interface CompiledEntry {
  zh: string
  /** 全拼（无空格，便于直接比较）：dingshiqi */
  full: string
  /** 首字母缩写：dsq */
  abbr: string
  /** 完整音节数组：['ding','shi','qi'] */
  syllables: string[]
  /** 前缀串集合：dingshiqi / dingshi / ding（按整音节截断） */
  prefixes: string[]
}

const COMPILED: CompiledEntry[] = PY_TERMS.map((e) => {
  const syl = e.py.split(' ').filter(Boolean)
  const prefixes: string[] = []
  for (let i = 1; i <= syl.length; i++) prefixes.push(syl.slice(0, i).join(''))
  // 去重保序
  const seen = new Set<string>()
  return {
    zh: e.zh.trim(),
    full: syl.join(''),
    abbr: initialsOf(e.py),
    syllables: syl,
    prefixes: prefixes.filter((p) => (seen.has(p) ? false : (seen.add(p), true))),
  }
})

/** 全拼 / 缩写 → 中文术语 的索引（懒加载缓存） */
let FULL_INDEX: Map<string, string[]> | null = null
let ABBR_INDEX: Map<string, string[]> | null = null

function buildIndexes() {
  FULL_INDEX = new Map()
  ABBR_INDEX = new Map()
  for (const e of COMPILED) {
    if (!FULL_INDEX.has(e.full)) FULL_INDEX.set(e.full, [])
    FULL_INDEX.get(e.full)!.push(e.zh)
    if (!ABBR_INDEX.has(e.abbr)) ABBR_INDEX.set(e.abbr, [])
    ABBR_INDEX.get(e.abbr)!.push(e.zh)
  }
}

/**
 * 把一个拉丁词展开成它可能对应的中文术语列表。
 * 匹配规则（按优先级）：
 * 1. 全拼完全相等：dingshiqi → 定时器
 * 2. 首字母缩写完全相等：dsq → 定时器
 * 3. 整音节前缀：dingshi → 定时器（输入到一半也能命中）
 * 返回去重后的中文术语（最多 8 个，避免展开爆炸）。
 */
export function expandLatin(term: string): string[] {
  const t = term.toLowerCase()
  if (!/^[a-z][a-z0-9]*$/.test(t) || t.length < 2) return []
  if (!FULL_INDEX) buildIndexes()

  const out: string[] = []
  const push = (zh: string) => {
    if (!out.includes(zh)) out.push(zh)
  }
  for (const zh of FULL_INDEX!.get(t) ?? []) push(zh)
  for (const zh of ABBR_INDEX!.get(t) ?? []) push(zh)
  if (out.length < 8) {
    for (const e of COMPILED) {
      if (e.prefixes.includes(t)) push(e.zh)
      if (out.length >= 8) break
    }
  }
  return out.slice(0, 8)
}

/** 判断 sub 的全部字符是否按顺序出现在 str 中（子序列模糊匹配） */
export function isSubsequence(sub: string, str: string): boolean {
  let i = 0
  for (const ch of str) {
    if (ch === sub[i]) i += 1
    if (i >= sub.length) return true
  }
  return false
}
