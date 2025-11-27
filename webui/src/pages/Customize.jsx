import React, { useState } from 'react'

export default function Customize(){
  const [accent, setAccent] = useState(getComputedStyle(document.documentElement).getPropertyValue('--accent')?.trim() || '#7ee7ff')
  const [accent2, setAccent2] = useState(getComputedStyle(document.documentElement).getPropertyValue('--accent-2')?.trim() || '#9b7cff')
  const [nebulaIntensity, setNebulaIntensity] = useState(0.9)

  const apply = () =>{
    document.documentElement.style.setProperty('--accent', accent)
    document.documentElement.style.setProperty('--accent-2', accent2)
    const neb = document.querySelector('.nebula')
    if (neb) neb.style.opacity = String(Math.max(0.2, Math.min(1.0, nebulaIntensity)))
  }

  const applyPreset = (preset) => {
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
