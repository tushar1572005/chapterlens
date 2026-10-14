import React, { useState, createRef } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TurnstileWidget, { DUMMY_TURNSTILE_SITE_KEY } from '../src/components/TurnstileWidget.jsx';
import AiReviewPanel from '../src/components/AiReviewPanel.jsx';

describe('Turnstile Widget Lifecycle & Stability Regression Tests', () => {
  let mockTurnstile;
  let renderCount;
  let removeCount;
  let resetCount;

  beforeEach(() => {
    vi.restoreAllMocks();
    document.head.innerHTML = '';
    document.body.innerHTML = '';

    renderCount = 0;
    removeCount = 0;
    resetCount = 0;

    mockTurnstile = {
      render: vi.fn((container, options) => {
        renderCount++;
        // Simulate container holding widget
        container.setAttribute('data-turnstile-active', 'true');
        return `widget-${renderCount}`;
      }),
      remove: vi.fn((id) => {
        removeCount++;
      }),
      reset: vi.fn((id) => {
        resetCount++;
      }),
    };

    window.turnstile = mockTurnstile;
  });

  afterEach(() => {
    delete window.turnstile;
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('proves parent re-renders and inline callbacks DO NOT recreate or remove the widget', () => {
    function ParentComponent() {
      const [count, setCount] = useState(0);
      const [text, setText] = useState('initial');

      return (
        <div>
          <button data-testid="bump-count" onClick={() => setCount((c) => c + 1)}>
            Count: {count}
          </button>
          <button data-testid="change-text" onClick={() => setText('updated')}>
            Text: {text}
          </button>
          {/* Inline callback changing reference on every render */}
          <TurnstileWidget
            siteKey="1x00000000000000000000AA"
            onToken={(tok) => console.log(count, tok)}
            onError={() => {}}
            onExpire={() => {}}
          />
        </div>
      );
    }

    render(<ParentComponent />);

    // Initial render
    expect(mockTurnstile.render).toHaveBeenCalledTimes(1);
    expect(mockTurnstile.remove).toHaveBeenCalledTimes(0);

    // Trigger parent re-renders by mutating state
    fireEvent.click(screen.getByTestId('bump-count'));
    expect(screen.getByTestId('bump-count')).toHaveTextContent('Count: 1');

    fireEvent.click(screen.getByTestId('bump-count'));
    expect(screen.getByTestId('bump-count')).toHaveTextContent('Count: 2');

    fireEvent.click(screen.getByTestId('change-text'));
    expect(screen.getByTestId('change-text')).toHaveTextContent('Text: updated');

    // Widget must remain untouched - render count still 1, remove count still 0
    expect(mockTurnstile.render).toHaveBeenCalledTimes(1);
    expect(mockTurnstile.remove).toHaveBeenCalledTimes(0);
  });

  it('proves receiving a successful token callback does NOT recreate or remove the widget', () => {
    let capturedOptions = null;
    mockTurnstile.render.mockImplementation((container, options) => {
      renderCount++;
      capturedOptions = options;
      return 'widget-1';
    });

    function TokenParent() {
      const [token, setToken] = useState('');

      return (
        <div>
          <span data-testid="token-display">{token || 'no-token'}</span>
          <TurnstileWidget
            siteKey="1x00000000000000000000AA"
            onToken={(tok) => setToken(tok)}
          />
        </div>
      );
    }

    render(<TokenParent />);

    expect(mockTurnstile.render).toHaveBeenCalledTimes(1);
    expect(mockTurnstile.remove).toHaveBeenCalledTimes(0);
    expect(screen.getByTestId('token-display')).toHaveTextContent('no-token');

    // Simulate Cloudflare Turnstile issuing a successful token
    act(() => {
      capturedOptions.callback('cf-valid-token-xyz');
    });

    // Parent state updated with token
    expect(screen.getByTestId('token-display')).toHaveTextContent('cf-valid-token-xyz');

    // Widget MUST NOT have been removed or re-rendered
    expect(mockTurnstile.render).toHaveBeenCalledTimes(1);
    expect(mockTurnstile.remove).toHaveBeenCalledTimes(0);
  });

  it('proves privacy acknowledgment and token reception in AiReviewPanel keep the widget stable', async () => {
    let capturedOptions = null;
    mockTurnstile.render.mockImplementation((container, options) => {
      renderCount++;
      capturedOptions = options;
      return 'widget-ai-1';
    });

    const mockSentences = [
      {
        id: 's0',
        text: 'A very difficult and intricate sentence for readability analysis.',
        metrics: { words: 9, avgSyllables: 2.0, longWords: 3, commas: 0 },
        score: 40.0,
        tooLongForAi: false,
      },
    ];

    const mockOnReview = vi.fn().mockResolvedValue({
      summary: '1 sentence improved',
      sentences: [],
    });

    render(<AiReviewPanel sentences={mockSentences} onReview={mockOnReview} />);

    // Initial render mounts Turnstile once
    expect(mockTurnstile.render).toHaveBeenCalledTimes(1);
    expect(mockTurnstile.remove).toHaveBeenCalledTimes(0);

    // Toggle privacy acknowledgment checkbox
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    // Widget is still stable
    expect(mockTurnstile.render).toHaveBeenCalledTimes(1);
    expect(mockTurnstile.remove).toHaveBeenCalledTimes(0);

    // Deliver turnstile token
    act(() => {
      capturedOptions.callback('valid-turnstile-token');
    });

    // Button should now be active
    const submitBtn = screen.getByRole('button', { name: /Get Verified Rewrites/i });
    expect(submitBtn).not.toBeDisabled();

    // Widget remains stable after token arrival
    expect(mockTurnstile.render).toHaveBeenCalledTimes(1);
    expect(mockTurnstile.remove).toHaveBeenCalledTimes(0);

    // Click submit to run review
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(mockOnReview).toHaveBeenCalledWith({
      sentences: [
        {
          id: 's0',
          text: 'A very difficult and intricate sentence for readability analysis.',
          context: '',
        },
      ],
      turnstileToken: 'valid-turnstile-token',
    });

    // Reset method must be called after review attempt finishes
    expect(mockTurnstile.reset).toHaveBeenCalledWith('widget-ai-1');
  });

  it('keeps callback handlers current using refs without recreating the widget', () => {
    let capturedOptions = null;
    mockTurnstile.render.mockImplementation((container, options) => {
      renderCount++;
      capturedOptions = options;
      return 'widget-ref-1';
    });

    const firstHandler = vi.fn();
    const secondHandler = vi.fn();

    const { rerender } = render(
      <TurnstileWidget siteKey="1x00000000000000000000AA" onToken={firstHandler} />
    );

    expect(mockTurnstile.render).toHaveBeenCalledTimes(1);

    // Re-render with new callback reference
    rerender(<TurnstileWidget siteKey="1x00000000000000000000AA" onToken={secondHandler} />);

    expect(mockTurnstile.render).toHaveBeenCalledTimes(1);
    expect(mockTurnstile.remove).toHaveBeenCalledTimes(0);

    // Trigger token callback
    act(() => {
      capturedOptions.callback('sample-token');
    });

    // The second (latest) handler must be called, not the stale first handler
    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledWith('sample-token');
  });

  it('recreates the widget if and only if the effective site key changes or on unmount', () => {
    const { rerender, unmount } = render(
      <TurnstileWidget siteKey="1x00000000000000000000AA" />
    );

    expect(mockTurnstile.render).toHaveBeenCalledTimes(1);
    expect(mockTurnstile.remove).toHaveBeenCalledTimes(0);

    // Same siteKey prop -> no recreation
    rerender(<TurnstileWidget siteKey="1x00000000000000000000AA" />);
    expect(mockTurnstile.render).toHaveBeenCalledTimes(1);
    expect(mockTurnstile.remove).toHaveBeenCalledTimes(0);

    // Change siteKey prop -> removes previous widget and renders new widget
    rerender(<TurnstileWidget siteKey="2x00000000000000000000BB" />);
    expect(mockTurnstile.remove).toHaveBeenCalledWith('widget-1');
    expect(mockTurnstile.render).toHaveBeenCalledTimes(2);

    // Unmount -> clean up widget
    unmount();
    expect(mockTurnstile.remove).toHaveBeenCalledWith('widget-2');
  });

  it('shows helpful error message when Turnstile script fails to load', () => {
    delete window.turnstile; // Script not yet loaded

    const onErrorMock = vi.fn();
    render(
      <TurnstileWidget
        siteKey="1x00000000000000000000AA"
        onError={onErrorMock}
      />
    );

    const script = document.getElementById('cf-turnstile-script');
    expect(script).not.toBeNull();

    // Dispatch error on the script
    act(() => {
      script.dispatchEvent(new Event('error'));
    });

    // Error banner is displayed
    const errorEl = screen.getByTestId('turnstile-error');
    expect(errorEl).toBeInTheDocument();
    expect(errorEl).toHaveTextContent(/Failed to load Cloudflare Turnstile challenge/i);
    expect(onErrorMock).toHaveBeenCalled();
  });

  it('loads Turnstile script only once across multiple widget mounts', () => {
    delete window.turnstile;

    render(
      <div>
        <TurnstileWidget siteKey="1x00000000000000000000AA" />
        <TurnstileWidget siteKey="1x00000000000000000000AA" />
      </div>
    );

    const scripts = document.querySelectorAll('#cf-turnstile-script');
    expect(scripts.length).toBe(1);
  });
});
