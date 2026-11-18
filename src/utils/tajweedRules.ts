import type { MushafLetterUnit } from '../components/MushafLineRow';

export type TajweedRuleKind =
  | 'madd6'
  | 'madd45'
  | 'madd246'
  | 'madd2'
  | 'ghunnah'
  | 'idgham'
  | 'tafkheem'
  | 'qalqalah';

export interface TajweedLegendItem {
  kind: TajweedRuleKind;
  label: string;
  color: string;
}

export const TAJWEED_COLORS: Record<TajweedRuleKind, string> = {
  madd6: '#9E004D',
  madd45: '#E60067',
  madd246: '#EA580C',
  madd2: '#D49600',
  ghunnah: '#009944',
  idgham: '#8C939B',
  tafkheem: '#005A8D',
  qalqalah: '#009FE3',
};

// Ordered to render in a 4-column x 2-row RTL legend matching standard Dar Al-Maarifah Tajweed Mushaf
export const TAJWEED_LEGEND: TajweedLegendItem[] = [
  { kind: 'madd6', label: 'مدّ ٦ حركات لزوماً', color: TAJWEED_COLORS.madd6 },
  { kind: 'madd246', label: 'مدّ ٢ أو ٤ أو ٦ جوازاً', color: TAJWEED_COLORS.madd246 },
  { kind: 'ghunnah', label: 'إخفاء ، ومواقع الغُنَّة (حركتان)', color: TAJWEED_COLORS.ghunnah },
  { kind: 'tafkheem', label: 'تفخيم', color: TAJWEED_COLORS.tafkheem },
  { kind: 'madd45', label: 'مدّ واجب ٤ أو ٥ حركات', color: TAJWEED_COLORS.madd45 },
  { kind: 'madd2', label: 'مدّ حركتان', color: TAJWEED_COLORS.madd2 },
  { kind: 'idgham', label: 'إدغام ، وما لا يُلفَظ', color: TAJWEED_COLORS.idgham },
  { kind: 'qalqalah', label: 'قلقلة', color: TAJWEED_COLORS.qalqalah },
];

export interface AnalyzeWordTajweedOptions {
  prevWordTokens?: MushafLetterUnit[];
  nextWordTokens?: MushafLetterUnit[];
  isAyahEnd?: boolean;
}

const QALQALAH_LETTERS = new Set(['ق', 'ط', 'ب', 'ج', 'د']);
const ISTILAA_LETTERS = new Set(['خ', 'ص', 'ض', 'غ', 'ط', 'ق', 'ظ']);
const IDGHAM_GHUNNAH_LETTERS = new Set(['ي', 'ن', 'م', 'و']);
const IDGHAM_NO_GHUNNAH_LETTERS = new Set(['ل', 'ر']);
const ALIF_LIGATURE_SECONDS = new Set(['ا', 'أ', 'إ', 'آ', 'ٱ']);
const HAMZA_LETTERS = new Set(['ء', 'أ', 'إ', 'ؤ', 'ئ']);
const IKHFA_LETTERS = new Set([
  'ص',
  'ذ',
  'ث',
  'ك',
  'ج',
  'ش',
  'ق',
  'س',
  'د',
  'ط',
  'ز',
  'ف',
  'ت',
  'ض',
  'ظ',
]);

const TANWEEN_IDGHAM_IKHFA_RE = /[\u0656\u0657\u065E]/;
const ANY_TANWEEN_RE = /[\u064B\u064C\u064D\u0656\u0657\u065E]/;
const HARAKA_CHECK_RE = /[\u064B-\u0652\u0656-\u0658\u065E\u0670\u06E0\u06E1\u06E2\u06ED]/;
const STANDARD_VOWEL_RE = /[\u064B-\u0650\u0656-\u0658\u065E\u0670]/;
const FATHA_RE = /[\u064E\u064B\u0657]/;
const DAMMA_RE = /[\u064F\u064C\u065E]/;
const KASRA_RE = /[\u0650\u064D\u0656]/;
const WAQF_SIGN_RE = /[\u06D6-\u06DC]/;
const ASSIMILATED_EXCLUDE_BASES = new Set(['ا', 'أ', 'إ', 'آ', 'ٱ', 'ى', 'و', 'ي', 'ن', 'م', 'ل']);

