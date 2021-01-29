import * as React from 'react'
import { useInlineForm } from 'inline-form'

function getCursorPos() {
  if (!window.getSelection || !window.getSelection()) return 0
  const sel = window.getSelection()
  return sel ? sel.anchorOffset : 0
}

// @ts-ignore
function setCursorPos(node: any, index: any) {
  try {
    if (!node || !node.firstChild) return
    const range = document.createRange()
    const sel = window.getSelection()

    range.setStart(node.firstChild, index)
    range.collapse(true)
    sel?.removeAllRanges()
    sel?.addRange(range)
  } catch (e) {
    console.error(e)
  }
}

export function useContentEditableRef(fieldName: string) {
  const { form } = useInlineForm()
  const changeHandler = (e: any) => {
    const cursorPos = getCursorPos()
    console.warn({ cursorPos })
    form.finalForm.change(fieldName, e.target.innerHTML)
    console.warn({ cursorPos })
    // this seems to work, but is a probable race condition
    setCursorPos(e.target, cursorPos)
  }

  return React.useCallback(node => {
    if (!node) return

    console.log('re-hooking event listeners')
    node.addEventListener('input', changeHandler)
    return () => node.removeEventListener('input', changeHandler)
  }, [])
}

export function useMutableCERef(fieldName: string, data: any) {
  const ref = useContentEditableRef(fieldName)
  const dataRef = React.useRef(data)

  return [ref, dataRef.current]
}
