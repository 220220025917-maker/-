import React, { useEffect, useMemo, useState } from 'react';
import {
  BookMarked,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns2,
  FileText,
  Palette,
  X,
} from 'lucide-react';
import { MushafLineRow, type MushafLetterUnit, type MushafLineItem } from './MushafLineRow';
import { analyzeWordTajweed, TAJWEED_LEGEND } from '../utils/tajweedRules';
import {
  DIACRITIC_RE,
  INITIAL_MUSHAF_SURAHS,
  TOTAL_MUSHAF_PAGES,
  TOTAL_MUSHAF_SPREADS,
  toArabicDigits,
  tokenizeMushafText,
  type MushafDataset,
  type MushafRawPage,
  type MushafSurahMeta,
  type TokenizedMushafPage,
  type TokenizedMushafRow,
} from '../utils/mushafData';

export interface MushafPracticeConfig {
  targetLetters: string[];
  targetLabel: string;
  hitMessage?: string;
  missMessage?: string;
  completeSingleMessage?: string;
  completeDoubleMessage?: string;
  onPracticeComplete?: () => void;
}

export interface MushafProgramProps {
  variant?: 'standalone' | 'embedded';
  initialPage?: number;
  initialLayout?: 'double' | 'single';
  initialTajweed?: boolean;
  practiceConfig?: MushafPracticeConfig;
  onPlayChime?: (success: boolean) => void;
  onTriggerConfetti?: () => void;
}

