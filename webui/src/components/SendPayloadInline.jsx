import React, { useState } from 'react'
import { genId } from '../lib/utils'

export default function SendPayloadInline({server, target, payloads = []}){
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState('')
  const [loading, setLoading] = useState(false)

  const send = async () =>{
    if(!sel) return
    setLoading(true)
    try{
      const id = genId()
      const url = `${server}/addtask?task_id=${encodeURIComponent(id)}&task_type=PAYLOAD&machine_id=${encodeURIComponent(target)}&command=${encodeURIComponent(sel)}`
      const r = await fetch(url, {method:'POST'})
      if(!r.ok) console.error('send payload failed', r.status)
      setOpen(false)
      setSel('')
    }catch(e){ console.error(e) }
    setLoading(false)
  }

  return (
    <div style={{display:'flex', gap:8, alignItems:'center'}}>
      {!open && <button className='btn btn--fancy' style={{padding:'6px 8px', fontSize:12}} onClick={(e)=>{ e.stopPropagation(); setOpen(true)}}>Send payload</button>}
      {open && (
        <div style={{display:'flex', gap:8, alignItems:'center'}} className='inlineForm' onClick={e => e.stopPropagation()}>
          <select value={sel} onChange={e=>setSel(e.target.value)} className='payloadSelect'>
            <option value=''>-- pick payload --</option>
            {payloads.map(p => <option key={p.id} value={p.file_name}>{p.file_name}</option>)}
          </select>
          <button className='btn btn--fancy' onClick={(e)=>{ e.stopPropagation(); send() }} disabled={loading || !sel} style={{padding:'6px 10px'}}>{loading? 'Sending...' : 'Send'}</button>
          <button className='btn' onClick={(e)=>{ e.stopPropagation(); setOpen(false); setSel('') }} style={{padding:'6px 10px', background:'transparent', color:'var(--muted)', border:'1px solid rgba(255,255,255,0.03)'}}>Cancel</button>
        </div>
      )}
    </div>
  )
}
