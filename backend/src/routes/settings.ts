import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';

const router = Router();

/**
 * GET /api/settings
 * Returns current settings for the first user (single-tenant MVP).
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const settings = await prisma.userSettings.findFirst({
      include: { user: { include: { farms: true } } },
    });
    if (!settings) {
      res.json({ settings: null });
      return;
    }
    res.json({
      settings: {
        farmName: settings.user.farms[0]?.name ?? '',
        area: settings.user.farms[0]?.totalAreaHa ?? 0,
        waterSource: settings.user.farms[0]?.waterSource ?? 'borewell',
        alertLanguage: settings.alertLanguage,
        apiUrl: settings.apiUrl ?? '',
        autoIrr: settings.autoIrrigation,
        weather: settings.weatherAlerts,
        disease: settings.diseaseAlerts,
        sms: settings.smsAlerts,
        mandi: settings.mandiPrices,
      },
    });
  } catch (err) {
    console.error('[settings/get]', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * POST /api/settings
 * Saves farm settings.
 * Body: { farmName, area, waterSource, alertLanguage, apiUrl, autoIrr, weather, disease, sms, mandi }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      farmName, area, waterSource,
      alertLanguage, apiUrl,
      autoIrr, weather, disease, sms, mandi,
    } = req.body;

    // Upsert first user + farm (single-tenant MVP)
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: { email: 'admin@agromind.local', name: farmName ?? 'Farm Owner' },
      });
    }

    // Update or create farm
    const existingFarm = await prisma.farm.findFirst({ where: { userId: user.id } });
    if (existingFarm) {
      await prisma.farm.update({
        where: { id: existingFarm.id },
        data: {
          name: farmName ?? existingFarm.name,
          totalAreaHa: area != null ? parseFloat(area) : existingFarm.totalAreaHa,
          waterSource: waterSource ?? existingFarm.waterSource,
        },
      });
    } else {
      await prisma.farm.create({
        data: {
          name: farmName ?? 'My Farm',
          totalAreaHa: area != null ? parseFloat(area) : 1,
          waterSource: waterSource ?? 'borewell',
          userId: user.id,
        },
      });
    }

    // Upsert settings
    await prisma.userSettings.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        alertLanguage: alertLanguage ?? 'English',
        apiUrl: apiUrl ?? null,
        autoIrrigation: autoIrr === true || autoIrr === 'true',
        weatherAlerts: weather !== false && weather !== 'false',
        diseaseAlerts: disease !== false && disease !== 'false',
        smsAlerts: sms === true || sms === 'true',
        mandiPrices: mandi === true || mandi === 'true',
      },
      update: {
        alertLanguage: alertLanguage ?? 'English',
        apiUrl: apiUrl ?? null,
        autoIrrigation: autoIrr === true || autoIrr === 'true',
        weatherAlerts: weather !== false && weather !== 'false',
        diseaseAlerts: disease !== false && disease !== 'false',
        smsAlerts: sms === true || sms === 'true',
        mandiPrices: mandi === true || mandi === 'true',
      },
    });

    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (err) {
    console.error('[settings/post]', err);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

export default router;
