const fs = require("fs");
const path = require("path");
const { imageSize } = require("image-size");
const { Document, Packer, Paragraph, ImageRun } = require("docx");

async function generateDocxFromPngFolder(docxPath, pngFolder) {
  const files = fs.readdirSync(pngFolder).filter(f => f.endsWith(".png"));

  const sections = files.map(file => {
    const buffer = fs.readFileSync(path.join(pngFolder, file));
    const { width, height } = imageSize(buffer);

    return {
      children: [
        new Paragraph({
          children: [
            new ImageRun({
              data: buffer,
              transformation: { width, height }
            })
          ]
        })
      ]
    };
  });

  const doc = new Document({ sections });
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(docxPath, buf);
}

module.exports = { generateDocxFromPngFolder };
