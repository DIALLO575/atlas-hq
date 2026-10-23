export const PASSWORD_RULES = [
  { id: "length", label: "Au moins 8 caractères", test: (value: string) => value.length >= 8 },
  { id: "upper", label: "Une lettre majuscule", test: (value: string) => /[A-Z]/.test(value) },
  { id: "digit", label: "Un chiffre", test: (value: string) => /\d/.test(value) },
  { id: "special", label: "Un caractère spécial (ex. : !, @, #, etc.)", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
] as const;

export function passwordMeetsRules(value: string) {
  return PASSWORD_RULES.every((rule) => rule.test(value));
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
