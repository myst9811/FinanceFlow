import React, { useEffect, useState } from 'react'
import { getSummary, getTransactions, getAnomalies, uploadFiles } from './services/api'

export default function App(){
  const [txns, setTxns] = useState([])
  const [summary, setSummary] = useState({by_month:[], by_category:[], savings_forecast:{history:[],forecast:[]}})
  const [anoms, setAnoms] = useState([])

  const refresh = async () => {
    setTxns(await getTransactions())
    setSummary(await getSummary())
    const a = await getAnomalies()
    setAnoms(a.anomalies || [])
  }

  useEffect(()=>{ refresh() }, [])

  const onUpload = async (e)=>{
    const files = Array.from(e.target.files || [])
    if(files.length===0) return
    const parsed = await uploadFiles(files)
    // push parsed transactions to DB
    await fetch('http://localhost:8000/api/transactions', {
      method:'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({transactions: parsed.transactions})
    })
    await refresh()
  }

  return (
    <div style={{fontFamily:'system-ui', padding:16}}>
      <h1>FinanceFlow Dashboard</h1>
      <p>Upload bank statements or receipt images (PDF/PNG/JPG). Parsed transactions are stored locally.</p>
      <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg" onChange={onUpload} />

      <h2>Summary</h2>
      <div style={{display:'flex', gap:24}}>
        <div>
          <h3>By Month</h3>
          <ul>{summary.by_month.map(r=> <li key={r.month}>{r.month}: {r.amount.toFixed(2)}</li>)}</ul>
        </div>
        <div>
          <h3>By Category</h3>
          <ul>{summary.by_category.map(r=> <li key={r.category}>{r.category}: {r.amount.toFixed(2)}</li>)}</ul>
        </div>
        <div>
          <h3>Savings Forecast</h3>
          <ul>{summary.savings_forecast.forecast?.map(r=> <li key={r.month}>{r.month}: {r.value.toFixed(2)}</li>)}</ul>
        </div>
      </div>

      <h2>Transactions ({txns.length})</h2>
      <table border="1" cellPadding="6">
        <thead>
          <tr><th>Date</th><th>Amount</th><th>Category</th><th>Description</th></tr>
        </thead>
        <tbody>
          {txns.map(t => (
            <tr key={t.id}>
              <td>{t.date}</td>
              <td>{t.amount}</td>
              <td>{t.category}</td>
              <td>{t.description}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Anomalies</h2>
      <ul>{anoms.map(a => <li key={a.id}>{a.date} — {a.amount} — {a.description}</li>)}</ul>
    </div>
  )
}
