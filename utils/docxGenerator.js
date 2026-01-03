const fs = require("fs");
const path = require("path");
const officegen = require("officegen");

function generateDocxFromPngFolder(docxPath, pngFolder) {
  const images = fs
    .readdirSync(pngFolder)
    .filter(f => f.endsWith(".png"))
    .sort();

  if (!images.length) return;

  const docx = officegen("docx");

  images.forEach((img, index) => {
    const p = docx.createP();
    p.addImage(path.join(pngFolder, img));

    // Page break between images
    if (index < images.length - 1) {
      docx.createP().addText("", { pageBreakBefore: true });
    }
  });

  const out = fs.createWriteStream(docxPath);
  docx.generate(out);
}

module.exports = { generateDocxFromPngFolder };
