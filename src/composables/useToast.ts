/** 极简全局 Toast：任意组件调用 toast.success('...') 即可 */
import { ref } from 'vue'

export interface ToastItem {
  id: number
  text: string
  type: 'success' | 'error' | 'info'
}

const items = ref<ToastItem[]>([])
let seed = 1

function push(text: string, type: ToastItem['type'] = 'info', duration = 2200) {
  const id = seed++
  items.value.push({ id, text, type })
  setTimeout(() => {
    items.value = items.value.filter((t) => t.id !== id)
  }, duration)
}

export function useToast() {
  return {
    items,
    info: (t: string) => push(t, 'info'),
    success: (t: string) => push(t, 'success'),
    error: (t: string) => push(t, 'error', 2800),
  }
}
