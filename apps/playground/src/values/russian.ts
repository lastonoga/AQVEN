export type NounForms = readonly [string, string, string]

const VOWELS = "аеёиоуыэюя"
const HUSHING = "жчшщ"
const VELAR = "кгх"
const HARD = "бвгдзклмнпрстфх"
const ADJECTIVE_TAILS = ["ый", "ий", "ой", "ая", "яя", "ое", "ее", "ые"]
const PLURAL_TAILS = ["и", "ы"]
const BLOCKED: NounForms = ["", "", ""]
const MIN_NOUN = 4

export const plural = (count: number, one: string, few: string, many: string): string => {
  const teens = Math.abs(count) % 100
  if (teens >= 11 && teens <= 14) return many
  const last = Math.abs(count) % 10
  if (last === 1) return one
  if (last >= 2 && last <= 4) return few
  return many
}

const charAt = (word: string, offset: number): string => word[word.length - offset] ?? ""

const isVowel = (letter: string): boolean => VOWELS.includes(letter)

const endsWithAny = (word: string, tails: readonly string[]): boolean =>
  tails.some((tail) => word.endsWith(tail))

const stem = (word: string, cut: number): string => word.slice(0, word.length - cut)

type NounRule = (word: string) => NounForms | null

const notNoun: NounRule = (word) => {
  if (word.length < MIN_NOUN) return BLOCKED
  if (endsWithAny(word, ADJECTIVE_TAILS)) return BLOCKED
  return endsWithAny(word, PLURAL_TAILS) ? BLOCKED : null
}

const neuterIe: NounRule = (word) => {
  if (!word.endsWith("ие")) return null
  const base = stem(word, 1)
  return [word, `${base}я`, `${base}й`]
}

const neuterO: NounRule = (word) => {
  if (!word.endsWith("о")) return null
  if (isVowel(charAt(word, 2))) return BLOCKED
  if (!isVowel(charAt(word, 3))) return BLOCKED
  const base = stem(word, 1)
  return [word, `${base}а`, base]
}

const neuterE: NounRule = (word) => {
  if (!word.endsWith("е")) return null
  if (word.endsWith("ье")) return BLOCKED
  if (isVowel(charAt(word, 2))) return BLOCKED
  const base = stem(word, 1)
  return [word, `${base}я`, `${base}ей`]
}

const masculineShort: NounRule = (word) => {
  if (!word.endsWith("й")) return null
  const base = stem(word, 1)
  return [word, `${base}я`, `${base}ев`]
}

const fluentVowel = (letter: string): string => (HUSHING.includes(letter) || letter === "ц" ? "е" : "о")

const feminineVelar: NounRule = (word) => {
  if (!word.endsWith("а")) return null
  const mark = charAt(word, 2)
  if (!VELAR.includes(mark) && !HUSHING.includes(mark)) return BLOCKED
  const base = stem(word, 1)
  const inner = charAt(word, 3)
  if (isVowel(inner)) return [word, `${base}и`, base]
  return [word, `${base}и`, `${stem(base, 1)}${fluentVowel(inner)}${mark}`]
}

const feminineSoft: NounRule = (word) => {
  if (!word.endsWith("я")) return null
  if (word.endsWith("ья")) {
    const soft = stem(word, 2)
    return [word, `${soft}ьи`, `${soft}ей`]
  }
  if (!isVowel(charAt(word, 2))) return BLOCKED
  const base = stem(word, 1)
  return [word, `${base}и`, `${base}й`]
}

const masculineHushing: NounRule = (word) =>
  HUSHING.includes(charAt(word, 1)) ? [word, `${word}а`, `${word}ей`] : null

const masculineHard: NounRule = (word) =>
  HARD.includes(charAt(word, 1)) ? [word, `${word}а`, `${word}ов`] : null

const RULES: readonly NounRule[] = [
  notNoun,
  neuterIe,
  neuterO,
  neuterE,
  masculineShort,
  feminineVelar,
  feminineSoft,
  masculineHushing,
  masculineHard,
]

export const nounFormsOf = (noun: string): NounForms | null => {
  const word = noun.trim().toLowerCase()
  const found = RULES.reduce<NounForms | null>((forms, rule) => forms ?? rule(word), null)
  if (found === null || found === BLOCKED) return null
  return found
}

export const countedNoun = (count: number, noun: string): string | null => {
  const forms = nounFormsOf(noun)
  if (forms === null) return null
  return plural(count, forms[0], forms[1], forms[2])
}
