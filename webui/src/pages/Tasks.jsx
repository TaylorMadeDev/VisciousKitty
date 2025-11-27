import React, { useState } from 'react'

export default function Tasks({server}){
  const [target, setTarget] = useState('')
  const [tasks, setTasks] = useState([])
  const load = async (t)=>{
    if(!t) return
    try{ const r = await fetch(server + '/tasks?short_id=' + encodeURIComponent(t)); const d = await r.json(); setTasks(d.tasks || []) }catch(e){ setTasks([{error: String(e)}]) }
  }
  return (
    <div>
      <h3>Tasks</h3>
      <div style={{display:'flex', gap:8, marginTop:10}}>
        <input placeholder='short id or machine_id' value={target} onChange={e=>setTarget(e.target.value)} style={{padding:8, borderRadius:8, border:'1px solid rgba(255,255,255,0.03)', background:'transparent', color:'inherit'}} />
        <button className='btn' onClick={()=>load(target)}>Load</button>
      </div>
      <div className='card' style={{marginTop:12}}>
        <table className='table'><thead><tr><th>task_id</th><th>type</th><th>payload</th></tr></thead>
        <tbody>
          {tasks.map(t => (
            <tr key={t.task_id}><td>{t.task_id}</td><td>{t.type}</td><td style={{maxWidth:600}}>{t.command || t.script || t.payload_name || ''}</td></tr>
          ))}
        </tbody></table>
      </div>
    </div>
  )
}
