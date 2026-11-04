export type Theme = 'light' | 'dark'

const KEY = 'et:theme'

export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* 隐私模式下 localStorage 可能不可用 */
  }
  // 默认走深色：这套视觉的主场是深空台面
  return 'dark'
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* 忽略写入失败 */
  }
}
