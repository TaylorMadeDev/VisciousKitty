import React from 'react'
import SmallCard from '../components/SmallCard'
import SendPayloadInline from '../components/SendPayloadInline'
import { formatAgo } from '../lib/utils'

export default function Dashboard({ clientsCount, tasksCount, payloads = [], clients = [], now, onOpenMachine }){
  return (
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
                <tr key={c.id} className='rowClickable' onClick={() => { onOpenMachine && onOpenMachine(c.id) }}>
                  <td style={{maxWidth:380}}>{c.id}</td>
                  <td>{c.last_seen? formatAgo(c.last_seen): '-'}</td>
                  <td>{typeof c.sleeping_until === 'number' && c.sleeping_until ? Math.max(0, Math.round(c.sleeping_until - now)) : '-'}</td>
                  <td>{String(c.has_task)}</td>
                  <td><SendPayloadInline server={window.__VK_SERVER || 'http://127.0.0.1:8000'} target={c.id} payloads={payloads} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
