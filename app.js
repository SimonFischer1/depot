// app.js — verbesserte Portfolio-Logik mit History und korrigierter Preisberechnung
const STORAGE_KEY = 'depot_holdings_v1'
const HISTORY_KEY = 'depot_history_v1'
let holdings = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')

// DOM
const buyForm = document.getElementById('buyForm')
const assetType = document.getElementById('assetType')
const assetName = document.getElementById('assetName')
const buyDate = document.getElementById('buyDate')
const quantity = document.getElementById('quantity')
const buyPrice = document.getElementById('buyPrice')
const holdingsTableBody = document.querySelector('#holdingsTable tbody')
const fetchPricesBtn = document.getElementById('fetchPrices')
const clearAllBtn = document.getElementById('clearAll')
const historySelect = document.getElementById('historySelect')

const allocationCtx = document.getElementById('allocationChart').getContext('2d')
const pnlCtx = document.getElementById('pnlChart').getContext('2d')
const historyCtx = document.getElementById('historyChart').getContext('2d')
const compareCtx = document.getElementById('compareChart').getContext('2d')
let allocationChart, pnlChart, historyChart, compareChart

// Savings
const savingsForm = document.getElementById('savingsForm')
const savingsResult = document.getElementById('savingsResult')

function save(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings))
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
}

function formatEuro(x){
  if (x === null || x === undefined || Number.isNaN(Number(x))) return '—'
  return Number(x).toLocaleString('de-DE',{style:'currency',currency:'EUR'})
}

function uid(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8)
}

