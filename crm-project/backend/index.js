const { app } = require("./app");
const { logger } = require("./lib/logger");

const PORT = Number(process.env.PORT || 3000);

app.listen(PORT, () => {
  logger.info(`Server running successfully on port ${PORT}`);
});
