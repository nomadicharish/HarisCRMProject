const CURRENCY_CONFIG = {
  INR: { symbol: "\u20b9", locale: "en-IN", label: "INR" },
  EUR: { symbol: "\u20ac", locale: "de-DE", label: "EUR" },
  USD: { symbol: "$", locale: "en-US", label: "USD" }
};

export const CURRENCY_OPTIONS = [
  { value: "INR", label: "INR" },
  { value: "EUR", label: "Euro" },
  { value: "USD", label: "USD" }
];

export function normalizeCurrency(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "EURO") return "EUR";
  return CURRENCY_CONFIG[normalized] ? normalized : "INR";
}

export function getCurrencySymbol(value) {
  return CURRENCY_CONFIG[normalizeCurrency(value)].symbol;
}

export function formatCurrencyAmount(value, currency = "INR", withDecimals = false) {
  const config = CURRENCY_CONFIG[normalizeCurrency(currency)];
  return `${config.symbol}${Number(value || 0).toLocaleString(config.locale, {
    minimumFractionDigits: withDecimals ? 2 : 0,
    maximumFractionDigits: withDecimals ? 2 : 0
  })}`;
}
