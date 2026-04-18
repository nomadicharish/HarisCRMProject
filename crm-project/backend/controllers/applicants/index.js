const lifecycle = require("./lifecycleController");
const payment = require("./paymentController");
const documents = require("./documentController");
const workflow = require("./workflowController");

module.exports = {
  ...lifecycle,
  ...payment,
  ...documents,
  ...workflow
};
