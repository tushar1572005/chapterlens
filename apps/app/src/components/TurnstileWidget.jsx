import React, {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useState,
} from 'react';
import { AlertCircle } from 'lucide-react';

export const DUMMY_TURNSTILE_SITE_KEY = '1x00000000000000000000AA';

/**
 * Resolves the effective Turnstile site key.
 * Throws in production if missing or set to Cloudflare's dummy test key.
 */
export function resolveTurnstileSiteKey(customKey) {
  const isProd = Boolean(import.meta.env?.PROD);
  const key = customKey || import.meta.env?.VITE_TURNSTILE_SITE_KEY;

  if (isProd) {
    if (!key || key === DUMMY_TURNSTILE_SITE_KEY) {
      throw new Error(
        'Production deployment requires a valid VITE_TURNSTILE_SITE_KEY. Dummy Turnstile keys are prohibited in production.'
      );
    }
    return key;
  }

  // Local development only fallback
  return key || DUMMY_TURNSTILE_SITE_KEY;
}

/**
 * Cloudflare Turnstile CAPTCHA widget component.
 * Exposes a reset() imperative method to reset the widget after submit or failure.
 */
const TurnstileWidget = forwardRef(function TurnstileWidget(
  {
    siteKey,
    onToken,
    onError,
    onExpire,
    className = '',
  },
  ref
) {
  const effectiveSiteKey = resolveTurnstileSiteKey(siteKey);
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(
    typeof window !== 'undefined' && Boolean(window.turnstile)
  );
  const [scriptError, setScriptError] = useState(null);

  // Keep latest callbacks in refs to avoid recreating widget when callbacks change
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onTokenRef.current = onToken;
    onErrorRef.current = onError;
    onExpireRef.current = onExpire;
  });

  // Imperative handle so parent can reset widget after submit/error
  useImperativeHandle(ref, () => ({
    reset() {
      if (typeof window !== 'undefined' && window.turnstile && widgetIdRef.current !== null) {
        try {
          window.turnstile.reset(widgetIdRef.current);
        } catch {
          // Ignore reset error
        }
      }
    },
    getWidgetId() {
      return widgetIdRef.current;
    },
  }));

  // Load Turnstile script once and catch load errors
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.turnstile) {
      setIsLoaded(true);
      return;
    }

    const SCRIPT_ID = 'cf-turnstile-script';
    let script = document.getElementById(SCRIPT_ID);

    const onScriptLoaded = () => {
      setIsLoaded(true);
      setScriptError(null);
    };

    const onScriptLoadError = () => {
      const errMsg =
        'Failed to load Cloudflare Turnstile challenge. Please check your network connection or ad blocker.';
      setScriptError(errMsg);
      if (onErrorRef.current) {
        onErrorRef.current(new Error(errMsg));
      }
    };

    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.addEventListener('load', onScriptLoaded);
      script.addEventListener('error', onScriptLoadError);
      document.head.appendChild(script);
    } else {
      script.addEventListener('load', onScriptLoaded);
      script.addEventListener('error', onScriptLoadError);
    }

    return () => {
      if (script) {
        script.removeEventListener('load', onScriptLoaded);
        script.removeEventListener('error', onScriptLoadError);
      }
    };
  }, []);

  // Render Turnstile widget when script is ready and siteKey is resolved.
  // Re-creates ONLY if effectiveSiteKey changes or component unmounts.
  useEffect(() => {
    if (!isLoaded || !containerRef.current || typeof window === 'undefined' || !window.turnstile) {
      return;
    }

    // Clean up any existing widget before rendering
    if (widgetIdRef.current !== null) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {
        // Ignore removal error
      }
      widgetIdRef.current = null;
    }

    try {
      const id = window.turnstile.render(containerRef.current, {
        sitekey: effectiveSiteKey,
        callback: (token) => {
          if (onTokenRef.current) {
            onTokenRef.current(token);
          }
        },
        'error-callback': (err) => {
          if (onErrorRef.current) {
            onErrorRef.current(err);
          }
        },
        'expired-callback': () => {
          if (onExpireRef.current) {
            onExpireRef.current();
          }
        },
        theme: 'auto',
      });
      widgetIdRef.current = id;
    } catch (e) {
      console.warn('Turnstile render warning:', e);
    }

    return () => {
      if (typeof window !== 'undefined' && window.turnstile && widgetIdRef.current !== null) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Ignore
        }
        widgetIdRef.current = null;
      }
    };
  }, [isLoaded, effectiveSiteKey]);

  if (scriptError) {
    return (
      <div
        data-testid="turnstile-error"
        className={`p-3 text-xs rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 flex items-center gap-2 ${className}`}
      >
        <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
        <span>{scriptError}</span>
      </div>
    );
  }

  return (
    <div
      data-testid="turnstile-container"
      ref={containerRef}
      className={`min-h-[65px] flex items-center justify-center ${className}`}
    />
  );
});

export default TurnstileWidget;
