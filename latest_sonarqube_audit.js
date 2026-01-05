'use strict';

require("dotenv").config();
const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const csv = require("csv-parser");
const { createObjectCsvWriter } = require("csv-writer");

const { generatePNG } = require("./utils/pngGenerator");
const { generateDocxFromPngFolder } = require("./utils/docxGenerator");

/* ===================== CONFIG ===================== */

const SONAR_URL = process.env.SONAR_URL.replace(/\/$/, "");
const HEADERS = {
  Authorization: `Basic ${Buffer.from(`${process.env.SONAR_TOKEN}:`).toString("base64")}`
};

/* ===================== INPUT FILE (AUTO-DETECT) ===================== */

function getInputCsvFile() {
  const dir = path.join(__dirname, "input_files");

  if (!fs.existsSync(dir)) {
    throw new Error("input_files directory does not exist");
  }

  const files = fs
    .readdirSync(dir)
    .filter(f => f.toLowerCase().endsWith(".csv") && !f.startsWith("~$"));

  if (files.length !== 1) {
    throw new Error(
      `input_files must contain exactly one .csv file, found ${files.length}`
    );
  }

  return path.join(dir, files[0]);
}

/* ===================== HELPERS ===================== */

function getIST() {
  return new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour12: false
  });
}

/* ===================== SONAR API ===================== */

async function getUser(username) {
  const res = await axios.get(
    `${SONAR_URL}/api/users/search`,
    { params: { q: username }, headers: HEADERS }
  );
  return res.data.users?.find(u => u.login === username) || null;
}

async function deactivateUser(username) {
  return axios.post(
    `${SONAR_URL}/api/users/deactivate`,
    null,
    { params: { login: username }, headers: HEADERS }
  );
}

/* ===================== CSV OUTPUT ===================== */

const csvHeader = [
  { id: "Username", title: "Username" },
  { id: "Timestamp (IST)", title: "Timestamp (IST)" },
  { id: "Has Access", title: "Has Access" }
];

const accessCsv = createObjectCsvWriter({
  path: "output_files/access_check_results.csv",
  header: csvHeader
});

const noAccessCsv = createObjectCsvWriter({
  path: "output_files/no_access_check_results.csv",
  header: csvHeader
});

/* ===================== MAIN ===================== */

(async () => {
  try {
    /* 🔹 Resolve input CSV */
    const inputCsv = getInputCsvFile();
    console.log(`📄 Using input file: ${path.basename(inputCsv)}`);

    /* 🔹 Runtime directory setup */
    await fs.ensureDir("output_files/png/has_access");
    await fs.ensureDir("output_files/png/no_access");
    await fs.ensureDir("output_files/doc");
    await fs.ensureDir("output_files/logs");

    const stream = fs.createReadStream(inputCsv).pipe(csv());

    for await (const row of stream) {
      const username = String(row["Username"]).trim();
      if (!username) continue;

      let apiResponse = null;
      let finalUser = null;

      try {
        /* 1️⃣ Initial check */
        const initialUser = await getUser(username);

        /* 2️⃣ Enforce policy if active */
        if (initialUser && initialUser.active === true) {
          apiResponse = (await deactivateUser(username)).data;
        }

        /* 3️⃣ Final authoritative state */
        finalUser = await getUser(username);

      } catch (err) {
        apiResponse = err.response?.data || err.message;
      }

      const hasAccessFinal =
        finalUser && finalUser.active === true;

      const evidence = {
        "Username": username,
        "Account ID": username,
        "Timestamp (IST)": getIST(),
        "Has Access": hasAccessFinal ? "YES" : "NO",
        "Permission Level": "-",
        "API Response": apiResponse || finalUser || "User not found"
      };

      /* 📸 FINAL STATE EVIDENCE */
      await generatePNG(
        evidence,
        hasAccessFinal
          ? "output_files/png/has_access"
          : "output_files/png/no_access"
      );

      /* 🧾 CSV OUTPUT */
      const record = [{
        Username: username,
        "Timestamp (IST)": evidence["Timestamp (IST)"],
        "Has Access": evidence["Has Access"]
      }];

      if (hasAccessFinal) {
        await accessCsv.writeRecords(record);
      } else {
        await noAccessCsv.writeRecords(record);
      }

      /* 🔹 FINAL LOG (CONSOLE + FILE) */
      const finalLog =
        `[FINAL] ${username} → ${hasAccessFinal ? "HAS ACCESS" : "NO ACCESS"}`;

      console.log(finalLog);

      await fs.appendFile(
        "output_files/logs/audit-info.log",
        finalLog + "\n"
      );
    }

    /* 📄 DOCX GENERATION */
    await generateDocxFromPngFolder(
      "output_files/doc/SonarQube_Has_Access_Evidence.docx",
      "output_files/png/has_access"
    );

    await generateDocxFromPngFolder(
      "output_files/doc/SonarQube_No_Access_Evidence.docx",
      "output_files/png/no_access"
    );

    console.log("✅ SonarQube access evidence collection completed");

  } catch (err) {
    console.error("❌ Fatal error:", err.message);
    process.exit(1);
  }
})();
