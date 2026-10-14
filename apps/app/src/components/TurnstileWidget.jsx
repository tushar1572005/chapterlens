import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';

/**
 * Cloudflare Turnstile CAPTCHA widget component.
 * Exposes a reset() imperative method to reset the widget after submit or failure.
 */
const TurnstileWidget = forwardRef(function TurnstileWidget(
  {
    siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA',
    onToken,
    onError,
    onExpire,
    className = '',
  },
  ref
) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Imperative handle so parent can reset widget after submit/error
  useImperativeHandle(ref, () => ({
    reset() {
      if (typeof window !== 'undefined' && window.turnstile && widgetIdRef.current !== null) {
        window.turnstile.reset(widgetIdRef.current);
      }
    },
  }));

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Load Turnstile script if not present
    const SCRIPT_ID = 'cf-turnstile-script';
    let script = document.getElementById(SCRIPT_ID);

    const onScriptLoaded = () => {
      setIsLoaded(true);
    };

    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = onScriptLoaded;
      document.head.appendChild(script);
    } else if (window.turnstile) {
      setIsLoaded(true);
    } else {
      script.addEventListener('load', onScriptLoaded);
    }

    return () => {
      if (script) {
        script.removeEventListener('load', onScriptLoaded);
      }
    };
  }, []);

  useEffect(() => {
    if (!isLoaded || !containerRef.current || typeof window === 'undefined' || !window.turnstile) {
      return;
    }

    // Clean up any existing widget before re-rendering
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
        sitekey: siteKey,
        callback: (token) => {
          if (onToken) onToken(token);
        },
        'error-callback': (err) => {
          if (onError) onError(err);
        },
        'expired-callback': () => {
          if (onExpire) onExpire();
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
  }, [isLoaded, siteKey, onToken, onError, onExpire]);

  return (
    <div
      data-testid="turnstile-container"
      ref={containerRef}
      className={`min-h-[65px] flex items-center justify-center ${className}`}
    />
  );
});

export default TurnstileWidget;
