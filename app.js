
/* =========================================================
   DEPOT — FINANCE DASHBOARD
   Live prices + portfolio + performance + calculators
========================================================= */

const STORAGE_KEY = "depot_holdings_v3";
const HISTORY_KEY = "depot_history_v3";
const PRICE_CACHE_KEY = "depot_price_cache_v3";

const PRICE_REFRESH_MS = 60 * 1000;

let holdings = JSON.parse(
  localStorage.getItem(STORAGE_KEY) || "[]"
);

let history = JSON.parse(
  localStorage.getItem(HISTORY_KEY) || "[]"
);

let priceCache = JSON.parse(
  localStorage.getItem(PRICE_CACHE_KEY) || "{}"
);


/* =========================================================
   DOM
========================================================= */

const buyForm = document.getElementById("buyForm");
const assetType = document.getElementById("assetType");
const assetName = document.getElementById("assetName");
const buyDate = document.getElementById("buyDate");
const quantity = document.getElementById("quantity");
const buyPrice = document.getElementById("buyPrice");

const holdingsTableBody =
  document.querySelector("#holdingsTable tbody");

const fetchPricesBtn =
  document.getElementById("fetchPrices");

const refreshMarketsBtn =
  document.getElementById("refreshMarkets");

const clearAllBtn =
  document.getElementById("clearAll");

const historySelect =
  document.getElementById("historySelect");

const marketDot =
  document.getElementById("marketDot");

const marketStatus =
  document.getElementById("marketStatus");

const lastUpdate =
  document.getElementById("lastUpdate");

const holdingCount =
  document.getElementById("holdingCount");


/* =========================================================
   CHARTS
========================================================= */

const allocationCtx =
  document.getElementById("allocationChart").getContext("2d");

const pnlCtx =
  document.getElementById("pnlChart").getContext("2d");

const historyCtx =
  document.getElementById("historyChart").getContext("2d");

let allocationChart = null;
let pnlChart = null;
let historyChart = null;


/* =========================================================
   HELPERS
========================================================= */

function save() {

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(holdings)
  );

  localStorage.setItem(
    HISTORY_KEY,
    JSON.stringify(history)
  );

  localStorage.setItem(
    PRICE_CACHE_KEY,
    JSON.stringify(priceCache)
  );
}


function uid() {

  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 9)
  );

}


function formatEuro(value) {

  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return "—";
  }

  return Number(value).toLocaleString(
    "de-DE",
    {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2
    }
  );

}


function formatNumber(value, digits = 2) {

  if (!Number.isFinite(Number(value))) {
    return "—";
  }

  return Number(value).toLocaleString(
    "de-DE",
    {
      maximumFractionDigits: digits
    }
  );

}


function formatPercent(value) {

  if (!Number.isFinite(Number(value))) {
    return "—";
  }

  const sign = value > 0 ? "+" : "";

  return (
    sign +
    Number(value).toLocaleString(
      "de-DE",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    ) +
    "%"
  );

}


function isValidPrice(value) {

  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0
  );

}


function escapeHtml(text) {

  const div = document.createElement("div");

  div.textContent = text;

  return div.innerHTML;

}


/* =========================================================
   PRICE CACHE
========================================================= */

function setCachedPrice(key, data) {

  priceCache[key] = {
    ...data,
    timestamp: Date.now()
  };

}


function getCachedPrice(key) {

  return priceCache[key] || null;

}


/* =========================================================
   CORS FETCH
========================================================= */

