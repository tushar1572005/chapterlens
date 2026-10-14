import React, { useState } from 'react';
import { BookOpen, Sparkles, Feather, AlertCircle, RefreshCw } from 'lucide-react';
import TextInput from './components/TextInput.jsx';
import ScoreCard from './components/ScoreCard.jsx';
import HighlightedText from './components/HighlightedText.jsx';
import SentenceList from './components/SentenceList.jsx';
import AiReviewPanel from './components/AiReviewPanel.jsx';
import DarkModeToggle from './components/DarkModeToggle.jsx';
import { useAnalyzer } from './hooks/useAnalyzer.js';
import { useAiReview } from './hooks/useAiReview.js';

export const SAMPLE_CHAPTER = `The ancient library smelled of aged parchment and damp stone. Dr. Hawthorne paused near the towering cedar shelves, closely studying the illuminated manuscript resting upon the podium. For centuries, scholars had debated whether the enigmatic marginalia contained genuine mathematical formulations or merely superstitious astrological commentary.

"Have you discovered the missing cipher yet?" asked his younger apprentice, who was carefully carrying an armful of leather-bound folios across the flagstone floor. The young man's hands were trembling slightly under the tremendous weight of the historical volumes.

Hawthorne did not answer immediately. He adjusted his brass spectacles and traced his finger along a faded Latin inscription that curved along the parchment border. Furthermore, the incomprehensible syntactic density of this particular paragraph, combined with its deliberate grammatical obfuscation, presented an almost insurmountable challenge even to seasoned paleographers.

Outside, the autumn wind whistled through the narrow battlements of the tower. It was getting dark rapidly, and the faint tallow candles cast flickering shadows against the vaulted ceiling. They knew that if the manuscript could not be deciphered before midnight, the secret entrance to the subterranean archives would remain sealed for another generation.`;

export default function App() {
  const [chapterText, setChapterText] = useState('');
  const [activeSentenceId, setActiveSentenceId] = useState(null);
  const { result, isLoading, error: analyzerError, analyzeText, clearResult } = useAnalyzer();
  const {
    reviewData,
    isLimited,
    limitMessage,
    isReviewing,
    error: reviewError,
    requestReview,
    resetReview,
  } = useAiReview();

  const handleAnalyze = async () => {
    if (!chapterText.trim()) return;
    try {
      resetReview();
      await analyzeText(chapterText);
      setActiveSentenceId(null);
    } catch {
      // Error state captured in useAnalyzer
    }
  };

  const handleLoadSample = () => {
    setChapterText(SAMPLE_CHAPTER);
  };

  const handleClear = () => {
    setChapterText('');
    clearResult();
    resetReview();
    setActiveSentenceId(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Top Navbar */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-white/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Feather className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white">
                ChapterLens
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900">
                Readability Checker
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <DarkModeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Intro Banner */}
        <section className="text-center sm:text-left space-y-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Analyze Your Chapter's Readability
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Paste your narrative text below to calculate standard readability scores, view the five hardest sentences, and optionally request verified rewrites.
          </p>
        </section>

        {/* Input Card */}
        <TextInput
          value={chapterText}
          onChange={(val) => {
            setChapterText(val);
            if (!val.trim()) {
              clearResult();
              resetReview();
            }
          }}
          onAnalyze={handleAnalyze}
          isLoading={isLoading}
          onLoadSample={handleLoadSample}
        />

        {/* Error State */}
        {analyzerError && (
          <div
            role="alert"
            data-testid="error-banner"
            className="p-4 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-500 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-semibold">Analysis Failed</p>
              <p className="text-rose-600 dark:text-rose-400 text-xs mt-0.5">{analyzerError}</p>
            </div>
            <button
              onClick={handleAnalyze}
              className="px-3 py-1 text-xs font-medium rounded-lg bg-rose-100 dark:bg-rose-900 text-rose-800 dark:text-rose-200 hover:bg-rose-200 transition"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading State Skeleton */}
        {isLoading && (
          <div
            data-testid="loading-state"
            className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-4 animate-pulse"
          >
            <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-950/60 mx-auto flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <RefreshCw className="w-6 h-6 animate-spin" />
            </div>
            <div className="space-y-2 max-w-sm mx-auto">
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4 mx-auto" />
              <div className="h-3 bg-slate-100 dark:bg-slate-800/60 rounded w-1/2 mx-auto" />
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Counting syllables and ranking difficulty...
            </p>
          </div>
        )}

        {/* Results Section */}
        {result && !isLoading && (
          <div className="space-y-6 animate-fadeIn">
            {/* Score Summary Card */}
            <ScoreCard result={result} />

            {/* Split View: Highlighted Text & Ranked Sentences + AI Review */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-7">
                <HighlightedText
                  text={chapterText}
                  hardest={result.hardest}
                  activeSentenceId={activeSentenceId}
                  onSelectSentence={setActiveSentenceId}
                />
              </div>

              <div className="lg:col-span-5 space-y-6">
                <SentenceList
                  hardest={result.hardest}
                  activeSentenceId={activeSentenceId}
                  onSelectSentence={setActiveSentenceId}
                />

                <AiReviewPanel
                  sentences={result.hardest}
                  allSentences={result.hardest}
                  onReview={requestReview}
                  isReviewing={isReviewing}
                  reviewData={reviewData}
                  isLimited={isLimited}
                  limitMessage={limitMessage}
                  error={reviewError}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
