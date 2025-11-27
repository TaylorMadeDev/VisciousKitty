import React from 'react'

export default function VkCheckbox({ id, checked=false, onChange, label, className='' }){
  const uid = id || ('vkcb-' + Math.random().toString(36).slice(2,8))
  return (
    <label className={`vk-checkbox ${className||''}`} htmlFor={uid}>
      <input id={uid} type='checkbox' checked={!!checked} onChange={e => onChange && onChange(e.target.checked)} />
      <span className='vk-box' aria-hidden='true'>
        <svg className='vk-check' viewBox='0 0 24 24' width='14' height='14' xmlns='http://www.w3.org/2000/svg'>
          <polyline points='20 6 9 17 4 12' stroke='currentColor' fill='none' strokeWidth='2.6' strokeLinecap='round' strokeLinejoin='round' />
        </svg>
      </span>
      {label ? <span className='vk-label'>{label}</span> : null}
    </label>
  )
}
