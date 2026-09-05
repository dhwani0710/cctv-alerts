export function initials(name = '') {
  return name
    .split(' ')
    .map((p) => p.replace('.', ''))
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export const MOCK_CAMERAS = [
  { id: 'cam-1', name: 'Front Entrance', zone: 'Entrance', status: 'online', sensitivity: 'medium' },
  { id: 'cam-2', name: 'Display Case 3', zone: 'Sales Floor', status: 'online', sensitivity: 'medium' },
  { id: 'cam-3', name: 'Vault Room', zone: 'Vault', status: 'online', sensitivity: 'high' },
  { id: 'cam-4', name: 'Back Entrance', zone: 'Rear', status: 'online', sensitivity: 'medium' },
  { id: 'cam-5', name: 'Stock Room', zone: 'Storage', status: 'offline', sensitivity: 'low' },
  { id: 'cam-6', name: 'Checkout Counter', zone: 'Sales Floor', status: 'online', sensitivity: 'medium' },
];

export const MOCK_ALERTS = [
  { id: 'a1', title: 'Unrecognized face — Display Case 3', desc: 'No match in staff roster, flagged for review', camera: 'Display Case 3', sev: 'high', time: '09:41' },
  { id: 'a2', title: 'Vault Room motion — after hours', desc: 'Detected outside scheduled store hours', camera: 'Vault Room', sev: 'high', time: '23:12' },
  { id: 'a3', title: 'Back Entrance door held open', desc: 'Open for 47s, above 30s threshold', camera: 'Back Entrance', sev: 'low', time: '14:03' },
];

export const MOCK_ACTIVITY_LOG = [
  { time: '09:41:07', text: 'Face flagged — Display Case 3', tag: 'Unrecognized', type: 'alert' },
  { time: '09:15:44', text: 'Clocked in — Front Entrance', tag: 'R. Verma', type: 'info' },
  { time: '08:52:10', text: 'Vault access — Vault Room', tag: 'S. Kapoor', type: 'info' },
  { time: '07:58:02', text: 'Camera offline — Stock Room', tag: 'system', type: 'default' },
  { time: '23:12:00', text: 'After-hours motion — Vault Room', tag: 'Unrecognized', type: 'alert' },
];

export const MOCK_RECORDS = [
  { id: 'r1', camera: 'Display Case 3', event: 'Unrecognized face', status: 'flag', date: '02 Sep 2026', time: '09:41' },
  { id: 'r2', camera: 'Front Entrance', event: 'Staff clock-in', status: 'clear', date: '02 Sep 2026', time: '09:15' },
  { id: 'r3', camera: 'Vault Room', event: 'Vault access', status: 'clear', date: '02 Sep 2026', time: '08:52' },
  { id: 'r4', camera: 'Stock Room', event: 'Camera offline', status: 'review', date: '02 Sep 2026', time: '07:58' },
  { id: 'r5', camera: 'Vault Room', event: 'After-hours motion', status: 'flag', date: '01 Sep 2026', time: '23:12' },
  { id: 'r6', camera: 'Back Entrance', event: 'Door held open', status: 'review', date: '01 Sep 2026', time: '14:03' },
];

export const MOCK_STAFF_INITIAL = [
  { name: 'S. Kapoor', role: 'Admin', shift: '09:00 – 18:00', added: 'Mar 2025' },
  { name: 'R. Verma', role: 'Sales Associate', shift: '09:00 – 17:00', added: 'Jun 2025' },
  { name: 'A. Iyer', role: 'Sales Associate', shift: '12:00 – 20:00', added: 'Jan 2026' },
];

export const MOCK_ATTENDANCE = [
<<<<<<< Updated upstream
  { name: 'S. Kapoor', role: 'Admin', firstSeen: '08:52 AM', lastSeen: '06:10 PM', date: '02 Sep 2026' },
  { name: 'R. Verma', role: 'Sales Associate', firstSeen: '09:04 AM', lastSeen: '05:02 PM', date: '02 Sep 2026' },
  { name: 'A. Iyer', role: 'Sales Associate', firstSeen: '12:15 PM', lastSeen: '08:03 PM', date: '02 Sep 2026' },
];

export function initials(name) {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}
=======
  { name: 'S. Kapoor', role: 'Admin', firstSeen: '08:52 AM', lastSeen: '06:10 PM', date: '01 Sep 2026' },
  { name: 'S. Kapoor', role: 'Admin', firstSeen: '08:47 AM', lastSeen: '06:02 PM', date: '02 Sep 2026' },
  { name: 'R. Verma', role: 'Sales Associate', firstSeen: '09:04 AM', lastSeen: '05:02 PM', date: '01 Sep 2026' },
  { name: 'R. Verma', role: 'Sales Associate', firstSeen: '09:11 AM', lastSeen: '05:15 PM', date: '02 Sep 2026' },
  { name: 'R. Verma', role: 'Sales Associate', firstSeen: '08:58 AM', lastSeen: '04:50 PM', date: '03 Sep 2026' },
  { name: 'A. Iyer', role: 'Sales Associate', firstSeen: '12:15 PM', lastSeen: '08:03 PM', date: '01 Sep 2026' },
  { name: 'A. Iyer', role: 'Sales Associate', firstSeen: '12:20 PM', lastSeen: '08:10 PM', date: '02 Sep 2026' },
];
>>>>>>> Stashed changes
