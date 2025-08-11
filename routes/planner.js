const express = require('express');
const router = express.Router();
const db = require('../db');
const requireRole = require('../middleware/requireRole');

// ===============================
// GET: Planner Dashboard
// ===============================
router.get('/dashboard/planner', requireRole(['planner', 'admin']), async (req, res) => {
  const userRole = req.session.user?.role;
  const userLocation = req.session.user?.location;

  try {
    let query = `
      SELECT 
        t.*, 
        u.name AS assigned_to_name
      FROM tickets t
      LEFT JOIN users u ON t.assigned_to = u.global_id
      WHERE 1=1
    `;
    const params = [];

    if (!(userRole === 'admin' && userLocation === 'Pune')) {
      query += ` AND t.location = ?`;
      params.push(userLocation);
    }

    query += ` ORDER BY t.created_at DESC`;

    const [tickets] = await db.query(query, params);

    // Fetch technicians list (filtered by location for non-Pune admin)
    let techQuery = `
      SELECT global_id, name, location
      FROM users 
      WHERE department IN ('technician', 'planner', 'admin')
    `;
    const techParams = [];

    if (!(userRole === 'admin' && userLocation === 'Pune')) {
      techQuery += ` AND location = ?`;
      techParams.push(userLocation);
    }

    techQuery += ` ORDER BY name`;

    const [technicians] = await db.query(techQuery, techParams);

    res.render('dashboard-planner', {
      tickets,
      technicians,
      user: req.session.user
    });
  } catch (err) {
    console.error('Planner dashboard error:', err);
    res.status(500).send("Error loading planner dashboard");
  }
});

// ===============================
// POST: Assign Ticket
// ===============================
router.post('/planner/assign', requireRole(['planner', 'admin']), async (req, res) => {
  const { ticketId, executerId } = req.body;
  const assignerGlobalId = req.session.user?.globalId;
  const userRole = req.session.user?.role;
  const userLocation = req.session.user?.location;

  if (!ticketId || !executerId) {
    return res.status(400).send('Missing ticketId or executerId');
  }

  try {
    let query = `
      UPDATE tickets 
      SET assigned_to = ?, planner_id = ?, status = 'Assigned', updated_at = NOW()
      WHERE id = ?
    `;
    const params = [executerId, assignerGlobalId, ticketId];

    if (!(userRole === 'admin' && userLocation === 'Pune')) {
      query += ` AND location = ?`;
      params.push(userLocation);
    }

    const [result] = await db.query(query, params);

    if (result.affectedRows === 0) {
      return res.status(404).send('❌ Ticket not found or no permission.');
    }

    res.redirect('/dashboard/planner');
  } catch (err) {
    console.error('Assignment error:', err);
    res.status(500).send('❌ Failed to assign technician.');
  }
});

module.exports = router;
