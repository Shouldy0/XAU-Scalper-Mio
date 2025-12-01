const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const MetaApi = require('metaapi.cloud-sdk').default;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(__dirname));

const token = process.env.METAAPI_TOKEN;
const accountId = process.env.METAAPI_ACCOUNT_ID;

const api = new MetaApi(token);
let account, connection;

async function startBot() {
  if (!token || !accountId) {
    console.log('Aggiungi TOKEN e ACCOUNT_ID su Render!');
    io.emit('status', 'MetaApi non configurato');
    return;
  }
  try {
    account = await api.metatraderAccountApi.getAccount(accountId);
    await account.deploy();
    await account.waitConnected();
    connection = account.getStreamingConnection();
    await connection.connect();
    await connection.waitSynchronized();
    console.log('Bot connesso a MetaTrader!');

    const terminal = connection.terminalState;
    setInterval(async () => {
      const price = terminal.price('XAUUSD');
      if (!price) return;

      const history = await connection.getCandles('XAUUSD', '1m', 100);
      const rsi = calculateRSI(history);
      const emaFast = calculateEMA(history, 8);
      const emaSlow = calculateEMA(history, 21);

      io.emit('tick', {
        time: Date.now() / 1000,
        open: price.ask,
        high: Math.max(price.ask, price.bid) + 0.05,
        low: Math.min(price.ask, price.bid) - 0.05,
        close: price.bid,
        volume: 1000,
        bid: price.bid,
        ask: price.ask,
        rsi,
        emaFast: emaFast[emaFast.length - 1],
        emaSlow: emaSlow[emaSlow.length - 1]
      });
    }, 1000);
  } catch (err) {
    console.error('Errore MetaApi:', err);
    io.emit('status', 'Errore connessione broker');
  }
}

app.post('/api/trade', async (req, res) => {
  const { symbol, side, volume = 0.10 } = req.body;
  try {
    const price = connection.terminalState.price(symbol);
    const sl = side === 'buy' ? price.bid - 5 : price.ask + 5;
    const tp = side === 'buy' ? price.bid + 10 : price.ask - 10;
    await connection.createMarketOrder(symbol, side, volume, null, { 
      stopLoss: sl, 
      takeProfit: tp, 
      comment: 'GoldScalper2025' 
    });
    res.json({ success: true, message: `Trade ${side} eseguito!` });
  } catch (err) { 
    res.json({ error: err.message }); 
  }
});

// Placeholder per indicatori (aggiungi TA-Lib in prod)
function calculateRSI(candles) { return 50 + Math.random() * 20; }
function calculateEMA(data, period) { return data.map(() => Math.random() * 10 + 4240); }

server.listen(process.env.PORT || 3000, () => {
  console.log('Gold Scalper Bot LIVE su porta ' + (process.env.PORT || 3000));
  startBot();
});
