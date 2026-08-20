/**
 * Lokal eylem kayıt defteri (D6 — minimal). Ajanın çalıştırabileceği
 * eylemler yalnızca burada tanımlı olanlarla sınırlı — imza geçerli olsa
 * bile kayıtsız bir actionId ASLA çalıştırılmaz.
 *
 * Etki-yarıçapı sınıflaması ve yıkıcı eylemlerde insan onay kapısı D7'nin
 * kapsamı; bu defter yalnızca "izinli mi" sorusuna cevap verir.
 */
export function createActionRegistry() {
  const actions = new Map();

  return {
    register(actionId, handler) {
      if (typeof handler !== 'function') {
        throw new Error(`Eylem "${actionId}" için handler bir fonksiyon olmalı`);
      }
      if (actions.has(actionId)) {
        throw new Error(`Eylem "${actionId}" zaten kayıtlı`);
      }
      actions.set(actionId, handler);
    },

    has(actionId) {
      return actions.has(actionId);
    },

    async execute(actionId, params) {
      const handler = actions.get(actionId);
      if (!handler) {
        throw new Error(`Eylem "${actionId}" kayıtlı değil — çalıştırılmadı`);
      }
      return handler(params);
    },
  };
}
