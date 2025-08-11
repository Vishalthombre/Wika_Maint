const express = require('express');
const router = express.Router();
const db = require('../db');
const requireRole = require('../middleware/requireRole');

// ==============================
// GET: Technician Dashboard
// Roles: technician, planner, admin
// ==============================
router.get('/dashboard/technician', requireRole(['technician', 'planner', 'admin']), async (req, res) => {
  const { globalId, role, location } = req.session.user || {};

  if (!globalId) return res.redirect('/login');

  try {
    let query = `
      SELECT 
        t.*, 
        u.name AS planner_name
      FROM tickets t
      LEFT JOIN users u ON t.planner_id = u.global_id
      WHERE t.assigned_to = ?
    `;
    const params = [globalId];

    // Location-bound filtering for non-admins
    if (role !== 'admin') {
      query += ` AND t.location = ?`;
      params.push(location);
    }

    query += ` ORDER BY t.created_at DESC`;

    const [tickets] = await db.query(query, params);

    res.render('dashboard-technician', {
      tickets,
      user: req.session.user
    });
  } catch (err) {
    console.error('Technician dashboard error:', err);
    res.status(500).send('Error loading technician dashboard.');
  }
});

// ==============================
// POST: Start Ticket
// ==============================
router.post('/technician/start', requireRole(['technician', 'planner', 'admin']), async (req, res) => {
  const { ticketId } = req.body;
  const { role, location } = req.session.user || {};

  if (!ticketId) return res.status(400).send('Missing ticketId');

  try {
    let query = `
      UPDATE tickets 
      SET status = ?, started_at = NOW(), updated_at = NOW()
      WHERE id = ?
    `;
    const params = ['In Progress', ticketId];

    if (role !== 'admin') {
      query += ` AND location = ?`;
      params.push(location);
    }

    const [result] = await db.query(query, params);

    if (result.affectedRows === 0) {
      return res.status(404).send("❌ Ticket not found or no permission.");
    }

    res.redirect('/dashboard/technician');
  } catch (err) {
    console.error("Error in /technician/start:", err);
    res.status(500).send('Error starting the ticket.');
  }
});

// ==============================
// POST: Complete Ticket
// ==============================
router.post('/technician/complete', requireRole(['technician', 'planner', 'admin']), async (req, res) => {
  const { ticketId, completion_note } = req.body;
  const { role, location } = req.session.user || {};

  if (!ticketId) return res.status(400).send('Missing ticketId');

  try {
    let query = `
      UPDATE tickets 
      SET status = 'Completed', 
          completion_note = ?, 
          updated_at = NOW(),
          completed_at = NOW()
      WHERE id = ?
    `;
    const params = [completion_note || null, ticketId];

    if (role !== 'admin') {
      query += ` AND location = ?`;
      params.push(location);
    }

    const [result] = await db.query(query, params);

    if (result.affectedRows === 0) {
      return res.status(404).send("❌ Ticket not found or no permission.");
    }

    res.redirect('/dashboard/technician');
  } catch (err) {
    console.error("Error in /technician/complete:", err);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;