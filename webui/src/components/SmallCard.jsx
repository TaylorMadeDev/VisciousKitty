import React from 'react'

export default function SmallCard({title, value, children}){
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
