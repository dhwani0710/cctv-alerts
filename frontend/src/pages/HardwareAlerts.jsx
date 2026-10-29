import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import Shell from '../components/Shell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  subscribeSensors,
  isFirebaseConfigured,
} from '../services/hardwareFirebase.js';
import {
  enableAlarmAudio,
  startAlarm,
  stopAlarm,
} from '../services/hardwareAlarm.js';
import {
  createLogEntry,
  getInitialSecurityLogs,
  exportLogsToCsv,
  exportLogsToJson,
} from '../services/hardwareAuditLogs.js';

const HISTORY_LEN = 35;
const STALE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes in milliseconds
const SIREN_STORAGE_KEY = 'vaultwatch_siren_settings';

function toMinutes(hhmm) {
  const [h = 0, m = 0] = (hhmm || '00:00').split(':').map(Number);
  return h * 60 + m;
}

function isWithinTimeWindow(startTime, endTime, now = new Date()) {
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  return start > end ? cur >= start || cur < end : cur >= start && cur < end;
}

function isAfterHours(closeTime, openTime, now = new Date()) {
  return isWithinTimeWindow(closeTime, openTime, now);
}

const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

const DEFAULT_SIREN_CONFIG = {
  scheduleType: 'custom', // 'custom' | 'after_hours' | 'always'
  startTime: '20:00',
  endTime: '08:00',
  durationSeconds: 60, // 0 = continuous
  activeDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
};

function loadSirenConfig() {
  try {
    const raw = localStorage.getItem(SIREN_STORAGE_KEY);
    if (!raw) return DEFAULT_SIREN_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SIREN_CONFIG,
      ...parsed,
      activeDays:
        Array.isArray(parsed.activeDays) && parsed.activeDays.length > 0
          ? parsed.activeDays
          : ALL_DAYS,
    };
  } catch {
    return DEFAULT_SIREN_CONFIG;
  }
}

/* ---------- SVG icons ---------- */
const svgIcon = (d, viewBox = '0 0 24 24') => (
  <svg viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    {d}
  </svg>
);

