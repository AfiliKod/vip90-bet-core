import { z } from 'zod';

const paymentMethods = [
  'credit_card', 'credit_card_ftd', 'open_banking', 'crypto',
  'blik', 'googlepay', 'applepay', 'interac', 'mbway',
  'instantbanking', 'revolut', 'skrill', 'ideal', 'trustly',
  'eps', 'neteller', 'rapidtransfer', 'paysafecard', 'mybank',
];

// Kullanıcı yatırma isteği
export const slikairDepositSchema = z.object({
  amount:         z.number().positive().min(1),
  currency:       z.string().min(3).max(4).default('EUR'),
  paymentMethod:  z.enum(paymentMethods),
  email:          z.string().email(),
  country:        z.string().min(3).max(3),
  firstName:      z.string().min(1),
  lastName:       z.string().min(1),
  // Kredi kartı için (credit_card / credit_card_ftd)
  cardNum:        z.string().regex(/^\d{13,19}$/).optional(),
  cardHolder:     z.string().min(2).optional(),
  cardExpireMonth: z.string().regex(/^(0[1-9]|1[0-2])$/).optional(),
  cardExpireYear: z.string().regex(/^\d{4}$/).optional(),
  cardCvv:        z.string().regex(/^\d{3,4}$/).optional(),
  // Ek bilgiler (bazı yöntemler için gerekli)
  mobile:         z.string().optional(),
  address:        z.string().optional(),
  city:           z.string().optional(),
  zipCode:        z.string().optional(),
  state:          z.string().optional(),
  birthDate:      z.string().optional(),
});

// Admin: kullanıcı için payout (çekim) başlat — minimal, admin-tetikli.
// Slikair'in kendi OpenAPI spec'i "Sandbox environment does not support
// payouts" diyor, yani paymentDetails'in tam şekli sandbox'ta hiç
// doğrulanamıyor — burada yalnızca Slikair'in v2 payout örneklerindeki temel
// alanları (method'a göre değişen paymentDetails hariç, o passthrough)
// doğruluyoruz.
export const slikairAdminPayoutSchema = z.object({
  userId:         z.string().min(1),
  amount:         z.number().positive().min(1),
  currency:       z.string().min(3).max(4).default('EUR'),
  method:         z.enum(paymentMethods),
  country:        z.string().min(3).max(3),
  paymentDetails: z.record(z.any()),
});

// Admin liste filtresi
export const slikairAdminQuerySchema = z.object({
  page:           z.coerce.number().int().positive().default(1),
  limit:          z.coerce.number().int().positive().max(100).default(20),
  status:         z.string().optional(),
  paymentMethod:  z.string().optional(),
  userId:         z.string().optional(),
  startDate:      z.string().optional(),
  endDate:        z.string().optional(),
});
