export function createLogEntry(params) {
  const now = Date.now();
  const d = new Date(now);
  const timeString =
    d.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) +
    '.' +
    String(d.getMilliseconds()).padStart(3, '0');

  return {
    id: `log-${now}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: now,
    timeString,
    code: params.code,
    severity: params.severity, // 'CRITICAL' | 'WARNING' | 'NOTICE' | 'INFO'
    category: params.category, // 'perimeter' | 'access' | 'motion' | 'radar' | 'system' | 'patrol' | 'dispatch'
    zone: params.zone,
    message: params.message,
    details: params.details || '',
    telemetry: params.telemetry,
    acknowledged: params.severity !== 'CRITICAL',
  };
}

export function getInitialSecurityLogs() {
  const baseTime = Date.now();
  const minute = 60 * 1000;

  const mockEvents = [
    {
      offsetMinutes: 140,
      code: 'SYS-101',
      severity: 'INFO',
      category: 'system',
      zone: 'Main Controller',
      message: 'Hardware telemetry daemon started & Firebase link established',
      details: 'Firebase RTDB connected at asia-southeast1. Latency: 22ms.',
    },
    {
      offsetMinutes: 120,
      code: 'PAT-004',
      severity: 'INFO',
      category: 'patrol',
      zone: 'Perimeter Sector Alpha',
      message: 'Scheduled automated perimeter diagnostic completed',
      details: 'MC-38 reed switch circuit loop verified intact (0.02 Ohm).',
    },
    {
      offsetMinutes: 95,
      code: 'RAD-012',
      severity: 'NOTICE',
      category: 'radar',
      zone: 'Zone 3 - Ultrasonic HC-SR04',
      message: 'Rangefinder auto-calibrated to baseline echo return',
      details: 'Baseline distance established at 284.5 cm with zero offset error.',
    },
    {
      offsetMinutes: 72,
      code: 'ACC-032',
      severity: 'INFO',
      category: 'access',
      zone: 'Zone 1 - Main Entrance',
      message: 'Authorized access portal opened — Badge ID #4491',
      details: 'Door contact opened for 6.4s during scheduled business hours.',
    },
    {
      offsetMinutes: 71,
      code: 'ACC-033',
      severity: 'INFO',
      category: 'access',
      zone: 'Zone 1 - Main Entrance',
      message: 'Access portal closed & magnetic contact engaged',
      details: 'MC-38 circuit closed. Seal confirmed secure.',
    },
    {
      offsetMinutes: 45,
      code: 'PIR-018',
      severity: 'NOTICE',
      category: 'motion',
      zone: 'Zone 2 - PIR Sector',
      message: 'Infrared motion pulse detected in lobby corridor',
      details: 'Thermal signature detected. Duration: 1.8s. Threat: Low.',
    },
    {
      offsetMinutes: 30,
      code: 'SYS-202',
      severity: 'NOTICE',
      category: 'system',
      zone: 'Store Vault SOC',
      message: 'Security Protocol Armed [ARMED_AWAY]',
      details: 'Tri-sensor tripwires active: Door Breaches, Motion, and Proximity.',
    },
    {
      offsetMinutes: 14,
      code: 'RAD-044',
      severity: 'WARNING',
      category: 'radar',
      zone: 'Zone 3 - Ultrasonic',
      message: 'Object entered proximity buffer zone (< 65 cm)',
      details: 'Distance collapsed from 280cm to 48.2cm rapidly.',
    },
    {
      offsetMinutes: 5,
      code: 'SYS-099',
      severity: 'INFO',
      category: 'system',
      zone: 'Console',
      message: 'Heartbeat ping confirmed — all 3 IoT modules responsive',
      details: 'PIR: OK | HC-SR04: OK | MC-38: OK | Link: 100% Signal.',
    },
  ];

  return mockEvents.map((item, idx) => {
    const timestamp = baseTime - item.offsetMinutes * minute;
    const d = new Date(timestamp);
    const timeString =
      d.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }) +
      '.' +
      String(d.getMilliseconds()).padStart(3, '0');

    return {
      id: `init-log-${idx}-${timestamp}`,
      timestamp,
      timeString,
      code: item.code,
      severity: item.severity,
      category: item.category,
      zone: item.zone,
      message: item.message,
      details: item.details,
      acknowledged: item.severity !== 'CRITICAL',
    };
  });
}

export function exportLogsToCsv(logs) {
  const headers = [
    'Timestamp',
    'Time',
    'Code',
    'Severity',
    'Category',
    'Zone',
    'Message',
    'Details',
    'Acknowledged',
  ];

  const rows = logs.map((log) => [
    log.timestamp,
    `"${log.timeString}"`,
    `"${log.code}"`,
    `"${log.severity}"`,
    `"${log.category}"`,
    `"${(log.zone || '').replace(/"/g, '""')}"`,
    `"${(log.message || '').replace(/"/g, '""')}"`,
    `"${(log.details || '').replace(/"/g, '""')}"`,
    log.acknowledged ? 'YES' : 'NO',
  ]);

  const csvContent =
    'data:text/csv;charset=utf-8,' +
    [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute(
    'download',
    `hardware-incident-logs-${new Date().toISOString().slice(0, 10)}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportLogsToJson(logs) {
  const jsonStr = JSON.stringify(logs, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute(
    'download',
    `hardware-incident-logs-${new Date().toISOString().slice(0, 10)}.json`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
