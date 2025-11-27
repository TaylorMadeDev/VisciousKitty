import React, { useState, useEffect } from 'react'
import SendPayloadInline from '../components/SendPayloadInline'
import AnimatedCountdown from '../components/AnimatedCountdown'
import { formatAgo } from '../lib/utils'

function ClientRow({idx, c, payloads, server, now, nicknames = {}, setNickname, onOpenMachine}){
  const nowVal = now || (Date.now()/1000)
  const secs = (typeof c.sleeping_until === 'number' && c.sleeping_until) ? Math.max(0, Math.round(c.sleeping_until - nowVal)) : null
  const sleeping = secs !== null && secs > 0
  const nick = (nicknames && nicknames[c.id]) || ''
  return (
    <tr className='rowClickable' onClick={() => onOpenMachine ? onOpenMachine(c.id) : null}>
      <td>{idx+1}</td>
      <td style={{maxWidth:380}}>{c.id}</td>
      <td style={{maxWidth:220, color:'var(--muted)'}}>{nick || <span style={{color:'var(--muted)'}}>-</span>} <button className='btn' style={{marginLeft:8,padding:'4px 6px'}} onClick={(e)=>{ e.stopPropagation(); const res = window.prompt('Set nickname for this machine (blank to clear):', nick || ''); if(res !== null){ setNickname && setNickname(c.id, res || '') } }}>✎</button></td>
      <td>{c.last_seen? formatAgo(c.last_seen) : '-'}</td>
      <td><span style={{display:'inline-flex', alignItems:'center'}}><span className={`statusDot ${sleeping? 'sleeping':'idle'}`} />{secs !== null ? <AnimatedCountdown value={secs} /> : '-'}</span></td>
      <td>{String(c.has_task)}</td>
      <td><SendPayloadInline server={server} target={c.id} payloads={payloads} /></td>
    </tr>
  )
}

export default function Clients({server, payloads = [], nicknames = {}, setNickname, onOpenMachine, now}){
  const [items, setItems] = useState([])
  useEffect(()=>{ (async ()=>{ try{ const r=await fetch(server + '/clients_status'); const d=await r.json(); setItems(Object.entries(d.clients_status||{}).map(([id,s]) => ({id, ...s}))) }catch(e){} })() }, [server])
  return (
    <div>
      <h3>Clients</h3>
      <div className='card' style={{marginTop:8}}>
        <table className='table'><thead><tr><th>#</th><th>machine_id</th><th>nickname</th><th>last_seen</th><th>sleeping_in(s)</th><th>has_task</th><th>actions</th></tr></thead>
        <tbody>
        {items.map((c,i)=> <ClientRow key={c.id} idx={i} c={c} payloads={payloads} server={server} nicknames={nicknames} setNickname={setNickname} onOpenMachine={onOpenMachine} now={now} />)}
        </tbody></table>
      </div>
    </div>
  )
}
