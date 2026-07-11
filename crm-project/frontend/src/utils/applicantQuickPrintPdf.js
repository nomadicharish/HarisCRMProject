import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const A4 = [595.28, 841.89];
const BLUE = rgb(0.02, 0.22, 0.68);
const DARK_BLUE = rgb(0.02, 0.16, 0.5);
const TEXT = rgb(0.08, 0.1, 0.16);
const MUTED = rgb(0.38, 0.43, 0.52);
const LINE = rgb(0.82, 0.87, 0.95);
const PALE_BLUE = rgb(0.93, 0.96, 1);
const WHITE = rgb(1, 1, 1);
const QUICK_PRINT_ICON_URLS = {
  title: "/quick-print-icons/person-luggage.png",
  bus: "/quick-print-icons/bus-alt.png",
  company: "/quick-print-icons/company.png",
  hotel: "/quick-print-icons/hotel.png",
  job: "/quick-print-icons/job-position.png",
  phone: "/quick-print-icons/phone-flip.png",
  flightTime: "/quick-print-icons/plane-clock.png",
  flight: "/quick-print-icons/plane.png"
};

function valueOrDash(value) {
  return String(value || "").trim() || "-";
}

function combineDateTime(date, time) {
  return [date, time].filter((value) => String(value || "").trim()).join(" ");
}

function calculateAge(applicant) {
  const directAge = Number(applicant?.age || applicant?.personalDetails?.age);
  if (Number.isFinite(directAge) && directAge > 0) return directAge;
  const rawDob = applicant?.dob || applicant?.personalDetails?.dob;
  if (!rawDob) return "";
  const dob = new Date(rawDob);
  if (Number.isNaN(dob.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDelta = today.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age > 0 ? age : "";
}

function wrapText(text, font, size, maxWidth) {
  const words = valueOrDash(text).split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  });
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

async function fetchBytes(url) {
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error(`Unable to fetch attachment (${response.status})`);
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: String(response.headers.get("content-type") || "").toLowerCase()
  };
}

