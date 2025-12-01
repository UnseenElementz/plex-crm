import { z } from 'zod'

export const PlanEnum = z.enum(['monthly','yearly','three_year'])

export const CustomerCreateSchema = z.object({
  full_name: z.string().min(2),
  email: z.string().email(),
  plan: PlanEnum,
  streams: z.number().int().min(1),
  start_date: z.string().datetime().optional(),
  next_due_date: z.string().datetime(),
  notes: z.string().max(2000).optional(),
  plex_username: z.string().min(2).max(100).optional(),
  timezone: z.string().max(100).optional()
})

export const CustomerUpdateSchema = CustomerCreateSchema.partial().extend({
  id: z.string().optional(),
  start_date: z.string().datetime().nullable().optional(),
  next_due_date: z.string().datetime().nullable().optional()
})

export function formatZodError(err: z.ZodError){
  return err.issues.map(i=> `${i.path.join('.')}: ${i.message}`).join('\n')
}
