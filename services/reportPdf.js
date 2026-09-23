// services/reportPdf.js
// Generates the actual PDF report by spawning the Python report generator
// (report-generator/report_generator.py). Requires Python 3 with reportlab
// installed on whatever server this runs on:
//   pip install reportlab --break-system-packages

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const GENERATOR_DIR = path.join(__dirname, "..", "report-generator");
const GENERATOR_SCRIPT = path.join(GENERATOR_DIR, "report_generator.py");
const TOOLKIT_SCRIPT = path.join(GENERATOR_DIR, "toolkit_generator.py");
const REPORTS_DIR = path.join(__dirname, "..", "data", "reports");

function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

/**
 * Generates a PDF report and returns its file path.
 * @param {object} reportData - matches report_generator.py's expected JSON shape:
 *   { businessName, businessType, city, reportId, reportDate, waNumber, scores, competitor, industryAvg }
 * @returns {Promise<string>} absolute path to the generated PDF
 */
function generateReportPdf(reportData) {
  return new Promise((resolve, reject) => {
    ensureReportsDir();

    const tmpInputPath = path.join(os.tmpdir(), `kyp-report-input-${Date.now()}.json`);
    const outputPath = path.join(REPORTS_DIR, `${reportData.reportId}.pdf`);

    fs.writeFileSync(tmpInputPath, JSON.stringify(reportData));

    const proc = spawn("python3", [GENERATOR_SCRIPT, tmpInputPath, outputPath], { cwd: GENERATOR_DIR });

    let stderr = "";
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      fs.unlink(tmpInputPath, () => {}); // clean up temp input file regardless of outcome
      if (code !== 0) {
        return reject(new Error(`Report generation failed (exit code ${code}): ${stderr}`));
      }
      if (!fs.existsSync(outputPath)) {
        return reject(new Error("Report generation reported success but no PDF was found."));
      }
      resolve(outputPath);
    });

    proc.on("error", (err) => {
      reject(new Error(`Could not start Python report generator - is Python 3 installed? (${err.message})`));
    });
  });
}

/**
 * Builds a cryptographically random reportId - NOT guessable from a
 * timestamp, unlike a plain Date.now()-based ID would be. This matters
 * because the report ID doubles as the download link's access token.
 */
function makeReportId() {
  const crypto = require("crypto");
  return `KYP-${crypto.randomBytes(12).toString("hex").toUpperCase()}`;
}

/**
 * Generates the toolkit ZIP and returns its file path.
 * Same input JSON shape as generateReportPdf.
 * @returns {Promise<string>} absolute path to the generated ZIP
 */
function generateToolkitZip(reportData) {
  return new Promise((resolve, reject) => {
    ensureReportsDir();
    const tmpInputPath = path.join(os.tmpdir(), `kyp-toolkit-input-${Date.now()}.json`);
    const outputPath = path.join(REPORTS_DIR, `${reportData.reportId}-toolkit.zip`);
    fs.writeFileSync(tmpInputPath, JSON.stringify(reportData));
    const proc = spawn("python3", [TOOLKIT_SCRIPT, tmpInputPath, outputPath], { cwd: GENERATOR_DIR });
    let stderr = "";
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    proc.on("close", (code) => {
      fs.unlink(tmpInputPath, () => {});
      if (code !== 0) return reject(new Error(`Toolkit generation failed (exit ${code}): ${stderr}`));
      if (!fs.existsSync(outputPath)) return reject(new Error("Toolkit ZIP not found after generation."));
      resolve(outputPath);
    });
    proc.on("error", (err) => reject(new Error(`Could not start toolkit generator: ${err.message}`)));
  });
}

module.exports = { generateReportPdf, generateToolkitZip, makeReportId, REPORTS_DIR };
