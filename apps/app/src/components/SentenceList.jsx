import React from 'react';
import { ChevronRight, AlertTriangle, Hash } from 'lucide-react';

/**
 * Renders the ranked list of the 5 hardest sentences.
 * Clicking any sentence card scrolls to its highlighted mark in the chapter text.
 *
 * @param {{
 *   hardest: Array<import('@chapterlens/analyzer').SentenceResult>,
 *   activeSentenceId?: string | null,
 *   onSelectSentence?: (id: string) => void
 * }} props
 */
export default function SentenceList({
  hardest = [],
  activeSentenceId = null,
  onSelectSentence,
}) {
  if (!hardest || hardest.length === 0) {
    return null;
  }

  const handleCardClick = (id) => {
    if (onSelectSentence) {
      onSelectSentence(id);
    }

    // Scroll to the corresponding mark in the highlighted text view
    if (typeof document !== 'undefined') {
      const markElement = document.getElementById(`mark-${id}`);
      if (markElement) {
        markElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  return (
    <div
      data-testid="sentence-list"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm transition-colors"
    >
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
            Top 5 Hardest Sentences
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Ranked by structural complexity, syllable density, and length
          </p>
        </div>
        <span className="text-xs font-mono font-medium px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded">
          {hardest.length} sentences
        </span>
      </div>

      <div className="space-y-3">
        {hardest.map((item, index) => {
          const rank = index + 1;
          const isActive = activeSentenceId === item.id;

          return (
            <div
              key={item.id}
              id={`card-${item.id}`}
              data-testid={`sentence-card-${item.id}`}
              onClick={() => handleCardClick(item.id)}
              className={`p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 ring-2 ring-indigo-500/30'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/40 dark:bg-slate-950/40'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center justify-center text-xs font-bold font-mono px-2 py-0.5 rounded ${
                      rank === 1
                        ? 'bg-rose-500 text-white'
                        : rank === 2
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-700 text-white dark:bg-slate-600'
                    }`}
                  >
                    #{rank}
                  </span>
                  <span className="text-xs font-mono text-slate-400 dark:text-slate-500">
                    ID: {item.id}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="text-xs font-bold font-mono text-slate-800 dark:text-slate-200">
                      Score {item.score}
                    </span>
                    <span className="text-[10px] text-slate-400 block -mt-1">/ 100</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>

              <p className="text-slate-800 dark:text-slate-200 text-sm font-serif leading-relaxed mb-3 line-clamp-3">
                "{item.text}"
              </p>

              {/* Metrics chips */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                <span className="bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700/60">
                  {item.metrics.words} words
                </span>
                <span className="bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700/60">
                  {item.metrics.avgSyllables} syl/word
                </span>
                <span className="bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700/60">
                  {item.metrics.longWords} long words
                </span>
                <span className="bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700/60">
                  {item.metrics.commas} commas
                </span>

                {item.tooLongForAi && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 rounded border border-rose-200 dark:border-rose-900 font-sans font-medium">
                    <AlertTriangle className="w-3 h-3" />
                    too long for AI review
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
