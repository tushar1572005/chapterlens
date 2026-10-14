import React from 'react';
import { Award, BookOpen, Layers, FileText } from 'lucide-react';

/**
 * Visual dial/gauge for Flesch Reading Ease score.
 */
function FleschGauge({ score }) {
  // Clamp score between 0 and 100 for gauge display
  const clamped = Math.max(0, Math.min(100, score));
  // Circumference for r=38
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  // Determine color based on readability ease
  let strokeColor = 'text-emerald-500';
  if (score < 30) strokeColor = 'text-rose-500';
  else if (score < 50) strokeColor = 'text-amber-500';
  else if (score < 70) strokeColor = 'text-blue-500';

  return (
    <div className="relative flex items-center justify-center w-28 h-28">
      <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r={radius}
          className="stroke-slate-200 dark:stroke-slate-800"
          strokeWidth="8"
          fill="transparent"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          className={`${strokeColor} transition-all duration-700 ease-out`}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="transparent"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-bold font-mono tracking-tight text-slate-800 dark:text-slate-100">
          {Math.round(score)}
        </span>
        <span className="text-[10px] uppercase font-semibold text-slate-400 dark:text-slate-500">
          Ease
        </span>
      </div>
    </div>
  );
}

/**
 * Readability scorecard displaying score dial, FK grade, label, and document stats.
 *
 * @param {{ result: import('@chapterlens/analyzer').AnalysisResult }} props
 */
export default function ScoreCard({ result }) {
  if (!result) return null;

  const { readability, stats } = result;

  // Color badges for readability label
  const getLabelBadge = (label) => {
    switch (label) {
      case 'Very Easy':
      case 'Easy':
        return 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'Fairly Easy':
      case 'Standard':
        return 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'Fairly Difficult':
        return 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'Difficult':
      case 'Very Difficult':
      default:
        return 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800';
    }
  };

  return (
    <div
      data-testid="score-card"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm transition-colors"
    >
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Left: Gauge + Main Readability Ratings */}
        <div className="flex flex-col sm:flex-row items-center gap-6 w-full md:w-auto">
          <FleschGauge score={readability.fleschRE} />

          <div className="text-center sm:text-left space-y-1.5">
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <span
                data-testid="readability-label"
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${getLabelBadge(
                  readability.label
                )}`}
              >
                {readability.label}
              </span>
            </div>

            <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Grade {readability.fkGrade}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
              Flesch-Kincaid Grade Level represents required US education years to comprehend comfortably.
            </p>
          </div>
        </div>

        {/* Right: Quick Document Stats */}
        <div className="grid grid-cols-3 gap-3 w-full md:w-auto border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-800 pt-4 md:pt-0 md:pl-6">
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-center">
            <div className="flex items-center justify-center text-slate-400 mb-1">
              <FileText className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-lg font-bold font-mono text-slate-800 dark:text-slate-200">
              {stats.words.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              Words
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-center">
            <div className="flex items-center justify-center text-slate-400 mb-1">
              <BookOpen className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-lg font-bold font-mono text-slate-800 dark:text-slate-200">
              {stats.sentences.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              Sentences
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-center">
            <div className="flex items-center justify-center text-slate-400 mb-1">
              <Layers className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-lg font-bold font-mono text-slate-800 dark:text-slate-200">
              {stats.paragraphs.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              Paragraphs
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
