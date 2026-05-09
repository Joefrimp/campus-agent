import { useCallback, useEffect, useState } from 'react'

const KEY = 'eastern-ai-sidebar-collapsed'

export function useSidebarCollapse() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(KEY) === '1'
  })

  useEffect(() => {
    localStorage.setItem(KEY, collapsed ? '1' : '0')
  }, [collapsed])

  const toggle = useCallback(() => setCollapsed(c => !c), [])
  return { collapsed, toggle }
}
