import { useState, useRef, useEffect, useCallback } from 'react';
import { analyze } from '@chapterlens/analyzer';

/**
 * Hook to bridge React components with the analyzer Web Worker.
 * Offloads syllable counting and difficulty scoring off the main thread.
 * Gracefully falls back to synchronous analysis in non-Worker environments (such as jsdom).
 */
export function useAnalyzer() {
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const workerRef = useRef(null);
  const pendingRequests = useRef(new Map());
  const messageIdCounter = useRef(0);

  useEffect(() => {
    // Only instantiate Web Worker if Worker is available in environment
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        const worker = new Worker(
          new URL('../worker/analyzer.worker.js', import.meta.url),
          { type: 'module' }
        );

        worker.onmessage = (event) => {
          const { id, success, result: workerResult, error: workerError } = event.data;
          const promiseCallbacks = pendingRequests.current.get(id);

          if (promiseCallbacks) {
            pendingRequests.current.delete(id);
            if (success) {
              promiseCallbacks.resolve(workerResult);
            } else {
              promiseCallbacks.reject(new Error(workerError || 'Analysis failed'));
            }
          }
        };

        worker.onerror = (err) => {
          console.error('Worker error:', err);
          for (const [, callbacks] of pendingRequests.current) {
            callbacks.reject(new Error('Worker error'));
          }
          pendingRequests.current.clear();
        };

        workerRef.current = worker;
      } catch (e) {
        console.warn('Worker initialization failed, fallback to main thread:', e);
      }
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  const analyzeText = useCallback(async (text) => {
    setIsLoading(true);
    setError(null);

    try {
      let analysisResult;

      if (workerRef.current) {
        const requestId = ++messageIdCounter.current;
        analysisResult = await new Promise((resolve, reject) => {
          pendingRequests.current.set(requestId, { resolve, reject });
          workerRef.current.postMessage({ id: requestId, text });
        });
      } else {
        // Fallback for jsdom/test or environments without Worker
        await new Promise((resolve) => setTimeout(resolve, 0));
        analysisResult = analyze(text);
      }

      setResult(analysisResult);
      setIsLoading(false);
      return analysisResult;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setIsLoading(false);
      throw err;
    }
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    result,
    isLoading,
    error,
    analyzeText,
    clearResult,
  };
}
