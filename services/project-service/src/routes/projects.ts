import { Router, Request, Response } from 'express';
import { db } from '@vercel-pro/db';
import { logger } from '@vercel-pro/logger';
import { CreateProjectInputSchema } from '@vercel-pro/contracts';
import { ZodError } from 'zod';

// Projects router — project CRUD ke saare endpoints yahan hain
const router = Router();

// ============================================================
// POST /projects — Naya project create karo
// Frontend form submit karega -> ye endpoint data validate karke DB mein insert karega
// Agar slug duplicate hoga toh Prisma unique constraint error aayega
// ============================================================
router.post('/', async (req: Request, res: Response) => {
  try {
    // Step 1: Zod se incoming request body validate karo
    // Agar validation fail hua toh ZodError throw hoga with field-level errors
    const validatedData = CreateProjectInputSchema.parse(req.body);

    // Step 2: Dev user dhoodho ya banao (jab tak auth nahi aata tab tak ye kaam karega)
    // findFirst se pehla user pick karte hain — production mein auth token se user milega
    let devUser = await db.user.findFirst();

    // Agar koi user nahi mila toh ek default dev user create karte hain
    if (!devUser) {
      devUser = await db.user.create({
        data: {
          email: 'dev@vercel-pro.local',
          name: 'Dev User',
        },
      });
      logger.info('Auto-created default dev user for development');
    }

    // Step 3: Project create karo DB mein — Prisma automatically unique slug check karega
    const project = await db.project.create({
      data: {
        name: validatedData.name,
        slug: validatedData.slug,
        repositoryUrl: validatedData.repositoryUrl || null,
        branch: validatedData.branch,
        buildCommand: validatedData.buildCommand,
        outputDir: validatedData.outputDir,
        rootDir: validatedData.rootDir,
        userId: devUser.id,
      },
    });

    logger.info(`Project created: ${project.slug} (${project.id})`);

    // 201 Created response — naya resource successfully bana
    res.status(201).json({
      status: 'success',
      project,
    });
  } catch (error) {
    // Zod validation errors — field-level errors ko clean format mein bhejte hain
    if (error instanceof ZodError) {
      logger.warn('Project creation validation failed:', error.errors);
      res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
      return;
    }

    // Prisma unique constraint violation — duplicate slug ka case
    if (
      error instanceof Error &&
      'code' in error &&
      (error as any).code === 'P2002'
    ) {
      logger.warn('Duplicate slug attempted:', req.body.slug);
      res.status(409).json({
        status: 'error',
        message: 'A project with this slug already exists. Please choose a different slug.',
      });
      return;
    }

    // Unexpected errors — log karo aur generic 500 bhejo
    logger.error('Project creation failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while creating project',
    });
  }
});

// ============================================================
// GET /projects — Saare projects ki list return karo
// Frontend dashboard par ye list dikhegi with deployment counts
// ============================================================
router.get('/', async (req: Request, res: Response) => {
  try {
    // Saare projects fetch karo with deployment count — latest pehle aayega
    const projects = await db.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { deployments: true },
        },
      },
    });

    res.json({
      status: 'success',
      projects,
    });
  } catch (error) {
    logger.error('Failed to fetch projects list:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch projects',
    });
  }
});

// ============================================================
// GET /projects/:id — Ek specific project ki poori detail return karo
// Project detail page par ye data dikhega — build config, recent deployments sab
// ============================================================
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Project ko uski recent deployments ke saath fetch karo
    // include se related deployment data bhi ek hi query mein aa jaata hai (SQL JOIN jaisa)
    const project = await db.project.findUnique({
      where: { id },
      include: {
        deployments: {
          orderBy: { createdAt: 'desc' },
          take: 10, // Sirf last 10 deployments dikhayenge (performance ke liye)
        },
        _count: {
          select: { deployments: true },
        },
      },
    });

    // Agar project nahi mila toh 404 bhejo
    if (!project) {
      res.status(404).json({
        status: 'error',
        message: 'Project not found',
      });
      return;
    }

    res.json({
      status: 'success',
      project,
    });
  } catch (error) {
    logger.error('Failed to fetch project detail:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch project details',
    });
  }
});

export default router;
