// generateEvents.js
function generateEvents() {
   const events = [];
   let id = 1;

   const startTimes = [
      { hour: 8, minute: 0 },
      { hour: 9, minute: 30 },
      { hour: 11, minute: 0 },
      { hour: 12, minute: 30 },
      { hour: 14, minute: 0 },
      { hour: 15, minute: 30 },
   ];

   const instructors = ["Ion B.", "Maria S.", "Alex P."];
   const eventTypes = ["Lecția", "Meditație", "Test"];

   for (let day = 1; day <= 31; day++) {
      startTimes.forEach(({ hour, minute }) => {
         const countAtSlot = Math.floor(Math.random() * 3); // 0–2 programări în paralel

         for (let i = 0; i < countAtSlot; i++) {
            const start = new Date(2025, 6, day, hour, minute);
            const end = new Date(start.getTime() + 90 * 60 * 1000); // 90 minute

            const type =
               eventTypes[Math.floor(Math.random() * eventTypes.length)];
            const instructor =
               instructors[Math.floor(Math.random() * instructors.length)];
            const title = `${type} (${instructor})`;

            const history = [
               {
                  status: "scheduled",
                  timestamp: new Date(start.getTime() - 60 * 60 * 1000), // 1h înainte
               },
            ];

            if (Math.random() > 0.5) {
               history.push({
                  status: "completed",
                  timestamp: new Date(end.getTime() + 15 * 60 * 1000), // după terminare
               });
            } else if (Math.random() > 0.5) {
               history.push({
                  status: "cancelled",
                  timestamp: new Date(start.getTime() - 10 * 60 * 1000), // anulat cu 10 min înainte
               });
            }

            events.push({
               id: id++,
               title,
               start,
               end,
               instructor,
               type,
               history,
            });
         }
      });
   }

   return events;
}

const calendarEvents = generateEvents();

export { generateEvents, calendarEvents };
