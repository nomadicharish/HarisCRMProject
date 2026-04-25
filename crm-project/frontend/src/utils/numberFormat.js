export function formatIndianNumberInput(value) {
  const cleaned = String(value || "").replace(/,/g, "").replace(/[^\d.]/g, "");
  const [whole = "", decimal = ""] = cleaned.split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "") || (whole.includes("0") ? "0" : "");

  if (!normalizedWhole) {
    return decimal ? `0.${decimal.slice(0, 2)}` : "";
  }

  const lastThree = normalizedWhole.slice(-3);
  const rest = normalizedWhole.slice(0, -3);
  const groupedRest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  const withComma = rest ? `${groupedRest},${lastThree}` : lastThree;
  return decimal ? `${withComma}.${decimal.slice(0, 2)}` : withComma;
}

export function parseIndianNumberInput(value) {
  return Number(String(value || "").replace(/,/g, ""));
}
