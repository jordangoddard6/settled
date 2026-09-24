/** Provo, UT: 7.45% combined sales tax + 1% Utah County restaurant tax on prepared food. */
export const TAX_RATE = 0.0845;

export const LIMITS = {
  nameMax: 30,
  noteMax: 140,
  quantityMin: 1,
  quantityMax: 20,
  linesPerCart: 100,
  participantsPerCart: 25,
} as const;

export const ACTIVITY_LIMIT = 30;

/** Unambiguous characters for cart codes: no 0/O or 1/I. */
export const CART_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const CART_CODE_LENGTH = 6;
