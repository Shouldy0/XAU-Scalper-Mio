const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const MetaApi = require('metaapi.cloud-sdk').default; // npm install metaapi.cloud-sdk

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(__dirname));

const token = process.env.METAAPI_TOKEN; // Dal .env o Render
const accountId = process.env.METAAPI_ACCOUNT_ID;

const api = new MetaApi(token);
let account, connection;

async function startBot() {
  if (!token || !accountId) {
    console.log('Aggiungi TOKEN e ACCOUNT_ID su Render!');
    return;
  }
  account = await api.metatraderAccountApi.getAccount(accountId);
  await account.deploy();
  await account.waitConnected();
  connection = account.getStreamingConnection();
  await connection.connect();
  await connection.waitSynchronized();

  const terminal = connection.terminalState;
  setInterval(async () => {
    const price = terminal.price('XAUUSD');
    if (!price) return;
    
    // Simula indicatori (in prod usa TA-Lib o calcola da history)
    const history = await connection.getCandles('XAUUSD', '1m', 100);
    const rsi = calculateRSI(history); // Placeholder: implementa RSI reale
    const emaFast = calculateEMA(history, 8);
    const emaSlow = calculateEMA(history, 21);

    io.emit('tick', {
      time: Date.now()/1000,
      open: price.ask,
      high: Math.max(price.ask, price.bid) + 0.05,
      low: Math.min(price.ask, price.bid) - 0.05,
      close: price.bid,
      volume: 1000,
      bid: price.bid,
      ask: price.ask,
      rsi: rsi,
      emaFast: emaFast,
      emaSlow: emaSlow
    });
  }, 1000); // Tick ogni secondo
}

app.post('/api/trade', async (req, res) => {
  const { symbol, side, volume = 0.10 } = req.body;
  try {
    // Aggiungi TP/SL dinamico (es. ATR-based)
    const sl = side === 'buy' ? req.body.price - 5 : req.body.price + 5; // Esempio
    const tp = side === 'buy' ? req.body.price + 10 : req.body.price - 10;
    await connection.createMarketOrder(symbol, side, volume, null, { 
      stopLoss: sl, 
      takeProfit: tp, 
      comment: 'GoldScalper2025' 
    });
    res.json({ success: true, message: `Ordine ${side} aperto!` });
  } catch (err) { 
    res.json({ error: err.message }); 
  }
});

// Funzioni indicatori (semplificate – espandi con TA-Lib)
function calculateRSI(candles) { 
  // Implementazione RSI 14 periodi
  return 50 + Math.random() * 20; // Placeholder per test
}
function calculateEMA(data, period) { 
  // EMA semplice
  return data[data.length - 1]?.close || 0;
}

server.listen(process.env.PORT || 3000, () => {
  console.log('Gold Scalper Bot LIVE!');
  startBot();
});
