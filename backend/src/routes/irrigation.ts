import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';

const router = Router();

/**
 * GET /api/irrigation/schedule
 * Returns today's irrigation schedule.
 */
router.get('/schedule', async (_req: Request, res: Response) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const logs = await prisma.irrigationLog.findMany({
      where: { scheduledAt: { gte: todayStart, lte: todayEnd } },
      orderBy: { scheduledAt: 'asc' },
      include: {
        field: { select: { name: true, cropType: true } },
      },
    });

    const badgeMap: Record<string, string> = {
      done: 'badge-done',
      active: 'badge-active',
      scheduled: 'badge-soon',
      urgent: 'badge-urgent',
      cancelled: 'badge-done',
    };
    const labelMap: Record<string, string> = {
      done: 'Done', active: 'Active', scheduled: 'Scheduled', urgent: 'Urgent', cancelled: 'Cancelled',
    };

    const schedule = logs.map(r => {
      const time = r.scheduledAt.toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true,
      });
      const fieldLabel = r.field.cropType
        ? `${r.field.name} – ${r.field.cropType}`
        : r.field.name;
      return {
        id: r.id,
        name: fieldLabel,
        meta: `${time} · ${r.waterUsedL ?? '—'} L · ${r.durationMin ?? '—'} min`,
        badge: badgeMap[r.status] ?? 'badge-soon',
        label: labelMap[r.status] ?? r.status,
        status: r.status,
        scheduledAt: r.scheduledAt,
      };
    });

    res.json({ schedule });
  } catch (err) {
    console.error('[irrigation/schedule]', err);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

/**
 * POST /api/irrigation/run
 * Manually triggers an irrigation entry or marks one as active.
 * Body: { fieldId, durationMin, waterUsedL }
 */
router.post('/run', async (req: Request, res: Response) => {
  try {
    const { fieldId, durationMin, waterUsedL } = req.body;
    if (!fieldId) {
      res.status(400).json({ error: 'fieldId is required' });
      return;
    }

    const log = await prisma.irrigationLog.create({
      data: {
        fieldId,
        status: 'active',
        scheduledAt: new Date(),
        startedAt: new Date(),
        durationMin: durationMin ? parseInt(durationMin, 10) : undefined,
        waterUsedL: waterUsedL ? parseFloat(waterUsedL) : undefined,
      },
    });

    res.status(201).json({ success: true, log });
  } catch (err) {
    console.error('[irrigation/run]', err);
    res.status(500).json({ error: 'Failed to start irrigation' });
  }
});

/**
 * POST /api/irrigation/accept
 * Accepts the AI-generated irrigation plan for today.
 */
router.post('/accept', async (_req: Request, res: Response) => {
  try {
    // Mark all scheduled/urgent items as "active" to signal plan acceptance
    await prisma.irrigationLog.updateMany({
      where: { status: { in: ['scheduled', 'urgent'] } },
      data: { status: 'active', startedAt: new Date() },
    });
    res.json({ success: true, message: 'Irrigation plan accepted — schedule updated' });
  } catch (err) {
    console.error('[irrigation/accept]', err);
    res.status(500).json({ error: 'Failed to accept irrigation plan' });
  }
});

/**
 * POST /api/irrigation/calculate
 * Calculates irrigation needs based on sensor data.
 * Body: { fieldId, cropType, soilMoisture, areaHa }
 */
router.post('/calculate', async (req: Request, res: Response) => {
  try {
    const { fieldId, cropType, soilMoisture, areaHa } = req.body;

    // Basic agronomic calculation
    const targetMoisture = 70; // % field capacity
    const currentMoisture = parseFloat(soilMoisture ?? '50');
    const area = parseFloat(areaHa ?? '1');
    const deficitPct = Math.max(0, targetMoisture - currentMoisture);

    // Water needed (litres): deficit% × area(ha) × 10000 m² × field depth 0.3m × 10 (L/m³) × 0.001
    const waterLitres = Math.round(deficitPct * area * 10000 * 0.3 * 10 * 0.001);
    const durationMin = Math.round(waterLitres / 16); // assume 16 L/min flow rate

    res.json({
      fieldId,
      cropType,
      currentMoisture,
      targetMoisture,
      deficitPct,
      waterLitres,
      durationMin,
      recommendation: deficitPct < 5
        ? 'Soil moisture is adequate. No irrigation needed.'
        : `Apply ${waterLitres} L over ${durationMin} minutes to reach optimal moisture.`,
    });
  } catch (err) {
    console.error('[irrigation/calculate]', err);
    res.status(500).json({ error: 'Failed to calculate irrigation plan' });
  }
});

export default router;
