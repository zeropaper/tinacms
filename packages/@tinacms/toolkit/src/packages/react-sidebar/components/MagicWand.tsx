import * as React from 'react'
import { useEvent } from '../../react-core/use-cms-event'
import { useMutationSignal } from '../../../components/MutationSignal'
import { IconButton } from '../../styles'
import { CodeIcon } from '../../icons'
import { useCMS } from '../../..'
import styled from 'styled-components'
import { Plugin } from '../../core/plugins'

export const MagicWand = () => {
  const cms = useCMS()
  const [active, setActive] = React.useState(false)
  const [hoveredFieldName, setHoveredFieldName] = React.useState<string | null>(
    null
  )
  const escape = (e?: any) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    setHoveredFieldName(null)
    setActive(false)
  }

  const signal = useMutationSignal()
  const { dispatch } = useEvent('field:hover')
  const { dispatch: focusFieldInSidebar } = useEvent('field:reveal-in-sidebar')

  React.useEffect(() => {
    if (active) {
      document.body.style.cursor = 'crosshair'
      window.addEventListener('click', escape)
      window.addEventListener('keydown', escape)

      //@ts-ignore
      cms.sidebar.isOpen = false
    } else {
      document.body.style.cursor = 'initial'
    }

    return () => {
      window.removeEventListener('click', escape)
      window.removeEventListener('keydown', escape)
    }
  }, [active])

  React.useEffect(() => {
    if (!active) return

    const openSidebar = (e: any) => {
      e.preventDefault()
      e.stopPropagation()
      const fieldName = e.target.dataset.tinafield
      //@ts-ignore
      cms.sidebar.isOpen = true
      focusFieldInSidebar({ fieldName })
      escape()
    }
    const hoverStart = (e: any) => {
      e.preventDefault()
      e.stopPropagation()
      //@ts-ignore
      const fieldName = e.target.dataset.tinafield
      setHoveredFieldName(fieldName)
    }
    const hoverEnd = (e: any) => {
      e.preventDefault()
      e.stopPropagation()
      setHoveredFieldName(null)
    }

    const fieldReferences = Array.from(
      document.querySelectorAll('[data-tinafield]')
    )
    fieldReferences.map((ele) => {
      ele.addEventListener('mouseenter', hoverStart)
      ele.addEventListener('mouseleave', hoverEnd)
      ele.addEventListener('click', openSidebar)
    })

    return () => {
      fieldReferences.map((ele) => {
        ele.removeEventListener('mouseenter', hoverStart)
        ele.removeEventListener('mouseleave', hoverEnd)
        ele.removeEventListener('click', openSidebar)
      })
    }
  }, [active, setHoveredFieldName, signal])

  React.useEffect(() => {
    if (!active) return
    dispatch({ fieldName: hoveredFieldName })
  }, [active, hoveredFieldName, dispatch])

  return (
    <WandButton
      onClick={() => {
        setActive(!active)
      }}
    >
      <CodeIcon />
    </WandButton>
  )
}

const WandButton = styled(IconButton)`
  position: absolute;
  pointer-events: all;
  bottom: 15px;
  left: var(--tina-sidebar-width);
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
`

export const MagicWandPlugin: Plugin = {
  __type: 'unstable:featureflag',
  name: 'magic-wand',
}
