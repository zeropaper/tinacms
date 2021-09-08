import * as React from 'react'
import { useEvent } from '../../react-core/use-cms-event'
import { useMutationSignal } from '../../../components/MutationSignal'
import { IconButton } from '../../styles'
import { CodeIcon } from '../../icons'

export const MagicWand = () => {
  const [active, setActive] = React.useState(false)
  const [hoveredFieldName, setHoveredFieldName] = React.useState<string | null>(
    null
  )
  const signal = useMutationSignal()
  const { dispatch } = useEvent('field:hover')

  React.useEffect(() => {
    const escape = () => {
      setHoveredFieldName(null)
      setActive(false)
    }
    if (active) {
      document.body.style.cursor = 'help'
      window.addEventListener('click', escape)
      window.addEventListener('keydown', escape)
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
    const hoverStart = (e: any) => {
      e.preventDefault()
      e.stopPropagation()
      //@ts-ignore
      const fieldName = e.target.dataset.tinafield
      if (fieldName !== hoveredFieldName) {
        setHoveredFieldName(fieldName)
      }
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
      console.log(ele)
      ele.addEventListener('mouseenter', hoverStart)
      ele.addEventListener('mouseleave', hoverEnd)
    })

    return () => {
      fieldReferences.map((ele) => {
        ele.removeEventListener('mouseenter', hoverStart)
        ele.removeEventListener('mouseleave', hoverEnd)
      })
    }
  }, [active, setHoveredFieldName])

  React.useEffect(() => {
    dispatch({ fieldName: hoveredFieldName })
  }, [hoveredFieldName, dispatch, signal])

  return (
    <IconButton
      onClick={() => {
        setActive(!active)
        console.log('poofed')
      }}
    >
      <CodeIcon />
    </IconButton>
  )
}