async function fetchJson(url) {

  const proxies = [

    `https://corsproxy.io/?url=${encodeURIComponent(url)}`,

    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`

  ];

  let lastError = null;

  for (const proxyUrl of proxies) {

    try {

      const response = await fetch(
        proxyUrl,
        {
          cache: "no-store"
        }
      );

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      return await response.json();

    } catch (error) {

      lastError = error;

    }

  }

  throw lastError ||
    new Error("Keine Datenquelle erreichbar.");

}


/* =========================================================
   YAHOO FINANCE
========================================================= */

async function fetchYahooChart(
  symbol,
  range = "1d",
  interval = "5m"
) {

  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/` +
    `${encodeURIComponent(symbol)}` +
    `?range=${range}` +
    `&interval=${interval}` +
    `&includePrePost=false`;

  const data = await fetchJson(url);

  const result =
    data?.chart?.result?.[0];

  if (!result) {
    throw new Error(
      `Keine Yahoo-Daten für ${symbol}`
    );
  }

  return result;

}


function getYahooCurrentPrice(result) {

  const meta = result.meta || {};

  const regular =
    Number(meta.regularMarketPrice);

  if (isValidPrice(regular)) {
    return regular;
  }

  const closes =
    result.indicators?.quote?.[0]?.close || [];

  for (let i = closes.length - 1; i >= 0; i--) {

    const value = Number(closes[i]);

    if (isValidPrice(value)) {
      return value;
    }

  }

  return null;

}


function getYahooCurrency(result) {

  return (
    result?.meta?.currency ||
    "USD"
  );

}


/* =========================================================
   FX
========================================================= */

async function fetchEURUSD() {

  try {

    const result =
      await fetchYahooChart(
        "EURUSD=X",
        "1d",
        "5m"
      );

    const price =
      getYahooCurrentPrice(result);

    if (isValidPrice(price)) {

      setCachedPrice(
        "EURUSD",
        {
          price,
          currency: "USD"
        }
      );

      return price;

    }

  } catch (error) {

    console.warn(
      "EUR/USD konnte nicht geladen werden.",
      error
    );

  }

  return (
    getCachedPrice("EURUSD")?.price ||
    null
  );

}


/* =========================================================
   STOCK / ETF
========================================================= */

async function fetchStockPrice(symbol) {

  const result =
    await fetchYahooChart(
      symbol,
      "1d",
      "5m"
    );

  const price =
    getYahooCurrentPrice(result);

  if (!isValidPrice(price)) {
    return null;
  }

  const currency =
    getYahooCurrency(result);

  let eurPrice = price;

  if (currency === "USD") {

    const eurusd =
      await fetchEURUSD();

    if (isValidPrice(eurusd)) {
      eurPrice = price / eurusd;
    }

  }

  setCachedPrice(
    `STOCK:${symbol.toUpperCase()}`,
    {
      price: eurPrice,
      originalPrice: price,
      currency
    }
  );

  return eurPrice;

}


/* =========================================================
   METALS
========================================================= */

async function fetchMetalPrice(type) {

  const symbol =
    type === "gold"
      ? "GC=F"
      : "SI=F";

  const result =
    await fetchYahooChart(
      symbol,
      "1d",
      "5m"
    );

  const usdPerOunce =
    getYahooCurrentPrice(result);

  if (!isValidPrice(usdPerOunce)) {
    return null;
  }

  const eurusd =
    await fetchEURUSD();

  if (!isValidPrice(eurusd)) {
    return null;
  }

  const eurPerOunce =
    usdPerOunce / eurusd;

  setCachedPrice(
    `METAL:${type}`,
    {
      price: eurPerOunce,
      usdPrice: usdPerOunce,
      currency: "EUR"
    }
  );

  return eurPerOunce;

}


/* =========================================================
   CRYPTO
========================================================= */

let coinListCache = null;


async function ensureCoinList() {

  if (coinListCache) {
    return;
  }

  try {

    const url =
      "https://api.coingecko.com/api/v3/coins/list";

    coinListCache =
      await fetchJson(url);

  } catch (error) {

    console.warn(
      "CoinGecko coin list unavailable.",
      error
    );

    coinListCache = [];

  }

}


function findCoinId(name) {

  const query =
    name.trim().toLowerCase();

  if (!coinListCache?.length) {
    return null;
  }

  let found =
    coinListCache.find(
      coin =>
        coin.id.toLowerCase() === query
    );

  if (found) {
    return found.id;
  }

  found =
    coinListCache.find(
      coin =>
        coin.symbol.toLowerCase() === query
    );

  if (found) {
    return found.id;
  }

  found =
    coinListCache.find(
      coin =>
        coin.name.toLowerCase() === query
    );

  return found?.id || null;

}


async function fetchCryptoPrices() {

  await ensureCoinList();

  const cryptoHoldings =
    holdings.filter(
      h => h.type === "crypto"
    );

  if (!cryptoHoldings.length) {
    return;
  }

  const ids = [
    ...new Set(
      cryptoHoldings
        .map(h => findCoinId(h.name))
        .filter(Boolean)
    )
  ];

  if (!ids.length) {
    return;
  }

  const url =
    "https://api.coingecko.com/api/v3/simple/price" +
    `?ids=${encodeURIComponent(ids.join(","))}` +
    "&vs_currencies=eur" +
    "&include_24hr_change=true" +
    "&include_last_updated_at=true";

  try {

    const data =
      await fetchJson(url);

    cryptoHoldings.forEach(
      h => {

        const id =
          findCoinId(h.name);

        if (
          id &&
          data[id] &&
          isValidPrice(
            Number(data[id].eur)
          )
        ) {

          setCachedPrice(
            `CRYPTO:${h.name.toUpperCase()}`,
            {
              price: Number(data[id].eur),
              change24h:
                Number(
                  data[id].eur_24h_change
                ) || 0
            }
          );

        }

      }
    );

  } catch (error) {

    console.warn(
      "CoinGecko konnte nicht geladen werden.",
      error
    );

  }

}


/* =========================================================
   CURRENT PRICE FOR HOLDING
========================================================= */

async function updateHoldingPrice(h) {

  try {

    if (h.type === "crypto") {

      const key =
        `CRYPTO:${h.name.toUpperCase()}`;

      const cached =
        getCachedPrice(key);

      if (cached) {
        h.currentPrice = cached.price;
      }

      return;

    }


    if (
      h.type === "stock" ||
      h.type === "etf"
    ) {

      const price =
        await fetchStockPrice(
          h.name.trim()
        );

      if (isValidPrice(price)) {
        h.currentPrice = price;
      }

      return;

    }


    if (h.type === "gold") {

      const price =
        await fetchMetalPrice("gold");

      if (isValidPrice(price)) {
        h.currentPrice = price;
      }

      return;

    }


    if (h.type === "silver") {

      const price =
        await fetchMetalPrice("silver");

      if (isValidPrice(price)) {
        h.currentPrice = price;
      }

      return;

    }


    if (h.type === "copper") {

      const result =
        await fetchYahooChart(
          "HG=F",
          "1d",
          "5m"
        );

      const usd =
        getYahooCurrentPrice(result);

      const eurusd =
        await fetchEURUSD();

      if (
        isValidPrice(usd) &&
        isValidPrice(eurusd)
      ) {

        h.currentPrice =
          usd / eurusd;

      }

    }

  } catch (error) {

    console.warn(
      `Preis für ${h.name} nicht verfügbar.`,
      error
    );

  }

}


/* =========================================================
   UPDATE ALL PRICES
========================================================= */

async function updatePrices(
  showStatus = true
) {

  if (showStatus) {

    marketStatus.textContent =
      "Marktdaten werden aktualisiert…";

    marketDot.classList.remove(
      "online"
    );

  }

  try {

    await fetchCryptoPrices();

    /*
      Metals and stocks are deliberately processed
      one by one to avoid hammering public endpoints.
    */

    for (const h of holdings) {

      await updateHoldingPrice(h);

    }


    /*
      Dedicated market cards.
    */

    await Promise.allSettled([
      fetchMetalPrice("gold"),
      fetchMetalPrice("silver"),
      fetchEURUSD()
    ]);


    /*
      Snapshot.
    */

    createSnapshot();

    save();

    renderEverything();


    if (showStatus) {

      marketStatus.textContent =
        "Marktdaten aktuell";

      marketDot.classList.add(
        "online"
      );

      lastUpdate.textContent =
        "Stand " +
        new Date().toLocaleTimeString(
          "de-DE"
        );

    }

  } catch (error) {

    console.error(error);

    if (showStatus) {

      marketStatus.textContent =
        "Datenquelle momentan nicht erreichbar";

      marketDot.classList.remove(
        "online"
      );

    }

    renderEverything();

  }

}


/* =========================================================
   SNAPSHOTS
========================================================= */

function createSnapshot() {

  const total =
    getPortfolioValue();

  if (!Number.isFinite(total)) {
    return;
  }

  const now =
    Date.now();

  /*
    Avoid dozens of identical snapshots.
  */

  const previous =
    history[history.length - 1];

  if (
    previous &&
    now - previous.timestamp < 30 * 1000
  ) {
    return;
  }

  history.push({
    timestamp: now,
    total
  });

  /*
    Keep approximately 2 years of
    browser-side snapshots.
  */

  if (history.length > 5000) {

    history =
      history.slice(-5000);

  }

}


/* =========================================================
   PORTFOLIO CALCULATIONS
========================================================= */

function getInvestedValue() {

  return holdings.reduce(
    (sum, h) =>
      sum +
      (
        Number(h.buyPrice) *
        Number(h.quantity)
      ),
    0
  );

}


function getPortfolioValue() {

  return holdings.reduce(
    (sum, h) => {

      const price =
        isValidPrice(
          Number(h.currentPrice)
        )
          ? Number(h.currentPrice)
          : Number(h.buyPrice);

      return (
        sum +
        price *
        Number(h.quantity)
      );

    },
    0
  );

}


function getTotalPnl() {

  return (
    getPortfolioValue() -
    getInvestedValue()
  );

}


function getTotalReturn() {

  const invested =
    getInvestedValue();

  if (!invested) {
    return 0;
  }

  return (
    getTotalPnl() /
    invested *
    100
  );

}


/* =========================================================
   PERFORMANCE
========================================================= */

function getSnapshotBefore(msAgo) {

  const target =
    Date.now() - msAgo;

  let closest = null;

  for (const snapshot of history) {

    if (snapshot.timestamp <= target) {

      closest = snapshot;

    }

  }

  return closest;

}


function performanceFromSnapshot(msAgo) {

  const current =
    getPortfolioValue();

  const snapshot =
    getSnapshotBefore(msAgo);

  if (!snapshot) {
    return null;
  }

  if (!Number.isFinite(snapshot.total)) {
    return null;
  }

  return (
    current -
    snapshot.total
  );

}


function renderPerformance() {

  const periods = {

    perfDay:
      24 * 60 * 60 * 1000,

    perfWeek:
      7 * 24 * 60 * 60 * 1000,

    perfMonth:
      30 * 24 * 60 * 60 * 1000,

    perfYear:
      365 * 24 * 60 * 60 * 1000

  };


  Object.entries(periods)
    .forEach(
      ([id, ms]) => {

        const value =
          performanceFromSnapshot(ms);

        const element =
          document.getElementById(id);

        if (value === null) {

          element.textContent =
            "Noch keine Historie";

          element.className =
            "";

          return;

        }

        element.textContent =
          formatEuro(value);

        element.className =
          value >= 0
            ? "positive"
            : "negative";

      }
    );


  const maxElement =
    document.getElementById(
      "perfMax"
    );

  if (history.length) {

    const first =
      history[0];

    const maxValue =
      getPortfolioValue() -
      first.total;

    maxElement.textContent =
      formatEuro(maxValue);

    maxElement.className =
      maxValue >= 0
        ? "positive"
        : "negative";

  } else {

    maxElement.textContent =
      "Noch keine Historie";

  }

}


/* =========================================================
   MARKET CARDS
========================================================= */

function renderMarketCards() {

  const gold =
    getCachedPrice("METAL:gold");

  const silver =
    getCachedPrice("METAL:silver");

  const eurusd =
    getCachedPrice("EURUSD");


  const goldElement =
    document.getElementById(
      "goldPrice"
    );

  const silverElement =
    document.getElementById(
      "silverPrice"
    );

  const eurusdElement =
    document.getElementById(
      "eurusdPrice"
    );


  goldElement.textContent =
    gold
      ? formatEuro(gold.price)
      : "—";


  silverElement.textContent =
    silver
      ? formatEuro(silver.price)
      : "—";


  eurusdElement.textContent =
    eurusd
      ? formatNumber(eurusd.price, 4)
      : "—";


  /*
    Daily change isn't always available for Yahoo's
    futures chart in the cache, so calculate it
    when possible from the intraday history.
  */

}


/* =========================================================
   KPI
========================================================= */

function renderKPIs() {

  const total =
    getPortfolioValue();

  const invested =
    getInvestedValue();

  const pnl =
    getTotalPnl();

  const returnPercent =
    getTotalReturn();


  document.getElementById(
    "totalValue"
  ).textContent =
    formatEuro(total);


  document.getElementById(
    "investedValue"
  ).textContent =
    formatEuro(invested);


  const pnlElement =
    document.getElementById(
      "totalPnl"
    );

  pnlElement.textContent =
    formatEuro(pnl);

  pnlElement.className =
    pnl >= 0
      ? "positive"
      : "negative";


  const returnElement =
    document.getElementById(
      "totalReturn"
    );

  returnElement.textContent =
    formatPercent(returnPercent);

  returnElement.className =
    returnPercent >= 0
      ? "positive"
      : "negative";


  document.getElementById(
    "dashboardTotal"
  ).textContent =
    formatEuro(total);


  const dashboardPnl =
    document.getElementById(
      "dashboardPnl"
    );

  dashboardPnl.textContent =
    formatEuro(pnl);

  dashboardPnl.className =
    pnl >= 0
      ? "positive"
      : "negative";

}


/* =========================================================
   HOLDINGS TABLE
========================================================= */

function renderHoldings() {

  holdingsTableBody.innerHTML = "";

  holdingCount.textContent =
    `${holdings.length} ${
      holdings.length === 1
        ? "Position"
        : "Positionen"
    }`;


  holdings.forEach(
    (h, index) => {

      const invested =
        Number(h.buyPrice) *
        Number(h.quantity);

      const current =
        isValidPrice(
          Number(h.currentPrice)
        )
          ? Number(h.currentPrice)
          : null;

      const value =
        current !== null
          ? current *
            Number(h.quantity)
          : null;

      const pnl =
        value !== null
          ? value - invested
          : null;

      const percent =
        invested > 0 &&
        pnl !== null
          ? pnl / invested * 100
          : null;


      const tr =
        document.createElement("tr");


      const typeNames = {

        stock: "Aktie",
        etf: "ETF",
        crypto: "Crypto",
        gold: "Gold",
        silver: "Silber",
        copper: "Kupfer"

      };


      tr.innerHTML = `

        <td>

          <div class="asset-cell">

            <div class="asset-avatar">
              ${escapeHtml(
                h.name
                  .substring(0, 2)
                  .toUpperCase()
              )}
            </div>

            <div>

              <strong>
                ${escapeHtml(h.name)}
              </strong>

              <small>
                ${typeNames[h.type] || h.type}
              </small>

            </div>

          </div>

        </td>


        <td>
          ${formatNumber(h.quantity, 6)}
        </td>


        <td>

          ${formatEuro(h.buyPrice)}

          <small class="table-sub">
            ${formatEuro(invested)}
          </small>

        </td>


        <td>

          ${
            current !== null
              ? formatEuro(current)
              : `<span class="loading-price">lädt…</span>`
          }

        </td>


        <td>

          ${
            value !== null
              ? formatEuro(value)
              : "—"
          }

        </td>


        <td>

          <span class="${
            pnl !== null
              ? pnl >= 0
                ? "positive"
                : "negative"
              : ""
          }">

            ${
              pnl !== null
                ? formatEuro(pnl)
                : "—"
            }

          </span>

        </td>


        <td>

          <span class="${
            percent !== null
              ? percent >= 0
                ? "positive"
                : "negative"
              : ""
          }">

            ${
              percent !== null
                ? formatPercent(percent)
                : "—"
            }

          </span>

        </td>


        <td>

          <button
            class="remove-btn"
            data-index="${index}"
            title="Position entfernen"
          >
            ×
          </button>

        </td>

      `;


      holdingsTableBody.appendChild(tr);

    }
  );


  document
    .querySelectorAll(
      ".remove-btn"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const index =
              Number(
                button.dataset.index
              );

            holdings.splice(
              index,
              1
            );

            save();

            updateHistorySelect();

            renderEverything();

          }
        );

      }
    );

}