const ICONS = {
  shieldAlert: svgIcon(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>),
  shieldCheck: svgIcon(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>),
  doorOpen: svgIcon(<><path d="M13 4h3a2 2 0 0 1 2 2v14H6V6a2 2 0 0 1 2-2h1" /><path d="m6 20 7-3V3L6 6v14Z" /><circle cx="10" cy="12" r="1" /></>),
  doorClosed: svgIcon(<><path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14" /><path d="M2 20h20" /><circle cx="14" cy="12" r="1" /></>),
  motion: svgIcon(<><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></>),
  radar: svgIcon(<><path d="M19.07 4.93a10 10 0 0 0-14.14 0" /><path d="M16.24 7.76a6 6 0 0 0-8.48 0" /><path d="M13.41 10.59a2 2 0 0 0-2.82 0" /><path d="M12 14v8" /></>),
  volumeOn: svgIcon(<><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></>),
  volumeMute: svgIcon(<><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></>),
  clock: svgIcon(<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>),
  test: svgIcon(<><path d="m14 12-8.5 8.5a2.12 2.12 0 1 1-3-3L11 9" /><path d="M18 16l4-4" /><path d="m17 7 3-3" /><path d="m11 13 3-3" /></>),
  panic: svgIcon(<><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>),
  download: svgIcon(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>),
  filter: svgIcon(<><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></>),
  check: svgIcon(<><polyline points="20 6 9 17 4 12" /></>),
  sliders: svgIcon(<><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></>),
  refresh: svgIcon(<><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" /></>),
  bell: svgIcon(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>),
};

export default function HardwareAlerts() {
  const { session, apiFetch } = useAuth();

  // Live telemetry state from Firebase RTDB
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([
    240, 245, 238, 242, 241, 239, 240, 244, 243, 240, 242, 241, 239, 240
  ]);
  const [motionEvents, setMotionEvents] = useState(3);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  // Security operational mode
  const [securityMode, setSecurityMode] = useState('ARMED_AWAY');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [manualSirenOverride, setManualSirenOverride] = useState(false);

  // Siren ringing schedule & duration configuration
  const [sirenConfig, setSirenConfig] = useState(loadSirenConfig);
  const [showSirenModal, setShowSirenModal] = useState(false);
  const [tempSirenConfig, setTempSirenConfig] = useState(loadSirenConfig);
  const [sirenRemainingSeconds, setSirenRemainingSeconds] = useState(0);
  const [sirenAutoSilenced, setSirenAutoSilenced] = useState(false);

  // Tripwires
  const [triggerDoor, setTriggerDoor] = useState(true);
  const [triggerMotion, setTriggerMotion] = useState(true);
  const [triggerPerson, setTriggerPerson] = useState(true);

  // Store hours (synced with backend settings)
  const [closeTime, setCloseTime] = useState('18:00');
  const [openTime, setOpenTime] = useState('09:00');
  const [afterHours, setAfterHours] = useState(() => isAfterHours('18:00', '09:00'));

  // Synchronize store operating hours from backend settings
  useEffect(() => {
    async function loadStoreTimes() {
      if (!apiFetch) return;
      try {
        const res = await apiFetch('/settings');
        if (res.ok) {
          const d = await res.json();
          if (d.store_open_time) setOpenTime(d.store_open_time);
          if (d.store_close_time) setCloseTime(d.store_close_time);
        }
      } catch {
        // preserve standard defaults if endpoint unreachable
      }
    }
    loadStoreTimes();
  }, [apiFetch]);

  // Incident & Audit Logs
  const [logs, setLogs] = useState(() => getInitialSecurityLogs());

  // Log center filters
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');

  // Manual log modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualMessage, setManualMessage] = useState('');
  const [manualZone, setManualZone] = useState('Store Vault Sector');
  const [manualSeverity, setManualSeverity] = useState('INFO');
  const [manualCategory, setManualCategory] = useState('patrol');

  // Simulation harness visibility
  const [showSimulation, setShowSimulation] = useState(false);

  // State refs for edge detection
  const prevMotionRef = useRef(false);
  const prevDoorRef = useRef(false);
  const prevDistanceRef = useRef(240);
  const prevAlarmStateRef = useRef(false);
  const sirenStartedAtRef = useRef(null);

  // Periodic timer for stale detection and clock evaluation
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Check store hours schedule
  useEffect(() => {
    const check = () => setAfterHours(isAfterHours(closeTime, openTime));
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, [closeTime, openTime]);

  // Check if last updated packet is >= 5 minutes (300,000 ms)
  const isStale = Boolean(data && currentTime - data.updatedAt >= STALE_TIMEOUT_MS);

  // If last updated time is >= 5 minutes (or no data), reset values to 0
  const activeData = useMemo(() => {
    if (!data) return null;
    if (isStale) {
      return {
        ...data,
        distance: 0,
        motion: false,
        doorOpen: false,
        personNear: false,
      };
    }
    return data;
  }, [data, isStale]);

  const currentDistance = activeData?.distance ?? 0;
  const isDoorOpen = Boolean(activeData?.doorOpen);
  const isMotion = Boolean(activeData?.motion);
  const isPersonNear = Boolean(activeData?.personNear || (currentDistance > 0 && currentDistance < 50));

  const areSensorsInactive =
    !data ||
    isStale ||
    (currentDistance === 0 && !isMotion && !isDoorOpen);

  // Append new log entry
  const addLog = useCallback(
    (entry) => {
      const isManual = entry.code.startsWith('MAN-') || entry.code.startsWith('SIM-');
      if (areSensorsInactive && !isManual) {
        return; // Suppress auto-logging when sensors are inactive
      }
      setLogs((prev) => [entry, ...prev]);
    },
    [areSensorsInactive]
  );

  // Arming logic
  const isArmed =
    securityMode === 'ARMED_AWAY' ||
    securityMode === 'ARMED_DOOR' ||
    (securityMode === 'ARMED_PERIMETER' && afterHours);

  // Perimeter breach conditions
  const isPerimeterBreached =
    (triggerDoor && isDoorOpen) ||
    (triggerMotion && isMotion && securityMode !== 'ARMED_PERIMETER' && securityMode !== 'ARMED_DOOR') ||
    (triggerPerson && isPersonNear && securityMode !== 'ARMED_DOOR');

  const alarmTriggered = manualSirenOverride || (isArmed && isPerimeterBreached);

  // Threat level
  const threatLevel = useMemo(() => {
    if (alarmTriggered) return 'BREACH';
    if (isDoorOpen) return 'HIGH';
    if (securityMode !== 'ARMED_DOOR') {
      if (currentDistance > 0 && currentDistance < 50) return 'HIGH';
      if (isMotion || (currentDistance >= 50 && currentDistance < 150)) return 'ELEVATED';
    }
    return 'NORMAL';
  }, [alarmTriggered, isDoorOpen, isMotion, currentDistance, securityMode]);

  // Is current time within the configured siren ringing window and active days?
  const isSirenScheduleActive = useMemo(() => {
    if (sirenConfig.scheduleType === 'always') return true;
    if (sirenConfig.scheduleType === 'after_hours') return afterHours;

    const now = new Date(currentTime);
    const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const currentDay = dayMap[now.getDay()];
    const activeDays =
      sirenConfig.activeDays && sirenConfig.activeDays.length > 0
        ? sirenConfig.activeDays
        : ALL_DAYS;

    if (!activeDays.includes(currentDay)) {
      return false;
    }

    return isWithinTimeWindow(sirenConfig.startTime, sirenConfig.endTime, now);
  }, [sirenConfig, afterHours, currentTime]);

  // Evaluate temporary configuration (used in settings modal live preview)
  const isTempSirenActive = useMemo(() => {
    if (tempSirenConfig.scheduleType === 'always') return true;
    if (tempSirenConfig.scheduleType === 'after_hours') return afterHours;

    const now = new Date(currentTime);
    const dayMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const currentDay = dayMap[now.getDay()];
    const activeDays =
      tempSirenConfig.activeDays && tempSirenConfig.activeDays.length > 0
        ? tempSirenConfig.activeDays
        : ALL_DAYS;

    if (!activeDays.includes(currentDay)) {
      return false;
    }

    return isWithinTimeWindow(tempSirenConfig.startTime, tempSirenConfig.endTime, now);
  }, [tempSirenConfig, afterHours, currentTime]);

  // Should the acoustic siren actually make sound right now?
  // - If operator pressed Emergency Panic: sounds immediately regardless of schedule
  // - If tripwire breach: sounds ONLY if within configured siren ringing window AND not auto-silenced by duration timeout
  const shouldSoundSiren =
    soundEnabled &&
    (manualSirenOverride || (alarmTriggered && isSirenScheduleActive && !sirenAutoSilenced));

  // Audio siren playback control
  useEffect(() => {
    if (shouldSoundSiren) {
      startAlarm();
      if (!sirenStartedAtRef.current) {
        sirenStartedAtRef.current = Date.now();
      }
    } else {
      stopAlarm();
      sirenStartedAtRef.current = null;
      setSirenRemainingSeconds(0);
    }
    return stopAlarm;
  }, [shouldSoundSiren]);

  // Siren countdown ticker & duration auto-cutoff
  useEffect(() => {
    if (!shouldSoundSiren || sirenConfig.durationSeconds <= 0) {
      setSirenRemainingSeconds(0);
      return;
    }

    const interval = setInterval(() => {
      if (!sirenStartedAtRef.current) return;
      const elapsedSec = Math.floor((Date.now() - sirenStartedAtRef.current) / 1000);
      const remaining = Math.max(0, sirenConfig.durationSeconds - elapsedSec);
      setSirenRemainingSeconds(remaining);

      if (remaining <= 0) {
        setSirenAutoSilenced(true);
        stopAlarm();
        addLog(
          createLogEntry({
            code: 'ALM-902',
            severity: 'NOTICE',
            category: 'perimeter',
            zone: 'Acoustic Siren Module',
            message: `Acoustic siren automatically silenced after ${sirenConfig.durationSeconds}s duration timeout`,
            details: 'Visual breach alert and security audit stream remain active.',
          })
        );
      }
    }, 500);

    return () => clearInterval(interval);
  }, [shouldSoundSiren, sirenConfig.durationSeconds, addLog]);

  // Reset auto-silenced state when alarm clears or user changes mode or toggles panic
  useEffect(() => {
    if (!alarmTriggered) {
      setSirenAutoSilenced(false);
    }
  }, [alarmTriggered]);

  // Log alarm trigger edges
  useEffect(() => {
    if (areSensorsInactive) return;
    if (alarmTriggered && !prevAlarmStateRef.current) {
      addLog(
        createLogEntry({
          code: 'ALM-911',
          severity: 'CRITICAL',
          category: 'perimeter',
          zone: 'Store Perimeter Alarm',
          message: manualSirenOverride
            ? 'MANUAL EMERGENCY SIREN INITIATED BY OPERATOR'
            : isSirenScheduleActive
            ? 'TRIPWIRE BREACH ACTIVATED: AUDIBLE SIREN SOUNDING'
            : 'TRIPWIRE BREACH ACTIVATED: SILENT WINDOW (VISUAL ALARM ONLY)',
          details: `Threat: ${threatLevel} | Door: ${isDoorOpen ? 'OPEN' : 'CLOSED'} | Motion: ${
            isMotion ? 'ACTIVE' : 'IDLE'
          } | Range: ${currentDistance.toFixed(1)}cm | Siren Window: ${
            isSirenScheduleActive ? 'AUDIBLE' : 'SILENT'
          }`,
        })
      );
    } else if (!alarmTriggered && prevAlarmStateRef.current) {
      addLog(
        createLogEntry({
          code: 'ALM-900',
          severity: 'NOTICE',
          category: 'perimeter',
          zone: 'Store Perimeter Alarm',
          message: 'Perimeter alarm silenced & restored to monitoring state',
        })
      );
    }
    prevAlarmStateRef.current = alarmTriggered;
  }, [alarmTriggered, manualSirenOverride, threatLevel, isDoorOpen, isMotion, currentDistance, addLog, areSensorsInactive, isSirenScheduleActive]);

  // Subscribe to Firebase RTDB
  useEffect(() => {
    if (!isFirebaseConfigured) return;

    return subscribeSensors(
      (newData) => {
        setData(newData);
        setError(null);

        // Stale packet check
        const isPacketStale = Date.now() - newData.updatedAt >= STALE_TIMEOUT_MS;
        if (isPacketStale) {
          prevMotionRef.current = newData.motion;
          prevDoorRef.current = newData.doorOpen;
          prevDistanceRef.current = newData.distance;
          return;
        }

        setHistory((h) => [...h, newData.distance].slice(-HISTORY_LEN));

        // 1. Motion Edge Detection
        if (newData.motion && !prevMotionRef.current) {
          setMotionEvents((c) => c + 1);
          addLog(
            createLogEntry({
              code: 'PIR-042',
              severity: isArmed ? 'CRITICAL' : 'NOTICE',
              category: 'motion',
              zone: 'Zone 02 - PIR Motion Detector',
              message: isArmed
                ? 'UNAUTHORIZED INTRUDER MOTION DETECTED WHILE ARMED'
                : 'Infrared motion pulse logged in lobby sector',
              details: `PIR sensor triggered. Session count: ${motionEvents + 1}.`,
              telemetry: {
                motion: true,
                distanceCm: newData.distance,
                doorOpen: newData.doorOpen,
              },
            })
          );
        }
        prevMotionRef.current = newData.motion;

        // 2. Door Edge Detection
        if (newData.doorOpen !== prevDoorRef.current) {
          if (newData.doorOpen) {
            addLog(
              createLogEntry({
                code: 'SEC-101',
                severity: isArmed ? 'CRITICAL' : 'WARNING',
                category: 'access',
                zone: 'Zone 01 - Main Entrance (MC-38)',
                message: isArmed
                  ? 'PERIMETER BREACH: DOOR CONTACT OPENED DURING ARMED STATE'
                  : 'Access portal opened — circuit loop broken',
                details: 'Magnetic switch MC-38 contacts disengaged.',
                telemetry: {
                  doorOpen: true,
                  distanceCm: newData.distance,
                  motion: newData.motion,
                },
              })
            );
          } else {
            addLog(
              createLogEntry({
                code: 'SEC-102',
                severity: 'INFO',
                category: 'access',
                zone: 'Zone 01 - Main Entrance (MC-38)',
                message: 'Access portal closed & magnetic contact engaged',
                details: 'Circuit integrity restored (Closed loop).',
                telemetry: {
                  doorOpen: false,
                  distanceCm: newData.distance,
                },
              })
            );
          }
          prevDoorRef.current = newData.doorOpen;
        }

        // 3. Proximity Edge Detection (<50cm)
        if (newData.distance > 0 && newData.distance < 50 && prevDistanceRef.current >= 50) {
          addLog(
            createLogEntry({
              code: 'RAD-077',
              severity: isArmed ? 'CRITICAL' : 'WARNING',
              category: 'radar',
              zone: 'Zone 03 - Ultrasonic Radar (HC-SR04)',
              message: `Intrusion into critical proximity buffer (${newData.distance.toFixed(1)} cm)`,
              details: 'Ultrasonic echo return collapsed below 50cm safety boundary.',
              telemetry: {
                distanceCm: newData.distance,
                personNear: true,
              },
            })
          );
        }
        prevDistanceRef.current = newData.distance;
      },
      (err) => {
        setError(err.message);
        addLog(
          createLogEntry({
            code: 'NET-500',
            severity: 'WARNING',
            category: 'system',
            zone: 'Firebase Client',
            message: `Telemetry stream disrupted: ${err.message}`,
          })
        );
      }
    );
  }, [isArmed, motionEvents, addLog]);

  // Mode change handler
  const handleModeChange = (newMode) => {
    setSecurityMode(newMode);
    setSirenAutoSilenced(false);
    addLog(
      createLogEntry({
        code: 'SYS-301',
        severity: newMode === 'DISARMED' ? 'WARNING' : 'NOTICE',
        category: 'system',
        zone: 'Security Console',
        message: `Security arming mode updated to: ${newMode}`,
        details: `Operator changed arm state. Scheduled after-hours active: ${
          afterHours ? 'YES' : 'NO'
        }.`,
      })
    );
  };

  const handleToggleSound = () => {
    if (!soundEnabled) enableAlarmAudio();
    setSoundEnabled((v) => !v);
  };

  const handleTestSiren = () => {
    enableAlarmAudio();
    startAlarm();
    addLog(
      createLogEntry({
        code: 'TST-001',
        severity: 'NOTICE',
        category: 'system',
        zone: 'Acoustic Siren Module',
        message: 'Manual acoustic siren diagnostic pulse executed (3s)',
      })
    );
    setTimeout(() => {
      stopAlarm();
    }, 3000);
  };

  const handleTriggerEmergency = () => {
    enableAlarmAudio();
    setSirenAutoSilenced(false);
    setManualSirenOverride((v) => !v);
  };

  const handleAcknowledgeLog = (id) => {
    setLogs((prev) =>
      prev.map((l) => (l.id === id ? { ...l, acknowledged: true } : l))
    );
  };

  // Save siren ringing settings
  const handleSaveSirenSettings = (e) => {
    e.preventDefault();
    setSirenConfig(tempSirenConfig);
    setSirenAutoSilenced(false);
    try {
      localStorage.setItem(SIREN_STORAGE_KEY, JSON.stringify(tempSirenConfig));
    } catch {}
    setShowSirenModal(false);

    const activeDaysStr =
      tempSirenConfig.activeDays && tempSirenConfig.activeDays.length === 7
        ? 'All Days'
        : (tempSirenConfig.activeDays || []).map((d) => DAY_LABELS[d] || d).join(', ');

    const desc =
      tempSirenConfig.scheduleType === 'always'
        ? '24/7 (Always Active)'
        : tempSirenConfig.scheduleType === 'after_hours'
        ? `Store After-Hours (${closeTime}–${openTime})`
        : `Custom Hours (${tempSirenConfig.startTime}–${tempSirenConfig.endTime} · ${activeDaysStr})`;

    const dur =
      tempSirenConfig.durationSeconds > 0
        ? `${tempSirenConfig.durationSeconds}s cutoff`
        : 'Continuous';

    addLog(
      createLogEntry({
        code: 'SYS-340',
        severity: 'INFO',
        category: 'system',
        zone: 'Acoustic Siren Module',
        message: `Siren ringing window updated: ${desc} · Duration: ${dur}`,
      })
    );
  };

  const handleOpenSirenModal = () => {
    setTempSirenConfig({
      ...sirenConfig,
      activeDays:
        Array.isArray(sirenConfig.activeDays) && sirenConfig.activeDays.length > 0
          ? sirenConfig.activeDays
          : ALL_DAYS,
    });
    setShowSirenModal(true);
  };

  // Interactive hardware simulation handlers
  const handleSimulateDoor = () => {
    const nextDoor = !isDoorOpen;
    setData((d) => ({
      distance: d?.distance ?? 240,
      motion: d?.motion ?? false,
      personNear: d?.personNear ?? false,
      doorOpen: nextDoor,
      updatedAt: Date.now(),
    }));
    addLog(
      createLogEntry({
        code: nextDoor ? 'SIM-010' : 'SIM-011',
        severity: nextDoor && isArmed ? 'CRITICAL' : 'NOTICE',
        category: 'access',
        zone: 'Zone 01 - Access Portal',
        message: nextDoor
          ? 'SIMULATION: Door contact pulled OPEN'
          : 'SIMULATION: Door contact engaged CLOSED',
      })
    );
  };

  const handleSimulateMotion = () => {
    const nextMotion = !isMotion;
    setData((d) => ({
      distance: d?.distance ?? 240,
      motion: nextMotion,
      personNear: d?.personNear ?? false,
      doorOpen: d?.doorOpen ?? false,
      updatedAt: Date.now(),
    }));
    if (nextMotion) setMotionEvents((c) => c + 1);
    addLog(
      createLogEntry({
        code: nextMotion ? 'SIM-020' : 'SIM-021',
        severity: nextMotion && isArmed ? 'CRITICAL' : 'NOTICE',
        category: 'motion',
        zone: 'Zone 02 - Motion Sensor',
        message: nextMotion
          ? 'SIMULATION: Motion detector triggered ACTIVE'
          : 'SIMULATION: Motion cleared to IDLE',
      })
    );
  };

  const handleSimulateProximity = (cm) => {
    setData((d) => ({
      distance: cm,
      motion: d?.motion ?? false,
      personNear: cm < 50,
      doorOpen: d?.doorOpen ?? false,
      updatedAt: Date.now(),
    }));
    setHistory((h) => [...h, cm].slice(-HISTORY_LEN));
    addLog(
      createLogEntry({
        code: 'SIM-030',
        severity: cm < 50 && isArmed ? 'CRITICAL' : 'WARNING',
        category: 'radar',
        zone: 'Zone 03 - Ultrasonic Radar',
        message: `SIMULATION: Target approach simulated at ${cm.toFixed(1)} cm`,
      })
    );
  };

  const handleSimulateStale = () => {
    const fiveMinsAgo = Date.now() - (5 * 60 * 1000 + 4000);
    setData({
      distance: 0,
      motion: false,
      doorOpen: false,
      personNear: false,
      updatedAt: fiveMinsAgo,
    });
  };

  const handleResetSafe = () => {
    setData({
      distance: 240,
      motion: false,
      personNear: false,
      doorOpen: false,
      updatedAt: Date.now(),
    });
    setManualSirenOverride(false);
    setSirenAutoSilenced(false);
    stopAlarm();
    addLog(
      createLogEntry({
        code: 'SIM-001',
        severity: 'INFO',
        category: 'system',
        zone: 'Simulation Lab',
        message: 'SIMULATION: All sensors restored to baseline safe conditions',
      })
    );
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualMessage.trim()) return;

    const newLog = createLogEntry({
      code: `MAN-${Math.floor(100 + Math.random() * 900)}`,
      severity: manualSeverity,
      category: manualCategory,
      zone: manualZone,
      message: manualMessage,
      details: `Manual entry logged by ${session?.username || 'Operator'}.`,
    });

    addLog(newLog);
    setManualMessage('');
    setShowManualModal(false);
  };

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (activeTab === 'critical' && log.severity !== 'CRITICAL') return false;
      if (activeTab === 'access' && log.category !== 'access' && log.category !== 'perimeter') return false;
      if (activeTab === 'motion_radar' && log.category !== 'motion' && log.category !== 'radar') return false;
      if (activeTab === 'system' && !['system', 'patrol', 'dispatch'].includes(log.category)) return false;

      if (severityFilter !== 'ALL' && log.severity !== severityFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          log.message.toLowerCase().includes(q) ||
          (log.zone || '').toLowerCase().includes(q) ||
          log.code.toLowerCase().includes(q) ||
          (log.details && log.details.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [logs, activeTab, severityFilter, searchQuery]);

  const criticalCount = logs.filter((l) => l.severity === 'CRITICAL').length;
  const isDistanceCritical = currentDistance > 0 && currentDistance < 50;
  const isDistanceWarning = currentDistance >= 50 && currentDistance < 150;

  // Category statistics for telemetry breakdown
  const categoryCounts = useMemo(() => {
    return logs.reduce(
      (acc, cur) => {
        acc[cur.category] = (acc[cur.category] || 0) + 1;
        return acc;
      },
      {}
    );
  }, [logs]);

  // SVG waveform path generation
  const waveformSvg = useMemo(() => {
    if (!history || history.length === 0) return null;
    const width = 580;
    const height = 150;
    const padding = 20;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;
    const maxVal = 300;

    const points = history.map((val, idx) => {
      const x = padding + (idx / Math.max(1, history.length - 1)) * chartW;
      const normalized = Math.min(maxVal, Math.max(0, val));
      const y = height - padding - (normalized / maxVal) * chartH;
      return { x, y, val };
    });

    const pathD = points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, '');
    const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${height - padding} L ${points[0].x.toFixed(1)} ${height - padding} Z`;

    const critY = height - padding - (50 / maxVal) * chartH;
    const warnY = height - padding - (150 / maxVal) * chartH;

    return { pathD, areaD, critY, warnY, points, width, height, padding };
  }, [history]);

  return (
    <Shell active="hardware" dark title="Hardware Alerts">
      {/* 1. Page Header */}
      <div className="page-head">
        <div className="eyebrow">IOT HARDWARE // SENTINEL SOC</div>
        <h1>Hardware & Sensor Alerts</h1>
        <p>
          Live surveillance telemetry from physical store security hardware: MC-38 magnetic door switch,
          PIR motion sensors, and HC-SR04 ultrasonic proximity radar.
        </p>
      </div>

      {/* 2. Critical Alarm Banner (when alarm is sounding) */}
      {alarmTriggered && (
        <div className="hw-alarm-banner">
          <div className="hw-alarm-banner-left">
            <div className="hw-alarm-icon">{ICONS.shieldAlert}</div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="hw-alarm-title">Critical Security Alarm In Effect</span>
                {shouldSoundSiren && sirenConfig.durationSeconds > 0 && sirenRemainingSeconds > 0 && (
                  <span className="hw-siren-countdown">
                    Siren auto-silences in {sirenRemainingSeconds}s
                  </span>
                )}
                {!isSirenScheduleActive && !manualSirenOverride && (
                  <span className="pill p-low mono">
                    Silent Window (Visual Alarm Only)
                  </span>
                )}
                {sirenAutoSilenced && (
                  <span className="pill p-medium mono">
                    Siren Auto-Silenced ({sirenConfig.durationSeconds}s Timeout Reached)
                  </span>
                )}
              </div>
              <div className="hw-alarm-sub">
                Perimeter breach detected in active armed sector · Threat: {threatLevel} ·
                Siren:{' '}
                <strong style={{ color: shouldSoundSiren ? 'var(--brick)' : 'inherit' }}>
                  {shouldSoundSiren
                    ? 'Acoustic horn sounding'
                    : manualSirenOverride
                    ? 'Operator panic active'
                    : isSirenScheduleActive
                    ? 'Muted / Silenced'
                    : 'Outside configured siren hours (Silent)'}
                </strong>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              setManualSirenOverride(false);
              setSirenAutoSilenced(true);
              setSecurityMode('DISARMED');
              stopAlarm();
            }}
          >
            Disarm & Silence Siren
          </button>
        </div>
      )}

      {/* 3. Stale Timeout Warning Banner (>= 5 minutes inactive) */}
      {isStale && (
        <div className="hw-stale-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="log-dot p-medium" />
            <span>
              <strong>Sensor Inactive Warning:</strong> No telemetry received for ≥ 5 minutes (last reading {data ? new Date(data.updatedAt).toLocaleTimeString() : '—'}). All sensor values have automatically reset to 0.
            </span>
          </div>
          <span className="pill p-medium mono">Values Reset to 0</span>
        </div>
      )}

      {/* 4. Security HUD Controls Bar */}
      <div className="hw-hud-bar">
        <div className="hw-hud-left">
          {/* Threat Pill */}
          <div className={`hw-threat-pill t-${threatLevel.toLowerCase()}`}>
            <span className="hw-threat-dot" />
            <span>Threat Level: {threatLevel}</span>
          </div>

          {/* Mode Selector Group */}
          <div className="hw-mode-group">
            {[
              { id: 'ARMED_AWAY', label: 'Armed Away' },
              { id: 'ARMED_PERIMETER', label: 'Perimeter' },
              { id: 'ARMED_DOOR', label: 'Door Only' },
              { id: 'DISARMED', label: 'Disarmed' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                className={`hw-mode-btn ${securityMode === m.id ? 'active' : ''}`}
                onClick={() => handleModeChange(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Siren Active Ringing Time Window Badge */}
          <div className={`hw-siren-time-badge ${isSirenScheduleActive ? 'is-ringing-allowed' : 'is-silent-period'}`}>
            <span className={`log-dot ${isSirenScheduleActive ? 'p-high' : 'p-low'}`} />
            <span>
              Siren Hours:{' '}
              {sirenConfig.scheduleType === 'always'
                ? '24/7 (Always Audible)'
                : sirenConfig.scheduleType === 'after_hours'
                ? `After-Hours (${closeTime}–${openTime})`
                : `${sirenConfig.startTime}–${sirenConfig.endTime}`}
            </span>
            <span style={{ opacity: 0.85 }}>
              · {isSirenScheduleActive ? 'Audible' : 'Silent Period'}
            </span>
          </div>

          {/* Store Hours Schedule Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }} className="mono text-muted">
            {ICONS.clock}
            <span>Store: {closeTime}–{openTime}</span>
            <span className={`pill ${afterHours ? 'p-high' : 'p-low'}`}>
              {afterHours ? 'After-Hours' : 'Business Hours'}
            </span>
          </div>
        </div>

        <div className="hw-hud-right">
          {/* Siren Time & Ring Configuration Button */}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleOpenSirenModal}
            title="Configure daily siren ringing time window and duration timeout"
          >
            {ICONS.bell}
            <span style={{ marginLeft: 6 }}>Siren Time Settings</span>
          </button>

          {/* Sound Mute Toggle */}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleToggleSound}
            title={soundEnabled ? 'Mute siren audio' : 'Unmute siren audio'}
          >
            {soundEnabled ? ICONS.volumeOn : ICONS.volumeMute}
            <span style={{ marginLeft: 6 }}>{soundEnabled ? 'Sound On' : 'Muted'}</span>
          </button>

          {/* Test Siren Pulse (3s) */}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleTestSiren}
            title="Execute a 3-second diagnostic siren pulse"
          >
            {ICONS.test}
            <span style={{ marginLeft: 6 }}>Test (3s)</span>
          </button>

          {/* Emergency Panic Trigger */}
          <button
            type="button"
            className={`btn btn-sm ${manualSirenOverride ? 'btn-danger' : 'btn-outline'}`}
            onClick={handleTriggerEmergency}
            title="Immediately trip emergency siren"
          >
            {ICONS.panic}
            <span style={{ marginLeft: 6 }}>
              {manualSirenOverride ? 'Cancel Panic' : 'Emergency Panic'}
            </span>
          </button>
        </div>
      </div>

      {/* 4b. Siren Operating Schedule & Protection Windows Summary Card */}
      <div className="hw-schedule-overview">
        <div className="hw-schedule-overview-left">
          <div className="hw-schedule-overview-icon">
            {ICONS.bell}
          </div>
          <div>
            <div className="hw-schedule-overview-title">
              <span>Acoustic Siren Ringing Schedule:</span>
              <span className={`pill ${isSirenScheduleActive ? 'p-high' : 'p-low'}`}>
                {isSirenScheduleActive ? '🟢 Audible Window Active' : '⚪ Silent Window (Visual Alerts Only)'}
              </span>
            </div>
            <div className="hw-schedule-overview-desc">
              {sirenConfig.scheduleType === 'always' && 'Siren rings 24/7 immediately upon any armed tripwire breach.'}
              {sirenConfig.scheduleType === 'after_hours' && `Siren rings exclusively during store after-hours (${closeTime} to ${openTime}).`}
              {sirenConfig.scheduleType === 'custom' && (
                <>
                  Allowed ringing hours: <strong>{sirenConfig.startTime} – {sirenConfig.endTime}</strong> · Active days:{' '}
                  <strong>
                    {sirenConfig.activeDays?.length === 7
                      ? 'All Days'
                      : sirenConfig.activeDays?.map((d) => DAY_LABELS[d] || d).join(', ')}
                  </strong>
                </>
              )}
              {' · '}
              <span>
                Auto-silences after {sirenConfig.durationSeconds > 0 ? `${sirenConfig.durationSeconds}s` : 'continuous run'}.
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={handleOpenSirenModal}
        >
          {ICONS.sliders}
          <span style={{ marginLeft: 6 }}>Configure Siren Hours</span>
        </button>
      </div>

      {/* 5. Key Metrics Stat Grid */}
      <div className="stat-grid">
        <div className={`stat-card ${isPerimeterBreached ? 'warn' : 'good'}`}>
          <div className="stat-icon">
            {isPerimeterBreached ? ICONS.shieldAlert : ICONS.shieldCheck}
          </div>
          <div>
            <div className="stat-label">Perimeter Integrity</div>
            <div className="value">{isPerimeterBreached ? 'BREACHED' : 'SECURE'}</div>
            <div className="delta">
              {isPerimeterBreached ? 'Tripwire Compromised' : 'All tripwires intact'}
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">{ICONS.radar}</div>
          <div>
            <div className="stat-label">Active IoT Tripwires</div>
            <div className="value">{isStale ? '0 / 3' : '3 / 3'}</div>
            <div className="delta mono">
              Door: {isDoorOpen ? 'OPEN' : 'OK'} · PIR: {isMotion ? 'ACTV' : 'IDLE'}
            </div>
          </div>
        </div>

        <div className={`stat-card ${isDistanceCritical ? 'warn' : isDistanceWarning ? 'warn' : ''}`}>
          <div className="stat-icon">{ICONS.radar}</div>
          <div>
            <div className="stat-label">Ultrasonic Radar Range</div>
            <div className="value mono">{currentDistance.toFixed(1)} cm</div>
            <div className="delta mono">
              {isDistanceCritical
                ? 'CRITICAL BUFFER (< 50cm)'
                : isDistanceWarning
                ? 'Warning Buffer (< 150cm)'
                : 'Proximity Clear (> 150cm)'}
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">{ICONS.shieldAlert}</div>
          <div>
            <div className="stat-label">Incident Audit Logs</div>
            <div className="value">{logs.length}</div>
            <div className="delta">
              {criticalCount > 0 ? `${criticalCount} critical events` : '0 critical unhandled'}
            </div>
          </div>
        </div>
      </div>

      {/* 6. Physical Sensor Zone Cards */}
      <div className="hw-zone-grid">
        {/* Zone 1: MC-38 Magnetic Door Reed Switch */}
        <div className={`hw-zone-card ${isDoorOpen ? 'is-alert' : ''}`}>
          <div>
            <div className="hw-zone-top">
              <span className="hw-zone-tag">Zone 01 · MC-38</span>
              {isDoorOpen ? (
                <span className="pill p-high">Open</span>
              ) : (
                <span className="pill p-low">Closed</span>
              )}
            </div>
            <div className="hw-zone-name">Main Entrance Portal</div>
            <div className={`hw-zone-metric ${isDoorOpen ? 'text-warn' : 'text-good'}`}>
              {isDoorOpen ? 'BREACH / OPEN' : 'CLOSED / SECURE'}
            </div>
            <div className="hw-zone-sub">
              Magnetic contact loop: {isDoorOpen ? 'BROKEN / DISENGAGED' : 'CONTINUOUS / SEALED'}
            </div>

            <div className="hw-zone-bar">
              <div
                className={`hw-zone-fill ${isDoorOpen ? 'fill-warn' : 'fill-good'}`}
                style={{ width: isDoorOpen ? '100%' : '100%' }}
              />
            </div>
          </div>

          <div className="hw-tripwire-toggle">
            <span>Alarm Tripwire:</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={triggerDoor}
                onChange={(e) => setTriggerDoor(e.target.checked)}
              />
              <span style={{ color: triggerDoor ? 'var(--brass)' : 'var(--text-muted)' }}>
                {triggerDoor ? 'ARMED' : 'BYPASSED'}
              </span>
            </label>
          </div>
        </div>

        {/* Zone 2: PIR Motion Detector (HC-SR501) */}
        <div className={`hw-zone-card ${isMotion ? 'is-alert' : ''}`}>
          <div>
            <div className="hw-zone-top">
              <span className="hw-zone-tag">Zone 02 · PIR Sensor</span>
              {isMotion ? (
                <span className="pill p-high">Motion Detected</span>
              ) : (
                <span className="pill p-low">Idle</span>
              )}
            </div>
            <div className="hw-zone-name">Lobby Corridor</div>
            <div className={`hw-zone-metric ${isMotion ? 'text-warn' : 'text-good'}`}>
              {isMotion ? 'MOTION ACTIVE' : 'CORRIDOR IDLE'}
            </div>
            <div className="hw-zone-sub">
              Infrared thermal pulse · Total detections: {motionEvents}
            </div>

            <div className="hw-zone-bar">
              <div
                className={`hw-zone-fill ${isMotion ? 'fill-warn' : 'fill-good'}`}
                style={{ width: isMotion ? '100%' : '20%' }}
              />
            </div>
          </div>

          <div className="hw-tripwire-toggle">
            <span>Alarm Tripwire:</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={triggerMotion}
                onChange={(e) => setTriggerMotion(e.target.checked)}
              />
              <span style={{ color: triggerMotion ? 'var(--brass)' : 'var(--text-muted)' }}>
                {triggerMotion ? 'ARMED' : 'BYPASSED'}
              </span>
            </label>
          </div>
        </div>

        {/* Zone 3: HC-SR04 Ultrasonic Sonar */}
        <div className={`hw-zone-card ${isDistanceCritical ? 'is-alert' : isDistanceWarning ? 'is-warning' : ''}`}>
          <div>
            <div className="hw-zone-top">
              <span className="hw-zone-tag">Zone 03 · HC-SR04</span>
              {isDistanceCritical ? (
                <span className="pill p-high">&lt; 50cm Breach</span>
              ) : isDistanceWarning ? (
                <span className="pill p-medium">&lt; 150cm Caution</span>
              ) : (
                <span className="pill p-low">Clear</span>
              )}
            </div>
            <div className="hw-zone-name">Vault Buffer Proximity</div>
            <div className={`hw-zone-metric ${isDistanceCritical ? 'text-warn' : isDistanceWarning ? 'text-caution' : 'text-good'}`}>
              {currentDistance.toFixed(1)} cm
            </div>
            <div className="hw-zone-sub">
              Target status: {isPersonNear ? 'PERSON IN BUFFER ZONE' : 'PERIMETER UNOBSTRUCTED'}
            </div>

            <div className="hw-zone-bar">
              <div
                className={`hw-zone-fill ${isDistanceCritical ? 'fill-warn' : isDistanceWarning ? 'fill-brass' : 'fill-good'}`}
                style={{ width: `${Math.min(100, Math.max(5, (currentDistance / 300) * 100))}%` }}
              />
            </div>
          </div>

          <div className="hw-tripwire-toggle">
            <span>Alarm Tripwire:</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={triggerPerson}
                onChange={(e) => setTriggerPerson(e.target.checked)}
              />
              <span style={{ color: triggerPerson ? 'var(--brass)' : 'var(--text-muted)' }}>
                {triggerPerson ? 'ARMED' : 'BYPASSED'}
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* 7. Realtime Waveform & Incident Category Distribution */}
      <div className="hw-telemetry-grid">
        {/* Waveform Area Chart */}
        <div className="panel">
          <div className="panel-head">
            <h2>Ultrasonic Proximity Waveform (HC-SR04)</h2>
            <span className="mono text-muted" style={{ fontSize: 11 }}>
              Last {history.length} Readings · Live Sonar Stream
            </span>
          </div>

          <div className="hw-waveform-box">
            {waveformSvg && (
              <svg width="100%" height="100%" viewBox={`0 0 ${waveformSvg.width} ${waveformSvg.height}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="hwCopperGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brass)" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="var(--brass)" stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                {/* Grid guidelines */}
                <line x1={waveformSvg.padding} y1={waveformSvg.critY} x2={waveformSvg.width - waveformSvg.padding} y2={waveformSvg.critY} stroke="var(--brick)" strokeDasharray="4 4" strokeWidth="1" opacity="0.6" />
                <text x={waveformSvg.width - waveformSvg.padding - 2} y={waveformSvg.critY - 4} fill="var(--brick)" fontSize="9" fontFamily="var(--font-mono)" textAnchor="end">50cm CRITICAL</text>

                <line x1={waveformSvg.padding} y1={waveformSvg.warnY} x2={waveformSvg.width - waveformSvg.padding} y2={waveformSvg.warnY} stroke="var(--brass)" strokeDasharray="4 4" strokeWidth="1" opacity="0.5" />
                <text x={waveformSvg.width - waveformSvg.padding - 2} y={waveformSvg.warnY - 4} fill="var(--brass)" fontSize="9" fontFamily="var(--font-mono)" textAnchor="end">150cm WARNING</text>

                {/* Waveform area fill */}
                <path d={waveformSvg.areaD} fill="url(#hwCopperGrad)" />

                {/* Waveform stroke line */}
                <path d={waveformSvg.pathD} fill="none" stroke="var(--brass)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

                {/* Point indicators */}
                {waveformSvg.points.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={i === waveformSvg.points.length - 1 ? 4 : 2}
                    fill={p.val < 50 ? 'var(--brick)' : p.val < 150 ? 'var(--brass)' : 'var(--sage)'}
                  />
                ))}
              </svg>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }} className="mono text-muted">
            <span>0 cm</span>
            <span>Thresholds: 50cm (Breach) · 150cm (Proximity Alert)</span>
            <span>300 cm Max</span>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="panel">
          <div className="panel-head">
            <h2>Incident Distribution</h2>
            <span className="mono text-muted" style={{ fontSize: 11 }}>By Category</span>
          </div>

          <div style={{ marginTop: 12 }}>
            {[
              { id: 'access', label: 'Access & Door (MC-38)', color: 'var(--sage)' },
              { id: 'motion', label: 'Infrared Motion (PIR)', color: 'var(--brass)' },
              { id: 'radar', label: 'Ultrasonic Proximity', color: '#38BDF8' },
              { id: 'perimeter', label: 'Perimeter Breach', color: 'var(--brick)' },
              { id: 'system', label: 'System & Diagnostics', color: '#A78BFA' },
            ].map((cat) => {
              const count = categoryCounts[cat.id] || 0;
              const pct = logs.length > 0 ? Math.round((count / logs.length) * 100) : 0;
              return (
                <div key={cat.id} style={{ marginBottom: 10 }}>
                  <div className="hw-cat-row">
                    <span>{cat.label}</span>
                    <span className="mono">{count} ({pct}%)</span>
                  </div>
                  <div className="hw-cat-bar-bg">
                    <div
                      className="hw-cat-bar-fill"
                      style={{ width: `${pct}%`, background: cat.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 8. Incident Audit Log Center */}
      <div className="panel">
        <div className="panel-head" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2>Hardware Incident Audit Log</h2>
            <span className="text-muted" style={{ fontSize: 12 }}>
              Cryptographically timestamped telemetry events and operator actions
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-brass btn-sm"
              onClick={() => setShowManualModal(true)}
            >
              + Log Manual Event
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => exportLogsToCsv(logs)}
              title="Download CSV"
            >
              {ICONS.download} Export CSV
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => exportLogsToJson(logs)}
              title="Download JSON"
            >
              Export JSON
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setLogs([])}
            >
              Clear
            </button>
          </div>
        </div>

        {/* Tab row + filter search */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, margin: '14px 0 16px' }}>
          <div className="hw-tab-row">
            {[
              { id: 'all', label: 'All Events', count: logs.length },
              { id: 'critical', label: 'Critical Only', count: logs.filter((l) => l.severity === 'CRITICAL').length },
              { id: 'access', label: 'Door / Access', count: logs.filter((l) => l.category === 'access' || l.category === 'perimeter').length },
              { id: 'motion_radar', label: 'Motion & Radar', count: logs.filter((l) => l.category === 'motion' || l.category === 'radar').length },
              { id: 'system', label: 'System', count: logs.filter((l) => ['system', 'patrol', 'dispatch'].includes(l.category)).length },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`hw-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
                <span className="count">({tab.count})</span>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search code, zone, message..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 12.5,
                width: 220,
              }}
            />

            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 12.5,
              }}
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="WARNING">Warning</option>
              <option value="NOTICE">Notice</option>
              <option value="INFO">Info</option>
            </select>
          </div>
        </div>

        {/* Logs Table */}
        {filteredLogs.length > 0 ? (
          <div className="table-wrap">
            <table className="records">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Time</th>
                  <th style={{ width: 90 }}>Code</th>
                  <th style={{ width: 95 }}>Severity</th>
                  <th style={{ width: 100 }}>Category</th>
                  <th style={{ width: 190 }}>Sensor / Zone</th>
                  <th>Incident Message</th>
                  <th style={{ width: 100, textAlign: 'right' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.slice(0, 50).map((log) => (
                  <tr key={log.id}>
                    <td className="mono" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                      {log.timeString}
                    </td>
                    <td className="mono" style={{ fontWeight: 600, color: 'var(--brass)' }}>
                      {log.code}
                    </td>
                    <td>
                      <span
                        className={`pill ${
                          log.severity === 'CRITICAL'
                            ? 'p-high'
                            : log.severity === 'WARNING'
                            ? 'p-medium'
                            : 'p-low'
                        }`}
                      >
                        {log.severity}
                      </span>
                    </td>
                    <td className="mono" style={{ fontSize: 11, textTransform: 'uppercase' }}>
                      {log.category}
                    </td>
                    <td style={{ fontWeight: 500 }}>
                      {log.zone}
                    </td>
                    <td className="cell-ellipsis">
                      <span style={{ fontWeight: 600 }}>{log.message}</span>
                      {log.details && (
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                          {log.details}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {log.acknowledged ? (
                        <span className="mono text-muted" style={{ fontSize: 11 }}>
                          ACKNOWLEDGED
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => handleAcknowledgeLog(log.id)}
                        >
                          Ack
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-note" style={{ padding: '24px 0', textAlign: 'center' }}>
            No hardware incident logs match the selected filter.
          </div>
        )}
      </div>

      {/* 9. Interactive Hardware Test Harness / Simulation Controls */}
      <div className="hw-sim-box">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div className="eyebrow" style={{ fontSize: 10 }}>SECURITY LAB // TEST HARNESS</div>
            <h3 style={{ margin: '2px 0', fontSize: 14, fontWeight: 700 }}>
              Hardware Simulation & Emergency Override Lab
            </h3>
            <span className="text-muted" style={{ fontSize: 12 }}>
              Simulate edge-triggered sensor events, proximity encroachments, and the 5-minute inactivity timeout.
            </span>
          </div>

          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setShowSimulation(!showSimulation)}
          >
            {ICONS.sliders}
            <span style={{ marginLeft: 6 }}>{showSimulation ? 'Hide Test Triggers' : 'Show Test Triggers'}</span>
          </button>
        </div>

        {showSimulation && (
          <div className="hw-sim-grid">
            <button
              type="button"
              className={`hw-sim-btn ${isDoorOpen ? 'active-danger' : ''}`}
              onClick={handleSimulateDoor}
            >
              {ICONS.doorOpen}
              <span>{isDoorOpen ? 'Simulate Door Close' : 'Simulate Door Open'}</span>
            </button>

            <button
              type="button"
              className={`hw-sim-btn ${isMotion ? 'active-caution' : ''}`}
              onClick={handleSimulateMotion}
            >
              {ICONS.motion}
              <span>{isMotion ? 'Clear Motion' : 'Simulate Motion Pulse'}</span>
            </button>

            <button
              type="button"
              className="hw-sim-btn"
              onClick={() => handleSimulateProximity(35.4)}
            >
              {ICONS.radar}
              <span>Encroach (35cm Danger)</span>
            </button>

            <button
              type="button"
              className={`hw-sim-btn ${isStale ? 'active-caution' : ''}`}
              onClick={handleSimulateStale}
              title="Simulates last telemetry packet received > 5 minutes ago to trigger auto-reset to 0"
            >
              {ICONS.clock}
              <span>Simulate &gt; 5m Timeout</span>
            </button>

            <button
              type="button"
              className="hw-sim-btn"
              onClick={handleResetSafe}
            >
              {ICONS.refresh}
              <span>Reset Safe (240cm)</span>
            </button>
          </div>
        )}
      </div>

      {/* 10. Siren Ringing Window & Duration Settings Modal */}
      {showSirenModal && (
        <div
          className="cam-lightbox-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSirenModal(false);
          }}
        >
          <div className="panel" style={{ maxWidth: 500, width: '100%' }}>
            <div className="panel-head">
              <h2>Siren Ringing Time & Duration Settings</h2>
            </div>

            <p className="text-muted" style={{ fontSize: 13, margin: '4px 0 16px' }}>
              Define the hours during which the audible acoustic siren is permitted to sound upon a perimeter breach, and the maximum sounding duration before auto-silencing.
            </p>

            <form onSubmit={handleSaveSirenSettings}>
              {/* Schedule Type Selection */}
              <div className="field">
                <label>Siren Ringing Schedule</label>
                <div className="hw-schedule-options">
                  <div
                    className={`hw-schedule-card ${tempSirenConfig.scheduleType === 'custom' ? 'active' : ''}`}
                    onClick={() => setTempSirenConfig((p) => ({ ...p, scheduleType: 'custom' }))}
                  >
                    <div className="hw-schedule-card-title">Custom Window</div>
                    <div className="hw-schedule-card-sub">Specific daily hours</div>
                  </div>

                  <div
                    className={`hw-schedule-card ${tempSirenConfig.scheduleType === 'after_hours' ? 'active' : ''}`}
                    onClick={() => setTempSirenConfig((p) => ({ ...p, scheduleType: 'after_hours' }))}
                  >
                    <div className="hw-schedule-card-title">After-Hours</div>
                    <div className="hw-schedule-card-sub">Store Close–Open</div>
                  </div>

                  <div
                    className={`hw-schedule-card ${tempSirenConfig.scheduleType === 'always' ? 'active' : ''}`}
                    onClick={() => setTempSirenConfig((p) => ({ ...p, scheduleType: 'always' }))}
                  >
                    <div className="hw-schedule-card-title">24 / 7 Always</div>
                    <div className="hw-schedule-card-sub">Audible anytime</div>
                  </div>
                </div>
              </div>

              {/* Custom Time Pickers & Presets */}
              {tempSirenConfig.scheduleType === 'custom' && (
                <>
                  <div style={{ marginTop: 6, marginBottom: 8 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Quick Time Presets:</label>
                    <div className="hw-time-presets">
                      <button
                        type="button"
                        className="hw-time-preset-btn"
                        onClick={() =>
                          setTempSirenConfig((p) => ({
                            ...p,
                            startTime: '20:00',
                            endTime: '08:00',
                            activeDays: ALL_DAYS,
                          }))
                        }
                      >
                        Night (20:00 – 08:00)
                      </button>
                      <button
                        type="button"
                        className="hw-time-preset-btn"
                        onClick={() =>
                          setTempSirenConfig((p) => ({
                            ...p,
                            startTime: '22:00',
                            endTime: '06:00',
                            activeDays: ALL_DAYS,
                          }))
                        }
                      >
                        Late Shift (22:00 – 06:00)
                      </button>
                      <button
                        type="button"
                        className="hw-time-preset-btn"
                        onClick={() =>
                          setTempSirenConfig((p) => ({
                            ...p,
                            startTime: '18:00',
                            endTime: '09:00',
                            activeDays: ALL_DAYS,
                          }))
                        }
                      >
                        Closing (18:00 – 09:00)
                      </button>
                      <button
                        type="button"
                        className="hw-time-preset-btn"
                        onClick={() =>
                          setTempSirenConfig((p) => ({
                            ...p,
                            startTime: '00:00',
                            endTime: '23:59',
                            activeDays: ['sat', 'sun'],
                          }))
                        }
                      >
                        Weekend 24h
                      </button>
                    </div>
                  </div>

                  <div className="hw-time-picker-row" style={{ marginBottom: 14 }}>
                    <div className="field" style={{ margin: 0 }}>
                      <label>Siren Rings From (Start Time)</label>
                      <input
                        type="time"
                        value={tempSirenConfig.startTime}
                        onChange={(e) =>
                          setTempSirenConfig((p) => ({ ...p, startTime: e.target.value }))
                        }
                        required
                      />
                    </div>

                    <div className="field" style={{ margin: 0 }}>
                      <label>Siren Rings Until (End Time)</label>
                      <input
                        type="time"
                        value={tempSirenConfig.endTime}
                        onChange={(e) =>
                          setTempSirenConfig((p) => ({ ...p, endTime: e.target.value }))
                        }
                        required
                      />
                    </div>
                  </div>

                  {/* Active Days of the Week */}
                  <div className="field" style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ margin: 0 }}>Active Days of the Week</label>
                      <div className="hw-quick-days">
                        <button
                          type="button"
                          className="hw-quick-link"
                          onClick={() => setTempSirenConfig((p) => ({ ...p, activeDays: ALL_DAYS }))}
                        >
                          All Days
                        </button>
                        <span className="text-muted" style={{ fontSize: 10 }}>·</span>
                        <button
                          type="button"
                          className="hw-quick-link"
                          onClick={() =>
                            setTempSirenConfig((p) => ({
                              ...p,
                              activeDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
                            }))
                          }
                        >
                          Weekdays
                        </button>
                        <span className="text-muted" style={{ fontSize: 10 }}>·</span>
                        <button
                          type="button"
                          className="hw-quick-link"
                          onClick={() =>
                            setTempSirenConfig((p) => ({
                              ...p,
                              activeDays: ['sat', 'sun'],
                            }))
                          }
                        >
                          Weekends
                        </button>
                      </div>
                    </div>
                    <div className="hw-day-picker">
                      {ALL_DAYS.map((d) => {
                        const isSelected = (tempSirenConfig.activeDays || []).includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            className={`hw-day-pill ${isSelected ? 'active' : ''}`}
                            onClick={() => {
                              setTempSirenConfig((prev) => {
                                const curDays = prev.activeDays || [];
                                const nextDays = curDays.includes(d)
                                  ? curDays.filter((x) => x !== d)
                                  : [...curDays, d];
                                return {
                                  ...prev,
                                  activeDays: nextDays.length > 0 ? nextDays : [d],
                                };
                              });
                            }}
                          >
                            {DAY_LABELS[d]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* Siren Ring Duration / Cutoff */}
              <div className="field">
                <label>Max Siren Ring Duration (Auto-Cutoff)</label>
                <select
                  value={tempSirenConfig.durationSeconds}
                  onChange={(e) =>
                    setTempSirenConfig((p) => ({
                      ...p,
                      durationSeconds: Number(e.target.value),
                    }))
                  }
                >
                  <option value={15}>15 seconds</option>
                  <option value={30}>30 seconds</option>
                  <option value={60}>60 seconds (1 minute — recommended)</option>
                  <option value={120}>120 seconds (2 minutes)</option>
                  <option value={300}>300 seconds (5 minutes)</option>
                  <option value={0}>Continuous (Sound until manually disarmed)</option>
                </select>
                <span className="text-muted" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                  If a breach occurs, the siren will automatically shut off after this duration while preserving visual alerts and incident logs.
                </span>
              </div>

              {/* Live Status Preview */}
              <div style={{ background: 'var(--surface-2)', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', margin: '14px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Current Time Evaluation:</span>
                  <span className={`pill ${isTempSirenActive ? 'p-high' : 'p-low'}`}>
                    {isTempSirenActive
                      ? '🟢 Siren Will Ring If Tripped Now'
                      : '⚪ Silent Window (Visual Breaches Only)'}
                  </span>
                </div>
                <div className="text-muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                  {isTempSirenActive
                    ? `Within configured active hours. Tripped tripwires will sound the acoustic siren horn for up to ${
                        tempSirenConfig.durationSeconds > 0
                          ? `${tempSirenConfig.durationSeconds}s`
                          : 'continuous manual disarm'
                      }.`
                    : 'Currently outside configured siren hours or inactive day. Perimeter breaches will flash red alerts and log audit records, but the acoustic horn remains silent.'}
                </div>
                <div className="text-muted" style={{ fontSize: 10.5, marginTop: 4, opacity: 0.75 }}>
                  Emergency panic triggers by guards/operators always bypass the schedule and sound immediately.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowSirenModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-brass">
                  Save Siren Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 11. Manual Incident Entry Modal */}
      {showManualModal && (
        <div
          className="cam-lightbox-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowManualModal(false);
          }}
        >
          <div className="panel" style={{ maxWidth: 460, width: '100%' }}>
            <div className="panel-head">
              <h2>Log Security Event / Incident</h2>
            </div>

            <form onSubmit={handleManualSubmit}>
              <div className="field">
                <label>Event Message</label>
                <input
                  type="text"
                  placeholder="e.g. Guard verified vault lock intact"
                  value={manualMessage}
                  onChange={(e) => setManualMessage(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="field">
                <label>Zone / Sector</label>
                <input
                  type="text"
                  placeholder="e.g. Zone 01 Main Entrance, Storeroom"
                  value={manualZone}
                  onChange={(e) => setManualZone(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label>Severity</label>
                  <select
                    value={manualSeverity}
                    onChange={(e) => setManualSeverity(e.target.value)}
                  >
                    <option value="INFO">Info</option>
                    <option value="NOTICE">Notice</option>
                    <option value="WARNING">Warning</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>

                <div className="field">
                  <label>Category</label>
                  <select
                    value={manualCategory}
                    onChange={(e) => setManualCategory(e.target.value)}
                  >
                    <option value="patrol">Patrol</option>
                    <option value="access">Access</option>
                    <option value="perimeter">Perimeter</option>
                    <option value="motion">Motion</option>
                    <option value="radar">Radar</option>
                    <option value="system">System</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowManualModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-brass">
                  Log Incident
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Shell>
  );
}