function extractLetters(tokens: MushafLetterUnit[] | undefined): MushafLetterUnit[] {
  if (!tokens) return [];
  const res: MushafLetterUnit[] = [];
  for (const t of tokens) {
    if (t.type === 'letter') res.push(t);
  }
  return res;
}

function isPrevWordEndingWithGhunnahTrigger(prevLetters: MushafLetterUnit[]): boolean {
  if (prevLetters.length === 0) return false;
  const last = prevLetters[prevLetters.length - 1];
  // Bare Nun Sakinah at end of previous word (e.g. مَن يَقُولُ / مِّن وَّالٍ)
  if (last.base === 'ن' && !HARAKA_CHECK_RE.test(last.extra)) {
    return true;
  }
  // Sequential tanween directly on last letter (e.g. بَرۡقٞ يَجۡعَلُونَ, هُدٗى وَرَحۡمَةٗ)
  if (TANWEEN_IDGHAM_IKHFA_RE.test(last.extra)) {
    return true;
  }
  // Sequential tanween fath on penultimate letter before silent Alif (e.g. مَثَلٗا يَوۡمَ)
  if (
    last.base === 'ا' &&
    !HARAKA_CHECK_RE.test(last.extra) &&
    prevLetters.length >= 2 &&
    TANWEEN_IDGHAM_IKHFA_RE.test(prevLetters[prevLetters.length - 2].extra)
  ) {
    return true;
  }
  return false;
}

function isAllahTafkheemBefore(
  tokens: MushafLetterUnit[],
  letterIndices: number[],
  lam1Pos: number,
  prevLetters: MushafLetterUnit[]
): boolean {
  const l1 = tokens[letterIndices[lam1Pos]];
  // e.g. لِلَّهِ / وَلِلَّهِ / فَلِلَّهِ -> Kasra directly on first Lam -> always Tarqeeq
  if (KASRA_RE.test(l1.extra)) return false;

  if (lam1Pos > 0) {
    const before = tokens[letterIndices[lam1Pos - 1]];
    // e.g. بِٱللَّهِ -> Kasra before Lam -> Tarqeeq
    if (KASRA_RE.test(before.extra)) return false;
    // e.g. وَٱللَّهُ / فَٱللَّهُ / تَٱللَّهِ / ءَآللَّهُ -> Fatha / Madd -> Tafkheem
    if (FATHA_RE.test(before.extra) || DAMMA_RE.test(before.extra) || before.extra.includes('\u0653')) {
      return true;
    }
    // If preceded by ٱ (Hamzat Wasl), inspect the letter before ٱ
    if (before.base === 'ٱ' && lam1Pos > 1) {
      const beforeWasl = tokens[letterIndices[lam1Pos - 2]];
      if (KASRA_RE.test(beforeWasl.extra)) return false;
      return true;
    }
  }

  // Word begins with ٱللَّه or لِلَّهِ -> inspect previous connected word
  if (prevLetters.length === 0) return true;
  const last = prevLetters[prevLetters.length - 1];
  const penult = prevLetters.length >= 2 ? prevLetters[prevLetters.length - 2] : null;

  if (KASRA_RE.test(last.extra) || ANY_TANWEEN_RE.test(last.extra)) {
    return false;
  }
  if ((last.base === 'ي' || last.base === 'ى') && !HARAKA_CHECK_RE.test(last.extra)) {
    if (penult && KASRA_RE.test(penult.extra)) {
      return false;
    }
  }
  return true;
}

