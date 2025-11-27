import React from 'react'

export default function Header({clients, tasks}){
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
