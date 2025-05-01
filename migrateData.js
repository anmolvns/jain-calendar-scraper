import dotenv from 'dotenv';
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

async function migrateCalendarData() {
  const { rows: allRows } = await pool.query(`
    SELECT * FROM jain_calendar
    WHERE en_year IS NOT NULL AND en_month IS NOT NULL AND en_date IS NOT NULL
    ORDER BY en_year, en_month, en_date
  `);

  for (const row of allRows) {
    const gregDate = `${row.en_year}-${String(row.en_month).padStart(
      2,
      '0'
    )}-${String(row.en_date).padStart(2, '0')}`;

    // Step 1: Insert into greg_calendar_dates
    const gregRes = await pool.query(
      `INSERT INTO greg_calendar_dates (greg_date, greg_day_name)
       VALUES ($1, $2)
       ON CONFLICT (greg_date) DO UPDATE SET greg_day_name = EXCLUDED.greg_day_name
       RETURNING id`,
      [gregDate, row.en_day?.toUpperCase()]
    );
    const gregDateId = gregRes.rows[0].id;

    // Step 2: Sanitize and insert Jain calendar date
    const rawPaksha = row.cal_sud_vad?.toUpperCase().trim();
    let validPaksha = null;

    if (rawPaksha?.includes('SUD')) validPaksha = 'SUD';
    else if (rawPaksha?.includes('VAD')) validPaksha = 'VAD';
    else {
      console.warn(
        `⚠️ Skipping row with invalid paksha "${row.cal_sud_vad}" on ${gregDate}`
      );
      continue;
    }

    const tithi = parseInt(row.cal_tithi);
    if (isNaN(tithi)) {
      console.warn(
        `⚠️ Skipping row with invalid tithi "${row.cal_tithi}" on ${gregDate}`
      );
      continue;
    }

    await pool.query(
      `INSERT INTO jain_calendar_dates (
    greg_calendar_dates_id, jain_tithi, jain_paksha,
    jain_month_name, jain_month_number,
    jain_veer_samvat_year, jain_vikram_samvat_year,
    jain_day_name
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  ON CONFLICT (greg_calendar_dates_id, jain_tithi, jain_paksha) DO UPDATE SET
    jain_month_name = EXCLUDED.jain_month_name,
    jain_month_number = EXCLUDED.jain_month_number,
    jain_veer_samvat_year = EXCLUDED.jain_veer_samvat_year,
    jain_vikram_samvat_year = EXCLUDED.jain_vikram_samvat_year,
    jain_day_name = EXCLUDED.jain_day_name`,
      [
        gregDateId,
        tithi,
        validPaksha,
        row.cal_month,
        validPaksha === 'SUD' ? 1 : 2,
        row.cal_veer_year,
        row.cal_vikram_year,
        row.cal_day,
      ]
    );

    // Step 3: Insert event if present
    const eventName =
      row.cal_special_event?.trim() || row.cal_event_details?.trim();
    if (eventName) {
      await pool.query(
        `INSERT INTO jain_events (
    recurrence, jain_month_name, jain_paksha,
    jain_tithi, jain_event_name, description
  ) VALUES ($1, $2, $3, $4, $5, $6)
  ON CONFLICT (recurrence, jain_month_name, jain_paksha, jain_tithi, jain_event_name) DO NOTHING`,
        [
          'ANNUAL',
          row.cal_month,
          validPaksha,
          tithi,
          eventName,
          row.cal_event_details || null,
        ]
      );
    }
  }

  console.log('✅ Migration complete.');
  await pool.end();
}

migrateCalendarData().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  pool.end();
});
