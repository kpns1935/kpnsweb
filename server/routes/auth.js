const express = require('express');
const router = express.Router();
const db = require('../db');

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await db.queryOne('SELECT * FROM users WHERE LOWER(email) = ?', [email.toLowerCase().trim()]);
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid credentials. Please check your email and password.' });
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    res.json({ success: true, user: req.session.user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout endpoint
router.post('/logout', (req, res) => {
  if (req.session) {
    if (typeof req.session.destroy === 'function') {
      req.session.destroy();
    } else {
      req.session = null;
    }
  }
  res.json({ success: true });
});

// Get current session user
router.get('/me', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ authenticated: true, user: req.session.user });
  } else {
    res.json({ authenticated: false });
  }
});

const isAdminUser = (user) => user && (user.role || '').toLowerCase() === 'admin';

// List all manager/admin users (Admin Only)
router.get('/users', async (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  if (!isAdminUser(req.session.user)) return res.status(403).json({ error: 'Admin access required' });
  try {
    const users = await db.queryAll('SELECT id, name, email, role, created_at FROM users ORDER BY id ASC');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new user
router.post('/users', async (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  if (!isManagementUser(req.session.user)) return res.status(403).json({ error: 'Management access required' });
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }

    const existing = await db.queryOne('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const result = await db.execute(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email.toLowerCase().trim(), password, role || 'manager']
    );

    res.json({ success: true, id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit user
router.put('/users/:id', async (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  if (!isManagementUser(req.session.user)) return res.status(403).json({ error: 'Management access required' });
  try {
    const userId = req.params.id;
    const { name, email, password, role } = req.body;

    const user = await db.queryOne('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Protect the default KPNS Admin account (email and role locked)
    if (user.email === 'kpnsclub@gmail.com') {
      if (role && role !== 'admin') {
        return res.status(400).json({ error: 'The default KPNS Admin account role must remain admin.' });
      }
      if (email && email.toLowerCase().trim() !== 'kpnsclub@gmail.com') {
        return res.status(400).json({ error: 'The default KPNS Admin email cannot be changed.' });
      }
    }

    // Prevent changing own role away from admin (safety guard)
    if (parseInt(userId) === req.session.user.id && role && role !== 'admin' && req.session.user.role === 'admin') {
      return res.status(400).json({ error: 'You cannot change your own admin role.' });
    }

    if (email && email.toLowerCase().trim() !== user.email) {
      const existing = await db.queryOne('SELECT id FROM users WHERE email = ? AND id != ?', [email.toLowerCase().trim(), userId]);
      if (existing) return res.status(400).json({ error: 'Another user with this email already exists' });
    }

    await db.execute(
      `UPDATE users SET name=?, email=?, role=?${password ? ', password=?' : ''} WHERE id=?`,
      password
        ? [name || user.name, email ? email.toLowerCase().trim() : user.email, role || user.role, password, userId]
        : [name || user.name, email ? email.toLowerCase().trim() : user.email, role || user.role, userId]
    );

    res.json({ success: true, message: 'User updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  if (!isManagementUser(req.session.user)) return res.status(403).json({ error: 'Management access required' });
  try {
    const userId = req.params.id;

    // Prevent self-deletion
    if (parseInt(userId) === req.session.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }

    const user = await db.queryOne('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Protect the default KPNS Admin account (non-deleteable)
    if (user.email === 'kpnsclub@gmail.com') {
      return res.status(403).json({ error: 'The default KPNS Admin account cannot be deleted.' });
    }

    await db.execute('DELETE FROM users WHERE id = ?', [userId]);
    res.json({ success: true, message: `User '${user.name}' deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
