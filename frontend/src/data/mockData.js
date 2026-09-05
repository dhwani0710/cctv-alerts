export const MOCK_CAMERAS = [
  { id: 'CAM-01', name: 'Front Entrance', zone: 'Storefront', live: true },
  { id: 'CAM-02', name: 'Display Case 1–4', zone: 'Sales Floor', live: true },
  { id: 'CAM-03', name: 'Display Case 5–8', zone: 'Sales Floor', live: true },
  { id: 'CAM-04', name: 'Back Entrance', zone: 'Rear Access', live: true },
  { id: 'CAM-05', name: 'Vault Room', zone: 'Restricted', live: true },
  { id: 'CAM-06', name: 'Stock Room', zone: 'Restricted', live: false },
];

export const MOCK_ALERTS = [
  { sev: 'high', title: 'Unrecognized face — Display Case 3', time: '09:41', desc: 'No match in staff roster, flagged for review' },
  { sev: 'high', title: 'Vault Room motion — after hours', time: '23:12', desc: 'Detected outside scheduled store hours' },
  { sev: 'low', title: 'Back Entrance door held open', time: '14:03', desc: 'Open for 47s, above 30s threshold' },
  { sev: 'low', title: 'Camera offline — Stock Room', time: '07:58', desc: 'Signal lost, last frame cached' },
];

export const MOCK_RECORDS = [
  { time: '09:41:07', camera: 'Display Case 3', person: 'Unrecognized', event: 'Face flagged', status: 'flag' },
  { time: '09:15:44', camera: 'Front Entrance', person: 'R. Verma', event: 'Clocked in', status: 'clear' },
  { time: '08:52:10', camera: 'Vault Room', person: 'S. Kapoor', event: 'Vault access', status: 'clear' },
  { time: '07:58:02', camera: 'Stock Room', person: '—', event: 'Camera offline', status: 'review' },
  { time: 'Yesterday · 23:12', camera: 'Vault Room', person: 'Unrecognized', event: 'After-hours motion', status: 'flag' },
  { time: 'Yesterday · 18:30', camera: 'Front Entrance', person: 'S. Kapoor', event: 'Clocked out', status: 'clear' },
];

export const MOCK_STAFF_INITIAL = [
  { name: 'S. Kapoor', role: 'Admin', shift: '9:00 – 18:00', added: 'Mar 2025' },
  { name: 'R. Verma', role: 'Sales Associate', shift: '9:00 – 17:00', added: 'Jun 2025' },
  { name: 'A. Iyer', role: 'Sales Associate', shift: '12:00 – 20:00', added: 'Jan 2026' },
];

export const MOCK_ATTENDANCE = [
  { name: 'S. Kapoor', role: 'Admin', firstSeen: '08:52 AM', lastSeen: '06:10 PM', date: '02 Sep 2026' },
  { name: 'R. Verma', role: 'Sales Associate', firstSeen: '09:04 AM', lastSeen: '05:02 PM', date: '02 Sep 2026' },
  { name: 'A. Iyer', role: 'Sales Associate', firstSeen: '12:15 PM', lastSeen: '08:03 PM', date: '02 Sep 2026' },
];

export function initials(name) {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}