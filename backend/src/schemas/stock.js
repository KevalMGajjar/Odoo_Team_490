import { z } from 'zod'

const countLine = z.object({
  productId: z.string().uuid('Product is required'),
  countedQty: z.coerce.number({ invalid_type_error: 'Counted quantity must be a number' })
    .nonnegative('Counted quantity cannot be negative'),
})

export const stockAdjustmentCreate = z.object({
  date: z.coerce.date({ invalid_type_error: 'Date is not valid' }),
  reason: z.string().trim().max(300).optional().nullable().or(z.literal('').transform(() => null)),
  lines: z.array(countLine).min(1, 'Count at least one product'),
})
