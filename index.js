import { closePool, fetchAndStoreCalendar } from './fetchAndStore.js';
import { migrateCalendarData } from './migrateData.js';

async function main() {
  for (let year = 2011; year <= 2025; year++) {
    for (let month = 1; month <= 12; month++) {
      await fetchAndStoreCalendar(year, month);
    }
  }

  await migrateCalendarData();
  await closePool(); // Make sure pool is closed after fetch phase
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
});