/* =========================================================
   HISTORY SELECT
========================================================= */

function updateHistorySelect() {

  historySelect.innerHTML = `
    <option value="portfolio">
      Gesamtportfolio
    </option>
  `;


  holdings.forEach(
    h => {

      const option =
        document.createElement(
          "option"
        );

      option.value =
        h.id;

      option.textContent =
        h.name;

      historySelect.appendChild(
        option
      );

    }
  );

}


/* =========================================================
   CHART DEFAULTS
========================================================= */

Chart.defaults.font.family =
  "Inter, system-ui, sans-serif";

Chart.defaults.color =
  "#9aa6a6";


/* =========================================================
   CHARTS
========================================================= */

function updateCharts() {

  updateAllocationChart();

  updatePnlChart();

  updateHistoryChart();

}


function updateAllocationChart() {

  if (allocationChart) {
    allocationChart.destroy();
  }


  if (!holdings.length) {
    return;
  }


  const labels =
    holdings.map(
      h => h.name
    );


  const values =
    holdings.map(
      h => {

        const price =
          isValidPrice(
            Number(h.currentPrice)
          )
            ? Number(h.currentPrice)
            : Number(h.buyPrice);

        return (
          price *
          Number(h.quantity)
        );

      }
    );


  allocationChart =
    new Chart(
      allocationCtx,
      {

        type: "doughnut",

        data: {

          labels,

          datasets: [{

            data: values,

            backgroundColor: [

              "#00f1d0",
              "#00b89a",
              "#54e3d0",
              "#168f7e",
              "#7ef5e4",
              "#006d60",
              "#36c9b4",
              "#0d5148"

            ],

            borderWidth: 0,

            hoverOffset: 8

          }]

        },

        options: {

          responsive: true,

          maintainAspectRatio: false,

          cutout: "72%",

          plugins: {

            legend: {

              position: "bottom",

              labels: {

                padding: 18,

                usePointStyle: true

              }

            },

            tooltip: {

              callbacks: {

                label(context) {

                  return (
                    " " +
                    context.label +
                    ": " +
                    formatEuro(
                      context.raw
                    )
                  );

                }

              }

            }

          }

        }

      }
    );

}


