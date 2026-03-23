import { Router, Request, Response } from 'express';
import axios from 'axios';
import { prisma } from '../prisma';

const router = Router();

/**
 * POST /api/crops/recommend
 * Body: { soil, ph, rainfall, temp, region, season, nitrogen, water }
 *
 * Forwards to Python AI service and returns:
 * { crops: [{ emoji, name, score, why }], summary }
 */
router.post('/recommend', async (req: Request, res: Response) => {
  try {
    const { soil, ph, rainfall, temp, region, season, nitrogen, water } = req.body;

    const aiServiceUrl = process.env.AI_SERVICE_URL ?? 'http://localhost:8000';
    const aiResponse = await axios.post<AiCropResponse>(
      `${aiServiceUrl}/crops/recommend`,
      { soil, ph, rainfall, temp, region, season, nitrogen, water },
      { timeout: 30_000 },
    );

    res.json(aiResponse.data);
  } catch (err) {
    console.error('[crops/recommend]', err);
    res.status(502).json({ error: 'Crop recommendation service unavailable' });
  }
});

/**
 * GET /api/crops/fields
 * Returns fields with current crop info (for dropdown population in UI).
 */
router.get('/fields', async (_req: Request, res: Response) => {
  try {
    const fields = await prisma.field.findMany({
      select: {
        id: true,
        name: true,
        cropType: true,
        cropSeason: true,
        soilType: true,
        soilPh: true,
        areaHa: true,
      },
      orderBy: { name: 'asc' },
    });
    res.json({ fields });
  } catch (err) {
    console.error('[crops/fields]', err);
    res.status(500).json({ error: 'Failed to fetch fields' });
  }
});

interface AiCropResponse {
  crops: Array<{
    emoji: string;
    name: string;
    score: number;
    why: string;
  }>;
  summary: string;
}

export default router;
