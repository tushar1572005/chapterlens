import React, { useState, useRef, useCallback } from 'react';
import { Sparkles, Shield, AlertCircle, Copy, Check, Info, Lock } from 'lucide-react';
import TurnstileWidget from './TurnstileWidget.jsx';

/**
 * AI Review panel with Privacy notice acknowledgment, Turnstile CAPTCHA,
 * and display of verified rewrites or "no safe rewrite found" fallback.
 *
 * @param {{
 *   sentences: Array<import('@chapterlens/analyzer').SentenceResult>,
 *   allSentences?: Array<import('@chapterlens/analyzer').SentenceResult>,
 *   onReview: (payload: { sentences: any[], turnstileToken: string }) => Promise<any>,
 *   isReviewing: boolean,
 *   reviewData: any | null,
 *   isLimited: boolean,
 *   limitMessage: string | null,
 *   error: string | null
 * }} props
 */
export default function AiReviewPanel({
  sentences = [],
  allSentences = [],
  onReview,
  isReviewing = false,
  reviewData = null,
  isLimited = false,
  limitMessage = null,
  error = null,
}) {
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const turnstileRef = useRef(null);

  // Stabilize Turnstile event callbacks to avoid unnecessary widget recreations
  const handleTurnstileToken = useCallback((token) => {
    setTurnstileToken(token);
  }, []);

  const handleTurnstileError = useCallback(() => {
    setTurnstileToken('');
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken('');
  }, []);

  // Filter out any sentences marked tooLongForAi (> 2000 chars)
  const eligibleSentences = sentences.filter((s) => !s.tooLongForAi);

  const handleSubmit = async () => {
    if (!privacyAcknowledged || !turnstileToken || isReviewing || eligibleSentences.length === 0) {
      return;
    }

    // Build sentence payload with <= 1 neighbouring sentence of context
    const payloadSentences = eligibleSentences.map((target) => {
      let context = '';
      if (allSentences && allSentences.length > 0) {
        const targetIndex = allSentences.findIndex((s) => s.id === target.id);
        if (targetIndex !== -1) {
          const prev = targetIndex > 0 ? allSentences[targetIndex - 1].text : '';
          const next = targetIndex < allSentences.length - 1 ? allSentences[targetIndex + 1].text : '';
          context = [prev, next].filter(Boolean).join(' ');
        }
      }
      return {
        id: target.id,
        text: target.text,
        context,
      };
    });

    try {
      await onReview({
        sentences: payloadSentences,
        turnstileToken,
      });
    } finally {
      // Rule: Reset Turnstile widget after every submit and on failure
      if (turnstileRef.current) {
        turnstileRef.current.reset();
      }
      setTurnstileToken('');
    }
  };

  const handleCopy = (id, text) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <div
      data-testid="ai-review-panel"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm transition-colors space-y-6"
    >
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-base">
            AI Sentence Rewrites
          </h3>
        </div>
        <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900">
          Verified Quality
        </span>
      </div>

      {/* Capacity Fallback Banner */}
      {isLimited && (
        <div
          role="alert"
          data-testid="capacity-banner"
          className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 flex items-start gap-3"
        >
          <Info className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">Review Quota Notice</p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
              {limitMessage || 'Daily limit reached. Local readability scores remain fully functional.'}
            </p>
          </div>
        </div>
      )}

      {/* Generic Error Banner */}
      {error && !isLimited && (
        <div
          role="alert"
          className="p-4 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 flex items-start gap-3 text-sm"
        >
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-500 mt-0.5" />
          <div>
            <p className="font-semibold">Review Error</p>
            <p className="text-xs text-rose-600 dark:text-rose-300 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Initial state: Privacy Notice + Turnstile + Submit Button */}
      {!reviewData && (
        <div className="space-y-5">
          {/* Privacy Notice Box */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200">
              <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Privacy & Data Protection Notice</span>
            </div>
            <p className="leading-relaxed">
              Your full chapter is analyzed locally in your browser. If you request an AI review, only
              the {eligibleSentences.length} highlighted sentence(s) and their immediate context will be sent
              to the Groq AI service. To avoid redundant AI calls, generated sentence rewrites are cached
              securely for up to 7 days, after which they automatically expire. No other chapter text is retained.
            </p>
            <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
              <input
                type="checkbox"
                id="privacy-ack-checkbox"
                checked={privacyAcknowledged}
                onChange={(e) => setPrivacyAcknowledged(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span className="font-medium text-slate-700 dark:text-slate-200">
                I understand and acknowledge that these sentences will be processed for AI review.
              </span>
            </label>
          </div>

          {/* Turnstile Widget */}
          <div className="flex justify-center">
            <TurnstileWidget
              ref={turnstileRef}
              onToken={handleTurnstileToken}
              onError={handleTurnstileError}
              onExpire={handleTurnstileExpire}
            />
          </div>

          {/* Action Button */}
          <button
            type="button"
            id="get-rewrites-btn"
            onClick={handleSubmit}
            disabled={!privacyAcknowledged || !turnstileToken || isReviewing || eligibleSentences.length === 0}
            className={`w-full py-3 px-4 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
              !privacyAcknowledged || !turnstileToken || isReviewing || eligibleSentences.length === 0
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 active:scale-[0.99]'
            }`}
          >
            {isReviewing ? (
              <>
                <svg className="animate-spin h-4 w-4 text-current" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>Generating Verified Rewrites...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Get Verified Rewrites ({eligibleSentences.length} sentences)</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Results View */}
      {reviewData && (
        <div className="space-y-5 animate-fadeIn">
          {/* Summary Banner */}
          <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-900 text-xs font-medium text-indigo-800 dark:text-indigo-200">
            {reviewData.summary}
          </div>

          {/* Sentence Cards */}
          <div className="space-y-4">
            {reviewData.sentences?.map((item) => {
              const gradeDrop = (item.gradeBefore - item.gradeAfter).toFixed(1);

              return (
                <div
                  key={item.id}
                  data-testid={`review-card-${item.id}`}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-bold text-slate-500">ID: {item.id}</span>
                    <span className="text-slate-400 text-[11px]">{item.whyHard}</span>
                  </div>

                  {/* Original text preview */}
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-serif line-through decoration-slate-300">
                    "{item.original}"
                  </div>

                  {/* Rewrite result */}
                  {item.improved ? (
                    <div className="p-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-900/60 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          Suggested Rewrite
                        </span>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200">
                          Grade {item.gradeBefore} → {item.gradeAfter} (-{gradeDrop})
                        </span>
                      </div>
                      <p className="text-sm font-serif text-slate-900 dark:text-slate-100 leading-relaxed">
                        "{item.rewrite}"
                      </p>
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => handleCopy(item.id, item.rewrite)}
                          className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium px-2 py-1 rounded hover:bg-slate-200/50 dark:hover:bg-slate-800 transition cursor-pointer"
                        >
                          {copiedId === item.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span className="text-emerald-600">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Fallback: no safe rewrite found */
                    <div
                      data-testid={`no-safe-rewrite-${item.id}`}
                      className="p-3 rounded-lg bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 space-y-1.5 text-xs text-amber-800 dark:text-amber-300"
                    >
                      <div className="flex items-center gap-1.5 font-semibold">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-[10px] uppercase font-bold tracking-wider">
                          no safe rewrite found
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-700 dark:text-amber-400">
                        The candidate rewrite did not lower the reading grade by at least 1.0. The original
                        sentence was kept to avoid degrading quality.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
