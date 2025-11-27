import React, { useState, useEffect } from 'react'

export default function AnimatedCountdown({value}){
  const [tick, setTick] = useState(false)
  const [last, setLast] = useState(value)
  useEffect(()=>{
    if (value !== last){
      setTick(true)
      setLast(value)
      const t = setTimeout(()=> setTick(false), 320)
      return ()=> clearTimeout(t)
    }
  }, [value, last])
  return <span className={`countdown ${tick? 'tick':''}`}>{typeof value === 'number' ? value : '-'}</span>
}
