const { getTodayEurToInrRate, roundCurrency } = require("../../services/applicantDomainService");

async function getExchangeRateUseCase() {
  const eurToInrRate = await getTodayEurToInrRate();
  return {
    currencyPair: "EURINR",
    rate: roundCurrency(eurToInrRate)
  };
}

module.exports = {
  getExchangeRateUseCase
};