/* =========================================================
   PNL CHART
========================================================= */

function updatePnlChart() {

  if (pnlChart) {
    pnlChart.destroy();
  }


  if (!holdings.length) {
    return;
  }


  const labels =
    holdings.map(
      h => h.name
    );


  const values =
    holdings.map(
      h => {

        const current =
          isValidPrice(
            Number(h.currentPrice)
          )
            ? Number(h.currentPrice) *
              Number(h.quantity)
            : Number(h.buyPrice) *
              Number(h.quantity);

        const invested =
          Number(h.buyPrice) *
          Number(h.quantity);

        return current - invested;

      }
    );


  pnlChart =
    new Chart(
      pnlCtx,
      {

        type: "bar",

        data: {

          labels,

          datasets: [{

            data: values,

            backgroundColor:
              values.map(
                value =>
                  value >= 0
                    ? "rgba(0,241,208,.75)"
                    : "rgba(255,90,90,.72)"
              ),

            borderRadius: 8,

            borderSkipped: false

          }]

        },

        options: {

          responsive: true,

          maintainAspectRatio: false,

          plugins: {

            legend: {
              display: false
            },

            tooltip: {

              callbacks: {

                label(context) {

                  return formatEuro(
                    context.raw
                  );

                }

              }

            }

          },

          scales: {

            x: {

              grid: {
                display: false
              }

            },

            y: {

              grid: {
                color:
                  "rgba(255,255,255,.05)"
              },

              ticks: {

                callback(value) {

                  return formatEuro(
                    value
                  );

                }

              }

            }

          }

        }

      }
    );

}


