const BASE = "http://localhost:8000"

export async function getTransactions(){
  const r = await fetch(BASE + "/api/transactions")
  return await r.json()
}

export async function getSummary(){
  const r = await fetch(BASE + "/api/summary")
  return await r.json()
}

export async function getAnomalies(){
  const r = await fetch(BASE + "/api/anomalies")
  return await r.json()
}

export async function uploadFiles(files){
  const fd = new FormData()
  files.forEach(f => fd.append("files", f))
  const r = await fetch(BASE + "/api/upload", { method: "POST", body: fd })
  return await r.json()
}