function renderHoldings(){
  holdingsTableBody.innerHTML = ''
  holdings.forEach((h, i) => {
    const currentUnit = typeof h.currentPrice === 'number' ? h.currentPrice : null
    const buyTotal = h.buyPrice * h.quantity
    const currentTotal = currentUnit != null ? currentUnit * h.quantity : null
    const pnl = currentTotal != null ? (currentTotal - buyTotal) : null
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${h.type}</td>
      <td>${h.name}</td>
      <td>${h.quantity}</td>
      <td>${formatEuro(h.buyPrice)}<br/><small>${formatEuro(buyTotal)}</small></td>
      <td>${currentUnit!=null? formatEuro(currentUnit): '<em>—</em>'}</td>
      <td>${currentTotal!=null? formatEuro(currentTotal): '<em>—</em>'}</td>
      <td>${pnl!=null? formatEuro(pnl): '<em>—</em>'}</td>
      <td><button class="btn" data-i="${i}">Entfernen</button></td>
    `
    holdingsTableBody.appendChild(tr)
  })
  document.querySelectorAll('#holdingsTable button[data-i]').forEach(btn=>{
    btn.addEventListener('click',e=>{
      const i = Number(btn.dataset.i)
      holdings.splice(i,1)
      updateHistorySelect()
      save(); renderHoldings(); updateCharts()
    })
  })
}

// CoinGecko helper: map name/ticker -> id
let coinListCache = null
async function ensureCoinList(){
  if(coinListCache) return
  try{
    const r = await fetch('https://api.coingecko.com/api/v3/coins/list')
    coinListCache = await r.json()
  }catch(e){
    console.warn('CoinGecko coin list failed', e)
    coinListCache = []
  }
}

function guessCoinId(name){
  if(!coinListCache) return null
  const q = name.toLowerCase()
  // exact id
  let found = coinListCache.find(c=>c.id.toLowerCase()===q)
  if(found) return found.id
  // match symbol
  found = coinListCache.find(c=>c.symbol.toLowerCase()===q)
  if(found) return found.id
  // match name contains
  found = coinListCache.find(c=>c.name.toLowerCase().includes(q))
  if(found) return found.id
  return null
}

async function fetchCryptoPrices(names){
  await ensureCoinList()
  const ids = []
  const mapping = {}
  names.forEach(n=>{
    const id = guessCoinId(n)
    if(id) ids.push(id)
  })
  if(ids.length===0) return {}
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(','))}&vs_currencies=eur`;
  try{
    const r = await fetch(url)
    if(!r.ok) throw new Error('CoinGecko error')
    const data = await r.json()
    // map back to provided names
    names.forEach(n=>{
      const id = guessCoinId(n)
      if(id && data[id] && data[id].eur) mapping[n] = data[id].eur
    })
    return mapping
  }catch(e){
    console.warn('Crypto price fetch failed', e)
    return {}
  }
}

async function tryFetchQuoteYahoo(ticker){
  // Best-effort Yahoo quote via public proxy — may fail due to CORS or proxy limits.
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`
  const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  try{
    const r = await fetch(proxy)
    if(!r.ok) throw new Error('Yahoo proxy failed')
    const j = await r.json()
    const quote = j.quoteResponse && j.quoteResponse.result && j.quoteResponse.result[0]
    if(quote && typeof quote.regularMarketPrice === 'number') return quote.regularMarketPrice
  }catch(e){
    console.warn('Yahoo fetch failed', e)
  }
  return null
}

async function updatePrices(){
  const cryptoNames = [...new Set(holdings.filter(h=>h.type==='crypto').map(h=>h.name))]
  const cryptoPrices = await fetchCryptoPrices(cryptoNames)

  for(let h of holdings){
    if(h.type==='crypto'){
      const p = cryptoPrices[h.name] || null
      if(p) h.currentPrice = p
    } else if(h.type==='stock' || h.type==='etf'){
      const p = await tryFetchQuoteYahoo(h.name)
      if(p) h.currentPrice = p
    } else if(['gold','silver','copper'].includes(h.type)){
      const trySymbols = {gold:'XAUUSD', silver:'XAGUSD', copper:'HG=F'}
      const guess = trySymbols[h.type]
      const p = await tryFetchQuoteYahoo(guess)
      if(p) h.currentPrice = p
    }
  }

  // After updating, create a snapshot for history
  const timestamp = Date.now()
  const snapshot = {timestamp, total:0, items: []}
  holdings.forEach(h=>{
    const price = typeof h.currentPrice === 'number' ? h.currentPrice : h.buyPrice
    const total = price * h.quantity
    snapshot.items.push({id:h.id, name:h.name, total, unitPrice: price})
    snapshot.total += total
  })
  history.push(snapshot)
  // keep only last 500 snapshots
  if(history.length>500) history = history.slice(history.length-500)

  save(); renderHoldings(); updateHistorySelect(); updateCharts()
}

function updateCharts(){
  // Allocation & PNL
  const labels = holdings.map(h=>h.name + ' ('+h.quantity+')')
  const allocationValues = holdings.map(h=> (typeof h.currentPrice==='number'? h.currentPrice : h.buyPrice) * h.quantity )
  const pnlValues = holdings.map(h=>{
    const current = typeof h.currentPrice==='number' ? h.currentPrice * h.quantity : h.buyPrice * h.quantity
    return current - (h.buyPrice * h.quantity)
  })

  if(allocationChart) allocationChart.destroy()
  allocationChart = new Chart(allocationCtx, {
    type:'doughnut',
    data:{labels, datasets:[{data:allocationValues, backgroundColor:labels.map((_,i)=> i%2? 'rgba(0,241,208,0.9)':'rgba(0,184,154,0.9)')}]},
    options:{plugins:{legend:{position:'bottom'}}}
  })

  if(pnlChart) pnlChart.destroy()
  pnlChart = new Chart(pnlCtx, {
    type:'bar',
    data:{labels, datasets:[{label:'Gewinn / Verlust EUR', data:pnlValues, backgroundColor:pnlValues.map(v=> v>=0? 'rgba(0,241,208,0.9)':'rgba(255,99,132,0.9)')}]},
    options:{scales:{y:{ticks:{callback: v=> v.toLocaleString() + ' €'}}}, plugins:{legend:{display:false}}}
  })

  // History chart (portfolio total over time)
  if(historyChart) historyChart.destroy()
  const histLabels = history.map(s=> new Date(s.timestamp).toLocaleString())
  const histValues = history.map(s=> s.total)
  historyChart = new Chart(historyCtx, {
    type:'line',
    data:{labels:histLabels, datasets:[{label:'Portfolio-Wert', data:histValues, borderColor: 'rgba(0,241,208,0.9)', backgroundColor:'rgba(0,241,208,0.12)', tension:0.2, fill:true}]},
    options:{scales:{y:{ticks:{callback: v=> v.toLocaleString() + ' €'}}}, plugins:{legend:{display:false}}}
  })

  // Compare buyPrice vs currentPrice scatter
  if(compareChart) compareChart.destroy()
  const scatterData = holdings.map(h=>{
    const current = typeof h.currentPrice==='number' ? h.currentPrice : h.buyPrice
    return {x: h.buyPrice, y: current, r: Math.min(20, Math.max(5, Math.sqrt(h.quantity))) , label: h.name}
  })
  compareChart = new Chart(compareCtx, {
    type:'bubble',
    data:{datasets:[{label:'Buy vs Current (per Einheit)', data:scatterData, backgroundColor:'rgba(0,184,154,0.9)'}]},
    options:{scales:{x:{title:{display:true,text:'Kaufpreis (EUR)'}}, y:{title:{display:true,text:'Aktueller Preis (EUR)'}}}, plugins:{tooltip:{callbacks:{label:context=>{
      const d = context.raw
      return `${d.label}: Kauf ${d.x} € → Aktuell ${d.y} €` }}}}}
  })
}

function updateHistorySelect(){
  // populate with holdings and portfolio
  historySelect.innerHTML = '<option value="portfolio">Gesamtportfolio</option>'
  holdings.forEach(h=>{
    const opt = document.createElement('option')
    opt.value = h.id
    opt.textContent = h.name
    historySelect.appendChild(opt)
  })
}

// events
buyForm.addEventListener('submit', e=>{
  e.preventDefault()
  const h = {
    id: uid(),
    type: assetType.value,
    name: assetName.value.trim(),
    date: buyDate.value,
    quantity: Number(quantity.value),
    buyPrice: Number(buyPrice.value),
    currentPrice: null
  }
  holdings.push(h)
  save(); renderHoldings(); updateHistorySelect(); updateCharts()
  buyForm.reset()
})

fetchPricesBtn.addEventListener('click', async ()=>{
  fetchPricesBtn.disabled = true
  fetchPricesBtn.textContent = 'Hole...'
  await updatePrices()
  fetchPricesBtn.disabled = false
  fetchPricesBtn.textContent = 'Aktuelle Preise holen'
})

clearAllBtn.addEventListener('click', ()=>{
  if(confirm('Alle Einträge löschen?')){
    holdings = []
    history = []
    save(); renderHoldings(); updateHistorySelect(); updateCharts()
  }
})

// Savings calculator
savingsForm.addEventListener('submit', e=>{
  e.preventDefault()
  const P = Number(document.getElementById('principal').value)
  const r = Number(document.getElementById('rate').value)/100
  const years = Number(document.getElementById('years').value)
  const payout = document.getElementById('payoutFreq').value
  const reinvest = document.getElementById('reinvest').checked

  let n = 1
  if(payout==='monthly') n = 12
  else if(payout==='yearly') n = 1
  else if(payout==='none') n = 1

  let result
  if(!reinvest){
    const interest = P * r * years
    result = {final: P + interest, interest}
  } else {
    const final = P * Math.pow(1 + r / n, n * years)
    result = {final, interest: final - P}
  }

  if(result){
    savingsResult.innerHTML = `<strong>Endbetrag:</strong> ${formatEuro(result.final)}<br/><strong>Zinsen insgesamt:</strong> ${formatEuro(result.interest)}`
  }
})

// initial render
renderHoldings(); updateHistorySelect(); updateCharts()

// expose for debugging
window.__depot = {holdings, history, save, updatePrices}
