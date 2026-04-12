const dashboardService = require("../services/dashboardService");

exports.getDashboard = async (req, res) => {
  const data = await dashboardService.getDashboard({
    user: req.user,
    query: req.query
  });

  return res.json(data);
};
