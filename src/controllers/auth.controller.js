const authService = require('../services/auth.service');

const authController = {
  async login(req, res, next) {
    try {
      const { username, password } = req.body;
      const data = await authService.login(username, password);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async verify(req, res, next) {
    try {
      const user = await authService.verify(req.userId);
      res.json({ user });
    } catch (err) {
      next(err);
    }
  }
};

module.exports = authController;
