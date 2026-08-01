const CORE_HEADERS = [
  "Sl No", "Embassy Appointment Date", "Embassy Interview Date", "TRC Collection Date", "Arrival Date",
  "Name", "Surname", "Email ID", "Telephone Number / Whatsapp Number", "Date of Birth", "Place OF Birth",
  "Passport Number", "Agent Name", "Education"
];
const PAYMENT_HEADERS = ["1st payment", "2nd payment", "3rd payment", "4th payment", "Final payment", "Remaining Payment"];
const REMARKS_HEADER = "Remarks";

function exportHeaders(role = "") {
  const headers = role === "EMPLOYER"
    ? CORE_HEADERS.filter((header) => header !== "Agent Name")
    : [...CORE_HEADERS];
  if (role === "SUPER_USER") headers.push(...PAYMENT_HEADERS);
  headers.push(REMARKS_HEADER);
  return headers;
}

function toDate(value) {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  if (value?._seconds) return new Date(value._seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = toDate(value);
  if (!date) return "";
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

function dateFromStage(stage = {}) {
  return stage.dateTime || stage.date || stage.createdAt || "";
}

function paymentValues(paymentSummary = {}, applicant = {}) {
  const history = Array.isArray(paymentSummary?.applicant?.history) ? paymentSummary.applicant.history : [];
  const ordered = [...history].sort((a, b) => new Date(a.paidDate || a.createdAt || 0) - new Date(b.paidDate || b.createdAt || 0));
  const values = Array.from({ length: 5 }, (_, index) => {
    const payment = ordered[index];
    if (!payment) return "";
    const amount = Number(payment.amount || 0);
    return `${amount}${payment.currency ? ` ${payment.currency}` : ""}`;
  });
  const totalAmount = Number(applicant.totalApplicantPayment ?? applicant.totalAmount ?? paymentSummary?.applicant?.totalAmount ?? 0);
  const paidAmount = ordered.reduce((total, payment) => total + Number(payment.amount || 0), 0);
  const remainingAmount = Math.max(0, totalAmount - paidAmount);
  const currency = applicant.paymentCurrency || applicant.currency || ordered.find((payment) => payment.currency)?.currency || "";
  values.push(`${remainingAmount}${currency ? ` ${currency}` : ""}`);
  return values;
}

function applicantRow(applicant, paymentSummary, serial, role) {
  const details = applicant.personalDetails || {};
  const coreValues = [
    serial,
    formatDate(dateFromStage(applicant.embassyAppointment)),
    formatDate(dateFromStage(applicant.embassyInterview)),
    formatDate(dateFromStage(applicant.visaCollection)),
    formatDate(dateFromStage(applicant.visaTravel)),
    applicant.firstName || details.firstName || "",
    applicant.lastName || details.lastName || "",
    applicant.email || details.email || "",
    [
      details.phone || details.phoneNumber || details.contactNumber || applicant.phone || applicant.phoneNumber || applicant.contactNumber,
      details.whatsappNumber || details.whatsapp || applicant.whatsappNumber || applicant.whatsapp
    ].filter(Boolean).join(" / "),
    formatDate(details.dob || details.dateOfBirth || applicant.dob || applicant.dateOfBirth),
    details.placeOfBirth || details.birthPlace || applicant.placeOfBirth || applicant.birthPlace || "",
    details.passportNumber || details.passportNo || applicant.passportNumber || applicant.passportNo || "",
    applicant.agencyName || "",
    applicant.education || details.education || ""
  ];
  if (role === "EMPLOYER") coreValues.splice(12, 1);
  if (role === "SUPER_USER") coreValues.push(...paymentValues(paymentSummary, applicant));
  coreValues.push(applicant.remarks || applicant.remark || applicant.note || "");
  return coreValues;
}

function safeSheetName(value, usedNames) {
  const base = String(value || "Unassigned Company").replace(/[\\/*?:[\]]/g, " ").trim().slice(0, 31) || "Unassigned Company";
  let name = base;
  let suffix = 2;
  while (usedNames.has(name)) name = `${base.slice(0, 28)} (${suffix++})`;
  usedNames.add(name);
  return name;
}

export async function downloadApplicantsExcel(applicants = [], { role = "" } = {}) {
  const XLSX = await import("xlsx-js-style");
  const headers = exportHeaders(role);
  const workbook = XLSX.utils.book_new();
  const companies = new Map();
  applicants.forEach((item) => {
    const company = item.applicant.companyName || "Unassigned Company";
    if (!companies.has(company)) companies.set(company, []);
    companies.get(company).push(item);
  });

  const usedSheetNames = new Set();
  companies.forEach((companyApplicants, companyName) => {
    const rows = [];
    const headerRows = [];
    const positionRows = [];
    const merges = [];
    const positions = new Map();
    companyApplicants.forEach((item) => {
      const position = item.applicant.jobPositionName || "Unassigned Job Position";
      if (!positions.has(position)) positions.set(position, []);
      positions.get(position).push(item);
    });

    positions.forEach((positionApplicants, positionName) => {
      positionRows.push(rows.length);
      rows.push([positionName.toUpperCase(), ...Array(headers.length - 1).fill("")]);
      merges.push({ s: { r: rows.length - 1, c: 0 }, e: { r: rows.length - 1, c: headers.length - 1 } });
      headerRows.push(rows.length);
      rows.push(headers.map((header) => header.toUpperCase()));
      positionApplicants.forEach((item, index) => rows.push(applicantRow(item.applicant, item.paymentSummary, index + 1, role)));
      rows.push([]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet["!cols"] = headers.map((header) => ({ wch: Math.max(14, header.length + 2) }));
    worksheet["!merges"] = merges;
    const border = {
      top: { style: "thin", color: { rgb: "808080" } }, bottom: { style: "thin", color: { rgb: "808080" } },
      left: { style: "thin", color: { rgb: "808080" } }, right: { style: "thin", color: { rgb: "808080" } }
    };
    rows.forEach((row, rowIndex) => {
      headers.forEach((_, columnIndex) => {
        const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
        worksheet[address] ||= { t: "s", v: "" };
        worksheet[address].s = { border };
      });
    });
    headerRows.forEach((rowIndex) => {
      headers.forEach((_, columnIndex) => {
        worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })].s = { border, fill: { patternType: "solid", fgColor: { rgb: "9DC3E6" } }, font: { bold: true } };
      });
    });
    positionRows.forEach((rowIndex) => {
      headers.forEach((_, columnIndex) => {
        worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })].s = { border, fill: { patternType: "solid", fgColor: { rgb: "C6E0B4" } }, font: { bold: true } };
      });
    });
    XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(companyName, usedSheetNames));
  });

  XLSX.writeFile(workbook, `filtered-applicants-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
