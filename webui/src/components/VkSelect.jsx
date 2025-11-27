import React, { useState, useRef, useEffect } from 'react'

export default function VkSelect({ value, onChange, options = [], placeholder = 'Select' }){
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(()=>{
    const onDoc = (e) => { if(ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (ev) => { if(ev.key === 'Escape') setOpen(false) }
    document.addEventListener('click', onDoc)
    document.addEventListener('keydown', onKey)
    return ()=>{ document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey) }
  }, [])
  const selected = options.find(o => o.value === value)
  return (
    <div className={`vk-select ${open? 'open':''}`} ref={ref}>
      <div className='vk-select__trigger' onClick={()=>setOpen(s=>!s)} role='button' tabIndex={0} onKeyDown={e=>{ if(e.key==='Enter' || e.key===' ') setOpen(s=>!s) }}>
        <div className='vk-select__label'>{selected ? selected.label : placeholder}</div>
        <div className='vk-select__caret'>▾</div>
      </div>
      {open && (
        <div className='vk-select__list' role='listbox'>
          {options.map(o => (
            <div key={o.value} role='option' aria-selected={o.value===value} className={`vk-select__option ${o.value===value? 'selected':''}`} onClick={()=>{ onChange(o.value); setOpen(false) }}>
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
