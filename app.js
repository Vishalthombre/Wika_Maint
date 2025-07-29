const express = require('express');
const bcrypt = require('bcrypt');
const session = require('express-session');
const db = require('./db');
const app = express();
require('dotenv').config();
const requireRole = require('./middleware/requireRole');


app.use(express.static('public'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }  // Use true only with HTTPS
}));

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));

// Route files
const ticketRoutes = require('./routes/ticket');
const plannerRoutes = require('./routes/planner');
const technicianRoutes = require('./routes/technician');
const adminRoutes = require('./routes/admin');

// Mount routes
app.use('/', ticketRoutes);
app.use('/', plannerRoutes);
app.use('/', technicianRoutes);
app.use(adminRoutes);

// Root redirect
app.get('/', (req, res) => res.redirect('/login'));

// Register Flow
app.get('/register', (req, res) => {
  res.render('register-id', { error: null });
});

app.post('/register/check', async (req, res) => {
  const globalId = req.body.globalId?.trim();
  if (!globalId) return res.render('register-id', { error: 'Global ID is required' });

  const [rows] = await db.query('SELECT * FROM users WHERE global_id = ?', [globalId]);
  const user = rows[0];

  if (!user) return res.render('register-id', { error: 'User not found' });
  if (user.password) return res.render('register-id', { error: 'User already registered' });

  res.render('register-details', { user });
});

app.post('/register/complete', async (req, res) => {
  const { globalId, password } = req.body;
  if (!globalId || !password) return res.send('Global ID and password are required.');

  try {
    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.query('UPDATE users SET password = ? WHERE global_id = ?', [hashed, globalId]);

    if (!result.affectedRows) return res.send('Error: Global ID not found.');
    res.send('✅ Registration complete. <a href="/login">Login now</a>.');
  } catch (err) {
    console.error('Registration error:', err);
    res.send('❌ Registration failed.');
  }
});

// Login flow
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { globalId, password } = req.body;
  if (!globalId || !password)
    return res.render('login', { error: 'Both fields are required' });

  const [rows] = await db.query('SELECT * FROM users WHERE global_id = ?', [globalId]);
  const user = rows[0];

  if (!user || !user.password)
    return res.render('login', { error: 'Invalid Global ID or unregistered user' });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch)
    return res.render('login', { error: 'Incorrect password' });

  req.session.user = {
    id: user.id,
    globalId: user.global_id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    department: user.department
  };
  console.log("Session set on login:", req.session.user);

  switch (user.department) {
    case 'planner':
      return res.redirect('/dashboard/planner');
    case 'admin':
      return res.redirect('/dashboard/admin');
    case 'normal_user':
      return res.redirect('/dashboard/user');
    case 'technician':
      return res.redirect('/dashboard/technician');
    default:
      return res.send('❌ Unknown department.');
  }
});

// Middleware
const isLoggedIn = (req, res, next) => {
  if (!req.session.user) return res.redirect('/login');
  next();
};

// ✅ Planner Dashboard with DB data
app.get('/dashboard/planner', isLoggedIn, async (req, res) => {
  try {
    const [tickets] = await db.query(`
      SELECT t.*, u.name AS assigned_to_name 
      FROM tickets t
      LEFT JOIN users u ON t.assigned_to = u.global_id
      ORDER BY t.created_at DESC
    `);

    const [technicians] = await db.query(`
      SELECT global_id, name FROM users WHERE department = 'technician'
    `);

    res.render('dashboard-planner', {
      tickets,
      technicians,
      user: req.session.user
    });
  } catch (err) {
    console.error('Planner dashboard error:', err);
    res.send('Failed to load planner dashboard');
  }
});

// ✅ Admin Dashboard with summary
app.get('/dashboard/admin', isLoggedIn, async (req, res) => {
  try {
    const [tickets] = await db.query(`
      SELECT t.*, u.name AS assigned_to_name
      FROM tickets t
      LEFT JOIN users u ON t.assigned_to = u.global_id
      ORDER BY t.created_at DESC
    `);

    const summary = {
      total: tickets.length,
      statusCounts: {},
      categoryCounts: {}
    };

    tickets.forEach(t => {
      summary.statusCounts[t.status] = (summary.statusCounts[t.status] || 0) + 1;
      summary.categoryCounts[t.category] = (summary.categoryCounts[t.category] || 0) + 1;
    });

    res.render('admin-dashboard', {
      tickets,
      summary,
      user: req.session.user
    });
  } catch (err) {
    console.error("Admin dashboard error:", err);
    res.send("Failed to load admin dashboard.");
  }
});

// ✅ User Dashboard - My Tickets
app.get('/dashboard/user', isLoggedIn, async (req, res) => {
  try {
    const [tickets] = await db.query(
      'SELECT * FROM tickets WHERE created_by = ? ORDER BY created_at DESC',
      [req.session.user.id]
    );

    res.render('dashboard-user', {
      tickets,
      user: req.session.user
    });
  } catch (err) {
    console.error('User dashboard error:', err);
    res.send('Failed to load user dashboard.');
  }
});

// ✅ Technician Dashboard - Assigned Tickets
app.get('/dashboard/technician', isLoggedIn, async (req, res) => {
  try {
    const [tickets] = await db.query(`
      SELECT t.*, u.name AS planner_name
      FROM tickets t
      LEFT JOIN users u ON t.planner_id = u.global_id
      WHERE t.assigned_to = ?
      ORDER BY t.created_at DESC
    `, [req.session.user.globalId]);

    res.render('dashboard-technician', {
      tickets,
      user: req.session.user
    });
  } catch (err) {
    console.error('Technician dashboard error:', err);
    res.send('Failed to load technician dashboard.');
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.send('Logout failed');
    res.redirect('/login');
  });
});

// Server start
app.listen(3000, () => console.log('🚀 Server running at http://localhost:3000'));