function isRaaMufakhkham(
  cur: MushafLetterUnit,
  prev: MushafLetterUnit | null,
  nxt: MushafLetterUnit | null
): boolean {
  // Imalah on مَجۡر۪ىٰهَا (U+06EA) -> Muraqqaqah
  if (cur.extra.includes('\u06EA')) return false;
  if (FATHA_RE.test(cur.extra) || DAMMA_RE.test(cur.extra)) return true;
  if (KASRA_RE.test(cur.extra)) return false;

  // Raa with explicit Sukun (U+06E1) or bare before pause
  if (cur.extra.includes('\u06E1') || !HARAKA_CHECK_RE.test(cur.extra)) {
    if (!prev) return true;
    // Preceded by Hamzat Wasl (e.g. ٱرۡجِعِي, لِمَنِ ٱرۡتَضَىٰ) -> Tafkheem
    if (prev.base === 'ٱ') return true;
    if (FATHA_RE.test(prev.extra) || DAMMA_RE.test(prev.extra)) return true;
    if (KASRA_RE.test(prev.extra)) {
      // Followed in same word by un-kasra'd Isti'laa letter (مِرۡصَادٗا, قِرۡطَاسٖ, فِرۡقَةٖ)
      if (nxt && ISTILAA_LETTERS.has(nxt.base) && !KASRA_RE.test(nxt.extra)) {
        return true;
      }
      return false;
    }
  }
  return false;
}

/**
 * Analyzes an authentic KFGQPC Uthmani Hafs v18 word (with optional previous/next word context
 * and ayah-end flag) and maps token indices to the 8-color Dar Al-Maarifah Tajweed Mushaf rules.
 */
