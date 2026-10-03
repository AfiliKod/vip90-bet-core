import { z } from 'zod';

export const claimPromotionSchema = z.object({
  acceptedBonusTerms: z.literal(true, { errorMap: () => ({ message: 'Bonus koşullarını kabul etmelisiniz' }) }),
});
