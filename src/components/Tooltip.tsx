import React, { useState } from 'react'

interface TooltipProps {
  content: React.ReactNode
  children: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
}

export default function Tooltip({ content, children, position = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false)

  const posClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  }

  return (
    <span 
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onClick={() => setVisible(!visible)} // mobile friendly
    >
      {children}
      {visible && (
        <div 
          className={`absolute z-[400] px-3 py-2 text-xs bg-[#12151F] border border-[#252A38] text-[#E6E8EE] rounded-lg shadow-xl max-w-[260px] whitespace-normal ${posClasses[position]}`}
        >
          {content}
        </div>
      )}
    </span>
  )
}