export function analyzeWordTajweed(
  tokens: MushafLetterUnit[],
  optionsOrNextTokens?: AnalyzeWordTajweedOptions | MushafLetterUnit[]
): Record<number, TajweedRuleKind> {
  const result: Record<number, TajweedRuleKind> = {};

  // UthmanicHafs renders KFGQPC Sajdah overline words (marked with U+06E4) via
  // whole-word GSUB ligatures (sajda1..sajda15); keep them unsplit so glyphs stay intact.
  if (tokens.some((t) => t.extra.includes('\u06E4'))) {
    return result;
  }

  const options: AnalyzeWordTajweedOptions = Array.isArray(optionsOrNextTokens)
    ? { nextWordTokens: optionsOrNextTokens }
    : optionsOrNextTokens || {};

  const letterIndices: number[] = [];
  let hasAnyStandardVowel = false;
  let hasWaqfSign = false;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'letter') {
      letterIndices.push(i);
      if (STANDARD_VOWEL_RE.test(t.extra)) hasAnyStandardVowel = true;
      if (WAQF_SIGN_RE.test(t.extra)) hasWaqfSign = true;
    }
  }
  if (letterIndices.length === 0) return result;

  const isMuqattaat = !hasAnyStandardVowel && tokens.some((t) => t.extra.includes('\u0653'));
  const prevLetters = extractLetters(options.prevWordTokens);
  const nextLetters = extractLetters(options.nextWordTokens);
  const nextFirstLetter = nextLetters[0] ?? null;
  const isStoppableEnd = !!options.isAyahEnd || hasWaqfSign;
  const prevEndedWithGhunnah = isPrevWordEndingWithGhunnahTrigger(prevLetters);

  // Detect Lafz al-Jalalah (ٱللَّهُ / لِلَّهِ / ٱللَّهُمَّ) and preserve its unified GSUB ligature
  const allahIndices = new Set<number>();
  for (let pos = 0; pos <= letterIndices.length - 3; pos++) {
    const l1Idx = letterIndices[pos];
    const l2Idx = letterIndices[pos + 1];
    const hIdx = letterIndices[pos + 2];
    const l1 = tokens[l1Idx];
    const l2 = tokens[l2Idx];
    const h = tokens[hIdx];

    if (
      l1.base === 'ل' &&
      l2.base === 'ل' &&
      l2.extra.includes('\u0651') &&
      h.base === 'ه' &&
      !h.extra.includes('\u06E1')
    ) {
      const rem = letterIndices.length - (pos + 3);
      const isAllahumma =
        rem === 1 &&
        tokens[letterIndices[pos + 3]].base === 'م' &&
        tokens[letterIndices[pos + 3]].extra.includes('\u0651');
      if (rem === 0 || isAllahumma) {
        allahIndices.add(l1Idx);
        allahIndices.add(l2Idx);
        allahIndices.add(hIdx);
        if (isAllahTafkheemBefore(tokens, letterIndices, pos, prevLetters)) {
          result[l1Idx] = 'tafkheem';
          result[l2Idx] = 'tafkheem';
          result[hIdx] = 'tafkheem';
        }
        break;
      }
    }
  }

  for (let pos = 0; pos < letterIndices.length; pos++) {
    const tIdx = letterIndices[pos];
    if (allahIndices.has(tIdx)) continue;

    const cur = tokens[tIdx];
    const prev = pos > 0 ? tokens[letterIndices[pos - 1]] : null;
    const inWord = pos + 1 < letterIndices.length;
    const nxt = inWord ? tokens[letterIndices[pos + 1]] : nextFirstLetter;
    const nextNext =
      pos + 2 < letterIndices.length ? tokens[letterIndices[pos + 2]] : null;

    let rule: TajweedRuleKind | null = null;

    // 1. Madd marked with Maddah sign ٓ (U+0653)
    if (cur.extra.includes('\u0653')) {
      if (cur.base === 'أ') {
        // Madd Badal (2 counts): ٱلۡأٓخِرَةِ, لِأٓدَمَ
        rule = 'madd2';
      } else if (isMuqattaat) {
        // Huruf Muqatta'at (6 counts Lazim Harfi): الٓمٓ, كٓهيعٓصٓ
        rule = 'madd6';
      } else {
        // Check immediately following letter inside word (skipping optional silent اْ)
        const immediateAfter =
          inWord && nxt?.base === 'ا' && nxt.extra.includes('\u0652') ? nextNext : nxt;
        const isLazimKalimi =
          inWord &&
          !!immediateAfter &&
          (immediateAfter.extra.includes('\u0651') || immediateAfter.extra.includes('\u06E1'));

        if (isLazimKalimi) {
          rule = 'madd6';
        } else {
          // Check Ya al-Nidaa / Haa al-Tanbeeh prefix (يَٰٓأَيُّهَا, هَٰٓؤُلَآءِ)
          const isPrefixMunfasil =
            (cur.base === 'ي' || cur.base === 'ه') &&
            cur.extra.includes('\u0670') &&
            pos <= 1 &&
            (cur.extra.includes('\u0654') || (inWord && !!nxt && HAMZA_LETTERS.has(nxt.base)));

          if (isPrefixMunfasil) {
            rule = 'madd246';
          } else {
            // Check Hamza inside the same word (Madd Wajib Muttasil 4-5 counts)
            let hasHamzaLaterInWord = cur.extra.includes('\u0654');
            if (!hasHamzaLaterInWord) {
              for (let k = pos + 1; k < letterIndices.length; k++) {
                const tk = tokens[letterIndices[k]];
                if (HAMZA_LETTERS.has(tk.base) || tk.extra.includes('\u0654')) {
                  hasHamzaLaterInWord = true;
                  break;
                }
              }
            }
            rule = hasHamzaLaterInWord ? 'madd45' : 'madd246';
          }
        }
      }
    }
    // 2. Iqlab (U+06E2 ۢ or U+06ED ۭ) -> Ghunnah site (2 counts)
    else if (cur.extra.includes('\u06E2') || cur.extra.includes('\u06ED')) {
      rule = 'ghunnah';
    }
    // 3. Ghunnah Mushaddadah (نّ or مّ — 2 counts)
    else if ((cur.base === 'ن' || cur.base === 'م') && cur.extra.includes('\u0651')) {
      rule = 'ghunnah';
    }
    // 4. Bare Nun Sakinah (no sukun/vowel => Idgham or Ikhfa)
    else if (cur.base === 'ن' && !HARAKA_CHECK_RE.test(cur.extra) && nxt) {
      if (IDGHAM_GHUNNAH_LETTERS.has(nxt.base) || IDGHAM_NO_GHUNNAH_LETTERS.has(nxt.base)) {
        rule = 'idgham';
      } else if (IKHFA_LETTERS.has(nxt.base)) {
        rule = 'ghunnah';
      }
    }
    // 5. Bare Meem Sakinah (no sukun/vowel => Idgham Shafawi or Ikhfa Shafawi)
    else if (cur.base === 'م' && !HARAKA_CHECK_RE.test(cur.extra) && nxt) {
      if (nxt.base === 'م') {
        rule = 'idgham';
      } else if (nxt.base === 'ب') {
        rule = 'ghunnah';
      }
    }
    // 6. Ghunnah site on initial ي / و after bare Nun or sequential Tanween in Idgham bi-Ghunnah
    else if (pos === 0 && (cur.base === 'ي' || cur.base === 'و') && prevEndedWithGhunnah) {
      rule = 'ghunnah';
    }
    // 7. Silent letters marked with Uthmani zero (U+0652 ْ or U+06E0 ۠)
    else if (cur.extra.includes('\u0652') || cur.extra.includes('\u06E0')) {
      rule = 'idgham';
    }
    // 8. Solar Laam and Idgham Laam (قُل رَّبِّ, بَل لَّا)
    else if (
      cur.base === 'ل' &&
      !HARAKA_CHECK_RE.test(cur.extra) &&
      nxt &&
      nxt.extra.includes('\u0651') &&
      (inWord || nxt.base === 'ل' || nxt.base === 'ر')
    ) {
      rule = 'idgham';
    }
    // 9. Idgham Mutamathilayn / Mutajanisayn / Mutaqaribayn (bare consonant before shaddah)
    else if (
      !ASSIMILATED_EXCLUDE_BASES.has(cur.base) &&
      !HARAKA_CHECK_RE.test(cur.extra) &&
      nxt &&
      nxt.extra.includes('\u0651')
    ) {
      rule = 'idgham';
    }
    // 10. Connecting Alif Wasla (mid-word e.g. بِٱللَّهِ, or mid-ayah e.g. ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ), excluding ل+ٱ ligature
    else if (
      cur.base === 'ٱ' &&
      ((pos > 0 && prev?.base !== 'ل') || (pos === 0 && prevLetters.length > 0))
    ) {
      rule = 'idgham';
    }
    // 11. Qalqalah (ق ط ب ج د with Uthmani Sukun ۡ U+06E1)
    else if (QALQALAH_LETTERS.has(cur.base) && cur.extra.includes('\u06E1')) {
      rule = 'qalqalah';
    }
    // 12. Tafkheem (Isti'laa letters + Mufakhkham Raa)
    else if (ISTILAA_LETTERS.has(cur.base)) {
      rule = 'tafkheem';
    } else if (cur.base === 'ر' && isRaaMufakhkham(cur, prev, nxt)) {
      rule = 'tafkheem';
    }
    // 13. Sequential Tanween Ikhfa (on non-tafkheem/non-qalqalah letter before Ikhfa letter)
    else if (
      TANWEEN_IDGHAM_IKHFA_RE.test(cur.extra) &&
      nextFirstLetter &&
      IKHFA_LETTERS.has(nextFirstLetter.base)
    ) {
      rule = 'ghunnah';
    }
    // 14. Madd 2 counts (Natural / Badal / Silah Sughra / Dagger Alif) or Madd 'Arid (2/4/6 at stop)
    else {
      const isLastLetter = pos === letterIndices.length - 1;
      const isPenultimateLetter = pos === letterIndices.length - 2;
      const dropsForWasl = isLastLetter && nextFirstLetter?.base === 'ٱ';

      // Madd letter ا / و / ي / ى without own vowel/sukun
      let isNaturalMaddLetter = false;
      if (!HARAKA_CHECK_RE.test(cur.extra) && !dropsForWasl) {
        if (cur.base === 'ا' && prev) {
          if (/\u064E/.test(prev.extra)) {
            isNaturalMaddLetter = true;
          } else if (isStoppableEnd && /[\u064B\u0657]/.test(prev.extra)) {
            // Madd 'Iwad (2 counts) at pause on Tanween Fath Alif (e.g. عَلِيمٗا)
            rule = 'madd2';
          }
        } else if (cur.base === 'و' && prev && /\u064F/.test(prev.extra)) {
          isNaturalMaddLetter = true;
        } else if (cur.base === 'ي' && prev && /\u0650/.test(prev.extra)) {
          isNaturalMaddLetter = true;
        } else if (cur.base === 'ى' && prev && /[\u064E\u0650]/.test(prev.extra)) {
          isNaturalMaddLetter = true;
        }
      } else if (
        cur.base === 'ى' &&
        cur.extra.includes('\u0670') &&
        !dropsForWasl
      ) {
        isNaturalMaddLetter = true;
      } else if (
        cur.base === 'و' &&
        cur.extra.includes('\u0670') &&
        prev &&
        /\u064E/.test(prev.extra) &&
        !dropsForWasl
      ) {
        // Uthmani Waw carrying Dagger Alif (e.g. ٱلصَّلَوٰةَ, ٱلزَّكَوٰةَ)
        isNaturalMaddLetter = true;
      }

      if (isNaturalMaddLetter) {
        const lastToken = tokens[letterIndices[letterIndices.length - 1]];
        const isLastSimpleConsonant =
          lastToken && lastToken.base !== 'ا' && !lastToken.extra.includes('\u06E5') && !lastToken.extra.includes('\u06E6');
        rule = isStoppableEnd && isPenultimateLetter && isLastSimpleConsonant ? 'madd246' : 'madd2';
      } else if (
        (cur.extra.includes('\u06E5') || cur.extra.includes('\u06E6')) &&
        !dropsForWasl
      ) {
        // Madd Silah Sughra (حَوۡلَهُۥ, بِهِۦ) -> 2 counts
        rule = 'madd2';
      } else if (cur.extra.includes('\u0670') && !dropsForWasl) {
        // Dagger Alif above consonant (مَٰلِكِ, ٱلۡعَٰلَمِينَ, ذَٰلِكَ)
        const lastToken = tokens[letterIndices[letterIndices.length - 1]];
        const isLastSimpleConsonant = lastToken && lastToken.base !== 'ا';
        rule = isStoppableEnd && isPenultimateLetter && isLastSimpleConsonant ? 'madd246' : 'madd2';
      }
    }

    if (rule) {
      result[tIdx] = rule;
    }
  }

  // Keep UthmanicHafs lam-alif ligatures (e.g. لَآ in أَلَآ / إِلَّآ / هَٰٓؤُلَآءِ)
  // unified under one rule so the single GSUB ligature glyph is never sliced across colors.
  for (let pos = 0; pos < letterIndices.length - 1; pos++) {
    const lamIdx = letterIndices[pos];
    const alifIdx = letterIndices[pos + 1];
    if (tokens[lamIdx].base === 'ل' && ALIF_LIGATURE_SECONDS.has(tokens[alifIdx].base)) {
      const alifRule = result[alifIdx];
      const lamRule = result[lamIdx];
      if (alifRule) {
        result[lamIdx] = alifRule;
      } else if (lamRule) {
        result[alifIdx] = lamRule;
      }
    }
  }

  return result;
}
