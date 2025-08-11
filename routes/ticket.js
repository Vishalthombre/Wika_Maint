const express = require('express');
const router = express.Router();
const db = require('../db');
const requireRole = require('../middleware/requireRole');

// ==============================
// GET: User Dashboard
// ==============================
router.get(
  '/dashboard/user',
  requireRole(['normal_user', 'technician', 'planner', 'admin']),
  async (req, res) => {
    try {
      const user = req.session.user;
      const sessionGlobalId = user?.globalId || user?.global_id;

      if (!sessionGlobalId) return res.redirect('/login');

      // The query remains the same here, it's correct for displaying tickets
      const [tickets] = await db.query(
        `
        SELECT
          t.*,
          u.name AS assigned_to_name
        FROM tickets t
        LEFT JOIN users u ON t.assigned_to = u.global_id
        WHERE t.raised_by = ?
        ORDER BY t.created_at DESC
        `,
        [sessionGlobalId]
      );

      res.render('dashboard-user', {
        tickets,
        user,
        message: req.query.message || null,
        error: req.query.error || null
      });
    } catch (err) {
      console.error('Error loading user dashboard:', err);
      res.render('dashboard-user', {
        tickets: [],
        user: req.session.user || null,
        message: null,
        error: 'Something went wrong loading your tickets.'
      });
    }
  }
);

// ==============================
// POST: Submit Ticket
// ==============================
router.post(
  '/ticket/submit',
  requireRole(['normal_user', 'technician', 'planner', 'admin']),
  async (req, res) => {
    try {
      const user = req.session.user;
      const sessionGlobalId = user?.globalId || user?.global_id;
      const sessionUserName = user?.name; // Get the user's name from the session

      if (!sessionGlobalId || !sessionUserName) {
        // Not logged in or malformed session
        return res.status(401).send('Session not found. Please log in.');
      }

      // Trim & normalize inputs
      let {
        category = '',
        description = '',
        building_no = '',
        area_code = '',
        sub_area = '',
        keyword = ''
      } = req.body;

      category = (category || '').toString().trim();
      description = (description || '').toString().trim();
      building_no = (building_no || '').toString().trim();
      area_code = (area_code || '').toString().trim();
      sub_area = (sub_area || '').toString().trim();
      keyword = (keyword || '').toString().trim();

      // Normalize category value (case-insensitive)
      if (category.toLowerCase() === 'facility' || category.toLowerCase() === 'facility service') {
        category = 'Facility Service';
      } else if (!category) {
        category = 'Other';
      }

      // Validation for Facility Service
      if (category === 'Facility Service') {
        if (!building_no || !area_code || !sub_area || !keyword) {
          const msg = encodeURIComponent(
            'Missing required Facility Service fields. Please select Level1, Level2, Level3 and Keyword.'
          );
          return res.redirect(`/dashboard/user?error=${msg}`);
        }
      }

      const insertSql = `
        INSERT INTO tickets
          (global_id, raised_by, category, description, building_no, area_code, sub_area, keyword, location, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `;

      const insertValues = [
        sessionGlobalId, // global_id (FK)
        sessionUserName, // raised_by (now stores the user's name)
        category || null,
        description || null,
        building_no || null,
        area_code || null,
        sub_area || null,
        keyword || null,
        user?.location || null
      ];

      await db.query(insertSql, insertValues);

      const successMsg = encodeURIComponent('Ticket submitted successfully.');
      return res.redirect(`/dashboard/user?message=${successMsg}`);
    } catch (err) {
      console.error('Error submitting ticket:', err);
      const errMsg = encodeURIComponent('Failed to submit ticket. Check server logs.');
      return res.redirect(`/dashboard/user?error=${errMsg}`);
    }
  }
);

module.exports = router;