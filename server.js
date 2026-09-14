const express = require('express');
const cron = require('node-cron');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
let alerts = [];

app.use(express.json());
app.use(express.static(__dirname));

function getPrice(ticker) {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1m`;
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const result = json.chart.result && json.chart.result[0];
          const price = result?.meta?.regularMarketPrice ?? result?.meta?.previousClose;
          if (typeof price !== 'number') throw new Error('Precio no disponible');
          resolve(price);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

app.get('/api/alerts', (req, res) => res.json(alerts));

app.post('/api/alerts', (req, res) => {
  const { ticker, target, direction, channels } = req.body;
  if (!ticker || !Number.isFinite(Number(target)) || !['above','below'].includes(direction)) {
    return res.status(400).json({ error: 'Datos de alerta inválidos' });
  }
  const alert = { id: Date.now().toString(), ticker: ticker.trim().toUpperCase(), target: Number(target), direction, channels: channels || [], active: true, createdAt: new Date().toISOString() };
  alerts.push(alert);
  res.status(201).json(alert);
});

app.delete('/api/alerts/:id', (req, res) => {
  alerts = alerts.filter(a => a.id !== req.params.id);
  res.status(204).end();
});

app.get('/api/price/:ticker', async (req, res) => {
  try { res.json({ ticker: req.params.ticker.toUpperCase(), price: await getPrice(req.params.ticker) }); }
  catch { res.status(502).json({ error: 'No se pudo obtener el precio ahora' }); }
});

async function checkAlerts() {
  for (const alert of alerts.filter(a => a.active)) {
    try {
      const price = await getPrice(alert.ticker);
      const hit = alert.direction === 'above' ? price >= alert.target : price <= alert.target;
      if (hit) {
        console.log(`ALERTA: ${alert.ticker} llegó a ${price}. Objetivo: ${alert.target}`);
        // Aquí conectaremos Telegram, email, Discord, WhatsApp y push del teléfono.
        alert.lastTriggeredAt = new Date().toISOString();
        alert.lastPrice = price;
        alert.active = false;
      }
    } catch (e) { console.error(`Error revisando ${alert.ticker}:`, e.message); }
  }
}
cron.schedule('* * * * *', checkAlerts);

app.listen(PORT, () => console.log(`Alerta Bolsa funcionando en puerto ${PORT}`));
