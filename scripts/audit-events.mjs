import fs from "node:fs/promises";
import vm from "node:vm";

const html = await fs.readFile("index.html", "utf8");
const match = html.match(/var EVENTS = (\[[\s\S]*?\n  \]);\n\n  \/\/ Türkiye tarihini/);
if (!match) throw new Error("EVENTS dizisi index.html içinde bulunamadı.");

const events = vm.runInNewContext(`(${match[1]})`);
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());
const allowedStatuses = new Set(["upcoming", "ongoing", "past", "unknown"]);
const allowedCategories = new Set(["resmi", "akademik", "stk", "intl"]);
const errors = [];
const warnings = [];
const seen = new Map();

events.forEach((event, index) => {
  const ref = `#${index + 1} ${event.title || "Başlıksız"}`;
  for (const key of ["title", "dateLabel", "loc", "org", "cat", "status", "src"]) {
    if (!event[key]) errors.push(`${ref}: ${key} alanı eksik.`);
  }
  if (!allowedStatuses.has(event.status)) errors.push(`${ref}: geçersiz durum (${event.status}).`);
  if (!allowedCategories.has(event.cat)) errors.push(`${ref}: geçersiz kategori (${event.cat}).`);
  if (event.date && !/^2026-\d{2}-\d{2}$/.test(event.date)) errors.push(`${ref}: geçersiz başlangıç tarihi.`);
  if (event.endDate && !/^2026-\d{2}-\d{2}$/.test(event.endDate)) errors.push(`${ref}: geçersiz bitiş tarihi.`);
  if (event.date && event.endDate && event.endDate < event.date) errors.push(`${ref}: bitiş başlangıçtan önce.`);
  if (!event.date && event.status === "upcoming") warnings.push(`${ref}: yaklaşan kaydın kesin tarihi yok.`);
  if (!event.date && event.status === "ongoing" && /Tarih doğrulanıyor/i.test(event.dateLabel)) {
    warnings.push(`${ref}: tarihi belirsiz kayıt ongoing yerine unknown olmalı.`);
  }
  if (event.src?.url && !/^https:\/\//.test(event.src.url)) errors.push(`${ref}: kaynak HTTPS değil.`);

  const duplicateKey = `${event.title}|${event.loc}`.toLocaleLowerCase("tr-TR");
  if (seen.has(duplicateKey)) warnings.push(`${ref}: #${seen.get(duplicateKey)} ile olası mükerrer kayıt.`);
  else seen.set(duplicateKey, index + 1);
});

const report = {
  checkedAt: new Date().toISOString(),
  turkeyDate: today,
  eventCount: events.length,
  sourceCount: new Set(events.map((event) => event.src?.url).filter(Boolean)).size,
  errors,
  warnings
};

await fs.mkdir("reports", { recursive: true });
await fs.writeFile("reports/audit.json", `${JSON.stringify(report, null, 2)}\n`);
await fs.writeFile("reports/audit.md", [
  "# COP31 veri denetimi",
  "",
  `- Kontrol: ${report.checkedAt}`,
  `- Etkinlik: ${report.eventCount}`,
  `- Benzersiz kaynak: ${report.sourceCount}`,
  `- Hata: ${errors.length}`,
  `- Uyarı: ${warnings.length}`,
  "",
  "## Hatalar",
  "",
  ...(errors.length ? errors.map((item) => `- ${item}`) : ["- Yok"]),
  "",
  "## Uyarılar",
  "",
  ...(warnings.length ? warnings.map((item) => `- ${item}`) : ["- Yok"]),
  ""
].join("\n"));

console.log(`Denetim tamamlandı: ${events.length} etkinlik, ${errors.length} hata, ${warnings.length} uyarı.`);
if (errors.length) process.exitCode = 1;
