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

  const fileName = `${evidence["Username"]}_${evidence["Project"]}_${Date.now()}.png`;
  await page.screenshot({
    path: `${outputDir}/${fileName}`,
    fullPage: true
  });

  await browser.close();
};
