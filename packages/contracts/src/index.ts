import { z } from 'zod';

// 1. CreateProjectInputSchema: Naya project banane ke request data ko validate karta hai.
// Isse invalid name ya format direct controller level pe catch ho jate hain.
export const CreateProjectInputSchema = z.object({
  name: z
    .string()
    .min(3, { message: 'Project name must be at least 3 characters' })
    .max(100)
    .regex(/^[a-z0-9-]+$/, { message: 'Name must contain only lowercase alphanumeric characters and hyphens (e.g. vercel-clone)' }),
  repositoryUrl: z
    .string()
    .url({ message: 'Must be a valid Git repository URL' })
    .optional()
    .or(z.literal('')),
  userId: z.string().uuid({ message: 'User ID must be a valid UUID' }),
});

// Zod schema se automatic TypeScript types generate kar rahe hain taaki front/back end me repeat na karna pade
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

// 2. DeployProjectInputSchema: Jab hum deployment trigger karenge, toh inputs ko ensure karega.
export const DeployProjectInputSchema = z.object({
  projectId: z.string().uuid({ message: 'Project ID must be a valid UUID' }),
  commitHash: z.string().min(7).max(40).optional(),
  commitMessage: z.string().max(250).optional(),
});

export type DeployProjectInput = z.infer<typeof DeployProjectInputSchema>;

// 3. BuildEventPayloadSchema: Build status change events (jaise START/ERROR) ka format validation.
export const BuildEventPayloadSchema = z.object({
  deploymentId: z.string().uuid({ message: 'Deployment ID must be a valid UUID' }),
  type: z.enum(['START', 'INFO', 'WARNING', 'ERROR', 'END']),
  message: z.string().min(1, { message: 'Log message cannot be empty' }),
});

export type BuildEventPayload = z.infer<typeof BuildEventPayloadSchema>;
