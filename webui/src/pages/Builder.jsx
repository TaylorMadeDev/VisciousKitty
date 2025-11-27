import React, { useState } from 'react'

export default function Builder({server}){
  const defaultUrl = server.replace(/\/$/, '')
  const urlMatch = defaultUrl.match(/^https?:\/\/([^:\/]+)(?::(\d+))?/) || []
  const [host, setHost] = useState(urlMatch[1] || '127.0.0.1')
  const [port, setPort] = useState(urlMatch[2] || '8000')
  const [exeName, setExeName] = useState('vk_client')
  const [onefile, setOnefile] = useState(true)
  const [consoleMode, setConsoleMode] = useState(false)
  const [building, setBuilding] = useState(false)
  const [buildLog, setBuildLog] = useState(null)

  const build = async () => {
    if (building) return
    setBuilding(true)
    try{
      const server_url = `http://${host}:${port}/`
      const params = new URLSearchParams({ server_url, onefile: String(onefile), console: String(consoleMode) })
      const url = `${server.replace(/\/$/, '')}/build_client?${params.toString()}`
      const resp = await fetch(url, { method: 'POST' })
      const ct = resp.headers.get('content-type') || ''
      if (ct.indexOf('application/json') !== -1) {
        const d = await resp.json()
        const log = d.log || d.reason || JSON.stringify(d)
        setBuildLog(String(log || 'No log available'))
        setBuilding(false)
        return
      }
      if (!resp.ok) {
        alert('Build failed: HTTP ' + resp.status)
        setBuilding(false)
        return
      }
      const blob = await resp.blob()
      const a = document.createElement('a')
      const obj = URL.createObjectURL(blob)
      a.href = obj
      const safeName = (exeName || 'vk_client').replace(/[^a-zA-Z0-9_\-]/g, '_') + '.exe'
      a.download = safeName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(obj)
    }catch(e){ alert('Build error: ' + String(e)) }
    setBuilding(false)
  }

  return (
    <div>
      <h3>Client Builder</h3>
      <div className='card' style={{marginTop:8}}>
        <div style={{display:'flex', flexDirection:'column', gap:12}}>
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <label style={{minWidth:120}}>Server host</label>
            <input value={host} onChange={e=>setHost(e.target.value)} style={{padding:8, borderRadius:8, border:'1px solid rgba(255,255,255,0.03)', background:'transparent'}} />
            <label style={{minWidth:60, marginLeft:12}}>Port</label>
            <input value={port} onChange={e=>setPort(e.target.value)} style={{width:120,padding:8,borderRadius:8,border:'1px solid rgba(255,255,255,0.03)', background:'transparent'}} />
          </div>

          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <label style={{minWidth:120}}>Executable name</label>
            <input value={exeName} onChange={e=>setExeName(e.target.value)} style={{padding:8, borderRadius:8, border:'1px solid rgba(255,255,255,0.03)', background:'transparent'}} />
          </div>

          <div style={{display:'flex', gap:16, alignItems:'center'}}>
            <label style={{display:'flex', gap:8, alignItems:'center'}}><input type='checkbox' checked={onefile} onChange={e=>setOnefile(e.target.checked)} /> One-file</label>
            <label style={{display:'flex', gap:8, alignItems:'center'}}><input type='checkbox' checked={consoleMode} onChange={e=>setConsoleMode(e.target.checked)} /> Show console</label>
          </div>

          <div style={{display:'flex', gap:8}}>
            <button className='btn btn--fancy' onClick={build} disabled={building}>{building? 'Building...':'Build & Download'}</button>
            <div style={{color:'var(--muted)', alignSelf:'center'}}>Builds a packaged Windows exe and downloads it.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
