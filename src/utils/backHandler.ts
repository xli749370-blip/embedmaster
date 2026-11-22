/**
 * 返回键消费队列 —— Android 物理返回键的统一分发
 * ------------------------------------------------------------------
 * Capacitor backButton 触发时按「后注册先消费」的顺序询问各浮层：
 *   - 浮层（抽屉/弹窗）打开中 → 关闭自身，返回 true，本次返回到此为止
 *   - 无浮层消费 → App.vue 再决定：路由回退 or「再按一次退出」
 * Web 端物理返回键事件不存在，这套机制自动闲置，零影响。
 */
type BackConsumer = () => boolean

const consumers: BackConsumer[] = []

/** 注册浮层消费者；返回解绑函数（供 onUnmounted 调用） */
export function registerBackConsumer(fn: BackConsumer): () => void {
  consumers.push(fn)
  return () => {
    const i = consumers.indexOf(fn)
    if (i >= 0) consumers.splice(i, 1)
  }
}

/** 尝试让浮层消费本次返回；有任一消费成功即返回 true */
export function consumeBack(): boolean {
  for (let i = consumers.length - 1; i >= 0; i--) {
    try {
      if (consumers[i]()) return true
    } catch {
      /* 单个消费者异常不阻断其余 */
    }
  }
  return false
}
