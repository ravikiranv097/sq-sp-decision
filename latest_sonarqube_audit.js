require("dotenv").config();

const XLSX = require("xlsx");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const { createObjectCsvWriter } = require("csv-writer");

const { generatePNG } = require("./utils/pngGenerator");
const { generateDocxFromPngFolder } = require("./utils/docxGenerator");

/* ===================== ENV & AUTH ===================== */

const SONAR_URL = process.env.SONAR_URL.replace(/\/$/, "");
const SONAR_TOKEN = process.env.SONAR_TOKEN;

const HEADERS = {
  Authorization: `Basic ${Buffer.from(`${SONAR_TOKEN}:`).toString("base64")}`
};

/* ===================== HELPERS ===================== */

function getIndianTimestamp() {
  return new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour12: false
  });
}

function getInputExcelFile() {
  const dir = path.join(__dirname, "input_files");
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".xlsx") && !f.startsWith("~$"));
  if (files.length !== 1) {
    throw new Error("input_files must contain exactly one .xlsx file");
  }
  return path.join(dir, files[0]);
}

/* ===================== PERMISSION LEVEL ===================== */

function resolvePermissionLevel(userInfo) {
  if (!userInfo || !Array.isArray(userInfo.groups) || userInfo.groups.length === 0) {
    return "-";
  }

  const mapped = userInfo.groups.map(group => {
    if (group === "sonar-users") return "SONAR USERS";
    if (group === "sonar-administrators") return "SONAR ADMINISTRATOR";
    return group;
  });

  return [...new Set(mapped)].join(", ");
}

/* ===================== CSV ===================== */

const csvHeader = [
  { id: "Username", title: "Username" },
  { id: "Account ID", title: "Account ID" },
  { id: "Timestamp (IST)", title: "Timestamp (IST)" },
  { id: "Has Access", title: "Has Access" },
  { id: "Permission Level", title: "Permission Level" }
];

const accessCsv = createObjectCsvWriter({
  path: "output_files/access_check_results.csv",
  append: fs.existsSync("output_files/access_check_results.csv"),
  header: csvHeader
});

const noAccessCsv = createObjectCsvWriter({
  path: "output_files/no_access_check_results.csv",
  append: fs.existsSync("output_files/no_access_check_results.csv"),
  header: csvHeader
});

/* ===================== SONAR API ===================== */

async function getUserStatus(username) {
  const res = await axios.get(
    `${SONAR_URL}/api/users/search`,
    { params: { q: username }, headers: HEADERS }
  );

  if (typeof res.data === "string") {
    throw new Error("HTML response received instead of JSON");
  }

  return {
    raw: res.data,
    user: res.data.users?.find(u => u.login === username) || null
  };
}

/* ===================== MAIN ===================== */

(async () => {
  try {
    await fs.ensureDir("output_files/png/has_access");
    await fs.ensureDir("output_files/png/no_access");
    await fs.ensureDir("output_files/doc");
    await fs.ensureDir("output_files/logs");

    const inputFile = getInputExcelFile();
    console.log(`📄 Using input file: ${path.basename(inputFile)}`);

    const workbook = XLSX.readFile(inputFile);
    const rows = XLSX.utils
      .sheet_to_json(workbook.Sheets[workbook.SheetNames[0]])
      .filter(r => r.Decision === "Revoked");

    for (const row of rows) {
      const user = String(row["User SSO"]).trim();

      try {
        const { user: userInfo, raw } = await getUserStatus(user);

        let hasAccess = false;
        let permissionLevel = "-";

        if (userInfo && userInfo.active === true) {
          hasAccess = true;
          permissionLevel = resolvePermissionLevel(userInfo);
        }

        const evidence = {
          "Username": user,
          "Account ID": user,
          "Timestamp (IST)": getIndianTimestamp(),
          "Has Access": hasAccess ? "YES" : "NO",
          "Permission Level": permissionLevel,
          "API Response": raw
        };

        await generatePNG(
          evidence,
          hasAccess
            ? "output_files/png/has_access"
            : "output_files/png/no_access"
        );

        const consoleMsg = hasAccess
          ? `[USER] ${user} | HAS ACCESS | ${permissionLevel}`
          : `[USER] ${user} | NO ACCESS`;

        console.log(consoleMsg);

        await fs.appendFile("output_files/logs/audit-info.log", consoleMsg + "\n");

        if (hasAccess) {
          await accessCsv.writeRecords([evidence]);
        } else {
          await noAccessCsv.writeRecords([evidence]);
        }

      } catch (err) {
        await fs.appendFile(
          "output_files/logs/audit-error.log",
          `[ERROR] ${user} → ${err.message}\n`
        );
      }
    }

    await generateDocxFromPngFolder(
      "output_files/doc/SonarQube_Has_Access_Evidence.docx",
      "output_files/png/has_access"
    );

    await generateDocxFromPngFolder(
      "output_files/doc/SonarQube_No_Access_Evidence.docx",
      "output_files/png/no_access"
    );

    console.log("✅ SonarQube access evidence collection completed");

  } catch (fatal) {
    console.error("❌ Fatal error:", fatal.message);
  }
})();