/* =========================================================
   HISTORY CHART
========================================================= */

function updateHistoryChart() {

  if (historyChart) {
    historyChart.destroy();
  }


  const labels =
    history.map(
      snapshot =>
        new Date(
          snapshot.timestamp
        ).toLocaleDateString(
          "de-DE"
        )
    );


  const values =
    history.map(
      snapshot =>
        snapshot.total
    );


  /*
    If there is no history yet,
    show current value as starting point.
  */

  if (!values.length) {

    labels.push(
      new Date().toLocaleDateString(
        "de-DE"
      )
    );

    values.push(
      getPortfolioValue()
    );

  }


  const gradient =
    historyCtx
      .createLinearGradient(
        0,
        0,
        0,
        350
      );

  gradient.addColorStop(
    0,
    "rgba(0,241,208,.28)"
  );

  gradient.addColorStop(
    1,
    "rgba(0,241,208,0)"
  );


  historyChart =
    new Chart(
      historyCtx,
      {

        type: "line",

        data: {

          labels,

          datasets: [{

            label:
              "Portfolio",

            data: values,

            borderColor:
              "#00f1d0",

            backgroundColor:
              gradient,

            borderWidth: 2,

            fill: true,

            tension: .38,

            pointRadius: 0,

            pointHoverRadius: 5,

            pointHoverBackgroundColor:
              "#00f1d0"

          }]

        },

        options: {

          responsive: true,

          maintainAspectRatio: false,

          interaction: {

            intersect: false,

            mode: "index"

          },

          plugins: {

            legend: {
              display: false
            },

            tooltip: {

              displayColors: false,

              callbacks: {

                label(context) {

                  return formatEuro(
                    context.raw
                  );

                }

              }

            }

          },

          scales: {

            x: {

              grid: {
                display: false
              },

              ticks: {
                maxTicksLimit: 8
              }

            },

            y: {

              grid: {

                color:
                  "rgba(255,255,255,.05)"

              },

              ticks: {

                callback(value) {

                  return formatEuro(
                    value
                  );

                }

              }

            }

          }

        }

      }
    );

}


