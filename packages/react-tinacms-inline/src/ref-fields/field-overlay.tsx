/**

Copyright 2019 Forestry.io Inc

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

*/

import * as React from 'react'

function useWindowResize(handler: () => void) {
  React.useEffect(() => {
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
}

export function FieldOverlay({
  targetNode,
  hasFocus,
  onClick,
  children,
}: {
  targetNode: HTMLElement | null
  hasFocus?: boolean
  onClick?: (event: React.MouseEvent<HTMLElement>) => void
  children?: JSX.Element | null
}) {
  const [hovering, setHovering] = React.useState(false)
  const [, setState] = React.useState(0)
  useWindowResize(() => setState(s => s + 1))
  if (!targetNode) return null

  const hoverStyles = {
    opacity: '0.3',
    border: '1px solid var(--tina-color-primary)',
    borderRadius: 'var(--tina-radius-medium)',
    boxShadow: 'var(--tina-shadow-big)',
  }
  const additionalStyles = hovering && !hasFocus ? hoverStyles : {}
  return (
    <div
      style={{
        position: 'absolute',
        padding: '32px',
        top: targetNode.offsetTop - 16,
        left: targetNode.offsetLeft - 16,
        width: hasFocus ? 'auto' : targetNode.offsetWidth + 16,
        height: hasFocus ? 'auto' : targetNode.offsetHeight + 16,
        pointerEvents: hasFocus ? 'none' : 'initial',
        ...additionalStyles,
      }}
      onClick={e => {
        if (onClick) {
          e.preventDefault()
          e.stopPropagation()
          onClick(e)
        }
      }}
      onMouseOver={() => setHovering(true)}
      onMouseOut={() => setHovering(false)}
    >
      {children}
    </div>
  )
}