export const MushafProgram: React.FC<MushafProgramProps> = ({
  variant = 'standalone',
  initialPage = 1,
  initialLayout = 'double',
  initialTajweed = true,
  practiceConfig,
  onPlayChime,
  onTriggerConfetti,
}) => {
  const hasPractice = !!practiceConfig && practiceConfig.targetLetters.length > 0;
  const targetLetters = practiceConfig?.targetLetters ?? [];
  const targetLettersKey = targetLetters.join(',');

  const [mushafDataset, setMushafDataset] = useState<MushafDataset | null>(null);
  const [selectedSurah, setSelectedSurah] = useState('الفاتحة');
  const [currentMushafPage, setCurrentMushafPage] = useState(initialPage);
  const [mushafPageLayout, setMushafPageLayout] = useState<'double' | 'single'>(initialLayout);
  const [mushafMode, setMushafMode] = useState<'practice' | 'reading'>(
    hasPractice ? 'practice' : 'reading'
  );
  const [mushafTajweed, setMushafTajweed] = useState(initialTajweed);
  const [surahCorrectMap, setSurahCorrectMap] = useState<Record<string, boolean>>({});
  const [surahRevealed, setSurahRevealed] = useState(false);
  const [surahStatus, setSurahStatus] = useState<{ msg: string; kind: 'ok' | 'bad' | null }>({
    msg: '',
    kind: null,
  });
  const [surahWrongKey, setSurahWrongKey] = useState<string | null>(null);

  useEffect(() => {
    setMushafMode(hasPractice ? 'practice' : 'reading');
    setSurahCorrectMap({});
    setSurahRevealed(false);
    setSurahStatus({ msg: '', kind: null });
  }, [hasPractice, targetLettersKey]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/data/mushaf_pages_v18.json', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load Mushaf dataset'))))
      .then((data: MushafDataset) => {
        if (
          data &&
          Array.isArray(data.surahs) &&
          Array.isArray(data.pages) &&
          data.pages.length === TOTAL_MUSHAF_PAGES
        ) {
          setMushafDataset(data);
        }
      })
      .catch(() => {
        // Ignore abort/offline errors
      });
    return () => controller.abort();
  }, []);

  const mushafSurahs = mushafDataset?.surahs || INITIAL_MUSHAF_SURAHS;

  const surahMetaMap = useMemo(() => {
    const map = new Map<number, MushafSurahMeta>();
    for (const s of mushafSurahs) {
      map.set(s.id, s);
    }
    return map;
  }, [mushafSurahs]);

  const juzStartPages = useMemo(() => {
    if (!mushafDataset) {
      return Array.from({ length: 30 }, (_, i) => ({
        jozz: i + 1,
        startPage: i === 0 ? 1 : i * 20 + 2,
      }));
    }
    const map = new Map<number, number>();
    for (let idx = 0; idx < mushafDataset.pages.length; idx++) {
      const jozz = mushafDataset.pages[idx].j;
      if (!map.has(jozz)) {
        map.set(jozz, idx + 1);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([jozz, startPage]) => ({ jozz, startPage }));
  }, [mushafDataset]);

  const clampedMushafPage = Math.max(1, Math.min(TOTAL_MUSHAF_PAGES, currentMushafPage));
  const safeSpreadIndex = Math.max(
    0,
    Math.min(TOTAL_MUSHAF_SPREADS - 1, Math.floor((clampedMushafPage - 1) / 2))
  );
  const rightPageNum = safeSpreadIndex * 2 + 1;
  const leftPageNum = safeSpreadIndex * 2 + 2;

  const getPageSurahNames = (rawPage: MushafRawPage | undefined): string[] => {
    if (!rawPage) return [];
    const names: string[] = [];
    for (const row of rawPage.rows) {
      if (row.k === 't' && row.r) {
        for (const run of row.r) {
          const meta = surahMetaMap.get(run.s);
          if (meta && !names.includes(meta.name)) {
            names.push(meta.name);
          }
        }
      }
    }
    if (names.length === 0) {
      for (const row of rawPage.rows) {
        if (row.s) {
          const meta = surahMetaMap.get(row.s);
          if (meta && !names.includes(meta.name)) {
            names.push(meta.name);
          }
        }
      }
    }
    return names;
  };

  const buildTokenizedPage = (pageNum: number): TokenizedMushafPage | null => {
    const rawPage = mushafDataset?.pages[pageNum - 1];
    if (!rawPage) return null;

    const surahNames = getPageSurahNames(rawPage);
    const rows: TokenizedMushafRow[] = [];

    for (const row of rawPage.rows) {
      if (row.k === 'b' && row.s) {
        const surahMeta = surahMetaMap.get(row.s);
        if (surahMeta) {
          rows.push({ kind: 'banner', line: row.l, surahMeta });
        }
        continue;
      }

      if (row.k === 'm' && row.s) {
        rows.push({ kind: 'basmalah', line: row.l, surahId: row.s });
        continue;
      }

      if (row.k === 't' && row.r) {
        const items: MushafLineItem[] = [];
        let endCount = 0;
        const plainParts: string[] = [];

        row.r.forEach((run, runIdx) => {
          const hasRubMarker = run.t.startsWith('\u00A0') && !run.t.includes('\u06DE');
          const clean = run.t.replace(/^[\s\u00A0]+|[\s\u00A0]+$/g, '');
          const words = clean ? clean.split(/[\s\u00A0]+/) : [];
          if (run.e === 1) endCount++;

          if (words.length === 0) {
            if (run.e === 1) {
              items.push({
                kind: 'rosette',
                keyPrefix: `${pageNum}_${row.l}_${runIdx}_end`,
                ayahNum: run.a,
                surahId: run.s,
              });
            }
            return;
          }

          plainParts.push(clean);
          words.forEach((word, wIdx) => {
            const isFirstWordOfRun = wIdx === 0;
            const isLastWordOfRun = wIdx === words.length - 1;
            const rawWithRub = isFirstWordOfRun && hasRubMarker ? `\u06DE${word}` : word;
            items.push({
              kind: 'word',
              keyPrefix: `${pageNum}_${row.l}_${runIdx}_${wIdx}`,
              rawWord: rawWithRub,
              tokens: tokenizeMushafText(rawWithRub, targetLetters),
              ayahEnd: isLastWordOfRun && run.e === 1 ? run.a : null,
              surahId: run.s,
              ayahNum: run.a,
            });
          });
        });

        const lastRun = row.r[row.r.length - 1];
        const lastSurahMeta = lastRun ? surahMetaMap.get(lastRun.s) : undefined;
        const isSurahEnd = !!(
          lastRun &&
          lastRun.e === 1 &&
          lastSurahMeta &&
          lastRun.a === lastSurahMeta.totalAyat
        );
        const baseTextLen =
          plainParts.join(' ').replace(new RegExp(DIACRITIC_RE.source, 'g'), '').length + endCount * 3;
        const isClosingPairRow = pageNum === 604 && row.l === 14;
        const isCentered = pageNum <= 2 || isClosingPairRow || (isSurahEnd && baseTextLen < 36);

        rows.push({
          kind: 'text',
          line: row.l,
          isCentered,
          items,
        });
      }
    }

    const flatWords: Array<Extract<MushafLineItem, { kind: 'word' }>> = [];
    for (const r of rows) {
      if (r.kind === 'text') {
        for (const item of r.items) {
          if (item.kind === 'word') {
            flatWords.push(item);
          }
        }
      }
    }

    let prevPageLastWordTokens: MushafLetterUnit[] | undefined;
    const prevRawPage = pageNum > 1 ? mushafDataset?.pages[pageNum - 2] : undefined;
    if (prevRawPage) {
      for (let rIdx = prevRawPage.rows.length - 1; rIdx >= 0; rIdx--) {
        const pr = prevRawPage.rows[rIdx];
        if (pr.k === 't' && pr.r && pr.r.length > 0) {
          const lastRun = pr.r[pr.r.length - 1];
          if (lastRun.e === 1) break;
          const clean = lastRun.t.replace(/^[\s\u00A0]+|[\s\u00A0]+$/g, '');
          const words = clean ? clean.split(/[\s\u00A0]+/) : [];
          if (words.length > 0) {
            prevPageLastWordTokens = tokenizeMushafText(words[words.length - 1], targetLetters);
          }
          break;
        }
        if (pr.k === 'b' || pr.k === 'm') break;
      }
    }

    let nextPageFirstWordTokens: MushafLetterUnit[] | undefined;
    const nextRawPage = pageNum < TOTAL_MUSHAF_PAGES ? mushafDataset?.pages[pageNum] : undefined;
    if (nextRawPage) {
      for (const nr of nextRawPage.rows) {
        if (nr.k === 't' && nr.r) {
          for (const nRun of nr.r) {
            const clean = nRun.t.replace(/^[\s\u00A0]+|[\s\u00A0]+$/g, '');
            const words = clean ? clean.split(/[\s\u00A0]+/) : [];
            if (words.length > 0) {
              nextPageFirstWordTokens = tokenizeMushafText(words[0], targetLetters);
              break;
            }
          }
        }
        if (nextPageFirstWordTokens) break;
      }
    }

    flatWords.forEach((wordItem, idx) => {
      const isFirstOnPage = idx === 0;
      const isLastOnPage = idx === flatWords.length - 1;
      const prevWord = idx > 0 ? flatWords[idx - 1] : undefined;
      const prevWordTokens = isFirstOnPage
        ? prevPageLastWordTokens
        : prevWord && prevWord.ayahEnd === null && prevWord.surahId === wordItem.surahId
        ? prevWord.tokens
        : undefined;
      const nextWord = idx < flatWords.length - 1 ? flatWords[idx + 1] : undefined;
      const nextWordTokens =
        wordItem.ayahEnd !== null
          ? undefined
          : isLastOnPage
          ? nextPageFirstWordTokens
          : nextWord && nextWord.surahId === wordItem.surahId
          ? nextWord.tokens
          : undefined;
      wordItem.tajweed = analyzeWordTajweed(wordItem.tokens, {
        prevWordTokens,
        nextWordTokens,
        isAyahEnd: wordItem.ayahEnd !== null,
      });
    });

    return {
      pageNum,
      jozz: rawPage.j,
      surahNames,
      rows,
    };
  };

  const activeSinglePageData = useMemo(
    () => buildTokenizedPage(clampedMushafPage),
    [mushafDataset, surahMetaMap, clampedMushafPage, targetLettersKey]
  );
  const rightPageData = useMemo(
    () => buildTokenizedPage(rightPageNum),
    [mushafDataset, surahMetaMap, rightPageNum, targetLettersKey]
  );
  const leftPageData = useMemo(
    () => buildTokenizedPage(leftPageNum),
    [mushafDataset, surahMetaMap, leftPageNum, targetLettersKey]
  );

  const visiblePagesData = useMemo(
    () => (mushafPageLayout === 'single' ? [activeSinglePageData] : [rightPageData, leftPageData]),
    [mushafPageLayout, activeSinglePageData, rightPageData, leftPageData]
  );

  const currentJozz =
    mushafPageLayout === 'single'
      ? activeSinglePageData?.jozz || 1
      : rightPageData?.jozz || leftPageData?.jozz || 1;
  const currentSurahIdx = Math.max(0, mushafSurahs.findIndex((s) => s.name === selectedSurah));
  const currentSurahEntry = mushafSurahs[currentSurahIdx] || mushafSurahs[0];

  const surahTotalTargets = useMemo(() => {
    if (!hasPractice) return 0;
    let count = 0;
    for (const pageData of visiblePagesData) {
      if (!pageData) continue;
      for (const row of pageData.rows) {
        if (row.kind !== 'text') continue;
        for (const item of row.items) {
          if (item.kind !== 'word') continue;
          for (const t of item.tokens) {
            if (t.type === 'letter' && t.isTarget) count++;
          }
        }
      }
    }
    return count;
  }, [hasPractice, visiblePagesData]);

  const surahFoundCount = useMemo(() => {
    if (!hasPractice) return 0;
    let count = 0;
    for (const pageData of visiblePagesData) {
      if (!pageData) continue;
      for (const row of pageData.rows) {
        if (row.kind !== 'text') continue;
        for (const item of row.items) {
          if (item.kind !== 'word') continue;
          for (let tIdx = 0; tIdx < item.tokens.length; tIdx++) {
            const key = `${item.keyPrefix}_${tIdx}`;
            if (item.tokens[tIdx].isTarget && surahCorrectMap[key]) count++;
          }
        }
      }
    }
    return count;
  }, [hasPractice, visiblePagesData, surahCorrectMap]);

  const syncSelectedSurahForSpread = (nextSpread: number) => {
    const rNames = getPageSurahNames(mushafDataset?.pages[nextSpread * 2]);
    const lNames = getPageSurahNames(mushafDataset?.pages[nextSpread * 2 + 1]);
    const firstName = rNames[0] || lNames[0];
    if (firstName) {
      setSelectedSurah(firstName);
    }
  };

  const handleSelectSurah = (name: string) => {
    const target = mushafSurahs.find((s) => s.name === name);
    setSelectedSurah(name);
    if (target) {
      setCurrentMushafPage(target.startPage);
    }
    setSurahRevealed(false);
    setSurahStatus({ msg: '', kind: null });
  };

  const handleJumpToPage = (pageNum: number) => {
    const clampedPage = Math.max(1, Math.min(TOTAL_MUSHAF_PAGES, pageNum));
    const nextSpread = Math.floor((clampedPage - 1) / 2);
    setCurrentMushafPage(clampedPage);
    const pNames = getPageSurahNames(mushafDataset?.pages[clampedPage - 1]);
    if (pNames[0]) {
      setSelectedSurah(pNames[0]);
    } else {
      syncSelectedSurahForSpread(nextSpread);
    }
    setSurahRevealed(false);
    setSurahStatus({ msg: '', kind: null });
  };

  const handleSelectJuz = (jozz: number) => {
    const entry = juzStartPages.find((item) => item.jozz === jozz);
    if (entry) {
      handleJumpToPage(entry.startPage);
    }
  };

  const handleChangeSpread = (nextSpread: number) => {
    const clamped = Math.max(0, Math.min(TOTAL_MUSHAF_SPREADS - 1, nextSpread));
    setCurrentMushafPage(clamped * 2 + 1);
    syncSelectedSurahForSpread(clamped);
    setSurahRevealed(false);
    setSurahStatus({ msg: '', kind: null });
  };

  const handleStepMushafPage = (delta: number) => {
    if (mushafPageLayout === 'single') {
      handleJumpToPage(clampedMushafPage + delta);
    } else {
      handleChangeSpread(safeSpreadIndex + delta);
    }
  };

  const handleChangePageLayout = (nextLayout: 'double' | 'single') => {
    setMushafPageLayout(nextLayout);
    setSurahRevealed(false);
    setSurahStatus({ msg: '', kind: null });
  };

  const handleSurahLetterClick = (unit: MushafLetterUnit, key: string) => {
    if (!hasPractice || mushafMode !== 'practice') return;

    if (surahCorrectMap[key]) {
      const next = { ...surahCorrectMap, [key]: false };
      setSurahCorrectMap(next);
      setSurahStatus({ msg: '', kind: null });
      return;
    }

    if (unit.isTarget) {
      onPlayChime?.(true);
      const next = { ...surahCorrectMap, [key]: true };
      setSurahCorrectMap(next);
      setSurahStatus({
        msg: practiceConfig?.hitMessage || 'أحسنت! إجابة صحيحة ✓',
        kind: 'ok',
      });

      const newFound = surahFoundCount + 1;
      if (newFound === surahTotalTargets && surahTotalTargets > 0) {
        setSurahStatus({
          msg:
            mushafPageLayout === 'single'
              ? practiceConfig?.completeSingleMessage ||
                `ممتاز! وجدت كل ${practiceConfig?.targetLabel || 'المواضع المطلوبة'} في هذه الصفحة ✓`
              : practiceConfig?.completeDoubleMessage ||
                `ممتاز! وجدت كل ${practiceConfig?.targetLabel || 'المواضع المطلوبة'} في هاتين الصفحتين ✓`,
          kind: 'ok',
        });
        onTriggerConfetti?.();
        practiceConfig?.onPracticeComplete?.();
      }
    } else {
      onPlayChime?.(false);
      setSurahWrongKey(key);
      setSurahStatus({
        msg: practiceConfig?.missMessage || 'حاول مرة أخرى، هذا ليس الحرف المطلوب',
        kind: 'bad',
      });
      setTimeout(() => setSurahWrongKey(null), 450);
    }
  };

  const isEffectivePractice = hasPractice && mushafMode === 'practice';

  return (
    <div className="sub-panel active" id="sub-surah" data-variant={variant}>
      <div className="apply-toolbar-row mushaf-toolbar-row" id="surah-toolbar-row">
        <div className="apply-select-group mushaf-nav-controls">
          <div className="apply-select-wrap">
            <select
              id="surah-select"
              aria-label="اختر سورة"
              value={currentSurahEntry.name}
              onChange={(e) => handleSelectSurah(e.target.value)}
            >
              {mushafSurahs.map((surah) => (
                <option key={surah.id} value={surah.name}>
                  {toArabicDigits(surah.id)}. سورة {surah.name} ({toArabicDigits(surah.totalAyat)})
                </option>
              ))}
            </select>
            <ChevronDown className="apply-select-chevron" aria-hidden="true" />
          </div>

          <div className="apply-select-wrap">
            <select
              id="mushaf-juz-select"
              className="mushaf-meta-select"
              aria-label="اختر الجزء"
              value={currentJozz}
              onChange={(e) => handleSelectJuz(Number(e.target.value))}
            >
              {juzStartPages.map((item) => (
                <option key={item.jozz} value={item.jozz}>
                  الجزء {toArabicDigits(item.jozz)}
                </option>
              ))}
            </select>
            <ChevronDown className="apply-select-chevron" aria-hidden="true" />
          </div>

          <div className="apply-select-wrap">
            <select
              id="mushaf-page-select"
              className="mushaf-meta-select"
              aria-label="انتقل إلى صفحة"
              value={mushafPageLayout === 'single' ? clampedMushafPage : rightPageNum}
              onChange={(e) => handleJumpToPage(Number(e.target.value))}
            >
              {Array.from({ length: TOTAL_MUSHAF_PAGES }, (_, idx) => {
                const pNum = idx + 1;
                return (
                  <option key={pNum} value={pNum}>
                    ص {toArabicDigits(pNum)}
                  </option>
                );
              })}
            </select>
            <ChevronDown className="apply-select-chevron" aria-hidden="true" />
          </div>

          <div className="apply-surah-nav-group" role="group" aria-label="التنقل بين صفحات المصحف">
            <button
              type="button"
              className="apply-surah-nav-btn"
              title={mushafPageLayout === 'single' ? 'الصفحة السابقة' : 'الصفحتان السابقتان'}
              aria-label={mushafPageLayout === 'single' ? 'الصفحة السابقة' : 'الصفحتان السابقتان'}
              disabled={mushafPageLayout === 'single' ? clampedMushafPage <= 1 : safeSpreadIndex <= 0}
              onClick={() => handleStepMushafPage(-1)}
            >
              <ChevronRight className="w-4 h-4" strokeWidth={2.4} />
            </button>
            <button
              type="button"
              className="apply-surah-nav-btn"
              title={mushafPageLayout === 'single' ? 'الصفحة التالية' : 'الصفحتان التاليتان'}
              aria-label={mushafPageLayout === 'single' ? 'الصفحة التالية' : 'الصفحتان التاليتان'}
              disabled={
                mushafPageLayout === 'single'
                  ? clampedMushafPage >= TOTAL_MUSHAF_PAGES
                  : safeSpreadIndex >= TOTAL_MUSHAF_SPREADS - 1
              }
              onClick={() => handleStepMushafPage(1)}
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={2.4} />
            </button>
          </div>
        </div>

        <div className="mushaf-toolbar-actions">
          <div className="mushaf-mode-toggle" role="group" aria-label="عرض صفحات المصحف">
            <button
              type="button"
              className={`mushaf-mode-btn ${mushafPageLayout === 'double' ? 'is-active' : ''}`}
              onClick={() => handleChangePageLayout('double')}
            >
              <Columns2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>صفحتان</span>
            </button>
            <button
              type="button"
              className={`mushaf-mode-btn ${mushafPageLayout === 'single' ? 'is-active' : ''}`}
              onClick={() => handleChangePageLayout('single')}
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              <span>صفحة واحدة</span>
            </button>
          </div>

          {hasPractice && (
            <div className="mushaf-mode-toggle" role="group" aria-label="وضع عرض المصحف">
              <button
                type="button"
                className={`mushaf-mode-btn ${mushafMode === 'practice' ? 'is-active' : ''}`}
                onClick={() => {
                  setMushafMode('practice');
                  setSurahStatus({ msg: '', kind: null });
                }}
              >
                <BookMarked className="w-3.5 h-3.5" aria-hidden="true" />
                <span>وضع التدريب</span>
              </button>
              <button
                type="button"
                className={`mushaf-mode-btn ${mushafMode === 'reading' ? 'is-active' : ''}`}
                onClick={() => {
                  setMushafMode('reading');
                  setSurahRevealed(false);
                  setSurahStatus({ msg: '', kind: null });
                }}
              >
                <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                <span>وضع القراءة</span>
              </button>
            </div>
          )}

          <button
            type="button"
            className={`mushaf-tajweed-toggle-btn ${mushafTajweed ? 'is-active' : ''}`}
            aria-pressed={mushafTajweed}
            onClick={() => setMushafTajweed((prev) => !prev)}
            title="تفعيل أو إيقاف تلوين أحكام التجويد (مصحف مجود)"
          >
            <Palette className="w-3.5 h-3.5" aria-hidden="true" />
            <span>مصحف مجود</span>
          </button>

          {isEffectivePractice && (
            <div
              className={`counter-pill ${
                surahTotalTargets > 0 && surahFoundCount === surahTotalTargets ? 'is-complete' : ''
              }`}
              id="surah-counter"
              aria-live="polite"
            >
              وجدت {toArabicDigits(surahFoundCount)} من {toArabicDigits(surahTotalTargets)}
            </div>
          )}
        </div>
      </div>

      {isEffectivePractice && practiceConfig && (
        <div className="instruction">
          اضغط على <span className="apply-instruction-accent">{practiceConfig.targetLabel}</span>{' '}
          {mushafPageLayout === 'single' ? 'في الصفحة' : 'في الصفحتين'}
        </div>
      )}

      <div
        className={`quran-frame ${
          isEffectivePractice && surahTotalTargets > 0 && surahFoundCount === surahTotalTargets
            ? 'is-solved'
            : ''
        }`}
        id="surah-frame"
      >
        <svg
          className="tile-deco-pattern"
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <circle cx="100" cy="20" r="52" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" opacity="0.35" />
          <circle cx="100" cy="20" r="38" stroke="currentColor" strokeWidth="1.2" opacity="0.45" />
          <circle cx="100" cy="20" r="22" stroke="currentColor" strokeWidth="1" opacity="0.5" />
          <circle cx="100" cy="20" r="8" fill="currentColor" opacity="0.25" />
          <rect x="76" y="-4" width="48" height="48" rx="6" transform="rotate(45 100 20)" stroke="currentColor" strokeWidth="1" opacity="0.4" />
          <rect x="76" y="-4" width="48" height="48" rx="6" stroke="currentColor" strokeWidth="1" opacity="0.4" />
        </svg>

        <div className={`mushaf-inner-frame ${isEffectivePractice ? 'is-practice-mode' : 'is-reading-mode'}`}>
          <div
            className={`mushaf-book-spread ${mushafPageLayout === 'single' ? 'is-single-page' : ''}`}
            aria-label={
              mushafPageLayout === 'single'
                ? `المصحف الشريف - صفحة ${toArabicDigits(clampedMushafPage)}`
                : `المصحف الشريف - صفحتا ${toArabicDigits(rightPageNum)} و ${toArabicDigits(leftPageNum)}`
            }
          >
            {(mushafPageLayout === 'single'
              ? [{ side: 'single' as const, pageNum: clampedMushafPage, pageData: activeSinglePageData }]
              : [
                  { side: 'right' as const, pageNum: rightPageNum, pageData: rightPageData },
                  { side: 'left' as const, pageNum: leftPageNum, pageData: leftPageData },
                ]
            ).map(({ side, pageNum, pageData }) => (
              <article
                key={pageNum}
                className={`mushaf-page-sheet is-${side}-page ${pageNum <= 2 ? 'is-opening-spread' : ''}`}
                aria-label={`صفحة ${toArabicDigits(pageNum)}`}
              >
                <div className="mushaf-page-border-outer">
                  <div className="mushaf-page-border-inner">
                    <header className="mushaf-page-header">
                      <span className="mushaf-page-header-surah">
                        {pageData && pageData.surahNames.length > 0
                          ? pageData.surahNames.length === 1
                            ? `سُورَةُ ${pageData.surahNames[0]}`
                            : pageData.surahNames.join(' · ')
                          : `صفحة ${toArabicDigits(pageNum)}`}
                      </span>
                      <span className="mushaf-page-header-juz">
                        الجزء {toArabicDigits(pageData?.jozz || currentJozz)}
                      </span>
                    </header>

                    <div className={`mushaf-page-body ${pageNum <= 2 ? 'is-opening-spread' : 'is-standard-page'}`}>
                      {pageData ? (
                        pageData.rows.map((row) => {
                          if (row.kind === 'banner') {
                            const seg = row.surahMeta;
                            return (
                              <div
                                key={`${pageNum}_b_${row.line}_${seg.id}`}
                                className="mushaf-surah-banner"
                                aria-label={`سورة ${seg.name}`}
                              >
                                <div className="mushaf-banner-dashed-inset" aria-hidden="true" />

                                <div className="mushaf-banner-wing is-right">
                                  <div className="mushaf-wing-fill" aria-hidden="true" />
                                  <svg
                                    className="mushaf-wing-arc-svg"
                                    viewBox="0 0 28 60"
                                    preserveAspectRatio="none"
                                    fill="none"
                                    aria-hidden="true"
                                  >
                                    <path d="M28 0H22C10 2 3 15 3 30C3 45 10 58 22 60H28Z" fill="#EEF3FF" />
                                    <path
                                      d="M25 1.5C11 3.5 3.5 16 3.5 30C3.5 44 11 56.5 25 58.5"
                                      stroke="currentColor"
                                      strokeWidth="1.35"
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                  <svg className="mushaf-wing-star" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                                    <path
                                      d="M10 1.5L12.1 7.9L18.5 10L12.1 12.1L10 18.5L7.9 12.1L1.5 10L7.9 7.9L10 1.5Z"
                                      fill="rgba(59, 130, 246, 0.14)"
                                      stroke="currentColor"
                                      strokeWidth="1.4"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                  <span className="mushaf-wing-text">{seg.rev}</span>
                                </div>

                                <div className="mushaf-surah-center">
                                  <svg className="mushaf-center-asterisk" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                                    <path
                                      d="M9 1.5V16.5M1.5 9H16.5M3.7 3.7L14.3 14.3M14.3 3.7L3.7 14.3"
                                      stroke="currentColor"
                                      strokeWidth="1.35"
                                      strokeLinecap="round"
                                    />
                                    <circle cx="9" cy="9" r="1.6" fill="#FFFFFF" stroke="currentColor" strokeWidth="1.1" />
                                  </svg>
                                  <span className="mushaf-surah-title">سُورَةُ {seg.name}</span>
                                  <svg className="mushaf-center-asterisk" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                                    <path
                                      d="M9 1.5V16.5M1.5 9H16.5M3.7 3.7L14.3 14.3M14.3 3.7L3.7 14.3"
                                      stroke="currentColor"
                                      strokeWidth="1.35"
                                      strokeLinecap="round"
                                    />
                                    <circle cx="9" cy="9" r="1.6" fill="#FFFFFF" stroke="currentColor" strokeWidth="1.1" />
                                  </svg>
                                </div>

                                <div className="mushaf-banner-wing is-left">
                                  <div className="mushaf-wing-fill" aria-hidden="true" />
                                  <svg
                                    className="mushaf-wing-arc-svg"
                                    viewBox="0 0 28 60"
                                    preserveAspectRatio="none"
                                    fill="none"
                                    aria-hidden="true"
                                  >
                                    <path d="M0 0H6C18 2 25 15 25 30C25 45 18 58 6 60H0Z" fill="#EEF3FF" />
                                    <path
                                      d="M3 1.5C17 3.5 24.5 16 24.5 30C24.5 44 17 56.5 3 58.5"
                                      stroke="currentColor"
                                      strokeWidth="1.35"
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                  <span className="mushaf-wing-text">آيَاتُهَا</span>
                                  <span
                                    className={`mushaf-wing-ayah-badge ${seg.totalAyat >= 100 ? 'is-triple' : ''}`}
                                    aria-label={`${toArabicDigits(seg.totalAyat)} آية`}
                                  >
                                    <svg className="mushaf-wing-badge-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                      <path
                                        d="M12 1.8L14.8 4.6L18.8 4.6L19.4 8.6L22.2 12L19.4 15.4L18.8 19.4L14.8 19.4L12 22.2L9.2 19.4L5.2 19.4L4.6 15.4L1.8 12L4.6 8.6L5.2 4.6L9.2 4.6L12 1.8Z"
                                        fill="#FFFFFF"
                                        stroke="currentColor"
                                        strokeWidth="1.35"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                    <span className="mushaf-wing-badge-num">{toArabicDigits(seg.totalAyat)}</span>
                                  </span>
                                  <svg className="mushaf-wing-star" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                                    <path
                                      d="M10 1.5L12.1 7.9L18.5 10L12.1 12.1L10 18.5L7.9 12.1L1.5 10L7.9 7.9L10 1.5Z"
                                      fill="rgba(59, 130, 246, 0.14)"
                                      stroke="currentColor"
                                      strokeWidth="1.4"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                </div>
                              </div>
                            );
                          }

                          if (row.kind === 'basmalah') {
                            return (
                              <div
                                key={`${pageNum}_m_${row.line}_${row.surahId}`}
                                className="mushaf-basmalah"
                                aria-hidden="true"
                              >
                                بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ
                              </div>
                            );
                          }

                          return (
                            <MushafLineRow
                              key={`${pageNum}_t_${row.line}`}
                              items={row.items}
                              isCentered={row.isCentered}
                              isPractice={isEffectivePractice}
                              isTajweedEnabled={mushafTajweed}
                              correctMap={surahCorrectMap}
                              revealed={surahRevealed}
                              wrongKey={surahWrongKey}
                              onLetterClick={handleSurahLetterClick}
                              toArabicDigits={toArabicDigits}
                            />
                          );
                        })
                      ) : (
                        <div className="mushaf-page-loading">جارٍ تحميل صفحات المصحف الشريف...</div>
                      )}
                    </div>

                    <footer className="mushaf-page-footer">
                      <span className="mushaf-page-footer-flourish" aria-hidden="true">✦</span>
                      <span className="mushaf-page-footer-num">{toArabicDigits(pageNum)}</span>
                      <span className="mushaf-page-footer-flourish" aria-hidden="true">✦</span>
                    </footer>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {mushafTajweed && (
            <div className="mushaf-tajweed-legend" aria-label="دليل ألوان أحكام التجويد">
              {TAJWEED_LEGEND.map((item) => (
                <span key={item.kind} className="mushaf-tajweed-chip">
                  <span
                    className="mushaf-tajweed-dot"
                    style={{ backgroundColor: item.color }}
                    aria-hidden="true"
                  />
                  <span className="mushaf-tajweed-label" style={{ color: item.color }}>
                    {item.label}
                  </span>
                </span>
              ))}
            </div>
          )}

          <div className="mushaf-pagination-bar" role="navigation" aria-label="تصفح صفحات المصحف">
            <button
              type="button"
              className="mushaf-page-btn"
              disabled={mushafPageLayout === 'single' ? clampedMushafPage <= 1 : safeSpreadIndex <= 0}
              onClick={() => handleStepMushafPage(-1)}
            >
              <ChevronRight className="w-4 h-4" strokeWidth={2.4} />
              <span>{mushafPageLayout === 'single' ? 'الصفحة السابقة' : 'الصفحتان السابقتان'}</span>
            </button>

            <div className="mushaf-page-jump">
              {mushafPageLayout === 'single' ? (
                <select
                  className="mushaf-page-select"
                  aria-label="اختر صفحة المصحف"
                  value={clampedMushafPage}
                  onChange={(e) => handleJumpToPage(Number(e.target.value))}
                >
                  {Array.from({ length: TOTAL_MUSHAF_PAGES }, (_, idx) => {
                    const pNum = idx + 1;
                    const pSurah = getPageSurahNames(mushafDataset?.pages[pNum - 1])[0];
                    return (
                      <option key={pNum} value={pNum}>
                        صفحة {toArabicDigits(pNum)}
                        {pSurah ? ` (${pSurah})` : ''}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <select
                  className="mushaf-page-select"
                  aria-label="اختر فتحة المصحف"
                  value={safeSpreadIndex}
                  onChange={(e) => handleChangeSpread(Number(e.target.value))}
                >
                  {Array.from({ length: TOTAL_MUSHAF_SPREADS }, (_, sIdx) => {
                    const rNum = sIdx * 2 + 1;
                    const lNum = sIdx * 2 + 2;
                    const rSurah = getPageSurahNames(mushafDataset?.pages[rNum - 1])[0];
                    return (
                      <option key={sIdx} value={sIdx}>
                        صفحة {toArabicDigits(rNum)} – {toArabicDigits(lNum)}
                        {rSurah ? ` (${rSurah})` : ''}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>

            <button
              type="button"
              className="mushaf-page-btn"
              disabled={
                mushafPageLayout === 'single'
                  ? clampedMushafPage >= TOTAL_MUSHAF_PAGES
                  : safeSpreadIndex >= TOTAL_MUSHAF_SPREADS - 1
              }
              onClick={() => handleStepMushafPage(1)}
            >
              <span>{mushafPageLayout === 'single' ? 'الصفحة التالية' : 'الصفحتان التاليتان'}</span>
              <ChevronLeft className="w-4 h-4" strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </div>

      {isEffectivePractice && surahStatus.msg && (
        <div
          role="status"
          aria-live="polite"
          className={`status-line word-extract-feedback ${
            surahStatus.kind === 'bad' ? 'is-wrong' : 'is-correct-letter'
          }`}
          id="surah-status"
        >
          {surahStatus.kind === 'bad' ? (
            <X className="w-4 h-4 shrink-0" strokeWidth={2.6} />
          ) : (
            <Check className="w-4 h-4 shrink-0" strokeWidth={2.6} />
          )}
          <span>{surahStatus.msg}</span>
        </div>
      )}

      {isEffectivePractice && (
        <div className="controls-row" id="surah-controls">
          <button
            type="button"
            className="btn"
            id="surah-reveal"
            onClick={() => setSurahRevealed(true)}
          >
            إظهار الحل
          </button>
          <button
            type="button"
            className="btn primary"
            id="surah-reset"
            onClick={() => {
              setSurahCorrectMap({});
              setSurahRevealed(false);
              setSurahStatus({ msg: '', kind: null });
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      )}
    </div>
  );
};
