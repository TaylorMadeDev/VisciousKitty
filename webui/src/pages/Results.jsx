import React, { useState, useEffect } from 'react'
import VkCheckbox from '../components/VkCheckbox'
import VkSelect from '../components/VkSelect'

export default function Results({server, nicknames = {}, setNickname}){
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
    try{ const r = await fetch(server + '/results_all'); const d = await r.json(); setItems(d.results || []) }catch(e){ console.error(e); setItems([]) }
    setLoading(false)
  }
  useEffect(()=>{ loadAll() }, [server])

  const toggleSelect = (id) =>{
    setSelectedIds(prev => { const next = new Set(prev); if(next.has(id)) next.delete(id); else next.add(id); return next })
  }

  const selectAllVisible = (visible) =>{
    if(visible.length === 0) return
    setSelectedIds(prev => { const next = new Set(prev); const allVisibleIds = visible.map(x => x.id); const allSelected = allVisibleIds.every(id => next.has(id)); if(allSelected){ allVisibleIds.forEach(id => next.delete(id)) } else { allVisibleIds.forEach(id => next.add(id)) } return next })
  }

  const deleteSelected = async () =>{
    if(selectedIds.size === 0) return
    if(!window.confirm(`Delete ${selectedIds.size} selected result(s)? This cannot be undone.`)) return
    setDeleting(true)
    try{ await Promise.all(Array.from(selectedIds).map(id => fetch(server + '/result?id=' + encodeURIComponent(id), { method: 'DELETE' }))); setSelectedIds(new Set()); await loadAll() }catch(e){ console.error(e) }
    setDeleting(false)
  }

  const view = async (id)=>{ try{ const r = await fetch(server + '/result?id=' + encodeURIComponent(id)); const d = await r.json(); setPreview(d.result) }catch(e){ setPreview({error:String(e)}) } }

  const deleteResult = async (id) => { if (!window.confirm('Delete this result?')) return; try{ await fetch(server + '/result?id=' + encodeURIComponent(id), { method: 'DELETE' }); await loadAll() }catch(e){ console.error(e) } }

  const filtered = items.filter(it => {
    if(query){ const q = query.toLowerCase(); const text = `${it.task_id} ${it.machine_id} ${String(it.result)}`.toLowerCase(); if(!text.includes(q)) return false }
    if(machineFilter){ if(!String(it.machine_id).includes(machineFilter)) return false }
    if(quickRange !== 'all'){ const ageSec = (Date.now()/1000) - (it.timestamp || 0); if(quickRange === '24h' && ageSec > 86400) return false; if(quickRange === '7d' && ageSec > 86400*7) return false }
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
