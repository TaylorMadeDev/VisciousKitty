import React, { useState } from 'react'
import VkCheckbox from '../components/VkCheckbox'

export default function Settings({server}){
  const [value, setValue] = useState(() => { try{ return parseInt(localStorage.getItem('vk_poll_ms')||'10000',10) }catch{return 10000}})
  const [reduce, setReduce] = useState(() => { try{ return localStorage.getItem('vk_reduce_motion') === '1' }catch{return false}})
  const [building, setBuilding] = useState(false)

  const buildClient = async () => {
    if (building) return
    setBuilding(true)
    try{
      const url = `${server.replace(/\/$/, '')}/build_client?server_url=${encodeURIComponent(server)}&onefile=true&console=false`
      const resp = await fetch(url, { method: 'POST' })
      if (!resp.ok) {
        let d = null
        try{ d = await resp.json() }catch(e){}
        alert('Build failed: ' + (d && (d.reason || d.status) ? (d.reason || JSON.stringify(d)) : resp.status))
        setBuilding(false)
        return
      }
      const ct = resp.headers.get('content-type') || ''
      if (ct.indexOf('application/octet-stream') === -1 && ct.indexOf('application/x-msdownload') === -1) {
        const d = await resp.json()
        alert('Build response: ' + JSON.stringify(d))
        setBuilding(false)
        return
      }
      const blob = await resp.blob()
      const a = document.createElement('a')
      const obj = URL.createObjectURL(blob)
      a.href = obj
      a.download = 'vk_client.exe'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(obj)
    }catch(e){ alert('Build error: ' + String(e)) }
    setBuilding(false)
  }

  const save = () =>{
    try{ localStorage.setItem('vk_poll_ms', String(value)) }catch{}
    try{ localStorage.setItem('vk_reduce_motion', reduce ? '1':'0') }catch{}
    window.location.reload()
  }

  return (
    <div>
      <h3>Settings</h3>
      <div className='card' style={{marginTop:8}}>
        <div style={{display:'flex', flexDirection:'column', gap:12}}>
          <div style={{display:'flex', gap:10, alignItems:'center'}}>
            <label style={{minWidth:220}}>UI polling interval (ms)</label>
            <input type='number' value={value} onChange={e=>setValue(parseInt(e.target.value || '10000',10))} style={{padding:8, borderRadius:8, border:'1px solid rgba(255,255,255,0.03)', background:'transparent'}} />
          </div>

          <div style={{display:'flex', gap:10, alignItems:'center'}}>
            <label style={{minWidth:220}}>Reduce motion (disable animations)</label>
            <VkCheckbox className='vk-small' checked={reduce} onChange={(on)=>setReduce(Boolean(on))} />
          </div>

          <div style={{display:'flex', gap:8, marginTop:6}}>
            <button className='btn btn--fancy' onClick={save}>Save & Reload</button>
            <div style={{alignSelf:'center', color:'var(--muted)', fontSize:13}}>Reload is required for some visual settings to fully apply.</div>
          </div>
          <div style={{display:'flex', gap:8, marginTop:12, alignItems:'center'}}>
            <button className='btn btn--fancy' onClick={buildClient} disabled={building}>{building? 'Building...':'Build client (.exe)'}</button>
            <div style={{color:'var(--muted)', fontSize:13}}>Builds a packaged Windows exe of the client for download.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