/* =========================================================
   TARGET INTEREST CALCULATOR
========================================================= */

const targetInterestForm =
  document.getElementById(
    "targetInterestForm"
  );


targetInterestForm.addEventListener(
  "submit",
  event => {

    event.preventDefault();


    const desired =
      Number(
        document.getElementById(
          "targetInterest"
        ).value
      );


    const rate =
      Number(
        document.getElementById(
          "targetRate"
        ).value
      );


    const frequency =
      Number(
        document.getElementById(
          "interestFrequency"
        ).value
      );


    if (
      !Number.isFinite(desired) ||
      !Number.isFinite(rate) ||
      desired < 0 ||
      rate <= 0
    ) {

      return;

    }


    const annualRate =
      rate / 100;


    /*
      Simple target:
      desired annual interest / annual rate

      The frequency is displayed as information.
      The required capital for a fixed annual
      interest target is based on the nominal rate.
    */

    const capital =
      desired /
      annualRate;


    const monthlyInterest =
      desired / 12;


    const result =
      document.getElementById(
        "targetInterestResult"
      );


    result.innerHTML = `

      <span>BENÖTIGTES KAPITAL</span>

      <strong>
        ${formatEuro(capital)}
      </strong>

      <p>
        Bei ${formatNumber(rate, 2)} % p.a.
        erhältst du ungefähr
        <b>${formatEuro(desired)}</b>
        Zinsen pro Jahr.
      </p>

      <div class="interest-extra">

        <span>
          Monatlich:
          <b>${formatEuro(monthlyInterest)}</b>
        </span>

        <span>
          Gutschrift:
          <b>
            ${
              frequency === 12
                ? "monatlich"
                : frequency === 4
                  ? "vierteljährlich"
                  : "jährlich"
            }
          </b>
        </span>

      </div>

    `;

  }
);


