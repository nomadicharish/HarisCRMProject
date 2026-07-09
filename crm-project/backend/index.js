require("dotenv").config();

const { app } = require("./app");
const { logger } = require("./lib/logger");
const { startDailyNotificationScheduler } = require("./services/notificationService");

const PORT = Number(process.env.PORT || 3000);

app.listen(PORT, () => {
  logger.info(`Server running successfully on port ${PORT}`);
  startDailyNotificationScheduler();
});
