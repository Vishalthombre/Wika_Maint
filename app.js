// app.js
const express = require('express');
const bcrypt = require('bcrypt');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const db = require('./db'); // your mysql2 promise pool wrapper
const requireRole = require('./middleware/requireRole');

require('dotenv').config();

const app = express();

// -------- Middleware setup --------
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true })); // for form posts
app.use(express.json()); // if you have JSON endpoints
app.use(cookieParser());

// Session config (must be applied before any route that uses sessions)
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',  // true only in prod for HTTPS
    sameSite: 'lax',                               // helps with some browser cookie policies
    maxAge: 1000 * 60 * 60
  }
}));

app.set('trust proxy', 1); // trust first proxy (if behind a reverse proxy like Nginx)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// -------- Helpers --------
const isLoggedIn = (req, res, next) => {
  if (!req.session.user) return res.redirect('/login');
  next();
};

// NOTE: admins are location-bound as well (no special-case for Pune)
function locationFilterSQL(user) {
  return 'WHERE t.location = ?';
}
function locationFilterParams(user) {
  return [user.location];
}

// -------- Auth / Basic Routes --------
app.get('/', (req, res) => res.redirect('/login'));

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  try {
    const { globalId, password } = req.body;
    if (!globalId || !password) return res.render('login', { error: 'Both fields are required' });

    const [rows] = await db.query('SELECT * FROM users WHERE global_id = ?', [globalId]);
    const user = rows[0];

    if (!user || !user.password) return res.render('login', { error: 'Invalid Global ID or unregistered user' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.render('login', { error: 'Incorrect password' });

    // store both department and role to be compatible with existing middleware/code
    req.session.user = {
      id: user.id,
      globalId: user.global_id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      department: user.department,
      role: user.department, // duplicate for routes expecting `role`
      location: user.location
    };
    console.log('✅ Session set on login:', req.session.user);

    // Redirect based on department
    switch (user.department) {
      case 'planner': return res.redirect('/dashboard/planner');
      case 'admin': return res.redirect('/dashboard/admin');
      case 'normal_user': return res.redirect('/dashboard/user');
      case 'technician': return res.redirect('/dashboard/technician');
      default: return res.send('❌ Unknown department.');
    }
  } catch (err) {
    console.error('Login error:', err);
    return res.render('login', { error: 'Something went wrong. Check server logs.' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Session destroy error:', err);
      return res.send('Logout failed');
    }
    res.redirect('/login');
  });
});

// -------- Registration flow (check + complete) --------
// GET /register -> show a simple global id form (you already have register-id.ejs)
app.get('/register', (req, res) => {
  res.render('register-id', { error: null, globalId: '' });
});

// POST /register/check -> checks whether the supplied global id exists in users table
// If user exists and has NO password => show complete registration page
// If user exists and already has password => redirect to login with message
// If user does not exist => show error
app.post('/register/check', async (req, res) => {
  try {
    const globalId = (req.body.globalId || '').trim();
    if (!globalId) {
      return res.render('register-id', { error: 'Please enter Global ID', globalId: '' });
    }

    const [rows] = await db.query('SELECT * FROM users WHERE global_id = ?', [globalId]);
    const user = rows[0];

    if (!user) {
      // Not found in master user table
      return res.render('register-id', { error: 'Global ID not found. Contact admin.', globalId });
    }

    if (user.password) {
      // Already registered
      return res.render('register-id', { error: 'Already registered. Please login.', globalId });
    }

    // Render completion form with details from DB
    return res.render('register-details', { user });
  } catch (err) {
    console.error('Register check error:', err);
    return res.render('register-id', { error: 'Server error during check', globalId: '' });
  }
});

// POST /register/complete -> finalizes registration by saving hashed password
app.post('/register/complete', async (req, res) => {
  try {
    const { globalId, password } = req.body;
    if (!globalId || !password) {
      return res.status(400).send('Missing required fields');
    }

    const hashed = await bcrypt.hash(password, 10);
    await db.query('UPDATE users SET password = ? WHERE global_id = ?', [hashed, globalId]);

    // Redirect to login with success message (you can pass a query param or show flash message)
    return res.redirect('/login');
  } catch (err) {
    console.error('Register complete error:', err);
    return res.status(500).send('Failed to complete registration');
  }
});

// -------- Dashboards --------
app.get('/dashboard/planner', isLoggedIn, async (req, res) => {
  try {
    const locSQL = locationFilterSQL(req.session.user);
    const locParams = locationFilterParams(req.session.user);

    const [tickets] = await db.query(
      `SELECT t.*, u.name AS assigned_to_name
       FROM tickets t
       LEFT JOIN users u ON t.assigned_to = u.global_id
       ${locSQL}
       ORDER BY t.created_at DESC`,
      locParams
    );

    const [technicians] = await db.query(
      'SELECT global_id, name, location FROM users WHERE department IN ("technician","planner","admin") AND location = ? ORDER BY name',
      [req.session.user.location]
    );

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

app.get('/dashboard/admin', isLoggedIn, async (req, res) => {
  try {
    const locSQL = locationFilterSQL(req.session.user);
    const locParams = locationFilterParams(req.session.user);

    const [tickets] = await db.query(
      `SELECT t.*, u.name AS assigned_to_name
       FROM tickets t
       LEFT JOIN users u ON t.assigned_to = u.global_id
       ${locSQL}
       ORDER BY t.created_at DESC`,
      locParams
    );

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
    console.error('Admin dashboard error:', err);
    res.send('Failed to load admin dashboard.');
  }
});

app.get('/dashboard/user', isLoggedIn, async (req, res) => {
  try {
    // Use global_id to fetch tickets created by the logged-in user (raised_by previously was name)
    const [tickets] = await db.query(
      'SELECT * FROM tickets WHERE global_id = ? AND location = ? ORDER BY created_at DESC',
      [req.session.user.globalId, req.session.user.location]
    );

    res.render('dashboard-user', {
      tickets,
      user: req.session.user,
      message: req.query.message || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('User dashboard error:', err);
    res.send('Failed to load user dashboard.');
  }
});

app.get('/dashboard/technician', isLoggedIn, async (req, res) => {
  try {
    const [tickets] = await db.query(
      `SELECT t.*, u.name AS planner_name
       FROM tickets t
       LEFT JOIN users u ON t.planner_id = u.global_id
       WHERE t.assigned_to = ? AND t.location = ?
       ORDER BY t.created_at DESC`,
      [req.session.user.globalId, req.session.user.location]
    );

    res.render('dashboard-technician', {
      tickets,
      user: req.session.user
    });
  } catch (err) {
    console.error('Technician dashboard error:', err);
    res.send('Failed to load technician dashboard.');
  }
});

// -------- Mount other route modules --------
// ensure these files export express.Router() and use their own paths
const ticketRoutes = require('./routes/ticket');
const plannerRoutes = require('./routes/planner');
const technicianRoutes = require('./routes/technician');
const adminRoutes = require('./routes/admin');

// mount route modules under root so their internal paths work
app.use('/', ticketRoutes);
app.use('/', plannerRoutes);
app.use('/', technicianRoutes);
app.use('/', adminRoutes);

// -------- Fallback / 404 --------
app.use((req, res) => {
  res.status(404).send('Not found');
});

// -------- Start server --------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
