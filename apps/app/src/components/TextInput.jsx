import React from 'react';
import { BookOpen, Sparkles, Trash2, AlertCircle } from 'lucide-react';

export const MAX_CHARS = 200000;

/**
 * Text input component for pasting chapter content with length guards.
 *
 * @param {{
 *   value: string,
 *   onChange: (val: string) => void,
 *   onAnalyze: () => void,
 *   isLoading: boolean,
 *   onLoadSample?: () => void
 * }} props
 */
export default function TextInput({
  value = '',
  onChange,
  onAnalyze,
  isLoading = false,
  onLoadSample,
}) {
  const charCount = value.length;
  const isOverLimit = charCount > MAX_CHARS;
  const isEmpty = value.trim().length === 0;
  const isButtonDisabled = isEmpty || isOverLimit || isLoading;

  const handleClear = () => {
    if (onChange) onChange('');
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm transition-colors">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <label htmlFor="chapter-input" className="font-semibold text-slate-800 dark:text-slate-200">
            Paste Chapter
          </label>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {onLoadSample && (
            <button
              type="button"
              onClick={onLoadSample}
              disabled={isLoading}
              className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium px-2 py-1 rounded hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition cursor-pointer"
            >
              Load Sample Chapter
            </button>
          )}

          {charCount > 0 && (
            <button
              type="button"
              onClick={handleClear}
              disabled={isLoading}
              title="Clear text"
              aria-label="Clear text"
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="relative">
        <textarea
          id="chapter-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste your chapter text here to check readability and pinpoint the 5 hardest sentences..."
          rows={10}
          disabled={isLoading}
          className={`w-full rounded-xl border p-4 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 bg-slate-50/50 dark:bg-slate-950/50 focus:bg-white dark:focus:bg-slate-950 font-normal leading-relaxed text-sm md:text-base outline-none transition-all resize-y min-h-[220px] ${
            isOverLimit
              ? 'border-rose-400 dark:border-rose-600 focus:ring-2 focus:ring-rose-500/20'
              : 'border-slate-200 dark:border-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
          }`}
        />
      </div>

      {isOverLimit && (
        <div
          role="alert"
          className="mt-3 flex items-center gap-2 text-xs md:text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-lg border border-rose-200 dark:border-rose-900/50"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            Text exceeds the maximum length of 200,000 characters. Please trim your chapter to continue.
          </span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs">
          <span
            data-testid="char-count"
            className={`font-mono font-medium ${
              isOverLimit
                ? 'text-rose-600 dark:text-rose-400 font-bold'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters
          </span>
        </div>

        <button
          type="button"
          id="analyze-btn"
          onClick={onAnalyze}
          disabled={isButtonDisabled}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 cursor-pointer ${
            isButtonDisabled
              ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed shadow-none'
              : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white shadow-md shadow-indigo-600/20'
          }`}
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-4 w-4 text-current" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Analyzing...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Analyze Chapter</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
