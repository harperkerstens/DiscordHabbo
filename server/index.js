const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { initializeBot, getTallies } = require('./discord-bot');

const app = express();

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve GIFs as static files
app.use('/gifs', express.static(path.join(__dirname, 'gifs')));

// Initialize Discord bot
initializeBot();

// Routes
app.get('/api/health', (req, res) => {
  res.json({ message: 'Server is running', timestamp: new Date() });
});

app.get('/api/tallies', (req, res) => {
  res.json(getTallies());
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