async function embedImage(pdfDoc, url, assetLoader = null, assetType = "") {
  if (!url) return null;
  const { bytes, contentType } = assetLoader
    ? await assetLoader(assetType)
    : await fetchBytes(url);
  if (contentType.includes("png") || /\.png(?:$|[?#])/i.test(url)) {
    return pdfDoc.embedPng(bytes);
  }
  return pdfDoc.embedJpg(bytes);
}

function drawImageContained(page, image, box) {
  const scale = Math.min(box.width / image.width, box.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height
  });
}

function drawHeader(page, { logo, boldFont }) {
  const [, height] = A4;
  if (logo) {
    drawImageContained(page, logo, { x: 30, y: height - 74, width: 48, height: 48 });
  } else {
    page.drawCircle({ x: 54, y: height - 50, size: 24, color: BLUE });
  }
  page.drawText("Talent Acquisition", {
    x: 90,
    y: height - 58,
    size: 24,
    font: boldFont,
    color: DARK_BLUE
  });
  page.drawLine({
    start: { x: 30, y: height - 86 },
    end: { x: 565, y: height - 86 },
    thickness: 1.2,
    color: BLUE
  });
}

function drawFooter(page, { regularFont, pageNumber, totalPages }) {
  page.drawLine({
    start: { x: 30, y: 42 },
    end: { x: 565, y: 42 },
    thickness: 1.2,
    color: BLUE
  });
  const pageText = `Page ${pageNumber} of ${totalPages}`;
  page.drawText(pageText, {
    x: 565 - regularFont.widthOfTextAtSize(pageText, 8),
    y: 24,
    size: 8,
    font: regularFont,
    color: TEXT
  });
}

function drawIcon(page, type, x, y) {
  const cx = x + 21;
  const cy = y + 21;
  const line = (x1, y1, x2, y2, thickness = 2) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color: BLUE });

  if (type === "phone") {
    page.drawRectangle({ x: x + 14, y: y + 9, width: 14, height: 26, borderColor: BLUE, borderWidth: 2 });
    line(x + 18, y + 31, x + 24, y + 31, 1.5);
    page.drawCircle({ x: cx, y: y + 13, size: 1.8, color: BLUE });
    return;
  }
  if (type === "whatsapp") {
    page.drawCircle({ x: cx, y: cy + 3, size: 12, borderColor: BLUE, borderWidth: 2 });
    line(x + 13, y + 11, x + 16, y + 16, 2);
    line(x + 16, y + 16, x + 21, y + 14, 2);
    line(x + 17, y + 27, x + 20, y + 23, 2);
    line(x + 20, y + 23, x + 26, y + 20, 2);
    line(x + 26, y + 20, x + 29, y + 22, 2);
    return;
  }
  if (type === "company" || type === "hotel") {
    page.drawRectangle({ x: x + 10, y: y + 9, width: 22, height: 25, borderColor: BLUE, borderWidth: 2 });
    if (type === "hotel") {
      line(x + 15, y + 14, x + 15, y + 22, 2);
      line(x + 15, y + 18, x + 28, y + 18, 2);
      line(x + 28, y + 14, x + 28, y + 24, 2);
    } else {
      [15, 21, 27].forEach((yy) => line(x + 15, y + yy, x + 19, y + yy, 1.5));
      [15, 21, 27].forEach((yy) => line(x + 23, y + yy, x + 27, y + yy, 1.5));
    }
    return;
  }
  if (type === "job") {
    page.drawRectangle({ x: x + 9, y: y + 13, width: 24, height: 17, borderColor: BLUE, borderWidth: 2 });
    page.drawRectangle({ x: x + 17, y: y + 29, width: 8, height: 4, borderColor: BLUE, borderWidth: 2 });
    line(x + 9, y + 22, x + 33, y + 22, 1.5);
    return;
  }
  if (type === "calendar" || type === "calendarClock") {
    page.drawRectangle({ x: x + 10, y: y + 10, width: 23, height: 22, borderColor: BLUE, borderWidth: 2 });
    line(x + 10, y + 25, x + 33, y + 25, 2);
    line(x + 16, y + 35, x + 16, y + 29, 2);
    line(x + 27, y + 35, x + 27, y + 29, 2);
    if (type === "calendarClock") {
      page.drawCircle({ x: x + 28, y: y + 14, size: 5, borderColor: BLUE, borderWidth: 1.5 });
      line(x + 28, y + 14, x + 28, y + 17, 1.2);
      line(x + 28, y + 14, x + 31, y + 14, 1.2);
    } else {
      line(x + 15, y + 20, x + 18, y + 20, 1.4);
      line(x + 23, y + 20, x + 26, y + 20, 1.4);
      line(x + 15, y + 15, x + 18, y + 15, 1.4);
    }
    return;
  }
  if (type === "time") {
    page.drawCircle({ x: cx, y: cy, size: 12, borderColor: BLUE, borderWidth: 2 });
    line(cx, cy, cx, cy + 7, 2);
    line(cx, cy, cx + 6, cy - 4, 2);
    return;
  }
  if (type === "flight") {
    line(x + 8, y + 22, x + 34, y + 22, 2.5);
    line(x + 24, y + 22, x + 14, y + 33, 2);
    line(x + 24, y + 22, x + 14, y + 11, 2);
    line(x + 10, y + 22, x + 7, y + 27, 1.8);
    line(x + 10, y + 22, x + 7, y + 17, 1.8);
    line(x + 31, y + 22, x + 35, y + 25, 1.8);
    line(x + 31, y + 22, x + 35, y + 19, 1.8);
    return;
  }
  if (type === "pin") {
    page.drawCircle({ x: cx, y: cy + 6, size: 10, borderColor: BLUE, borderWidth: 2 });
    page.drawCircle({ x: cx, y: cy + 6, size: 3, borderColor: BLUE, borderWidth: 1.5 });
    line(cx - 7, cy - 1, cx, y + 7, 2);
    line(cx + 7, cy - 1, cx, y + 7, 2);
    return;
  }
  if (type === "bus") {
    page.drawRectangle({ x: x + 9, y: y + 11, width: 24, height: 22, borderColor: BLUE, borderWidth: 2 });
    line(x + 12, y + 25, x + 30, y + 25, 2);
    line(x + 13, y + 18, x + 29, y + 18, 1.5);
    page.drawCircle({ x: x + 14, y: y + 10, size: 3, color: BLUE });
    page.drawCircle({ x: x + 28, y: y + 10, size: 3, color: BLUE });
    return;
  }
  if (type === "busClock") {
    page.drawRectangle({ x: x + 8, y: y + 14, width: 22, height: 18, borderColor: BLUE, borderWidth: 2 });
    line(x + 11, y + 25, x + 27, y + 25, 1.8);
    page.drawCircle({ x: x + 13, y: y + 13, size: 2.5, color: BLUE });
    page.drawCircle({ x: x + 25, y: y + 13, size: 2.5, color: BLUE });
    page.drawCircle({ x: x + 31, y: y + 13, size: 6, borderColor: BLUE, borderWidth: 1.5 });
    line(x + 31, y + 13, x + 31, y + 16, 1.2);
    line(x + 31, y + 13, x + 34, y + 13, 1.2);
  }
}

