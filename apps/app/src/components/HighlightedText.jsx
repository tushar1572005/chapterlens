import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Renders pasted text with highlighted <mark> spans for hardest sentences.
 * Built strictly with React text nodes and elements — NO dangerouslySetInnerHTML.
 *
 * @param {{
 *   text: string,
 *   hardest: Array<import('@chapterlens/analyzer').SentenceResult>,
 *   activeSentenceId?: string | null,
 *   onSelectSentence?: (id: string) => void
 * }} props
 */
export default function HighlightedText({
  text = '',
  hardest = [],
  activeSentenceId = null,
  onSelectSentence,
}) {
  if (!text) {
    return null;
  }

  // Create a map of sentence ID to its 1-based rank (hardest is #1)
  const rankMap = new Map();
  hardest.forEach((item, index) => {
    rankMap.set(item.id, index + 1);
  });

  // Sort by start offset for sequential in-text rendering
  const sortedHighlights = [...hardest].sort((a, b) => a.start - b.start);

  const elements = [];
  let currentIndex = 0;

  sortedHighlights.forEach((sentence) => {
    // 1. Text before this highlight
    if (sentence.start > currentIndex) {
      elements.push(
        <React.Fragment key={`text-${currentIndex}`}>
          {text.slice(currentIndex, sentence.start)}
        </React.Fragment>
      );
    }

    const rank = rankMap.get(sentence.id) || 1;
    const isActive = activeSentenceId === sentence.id;
    const sentenceSlice = text.slice(sentence.start, sentence.end);

    // 2. The highlighted sentence <mark>
    elements.push(
      <mark
        key={`mark-${sentence.id}`}
        id={`mark-${sentence.id}`}
        onClick={() => onSelectSentence && onSelectSentence(sentence.id)}
        className={`inline rounded px-1.5 py-0.5 my-0.5 text-inherit transition-all duration-200 cursor-pointer ${
          isActive
            ? 'bg-amber-300 dark:bg-amber-700/60 ring-2 ring-indigo-500 shadow-sm'
            : 'bg-amber-100/90 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-800/50'
        } border-b-2 ${
          isActive
            ? 'border-indigo-600 dark:border-indigo-400'
            : 'border-amber-400 dark:border-amber-600'
        }`}
      >
        <span
          className={`inline-flex items-center justify-center text-[10px] font-bold font-mono px-1.5 py-0.2 mr-1 rounded ${
            isActive
              ? 'bg-indigo-600 text-white'
              : 'bg-amber-500 text-white dark:bg-amber-600'
          }`}
        >
          #{rank}
        </span>
        <span>{sentenceSlice}</span>
        {sentence.tooLongForAi && (
          <span
            data-testid={`badge-too-long-${sentence.id}`}
            className="inline-flex items-center gap-1 ml-1.5 text-[10px] font-medium px-1.5 py-0.5 bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 rounded border border-rose-300 dark:border-rose-800"
          >
            <AlertTriangle className="w-3 h-3" />
            too long for AI review
          </span>
        )}
      </mark>
    );

    currentIndex = sentence.end;
  });

  // 3. Trailing text after the last highlight
  if (currentIndex < text.length) {
    elements.push(
      <React.Fragment key={`text-${currentIndex}`}>
        {text.slice(currentIndex)}
      </React.Fragment>
    );
  }

  return (
    <div
      data-testid="highlighted-text"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm transition-colors"
    >
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
        <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
          Chapter Text with Hardest Sentences Highlighted
        </h3>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          Click any highlight to focus card
        </span>
      </div>

      <div className="text-slate-700 dark:text-slate-300 leading-relaxed font-serif text-base whitespace-pre-wrap selection:bg-indigo-100 dark:selection:bg-indigo-900/50">
        {elements}
      </div>
    </div>
  );
}
