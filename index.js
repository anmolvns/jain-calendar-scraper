import dotenv from 'dotenv';
import fetch from 'node-fetch';
import pkg from 'pg';
const { Pool } = pkg;

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: +process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Month number to name mapping (1-based index)
const monthMap = [
  '', // padding for 0th index
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

const insertQuery = `
  INSERT INTO jain_calendar (
    en_day, en_date, en_month, en_year,
    cal_tithi, cal_sud_vad, cal_month,
    cal_veer_year, cal_vikram_year, cal_day,
    cal_atham_chaudas, cal_special_tithi,
    cal_special_event, cal_event, cal_event_details
  ) VALUES 
    ($1, $2, $3, $4,
     $5, $6, $7,
     $8, $9, $10,
     $11, $12,
     $13, $14, $15)
`;

async function fetchAndStoreCalendar(year, monthNum) {
  const monthName = monthMap[monthNum];
  const url = `https://www.vitragvani.com/app-calendar/eng/calendar/${year}/${monthName}.json`;

  try {
    const res = await fetch(url);

    // Check if the response is OK
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Read the response as text
    const text = await res.text();

    // Remove BOM and any non-printable characters
    const cleanedText = text
      .replace(/^\uFEFF/, '')
      .replace(/[^\x20-\x7E]+/g, ''); // Remove BOM and non-printable characters

    // Attempt to parse the cleaned text as JSON
    let json;
    try {
      json = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error(
        `❌ Failed to parse JSON for ${year}-${monthName}:`,
        parseError.message
      );
      console.log(`Raw response: ${cleanedText}`);
      return; // Exit the function if parsing fails
    }

    const calendar = json.calendar || [];

    // Check if data already exists for the year and month
    const existingRecords = await pool.query(
      'SELECT COUNT(*) FROM jain_calendar WHERE en_year = $1 AND en_month = $2',
      [year, monthNum]
    );

    if (existingRecords.rows[0].count > 0) {
      console.log(
        `⚠️ Data already exists for ${year}-${monthName}. Skipping...`
      );
      return; // Exit if data already exists
    }

    for (const day of calendar) {
      const values = [
        day.en_day,
        parseInt(day.en_date),
        parseInt(day.en_month),
        parseInt(day.en_year),
        day.cal_tithi,
        day.cal_sud_vad,
        day.cal_month,
        parseInt(day.cal_veer_year),
        parseInt(day.cal_vikram_year),
        day.cal_day,
        parseInt(day.cal_atham_chaudas) === 1,
        parseInt(day.cal_special_tithi) === 1,
        day.cal_special_event,
        parseInt(day.cal_event),
        day.cal_event_details,
      ];

      await pool.query(insertQuery, values);
    }

    console.log(
      `✅ Inserted ${calendar.length} days from ${year}-${monthName}`
    );
  } catch (err) {
    console.error(`❌ Failed for ${year}-${monthName}:`, err.message);
  }
}

async function run() {
  for (let year = 2011; year <= 2025; year++) {
    for (let month = 1; month <= 12; month++) {
      await fetchAndStoreCalendar(year, month);
    }
  }

  await pool.end();
}

run();
