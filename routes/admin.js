const express = require('express');
const router = express.Router();
const db = require('../db');
const requireRole = require('../middleware/requireRole');

// ✅ Middleware: Only allow admin access
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.department !== 'admin') {
    return res.redirect('/login');
  }
  next();
}

// ==============================
// GET: Admin Dashboard
// ==============================
router.get('/dashboard/admin', requireAdmin, async (req, res) => {
  try {
    const [tickets] = await db.query(`
      SELECT 
        t.*, 
        u.name AS assigned_to_name
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
    res.status(500).send("Something went wrong loading admin dashboard.");
  }
});

module.exports = router;