/* =========================================================
   COMPOUND INTEREST CALCULATOR
========================================================= */

const savingsForm =
  document.getElementById(
    "savingsForm"
  );


savingsForm.addEventListener(
  "submit",
  event => {

    event.preventDefault();


    const P =
      Number(
        document.getElementById(
          "principal"
        ).value
      );


    const rate =
      Number(
        document.getElementById(
          "rate"
        ).value
      ) / 100;


    const years =
      Number(
        document.getElementById(
          "years"
        ).value
      );


    const n =
      Number(
        document.getElementById(
          "payoutFreq"
        ).value
      );


    const reinvest =
      document.getElementById(
        "reinvest"
      ).checked;


    let finalAmount;


    if (reinvest) {

      finalAmount =
        P *
        Math.pow(
          1 + rate / n,
          n * years
        );

    } else {

      finalAmount =
        P +
        P *
        rate *
        years;

    }


    const interest =
      finalAmount - P;


    document.getElementById(
      "savingsResult"
    ).innerHTML = `

      <div>

        <span>ENDKAPITAL</span>

        <strong>
          ${formatEuro(finalAmount)}
        </strong>

      </div>

      <div>

        <span>ZINSEN GESAMT</span>

        <strong class="positive">
          ${formatEuro(interest)}
        </strong>

      </div>

    `;

  }
);


