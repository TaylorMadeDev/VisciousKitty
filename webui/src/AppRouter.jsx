import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'

export default function AppRouter(){
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<App initialTab='dashboard'/>} />
        <Route path='/clients' element={<App initialTab='clients'/>} />
        <Route path='/tasks' element={<App initialTab='tasks'/>} />
        <Route path='/payloads' element={<App initialTab='payloads'/>} />
        <Route path='/builder' element={<App initialTab='builder'/>} />
        <Route path='/results' element={<App initialTab='results'/>} />
        <Route path='/settings' element={<App initialTab='settings'/>} />
        <Route path='/machine/:id' element={<App initialTab='machine'/>} />
      </Routes>
    </BrowserRouter>
  )
}
