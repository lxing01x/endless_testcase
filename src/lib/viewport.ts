let centerProvider: () => { x: number; y: number } = () => ({ x: 120, y: 120 })

export function setCenterProvider(fn: () => { x: number; y: number }) {
  centerProvider = fn
}

export function getViewportCenter() {
  try {
    return centerProvider()
  } catch {
    return { x: 120, y: 120 }
  }
}