/* =========================================================
   ADD HOLDING
========================================================= */

buyForm.addEventListener(
  "submit",
  event => {

    event.preventDefault();


    const h = {

      id: uid(),

      type:
        assetType.value,

      name:
        assetName.value
          .trim(),

      date:
        buyDate.value,

      quantity:
        Number(
          quantity.value
        ),

      buyPrice:
        Number(
          buyPrice.value
        ),

      currentPrice:
        null

    };


    if (
      !h.name ||
      h.quantity <= 0 ||
      h.buyPrice <= 0
    ) {

      return;

    }


    holdings.push(h);

    save();

    renderEverything();

    buyForm.reset();

    buyDate.value =
      new Date()
        .toISOString()
        .split("T")[0];


    /*
      Immediately try to get current price.
    */

    updatePrices();

  }
);


/* =========================================================
   REFRESH BUTTONS
========================================================= */

async function refreshButton(
  button,
  text,
  callback
) {

  const original =
    button.textContent;

  button.disabled = true;

  button.textContent = text;

  try {

    await callback();

  } finally {

    button.disabled = false;

    button.textContent =
      original;

  }

}


fetchPricesBtn.addEventListener(
  "click",
  () => {

    refreshButton(
      fetchPricesBtn,
      "↻ Lade Kurse…",
      () => updatePrices()
    );

  }
);


refreshMarketsBtn.addEventListener(
  "click",
  () => {

    refreshButton(
      refreshMarketsBtn,
      "↻ Lade…",
      () => updatePrices()
    );

  }
);


/* =========================================================
   CLEAR
========================================================= */

clearAllBtn.addEventListener(
  "click",
  () => {

    if (
      !confirm(
        "Wirklich alle Positionen löschen?"
      )
    ) {
      return;
    }

    holdings = [];

    history = [];

    priceCache = {};

    save();

    renderEverything();

  }
);


/* =========================================================
   AUTO UPDATE
========================================================= */

setInterval(
  () => {

    updatePrices(
      false
    );

  },
  PRICE_REFRESH_MS
);


/* =========================================================
   INITIAL
========================================================= */

function renderEverything() {

  renderMarketCards();

  renderKPIs();

  renderPerformance();

  renderHoldings();

  updateHistorySelect();

  updateCharts();

}


buyDate.value =
  new Date()
    .toISOString()
    .split("T")[0];


renderEverything();


/*
  First market update immediately.
*/

updatePrices();


/*
  Debug access.
*/

window.__depot = {

  holdings,

  history,

  priceCache,

  updatePrices,

  renderEverything

};}

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
