import { z } from 'zod';

export const createCurrencySchema = z.object({
  code: z.string().length(3),
  name: z.string().min(1).max(60),
  symbol: z.string().min(1).max(5),
  rate: z.number().positive().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const updateCurrencySchema = z.object({
  name: z.string().min(1).max(60).optional(),
  symbol: z.string().min(1).max(5).optional(),
  isActive: z.boolean().optional(),
});

export const convertAmountSchema = z.object({
  amount: z.number().positive(),
  from: z.string().length(3),
  to: z.string().length(3),
});

export const updateExchangeRateSchema = z.object({
  rate: z.number().positive(),
});

export const bulkUpdateRatesSchema = z.object({
  rates: z.array(z.object({
    code: z.string().length(3),
    rate: z.number().positive(),
  })).min(1).max(50),
});
