const express = require('express');
const router = express.Router();
const db = require('../db');
const requireRole = require('../middleware/requireRole');

// ==============================
// GET: Technician Dashboard
// ==============================
router.get('/dashboard/technician', requireRole(['technician', 'planner', 'admin']), async (req, res) => {
  const globalId = req.session.user?.globalId;

  try {
    const [tickets] = await db.query(`
      SELECT 
        t.*, 
        u.name AS planner_name 
      FROM tickets t
      LEFT JOIN users u ON t.planner_id = u.global_id
      WHERE t.assigned_to = ?
      ORDER BY t.created_at DESC
    `, [globalId]);

    res.render('dashboard-technician', {
      tickets,
      user: req.session.user
    });

  } catch (err) {
    console.error('Technician dashboard error:', err);
    res.send('Error loading technician dashboard.');
  }
});

// ==============================
// POST: Start Ticket
// ==============================
router.post('/technician/start', requireRole(['technician', 'planner', 'admin']), async (req, res) => {
  const { ticketId } = req.body;

  try {
    const [result] = await db.query(
      'UPDATE tickets SET status = ?, started_at = NOW() WHERE id = ?',
      ['In Progress', ticketId]
    );

    if (result.affectedRows === 0) {
      console.error("No ticket updated. Possibly invalid ticket ID:", ticketId);
      return res.send("❌ Ticket not found.");
    }

    res.redirect('/dashboard/technician');
  } catch (err) {
    console.error("Error in /technician/start:", err);
    res.send('Error starting the ticket.');
  }
});

// ==============================
// POST: Complete Ticket
// ==============================
router.post('/technician/complete', requireRole(['technician', 'admin', 'planner']), async (req, res) => {
  const { ticketId, completion_note } = req.body;
  try {
    await db.query(`
      UPDATE tickets 
      SET status = 'Completed', 
          completion_note = ?, 
          updated_at = NOW(),
          completed_at = NOW()
      WHERE id = ?`, 
    [completion_note, ticketId]);

    res.redirect('/dashboard/technician');
  } catch (err) {
    console.error("Error in /technician/complete:", err);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
