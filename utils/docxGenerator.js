const fs = require("fs");
const path = require("path");
const { imageSize } = require("image-size");
const { Document, Packer, Paragraph, ImageRun } = require("docx");

/**
 * Generates DOCX by embedding PNGs.
 * - Fits image to page width
 * - Preserves aspect ratio
 * - One image per page
 */
async function generateDocxFromPngFolder(docxPath, pngFolder) {
  const pngFiles = fs
    .readdirSync(pngFolder)
    .filter(f => f.endsWith(".png"))
    .sort();

  const children = [];

  const MAX_WIDTH_PX = 600; // fits A4 page width safely

  for (const file of pngFiles) {
    const filePath = path.join(pngFolder, file);
    const imageBuffer = fs.readFileSync(filePath);

    // ✅ Correct way to read dimensions
    const { width, height } = imageSize(imageBuffer);

    // 📐 Scale proportionally
    const scale = MAX_WIDTH_PX / width;
    const scaledWidth = MAX_WIDTH_PX;
    const scaledHeight = Math.round(height * scale);

    children.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: imageBuffer,
            transformation: {
              width: scaledWidth,
              height: scaledHeight
            }
          })
        ],
        pageBreakBefore: true
      })
    );
  }

  const doc = new Document({
    sections: [{ children }]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(docxPath, buffer);
}

module.exports = { generateDocxFromPngFolder };
