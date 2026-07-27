const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./db');

const authRoutes = require('./routes/auth');
const memberRoutes = require('./routes/members');
const eventRoutes = require('./routes/events');
const transactionRoutes = require('./routes/transactions');
const expenseRoutes = require('./routes/expenses');
const reportRoutes = require('./routes/reports');
const backupRoutes = require('./routes/backup');

const app = express();
const PORT = process.env.PORT || 3000;

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Session middleware
app.use(session({
  secret: 'kpns-secret-key-organization-2026',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Auth Middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized. Please login first.' });
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/members', requireAuth, memberRoutes);
app.use('/api/events', requireAuth, eventRoutes);
app.use('/api/transactions', requireAuth, transactionRoutes);
app.use('/api/expenses', requireAuth, expenseRoutes);
app.use('/api/reports', requireAuth, reportRoutes);
app.use('/api/backup', requireAuth, backupRoutes);


// Fallback to index.html for single page application UI
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

function startServer(portToTry) {
  const server = app.listen(portToTry, () => {
    console.log(`=======================================================`);
    console.log(`🚀 KPNS Organization Web Application is running!`);
    console.log(`🌐 Local URL: http://localhost:${portToTry}`);
    console.log(`🔑 Default Admin: admin@kpns.org / admin123`);
    console.log(`=======================================================`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${portToTry} is in use, trying port ${portToTry + 1}...`);
      startServer(portToTry + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer(PORT);
