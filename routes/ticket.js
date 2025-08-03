const express = require('express');
const router = express.Router();
const db = require('../db');
const requireRole = require('../middleware/requireRole');

// ==============================
// GET: User Dashboard (Raise/View Tickets)
// Accessible by: normal_user, technician, planner, admin
// ==============================
router.get('/dashboard/user', requireRole(['normal_user', 'technician', 'planner', 'admin']), async (req, res) => {
  const globalId = req.session.user?.globalId;
  if (!globalId) return res.redirect('/login');

  try {
    const [tickets] = await db.query(`
      SELECT 
        t.*, 
        u.name AS assigned_to_name,
        k.name AS keyword_name
      FROM tickets t
      LEFT JOIN users u ON t.assigned_to = u.global_id
      LEFT JOIN keywords k ON t.keyword_id = k.id
      WHERE t.global_id = ?
      ORDER BY t.created_at DESC
    `, [globalId]);

    res.render('dashboard-user', { user: req.session.user, tickets });
  } catch (err) {
    console.error('Error loading user dashboard:', err);
    res.status(500).send('Something went wrong loading your tickets.');
  }
});

// ==============================
// POST: Submit Ticket (all authenticated roles)
// ==============================
router.post('/ticket/submit', async (req, res) => {
  if (!req.session?.user?.globalId) {
    return res.status(401).send("Session not found. Please log in.");
  }

  const globalId = req.session.user.globalId;
  const raisedBy = req.session.user.name;  // 👈 get user name

  const {
    category,
    description,
    building_no,
    area_code,
    sub_area,
    keyword
  } = req.body;

  try {
    if (category === 'Facility Service') {
      if (!building_no || !area_code || !sub_area || !keyword) {
        return res.status(400).send("⚠️ Missing Facility Service details.");
      }

      await db.query(`
        INSERT INTO tickets 
          (global_id, raised_by, category, description, building_no, area_code, sub_area, keyword)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [globalId, raisedBy, category, description, building_no, area_code, sub_area, keyword]);
    } else {
      await db.query(`
        INSERT INTO tickets 
          (global_id, raised_by, category, description)
        VALUES (?, ?, ?, ?)
      `, [globalId, raisedBy, category, description]);
    }

    res.send("✅ Ticket submitted successfully! <a href='/dashboard/user'>Go back</a>");
  } catch (err) {
    console.error("Error submitting ticket:", err);
    res.status(500).send("❌ Failed to submit ticket.");
  }
});

module.exports = router;
