import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';

const router = Router();

/**
 * GET /api/sensors/live
 * Returns the latest reading for every sensor.
 * Shape matches frontend MOCK.sensors.
 */
router.get('/live', async (_req: Request, res: Response) => {
  try {
    const sensors = await prisma.sensor.findMany({
      include: {
        readings: {
          orderBy: { recordedAt: 'desc' },
          take: 1,
        },
        field: { select: { name: true } },
      },
      orderBy: { deviceId: 'asc' },
    });

    const statusBadge: Record<string, string> = {
      online: 'badge-online',
      offline: 'badge-urgent',
      low_battery: 'badge-low',
    };
    const statusLabel: Record<string, string> = {
      online: 'Online',
      offline: 'Offline',
      low_battery: 'Low!',
    };

    const data = sensors.map(s => {
      const r = s.readings[0];
      const parts: string[] = [];
      if (r?.moisture != null) parts.push(`Moisture ${Math.round(r.moisture)}%`);
      if (r?.temperature != null) parts.push(`Temp ${r.temperature}°C`);
      if (r?.ph != null) parts.push(`pH ${r.ph}`);
      if (r?.humidity != null) parts.push(`Humidity ${Math.round(r.humidity)}%`);
      if (r?.windSpeed != null) parts.push(`Wind ${r.windSpeed} km/h`);
      return {
        id: s.deviceId,
        field: s.field?.name ?? s.name,
        info: parts.join(' · ') || 'No reading yet',
        status: statusBadge[s.status] ?? 'badge-online',
        label: statusLabel[s.status] ?? 'Online',
        lastSeen: r?.recordedAt ?? null,
      };
    });

    res.json({ sensors: data });
  } catch (err) {
    console.error('[sensors/live]', err);
    res.status(500).json({ error: 'Failed to fetch sensor data' });
  }
});

/**
 * GET /api/sensors/history/:deviceId
 * Returns last N readings for a sensor (default 100).
 */
router.get('/history/:deviceId', async (req: Request, res: Response) => {
  try {
    const deviceId = String(req.params.deviceId);
    const sensor = await prisma.sensor.findUnique({
      where: { deviceId },
    });
    if (!sensor) {
      res.status(404).json({ error: 'Sensor not found' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string ?? '100', 10), 1000);
    const readings = await prisma.sensorReading.findMany({
      where: { sensorId: sensor.id },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });

    res.json({ deviceId: req.params.deviceId, readings });
  } catch (err) {
    console.error('[sensors/history]', err);
    res.status(500).json({ error: 'Failed to fetch sensor history' });
  }
});

/**
 * GET /api/sensors/export
 * Returns CSV of all sensor readings (last 7 days).
 */
router.get('/export', async (_req: Request, res: Response) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const readings = await prisma.sensorReading.findMany({
      where: { recordedAt: { gte: since } },
      orderBy: { recordedAt: 'desc' },
      include: { sensor: { select: { deviceId: true, name: true } } },
    });

    const header = 'device_id,sensor_name,recorded_at,moisture,temperature,humidity,ph,wind_speed,rainfall\n';
    const rows = readings.map(r =>
      [
        r.sensor.deviceId,
        `"${r.sensor.name}"`,
        r.recordedAt.toISOString(),
        r.moisture ?? '',
        r.temperature ?? '',
        r.humidity ?? '',
        r.ph ?? '',
        r.windSpeed ?? '',
        r.rainfall ?? '',
      ].join(','),
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="sensor-readings.csv"');
    res.send(header + rows.join('\n'));
  } catch (err) {
    console.error('[sensors/export]', err);
    res.status(500).json({ error: 'Failed to export sensor data' });
  }
});

/**
 * POST /api/sensors/reading
 * Ingests a new reading from an IoT device.
 * Body: { deviceId, moisture?, temperature?, humidity?, ph?, windSpeed?, rainfall? }
 */
router.post('/reading', async (req: Request, res: Response) => {
  try {
    const { deviceId, moisture, temperature, humidity, ph, windSpeed, rainfall } = req.body;
    if (!deviceId) {
      res.status(400).json({ error: 'deviceId is required' });
      return;
    }

    const sensor = await prisma.sensor.findUnique({ where: { deviceId } });
    if (!sensor) {
      res.status(404).json({ error: `Sensor '${deviceId}' not found` });
      return;
    }

    const reading = await prisma.sensorReading.create({
      data: {
        sensorId: sensor.id,
        moisture: moisture != null ? parseFloat(moisture) : undefined,
        temperature: temperature != null ? parseFloat(temperature) : undefined,
        humidity: humidity != null ? parseFloat(humidity) : undefined,
        ph: ph != null ? parseFloat(ph) : undefined,
        windSpeed: windSpeed != null ? parseFloat(windSpeed) : undefined,
        rainfall: rainfall != null ? parseFloat(rainfall) : undefined,
      },
    });

    // Update sensor lastSeenAt and status
    await prisma.sensor.update({
      where: { id: sensor.id },
      data: { lastSeenAt: new Date(), status: 'online' },
    });

    res.status(201).json({ success: true, reading });
  } catch (err) {
    console.error('[sensors/reading]', err);
    res.status(500).json({ error: 'Failed to store reading' });
  }
});

export default router;
