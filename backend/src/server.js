require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

require('./db/db'); // initializes schema on boot

const authRoutes = require('./routes/auth.routes');
const orderRoutes = require('./routes/orders.routes');
const zoneRoutes = require('./routes/zones.routes');
const rateCardRoutes = require('./routes/ratecards.routes');
const agentRoutes = require('./routes/agents.routes');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'delivery-tracker-backend' }));

app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/zones', zoneRoutes);
app.use('/api/rate-cards', rateCardRoutes);
app.use('/api/agents', agentRoutes);

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`[server] Delivery Tracker API running on port ${PORT}`));
