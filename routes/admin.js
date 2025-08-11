const express = require('express');
const router = express.Router();
const db = require('../db');

// ✅ Middleware for Admin
function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  // Support both `role` and `department` as admin indicators
  const role = req.session.user.role || req.session.user.department;
  if (role !== 'admin') {
    return res.redirect('/login');
  }
  next();
}

// ==============================
// GET: Admin Dashboard
// ==============================
router.get('/dashboard/admin', requireAdmin, async (req, res) => {
  const userLocation = req.session.user?.location;

  try {
    let query = `
      SELECT 
        t.*, 
        u.name AS assigned_to_name,
        t.completed_at
      FROM tickets t
      LEFT JOIN users u ON t.assigned_to = u.global_id
      WHERE 1=1
    `;
    const params = [];

    // ✅ Location restriction unless Pune admin
    if (userLocation && userLocation !== 'Pune') {
      query += ` AND t.location = ?`;
      params.push(userLocation);
    }

    query += ` ORDER BY t.created_at DESC`;

    const [tickets] = await db.query(query, params);

    // ✅ Fetch breakdown & safety tickets
    let breakdownTickets = [];
    let safetyTickets = [];
    if (userLocation && userLocation !== 'Pune') {
      [breakdownTickets] = await db.query(`SELECT * FROM breakdown WHERE location = ?`, [userLocation]);
      [safetyTickets] = await db.query(`SELECT * FROM safety WHERE location = ?`, [userLocation]);
    } else {
      [breakdownTickets] = await db.query(`SELECT * FROM breakdown`);
      [safetyTickets] = await db.query(`SELECT * FROM safety`);
    }

    // Summary stats
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
      breakdownTickets,
      safetyTickets,
      summary,
      user: req.session.user
    });
  } catch (err) {
    console.error("Admin dashboard error:", err);
    res.status(500).send("Something went wrong loading admin dashboard.");
  }
});

module.exports = router;
