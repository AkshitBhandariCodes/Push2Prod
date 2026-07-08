import { z } from 'zod';

// ========================================================================
// PROJECT CONTRACTS
// Ye schemas frontend aur backend ke beech ek "agreement" (contract) ka kaam karte hain.
// Agar frontend valid data bhejega toh backend accept karega, warna Zod error throw karega.
// ========================================================================

// 1. CreateProjectInputSchema: Naya project banane ke request body ko validate karta hai.
// Frontend form submit karte waqt ye schema use hoga client-side aur server-side dono par.
export const CreateProjectInputSchema = z.object({
  // Display name — spaces aur capitals allowed hain (e.g. "My Portfolio Site")
  name: z
    .string()
    .min(3, { message: 'Project name must be at least 3 characters' })
    .max(100, { message: 'Project name must be at most 100 characters' }),

  // URL-friendly unique identifier — sirf lowercase, numbers aur hyphens allowed hain
  slug: z
    .string()
    .min(3, { message: 'Slug must be at least 3 characters' })
    .max(100, { message: 'Slug must be at most 100 characters' })
    .regex(/^[a-z0-9-]+$/, {
      message: 'Slug must contain only lowercase letters, numbers, and hyphens (e.g. my-portfolio)',
    }),

  // Git repository URL — optional hai, user baad mein bhi set kar sakta hai
  repositoryUrl: z
    .string()
    .url({ message: 'Must be a valid Git repository URL' })
    .optional()
    .or(z.literal('')),

  // Git branch — deploy kis branch se hoga (default "main")
  branch: z
    .string()
    .min(1, { message: 'Branch name cannot be empty' })
    .max(100)
    .default('main'),

  // Build command — container ke andar ye command chalegi (e.g. "npm run build")
  buildCommand: z
    .string()
    .max(500)
    .default('npm run build'),

  // Output directory — build ka result kahan aayega (e.g. "dist", ".next", "build")
  outputDir: z
    .string()
    .max(200)
    .default('dist'),

  // Root directory — mono-repo mein project ka root path (default "." matlab repo root)
  rootDir: z
    .string()
    .max(200)
    .default('.'),
});

// TypeScript type auto-generate — frontend aur backend dono ek hi type use karenge
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

// ========================================================================
// DEPLOYMENT CONTRACTS
// ========================================================================

// 2. DeployProjectInputSchema: Jab user deploy trigger karega, tab ye validate karega
export const DeployProjectInputSchema = z.object({
  projectId: z.string().uuid({ message: 'Project ID must be a valid UUID' }),
  commitHash: z.string().min(7).max(40).optional(),
  commitMessage: z.string().max(250).optional(),
});

export type DeployProjectInput = z.infer<typeof DeployProjectInputSchema>;

// ========================================================================
// BUILD EVENT CONTRACTS
// ========================================================================

// 3. BuildEventPayloadSchema: Build status change events (START/INFO/ERROR etc.) ka format validation.
// Redis Stream mein ye payload jaayega jab deployment enqueue hogi.
export const BuildEventPayloadSchema = z.object({
  deploymentId: z.string().uuid({ message: 'Deployment ID must be a valid UUID' }),
  projectId: z.string().uuid({ message: 'Project ID must be a valid UUID' }),
  // Build configuration — worker ko batayega ki kaise build karna hai
  repositoryUrl: z.string().optional(),
  branch: z.string().optional(),
  buildCommand: z.string().optional(),
  outputDir: z.string().optional(),
  rootDir: z.string().optional(),
  type: z.enum(['START', 'INFO', 'WARNING', 'ERROR', 'END']),
  message: z.string().min(1, { message: 'Log message cannot be empty' }),
});

export type BuildEventPayload = z.infer<typeof BuildEventPayloadSchema>;

// ========================================================================
// API RESPONSE TYPES
// Frontend ko backend se milne waale data ka exact shape pata hona chahiye
// ========================================================================

// Project list/detail mein jo data aayega uska type
export interface ProjectResponse {
  id: string;
  name: string;
  slug: string;
  repositoryUrl: string | null;
  branch: string;
  buildCommand: string;
  outputDir: string;
  rootDir: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    deployments: number;
  };
}

// Deployment ka response type
export interface DeploymentResponse {
  id: string;
  commitHash: string | null;
  commitMessage: string | null;
  status: string;
  attemptCount: number;
  lockedBy: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  projectId: string;
}
