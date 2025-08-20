'use client'

import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

interface TextEffectProps {
  children: React.ReactNode
  className?: string
  preset?: 'fade-in' | 'fade-in-blur' | 'slide-up'
  speedSegment?: number
  delay?: number
  as?: keyof JSX.IntrinsicElements
  per?: 'line' | 'word' | 'char'
}

export function TextEffect({ 
  children, 
  className, 
  preset = 'fade-in',
  speedSegment = 0.1,
  delay = 0,
  as = 'div',
  per = 'char'
}: TextEffectProps) {
  const [isVisible, setIsVisible] = useState(false)
  
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay * 1000)
    return () => clearTimeout(timer)
  }, [delay])

  const variants = {
    'fade-in': {
      initial: { opacity: 0 },
      animate: { opacity: 1 }
    },
    'fade-in-blur': {
      initial: { opacity: 0, filter: 'blur(4px)' },
      animate: { opacity: 1, filter: 'blur(0px)' }
    },
    'slide-up': {
      initial: { opacity: 0, y: 20 },
      animate: { opacity: 1, y: 0 }
    }
  }

  const Component = motion[as as keyof typeof motion] || motion.div

  if (per === 'line' && typeof children === 'string') {
    const lines = children.split('\n')
    return (
      <div className={className}>
        {lines.map((line, index) => (
          <Component
            key={index}
            initial={variants[preset].initial}
            animate={isVisible ? variants[preset].animate : variants[preset].initial}
            transition={{ 
              duration: 0.6,
              delay: index * speedSegment,
              ease: "easeOut"
            }}
          >
            {line}
          </Component>
        ))}
      </div>
    )
  }

  return (
    <Component
      className={className}
      initial={variants[preset].initial}
      animate={isVisible ? variants[preset].animate : variants[preset].initial}
      transition={{ 
        duration: 0.8,
        delay: 0,
        ease: "easeOut"
      }}
    >
      {children}
    </Component>
  )
}