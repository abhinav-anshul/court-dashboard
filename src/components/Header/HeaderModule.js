import React from 'react'
import MainPopover from '../MainPopover'

function HeaderModule() {
  return (
    <div
      ref={buttonRef}
      tabIndex="0"
      css={`
        display: flex;
        align-items: center;
        height: 100%;
        outline: 0;
      `}
    >
      {' '}
      {content}
      <MainPopover
        animateHeight={animate}
        heading={screen.title}
        height={screen.height}
        onClose={handlePopoverClose}
        opener={buttonRef.current}
        visible={opened}
      />
    </div>
  )
}

export default HeaderModule
