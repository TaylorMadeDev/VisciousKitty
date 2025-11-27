import React, { useState, useEffect } from 'react'
import { genId } from '../lib/utils'

export default function Payloads({server, payloads = [], setPayloads}){
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
    (async ()=>{
      try{ const r = await fetch(server + '/clients_status'); const d = await r.json(); const m = Object.keys(d.clients_status || {}); setMachines(m) }catch(e){}
    })()
  }, [server])

  const openEditor = async (p) =>{
    setSelectedPayload(p)
    setPayloadContent('Loading...')
    try{ const r = await fetch(server + '/payload?file_name=' + encodeURIComponent(p.file_name)); const d = await r.json(); setPayloadContent(d.content || '') }catch(e){ setPayloadContent(`Error loading: ${String(e)}`) }
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
