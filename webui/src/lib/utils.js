import { useEffect } from 'react'

export function usePolling(fn, ms = 5000) {
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

export function formatAgo(epochSeconds){
  if (!epochSeconds) return '-'
  const delta = Date.now()/1000 - epochSeconds
  if (delta < 2) return 'just now'
  if (delta < 60) return `${Math.round(delta)}s ago`
  if (delta < 3600) return `${Math.round(delta/60)}m ago`
  if (delta < 86400) return `${Math.round(delta/3600)}h ago`
  return `${Math.round(delta/86400)}d ago`
}

export function genId(){
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,10)
}

// watchForResult and watchForScreenshot rely on SERVER constant; caller should provide server URL
export function watchForResult(server, taskId, machineId, onFound, intervalMs = 1500, timeoutMs = 120000){
  let stopped = false
  let iv = null
  let to = null
  const stop = () => { stopped = true; if(iv) clearInterval(iv); if(to) clearTimeout(to) }

  const check = async () => {
    if (stopped) return
    try{
      const r = await fetch(server + '/results?machine_id=' + encodeURIComponent(machineId))
      const d = await r.json()
      const list = d.results || []
      const found = list.find(x => x.task_id === taskId)
      if (found) {
        stop()
        try{ onFound(found) }catch(e){ console.error(e) }
      }
    }catch(e){ /* ignore transient errors */ }
  }

  check()
  iv = setInterval(check, intervalMs)
  to = setTimeout(() => { stop(); }, timeoutMs)
  return stop
}

export function watchForScreenshot(server, taskId, machineId, onFound, intervalMs = 700, timeoutMs = 15000){
  let stopped = false
  let iv = null
  let to = null
  const stop = () => { stopped = true; if(iv) clearInterval(iv); if(to) clearTimeout(to) }
  const check = async () => {
    if (stopped) return
    try{
      const r = await fetch(server + '/screenshot?machine_id=' + encodeURIComponent(machineId))
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
