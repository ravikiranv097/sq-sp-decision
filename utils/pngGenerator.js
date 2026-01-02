const puppeteer = require("puppeteer");
const fs = require("fs-extra");
const Handlebars = require("handlebars");

const templateHtml = fs.readFileSync("templates/evidence.html", "utf8");
const template = Handlebars.compile(templateHtml);

exports.generatePNG = async (evidence, outputDir) => {
  await fs.ensureDir(outputDir);

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  const html = template({
    Username: evidence["Username"],
    AccountID: evidence["Account ID"],
    Project: evidence["Project"],
    Timestamp: evidence["Timestamp (IST)"],
    HasAccess: evidence["Has Access"],
    AccessClass: evidence["Has Access"] === "YES" ? "yes" : "no",
    Permission: evidence["Permission Level"],
    Source: evidence["Source"],
    ApiResponse: JSON.stringify(evidence["API Response"], null, 2)
  });

  await page.setContent(html, { waitUntil: "networkidle0" });

  // Ensure layout & fonts are fully settled
  await page.evaluate(() => document.fonts.ready);

  // Set a safe fixed viewport width (height doesn't matter now)
  await page.setViewport({
    width: 1200,
    height: 800,
    deviceScaleFactor: 1
  });

  const fileName = `${evidence["Username"]}_${evidence["Project"]}_${Date.now()}.png`;

  // Screenshot the rendered content itself (NO CUTTING)
  const bodyHandle = await page.$("body");
  await bodyHandle.screenshot({
    path: `${outputDir}/${fileName}`
  });

  await browser.close();
};
