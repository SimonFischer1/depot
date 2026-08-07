// app.js — einfache lokale Portfolio-Logik
const STORAGE_KEY = 'depot_holdings_v1'
let holdings = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')

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

const allocationCtx = document.getElementById('allocationChart').getContext('2d')
const pnlCtx = document.getElementById('pnlChart').getContext('2d')
let allocationChart, pnlChart

// Savings
const savingsForm = document.getElementById('savingsForm')
const savingsResult = document.getElementById('savingsResult')

function save(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings))
}

function formatEuro(x){
  return (typeof x==='number'? x: Number(x)).toLocaleString('de-DE',{style:'currency',currency:'EUR'})
}

function renderHoldings(){
  holdingsTableBody.innerHTML = ''
  holdings.forEach((h, i) => {
    const tr = document.createElement('tr')
    const current = h.currentPrice ? (h.currentPrice * h.quantity) : null
    const buyTotal = h.buyPrice * h.quantity
    const pnl = current != null ? (current - buyTotal) : null
    tr.innerHTML = `
      <td>${h.type}</td>
      <td>${h.name}</td>
      <td>${h.quantity}</td>
      <td>${formatEuro(h.buyPrice)}<br/><small>${formatEuro(buyTotal)}</small></td>
      <td>${current!=null? formatEuro(current): '<em>—</em>'}</td>
      <td>${pnl!=null? formatEuro(pnl): '<em>—</em>'}</td>
      <td><button class="btn" data-i="${i}">Entfernen</button></td>
    `
    holdingsTableBody.appendChild(tr)
  })
  document.querySelectorAll('#holdingsTable button[data-i]').forEach(btn=>{
    btn.addEventListener('click',e=>{
      const i = Number(btn.dataset.i)
      holdings.splice(i,1)
      save(); renderHoldings(); updateCharts()
    })
  })
}

async function fetchCryptoPrices(names){
  // names = array of id or symbol (we'll attempt to map name->coingecko id by search)
  // Use CoinGecko simple price by ids (we assume the user enters common names like bitcoin, ethereum)
  const ids = names.map(n=>n.toLowerCase().trim().replace(' ','-'))
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(','))}&vs_currencies=eur`;
  try{
    const r = await fetch(url)
    if(!r.ok) throw new Error('CoinGecko error')
    const data = await r.json()
    const map = {}
    names.forEach((n, idx)=>{
      const id = ids[idx]
      if(data[id] && data[id].eur) map[n] = data[id].eur
    })
    return map
  }catch(e){
    console.warn('Crypto price fetch failed', e)
    return {}
  }
}

async function tryFetchQuoteYahoo(ticker){
  // Try Yahoo Finance quote endpoint via cors proxy (allorigins.win)
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`
  const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  try{
    const r = await fetch(proxy)
    if(!r.ok) throw new Error('Yahoo proxy failed')
    const j = await r.json()
    const quote = j.quoteResponse && j.quoteResponse.result && j.quoteResponse.result[0]
    if(quote && quote.regularMarketPrice) return quote.regularMarketPrice
  }catch(e){
    console.warn('Yahoo fetch failed', e)
  }
  return null
}

async function updatePrices(){
  // fetch crypto prices for all crypto holdings
  const cryptoNames = [...new Set(holdings.filter(h=>h.type==='crypto').map(h=>h.name))]
  const cryptoPrices = await fetchCryptoPrices(cryptoNames)

  for(let h of holdings){
    if(h.type==='crypto'){
      const p = cryptoPrices[h.name] || null
      if(p) h.currentPrice = p
    } else if(h.type==='stock' || h.type==='etf'){
      // try yahoo
      const p = await tryFetchQuoteYahoo(h.name).catch(()=>null)
      if(p) h.currentPrice = p
    } else if(['gold','silver','copper'].includes(h.type)){
      // no free guaranteed API; leave currentPrice as-is and allow manual edit
      // try yahoo too with common symbols: XAUUSD, XAGUSD, HG=F (copper futures). The user-provided name may be a ticker.
      const trySymbols = {gold:'XAUUSD', silver:'XAGUSD', copper:'HG=F'}
      const guess = trySymbols[h.type]
      const p = await tryFetchQuoteYahoo(guess).catch(()=>null)
      if(p){
        // Yahoo returns USD price — we do not convert currency; user can interpret approx.
        h.currentPrice = p
      }
    }
  }

  save(); renderHoldings(); updateCharts()
}

function updateCharts(){
  const byType = {}
  const labels = []
  const values = []
  const pnlLabels = []
  const pnlValues = []

  holdings.forEach(h=>{
    const buyTotal = h.buyPrice * h.quantity
    const currentTotal = (h.currentPrice||0) * h.quantity
    const pnl = currentTotal - buyTotal
    // allocation by current value (fallback to buyTotal)
    const val = (h.currentPrice? currentTotal: buyTotal)
    byType[h.name] = {type:h.type, val, pnl}
  })

  Object.keys(byType).forEach(k=>{
    labels.push(k)
    values.push(byType[k].val)
    pnlLabels.push(k)
    pnlValues.push(byType[k].pnl)
  })

  // Allocation chart
  if(allocationChart) allocationChart.destroy()
  allocationChart = new Chart(allocationCtx, {
    type:'pie',
    data:{labels, datasets:[{data:values, backgroundColor:labels.map((_,i)=>i%2? '#00a99d': '#0b2b3b')} ]},
    options:{plugins:{legend:{position:'bottom'}}}
  })

  if(pnlChart) pnlChart.destroy()
  pnlChart = new Chart(pnlCtx, {
    type:'bar',
    data:{labels:pnlLabels, datasets:[{label:'Gewinn / Verlust EUR', data:pnlValues, backgroundColor:pnlValues.map(v=> v>=0? 'rgba(0,169,157,0.8)':'rgba(220,53,69,0.8)')}]},
    options:{scales:{y:{ticks:{callback: v=> v.toLocaleString() + ' €'}}}, plugins:{legend:{display:false}}}
  })
}

// events
buyForm.addEventListener('submit', e=>{
  e.preventDefault()
  const h = {
    type: assetType.value,
    name: assetName.value.trim(),
    date: buyDate.value,
    quantity: Number(quantity.value),
    buyPrice: Number(buyPrice.value),
    currentPrice: null
  }
  holdings.push(h)
  save(); renderHoldings(); updateCharts()
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
    save(); renderHoldings(); updateCharts()
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

  // compute
  let n = 1 // compounds per year
  if(payout==='monthly') n = 12
  else if(payout==='yearly') n = 1
  else if(payout==='none') n = 1

  let result;
  if(payout==='none' || !reinvest){
    // simple interest or compounding only at end
    // if no reinvest: interest paid out and not compounded -> simple interest
    if(!reinvest){
      const interest = P * r * years
      result = {final: P + interest, interest}
    } else {
      // reinvest true but payout none -> compounding continuously per year n=1
      const final = P * Math.pow(1 + r / n, n * years)
      result = {final, interest: final - P}
    }
  } else {
    // payouts with option to reinvest (we handle reinvest true here)
    const final = P * Math.pow(1 + r / n, n * years)
    result = {final, interest: final - P}
  }

  if(result){
    savingsResult.innerHTML = `<strong>Endbetrag:</strong> ${formatEuro(result.final)}<br/><strong>Zinsen insgesamt:</strong> ${formatEuro(result.interest)}`
  }
})

// initial render
renderHoldings(); updateCharts()

// expose for debugging
window.__depot = {holdings, save, updatePrices}
