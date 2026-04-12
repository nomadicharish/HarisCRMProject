const { sanitizeOutput } = require("../utils/outputSanitizer");

function responseSanitizer(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = (payload) => originalJson(sanitizeOutput(payload));
  next();
}

module.exports = { responseSanitizer };
