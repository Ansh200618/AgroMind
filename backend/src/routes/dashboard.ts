import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';

const router = Router();

/**
 * GET /api/dashboard
 * Aggregates latest sensor readings, active alerts, irrigation schedule
 * and water-usage chart data for the past 7 days.
 *
 * Returns the same shape consumed by the frontend MOCK objects so that
 * the JS render functions can be wired in with zero template changes.
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    // ── 1. Latest sensor readings (one per sensor) ──────────────────────────
    const sensors = await prisma.sensor.findMany({
      include: {
        readings: {
          orderBy: { recordedAt: 'desc' },
          take: 1,
        },
        field: { select: { name: true, cropType: true } },
      },
      orderBy: { deviceId: 'asc' },
    });

    const soilMoisture = sensors
      .filter(s => s.readings.length > 0 && s.readings[0].moisture !== null)
      .map(s => {
        const pct = Math.round(s.readings[0].moisture ?? 0);
        const color =
          pct >= 70 ? '#4caf60' :
          pct >= 50 ? '#2563a8' :
          pct >= 35 ? '#e6a817' : '#c0392b';
        const label = s.field?.cropType
          ? `${s.field.name} – ${s.field.cropType}`
          : s.name;
        return { name: label, pct, color };
      });

    // ── 2. Active alerts (disease logs + low-moisture sensors) ────────────
    const recentDiseases = await prisma.diseaseLog.findMany({
      where: { resultType: { in: ['danger', 'warning'] } },
      orderBy: { createdAt: 'desc' },
      take: 3,
      include: { field: { select: { name: true } } },
    });

    const diseaseAlerts = recentDiseases.map(d => ({
      pip: d.resultType === 'danger' ? 'pip-red' : 'pip-amber',
      title: `${d.diseaseName} — ${d.field?.name ?? 'Unknown Field'}`,
      meta: `AI Model · ${Math.round(d.confidence)}% confidence · ${timeAgo(d.createdAt)}`,
    }));

    const lowMoistureSensors = sensors.filter(
      s => s.readings.length > 0 && (s.readings[0].moisture ?? 100) < 35
    );
    const moistureAlerts = lowMoistureSensors.map(s => ({
      pip: 'pip-amber',
      title: `Low Moisture — ${s.field?.name ?? s.name} at ${Math.round(s.readings[0].moisture ?? 0)}%`,
      meta: `Sensor ${s.deviceId} · Irrigation recommended · ${timeAgo(s.readings[0].recordedAt)}`,
    }));

    const alerts = [...diseaseAlerts, ...moistureAlerts].slice(0, 4);

    // ── 3. Water usage chart – last 7 days ────────────────────────────────
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const irrLogs = await prisma.irrigationLog.findMany({
      where: {
        status: 'done',
        completedAt: { gte: sevenDaysAgo },
      },
      orderBy: { completedAt: 'asc' },
    });

    const waterByDay: Record<string, number> = {};
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    irrLogs.forEach(log => {
      if (!log.completedAt || !log.waterUsedL) return;
      const key = dayNames[log.completedAt.getDay()];
      waterByDay[key] = (waterByDay[key] ?? 0) + log.waterUsedL;
    });

    // Build last-7-days array, label today as "Today"
    const waterChart: { day: string; val: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dayNames[d.getDay()];
      waterChart.push({ day: i === 0 ? 'Today' : key, val: waterByDay[key] ?? 0 });
    }

    // ── 4. Today's irrigation schedule ────────────────────────────────────
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const scheduleRows = await prisma.irrigationLog.findMany({
      where: {
        scheduledAt: { gte: todayStart, lte: todayEnd },
      },
      orderBy: { scheduledAt: 'asc' },
      include: { field: { select: { name: true, cropType: true } } },
    });

    const badgeMap: Record<string, string> = {
      done: 'badge-done',
      active: 'badge-active',
      scheduled: 'badge-soon',
      urgent: 'badge-urgent',
      cancelled: 'badge-done',
    };
    const labelMap: Record<string, string> = {
      done: 'Done',
      active: 'Active',
      scheduled: 'Scheduled',
      urgent: 'Urgent',
      cancelled: 'Cancelled',
    };

    const schedule = scheduleRows.map(r => {
      const time = r.scheduledAt.toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true,
      });
      const fieldLabel = r.field.cropType
        ? `${r.field.name} – ${r.field.cropType}`
        : r.field.name;
      return {
        name: fieldLabel,
        meta: `${time} · ${r.waterUsedL ?? '—'} L · ${r.durationMin ?? '—'} min`,
        badge: badgeMap[r.status] ?? 'badge-soon',
        label: labelMap[r.status] ?? r.status,
      };
    });

    // ── 5. Recent disease history ──────────────────────────────────────────
    const diseaseHistory = (
      await prisma.diseaseLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 4,
        include: { field: { select: { name: true, cropType: true } } },
      })
    ).map(d => {
      const bm: Record<string, string> = {
        danger: 'badge-urgent',
        warning: 'badge-soon',
        healthy: 'badge-active',
      };
      const lm: Record<string, string> = {
        danger: 'Disease',
        warning: 'Warning',
        healthy: 'Healthy',
      };
      const fieldLabel = d.field
        ? d.field.cropType
          ? `${d.field.name} (${d.field.cropType})`
          : d.field.name
        : 'Unknown Field';
      return {
        title: `${d.diseaseName} — ${fieldLabel}`,
        meta: `${formatDate(d.createdAt)} · ${Math.round(d.confidence)}% confidence`,
        badge: bm[d.resultType] ?? 'badge-soon',
        label: lm[d.resultType] ?? d.resultType,
      };
    });

    // ── 6. Live sensor summary ─────────────────────────────────────────────
    const sensorList = sensors.map(s => {
      const r = s.readings[0];
      const parts: string[] = [];
      if (r?.moisture != null) parts.push(`Moisture ${Math.round(r.moisture)}%`);
      if (r?.temperature != null) parts.push(`Temp ${r.temperature}°C`);
      if (r?.ph != null) parts.push(`pH ${r.ph}`);
      if (r?.humidity != null) parts.push(`Humidity ${Math.round(r.humidity)}%`);
      if (r?.windSpeed != null) parts.push(`Wind ${r.windSpeed} km/h`);

      const statusMap: Record<string, string> = {
        online: 'badge-online',
        offline: 'badge-urgent',
        low_battery: 'badge-low',
      };
      return {
        id: s.deviceId,
        field: s.field?.name ?? s.name,
        info: parts.join(' · ') || 'No reading',
        status: statusMap[s.status] ?? 'badge-online',
        label: s.status === 'low_battery' ? 'Low!' : capitalize(s.status),
      };
    });

    res.json({
      soilMoisture,
      alerts,
      waterChart,
      schedule,
      diseaseHistory,
      sensors: sensorList,
    });
  } catch (err) {
    console.error('[dashboard]', err);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
  return `${Math.floor(hrs / 24)} day${Math.floor(hrs / 24) > 1 ? 's' : ''} ago`;
}

function formatDate(date: Date): string {
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `Today, ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default router;
