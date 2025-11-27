import React from 'react'

export default function BuildLogModal({log, onClose}){
  if(!log) return null
  return (
    <div className='galleryModal' onClick={onClose}>
      <div className='galleryContent' onClick={e=>e.stopPropagation()} style={{width:'80%', maxWidth:900, padding:18}}>
        <button className='modalClose' onClick={onClose}>Close</button>
        <h3 style={{color:'var(--accent)'}}>Build Log</h3>
        <div style={{height:12}} />
        <pre style={{whiteSpace:'pre-wrap', maxHeight:'70vh', overflow:'auto', background:'rgba(0,0,0,0.6)', padding:12, borderRadius:8}}>{log}</pre>
      </div>
    </div>
  )
}
