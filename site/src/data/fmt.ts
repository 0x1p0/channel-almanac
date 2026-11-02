// Date formats for the site's own copy. Fixed to en-GB so the server render and the browser agree
// ("Tue 11 April 2023"); the demo's range titles come from lib.js and follow the visitor's locale.
const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', o);
const dayMonthYear = f({ day: 'numeric', month: 'long', year: 'numeric' });
const shortDay = f({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const weekday = f({ weekday: 'long' });
const monthYear = f({ month: 'long', year: 'numeric' });
const time = f({ hour: '2-digit', minute: '2-digit', hour12: false });

export const fmt = {
  dayMonthYear: (t: number) => dayMonthYear.format(t), // 11 April 2023
  shortDay: (t: number) => shortDay.format(t).replace(',', ''), // Tue 11 Apr 2023
  weekday: (t: number) => weekday.format(t), // Tuesday
  monthYear: (t: number) => monthYear.format(t), // April 2023
  time: (t: number) => time.format(t), // 18:04
  count: (n: number) => n.toLocaleString('en-GB'),
  plural: (n: number, w: string) => `${n.toLocaleString('en-GB')} ${w}${n === 1 ? '' : 's'}`,
};