function drawIconBox(page, x, y, type, image = null) {
  page.drawRectangle({ x, y, width: 42, height: 42, color: PALE_BLUE, borderColor: LINE, borderWidth: 0.5 });
  if (image) {
    drawImageContained(page, image, { x: x + 7, y: y + 7, width: 28, height: 28 });
  } else {
    drawIcon(page, type, x, y);
  }
}

function drawDetail(page, { x, y, width, icon, iconImage, label, value, regularFont, boldFont }) {
  drawIconBox(page, x, y - 34, icon, iconImage);
  page.drawText(label, { x: x + 58, y: y - 6, size: 10, font: boldFont, color: TEXT });
  const lines = wrapText(value, regularFont, 11, width - 62);
  lines.forEach((line, index) => {
    page.drawText(line, { x: x + 58, y: y - 25 - index * 13, size: 11, font: regularFont, color: TEXT });
  });
  page.drawLine({
    start: { x, y: y - 48 },
    end: { x: x + width, y: y - 48 },
    thickness: 0.6,
    color: LINE
  });
}

async function drawDetailsPage(pdfDoc, applicant, assets, fonts) {
  const page = pdfDoc.addPage(A4);
  const [, height] = A4;
  const personal = applicant?.personalDetails || {};
  const arrival = applicant?.visaTravel || {};
  const fullName =
    applicant?.fullName ||
    [applicant?.firstName || personal.firstName, applicant?.lastName || personal.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "Applicant";

  if (assets.photo) {
    page.drawRectangle({ x: 45, y: height - 290, width: 145, height: 160, borderColor: LINE, borderWidth: 1 });
    drawImageContained(page, assets.photo, { x: 46, y: height - 289, width: 143, height: 158 });
  } else {
    page.drawRectangle({ x: 45, y: height - 290, width: 145, height: 160, color: PALE_BLUE, borderColor: LINE, borderWidth: 1 });
    page.drawText("No applicant photo", {
      x: 73,
      y: height - 216,
      size: 10,
      font: fonts.regular,
      color: MUTED
    });
  }

  page.drawText(fullName, {
    x: 220,
    y: height - 220,
    size: 30,
    font: fonts.bold,
    color: DARK_BLUE
  });
  const age = calculateAge(applicant);
  if (age) {
    page.drawRectangle({ x: 220, y: height - 255, width: 62, height: 22, borderColor: BLUE, borderWidth: 1 });
    page.drawText(`Age: ${age}`, { x: 230, y: height - 249, size: 10, font: fonts.regular, color: DARK_BLUE });
  }

  if (assets.icons?.title) {
    drawImageContained(page, assets.icons.title, { x: 32, y: height - 354, width: 28, height: 28 });
  } else {
    page.drawCircle({ x: 45, y: height - 340, size: 13, color: BLUE });
    page.drawText("TA", { x: 37, y: height - 344, size: 8, font: fonts.bold, color: WHITE });
  }
  page.drawText("Travel & Arrival Details", {
    x: 70,
    y: height - 347,
    size: 17,
    font: fonts.bold,
    color: DARK_BLUE
  });
  page.drawLine({
    start: { x: 30, y: height - 365 },
    end: { x: 565, y: height - 365 },
    thickness: 1,
    color: BLUE
  });

  const leftX = 36;
  const rightX = 309;
  const columnWidth = 250;
  const rows = [height - 405, height - 485, height - 565, height - 645, height - 725];
  drawDetail(page, { x: leftX, y: rows[0], width: columnWidth, icon: "phone", iconImage: assets.icons?.phone, label: "Contact Number", value: applicant?.phone || personal.phone, ...fonts });
  drawDetail(page, { x: leftX, y: rows[1], width: columnWidth, icon: "company", iconImage: assets.icons?.company, label: "Company", value: applicant?.companyName, ...fonts });
  drawDetail(page, { x: leftX, y: rows[2], width: columnWidth, icon: "calendarClock", iconImage: assets.icons?.flightTime, label: "Flight Arrival Date & Time", value: combineDateTime(arrival.date, arrival.time), ...fonts });
  drawDetail(page, { x: leftX, y: rows[3], width: columnWidth, icon: "flight", iconImage: assets.icons?.flight, label: "Flight Number", value: arrival.flightNumber, ...fonts });
  drawDetail(page, { x: leftX, y: rows[4], width: columnWidth, icon: "bus", iconImage: assets.icons?.bus, label: "Arrival Bus Number", value: arrival.arrivalBusNumber, ...fonts });
  drawDetail(page, { x: rightX, y: rows[0], width: columnWidth, icon: "job", iconImage: assets.icons?.job, label: "Job Position", value: applicant?.jobPositionName, ...fonts });
  drawDetail(page, { x: rightX, y: rows[1], width: columnWidth, icon: "hotel", iconImage: assets.icons?.hotel, label: "Hotel Name & Address", value: arrival.hotelNameAddress, ...fonts });
  drawDetail(page, { x: rightX, y: rows[2], width: columnWidth, icon: "pin", label: "Flight Arrival Place", value: arrival.arrivalPlace, ...fonts });
  drawDetail(page, { x: rightX, y: rows[3], width: columnWidth, icon: "busClock", iconImage: assets.icons?.bus, label: "Bus Arrival Date & Time", value: combineDateTime(arrival.arrivalBusDate, arrival.arrivalBusTime), ...fonts });
  drawDetail(page, { x: rightX, y: rows[4], width: columnWidth, icon: "bus", iconImage: assets.icons?.bus, label: "Bus Arrival Place", value: arrival.busArrivalPlace || arrival.arrivalBusPlace, ...fonts });
}

async function appendAttachment(pdfDoc, attachment, fonts, assetLoader) {
  if (!attachment?.url) return;
  const { bytes, contentType } = await assetLoader(attachment.assetType);
  const isPdf = contentType.includes("pdf") || /\.pdf(?:$|[?#])/i.test(attachment.url);
  if (isPdf) {
    const embeddedPages = await pdfDoc.embedPdf(bytes);
    embeddedPages.forEach((embeddedPage, index) => {
      const page = pdfDoc.addPage(A4);
      page.drawText(`${attachment.title}${embeddedPages.length > 1 ? ` - ${index + 1}` : ""}`, {
        x: 30,
        y: 735,
        size: 14,
        font: fonts.bold,
        color: DARK_BLUE
      });
      const box = { x: 30, y: 65, width: 535, height: 650 };
      const scale = Math.min(box.width / embeddedPage.width, box.height / embeddedPage.height);
      const width = embeddedPage.width * scale;
      const height = embeddedPage.height * scale;
      page.drawPage(embeddedPage, {
        x: box.x + (box.width - width) / 2,
        y: box.y + (box.height - height) / 2,
        width,
        height
      });
    });
    return;
  }

  const image = contentType.includes("png") || /\.png(?:$|[?#])/i.test(attachment.url)
    ? await pdfDoc.embedPng(bytes)
    : await pdfDoc.embedJpg(bytes);
  const page = pdfDoc.addPage(A4);
  page.drawText(attachment.title, { x: 30, y: 735, size: 14, font: fonts.bold, color: DARK_BLUE });
  drawImageContained(page, image, { x: 30, y: 65, width: 535, height: 650 });
}

export async function generateApplicantArrivalPdf(applicant, assetLoader) {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold, regularFont: regular, boldFont: bold };
  const generatedAt = new Date();

  const [logo, photo, iconEntries] = await Promise.all([
    embedImage(pdfDoc, "/talent-acquisition-logo.png").catch(() => null),
    applicant?.profilePhotoUrl
      ? embedImage(pdfDoc, applicant.profilePhotoUrl, assetLoader, "photo")
      : Promise.resolve(null),
    Promise.all(Object.entries(QUICK_PRINT_ICON_URLS).map(async ([key, url]) => [
      key,
      await embedImage(pdfDoc, url).catch(() => null)
    ]))
  ]);
  const icons = Object.fromEntries(iconEntries);

  await drawDetailsPage(pdfDoc, applicant, { logo, photo, icons }, fonts);
  const arrival = applicant?.visaTravel || {};
  await appendAttachment(pdfDoc, { title: "Arrival Flight Ticket", url: arrival.fileUrl, assetType: "flight" }, fonts, assetLoader);
  await appendAttachment(pdfDoc, { title: "Arrival Bus Ticket", url: arrival.busTicketUrl, assetType: "bus" }, fonts, assetLoader);

  const pages = pdfDoc.getPages();
  pages.forEach((page, index) => {
    drawHeader(page, { logo, ...fonts });
    drawFooter(page, {
      ...fonts,
      pageNumber: index + 1,
      totalPages: pages.length
    });
  });

  pdfDoc.setTitle(`${applicant?.fullName || "Applicant"} - Travel and Arrival Details`);
  pdfDoc.setAuthor("Talent Acquisition");
  pdfDoc.setCreationDate(generatedAt);
  return pdfDoc.save();
}
