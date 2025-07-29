const express = require('express');
const router = express.Router();
const db = require('../db');
const requireRole = require('../middleware/requireRole');


// ===============================
// GET: Planner Dashboard
// ===============================
router.get('/dashboard/planner', requireRole(['planner', 'admin']), async (req, res) => {
  try {
    // Fetch all tickets
    const [tickets] = await db.query(`
      SELECT 
        t.*, 
        u.name AS assigned_to_name 
      FROM tickets t
      LEFT JOIN users u ON t.assigned_to = u.global_id
      ORDER BY t.created_at DESC
    `);

    // Fetch all assignable users: technician, planner, admin
    const [technicians] = await db.query(`
      SELECT global_id, name 
      FROM users 
      WHERE department IN ('technician', 'planner', 'admin')
    `);

    res.render('dashboard-planner', {
      tickets,
      technicians, // updated: can include planner or admin too
      user: req.session.user
    });

  } catch (err) {
    console.error('Planner dashboard error:', err);
    res.send("Error loading planner dashboard");
  }
});

// ===============================
// POST: Assign Ticket
// ===============================
router.post('/planner/assign', requireRole(['planner', 'admin']), async (req, res) => {
  const { ticketId, executerId } = req.body;

  try {
    await db.query(
      'UPDATE tickets SET assigned_to = ?, status = ? WHERE id = ?',
      [executerId, 'Assigned', ticketId]
    );
    res.redirect('/dashboard/planner');
  } catch (err) {
    console.error('Assignment error:', err);
    res.send('❌ Failed to assign technician.');
  }
});

module.exports = router;
