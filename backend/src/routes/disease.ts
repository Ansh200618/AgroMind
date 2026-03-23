import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import rateLimit from 'express-rate-limit';
import { prisma } from '../prisma';

const router = Router();

// ── Multer storage ───────────────────────────────────────────────────────────
const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? './uploads');
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB ?? '10', 10)) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG/PNG/WebP images are allowed'));
    }
  },
});

// ── Rate limiter: max 20 uploads per IP per 10 minutes ───────────────────────
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many uploads from this IP. Please wait before trying again.' },
});

/**
 * POST /api/disease/analyse
 * Accepts a multipart/form-data request with an `image` file field
 * plus optional `fieldId` (string).
 *
 * Forwards the image to the Python AI service and stores the result
 * in the DiseaseLogs table.
 *
 * Response JSON shape (matches frontend DISEASE_MOCKS):
 * {
 *   type:        "danger" | "warning" | "healthy",
 *   title:       string,
 *   desc:        string,
 *   conf:        number,   // 0–100
 *   col:         string,   // hex colour
 *   disease:     string,
 *   treatment:   string,
 *   imageUrl:    string
 * }
 */
router.post('/analyse', uploadLimiter, upload.single('image'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No image file provided' });
    return;
  }

  const fieldId: string | undefined = req.body.fieldId;
  const imageUrl = `/uploads/${req.file.filename}`;

  try {
    const aiServiceUrl = process.env.AI_SERVICE_URL ?? 'http://localhost:8000';

    // Build multipart form for the AI service
    const form = new FormData();
    form.append('image', fs.createReadStream(req.file.path), req.file.originalname);

    const aiResponse = await axios.post<AiDiseaseResponse>(
      `${aiServiceUrl}/disease/detect`,
      form,
      { headers: form.getHeaders(), timeout: 30_000 },
    );

    const ai = aiResponse.data;

    // Map AI result → UI colour
    const colMap: Record<string, string> = {
      danger: '#c0392b',
      warning: '#e6a817',
      healthy: '#3d8b47',
    };
    const titleMap: Record<string, string> = {
      danger: `⚠️ ${ai.disease} Detected`,
      warning: `⚡ ${ai.disease} — Mild Risk`,
      healthy: '✅ Leaf Looks Healthy',
    };

    const result = {
      type: ai.type,
      title: titleMap[ai.type] ?? ai.disease,
      desc: ai.description,
      conf: Math.round(ai.confidence),
      col: colMap[ai.type] ?? '#3d8b47',
      disease: ai.disease,
      treatment: ai.treatment ?? '',
      imageUrl,
    };

    // Persist to database
    await prisma.diseaseLog.create({
      data: {
        imageUrl,
        resultType: ai.type,
        diseaseName: ai.disease,
        confidence: ai.confidence,
        description: ai.description,
        treatment: ai.treatment,
        colourHex: colMap[ai.type],
        rawModelOutput: ai as unknown as import('@prisma/client').Prisma.InputJsonValue,
        ...(fieldId ? { fieldId } : {}),
      },
    });

    res.json(result);
  } catch (err) {
    // Cleanup uploaded file on error
    fs.unlink(req.file.path, () => {});
    console.error('[disease/analyse]', err);
    res.status(502).json({ error: 'AI service unavailable. Please try again.' });
  }
});

// ── Type for AI service response ─────────────────────────────────────────────
interface AiDiseaseResponse {
  type: 'danger' | 'warning' | 'healthy';
  disease: string;
  confidence: number;
  description: string;
  treatment?: string;
}

export default router;
