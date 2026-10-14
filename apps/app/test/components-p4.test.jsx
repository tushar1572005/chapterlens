import React, { createRef } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TurnstileWidget from '../src/components/TurnstileWidget.jsx';
import AiReviewPanel from '../src/components/AiReviewPanel.jsx';

describe('P4 Client Components: Turnstile & AiReviewPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('TurnstileWidget Component', () => {
    it('renders the Turnstile container and exposes reset() method', () => {
      const widgetRef = createRef();
      render(<TurnstileWidget ref={widgetRef} siteKey="1x00000000000000000000AA" />);

      expect(screen.getByTestId('turnstile-container')).toBeInTheDocument();
      expect(widgetRef.current).toHaveProperty('reset');
      expect(typeof widgetRef.current.reset).toBe('function');
      // Calling reset() should not throw even if widget is not fully rendered in jsdom
      expect(() => widgetRef.current.reset()).not.toThrow();
    });
  });

  describe('AiReviewPanel Component', () => {
    const mockSentences = [
      {
        id: 's0',
        text: 'The ancient library was filled with magnificent historical manuscripts.',
        metrics: { words: 9, avgSyllables: 1.8, longWords: 3, commas: 0 },
        score: 62.4,
        tooLongForAi: false,
      },
      {
        id: 's1',
        text: 'An excessively long sentence that should not be sent for review.',
        metrics: { words: 10, avgSyllables: 1.5, longWords: 1, commas: 0 },
        score: 45.0,
        tooLongForAi: true,
      },
    ];

    it('displays privacy notice; review button is disabled until acknowledged', async () => {
      render(<AiReviewPanel sentences={mockSentences} onReview={vi.fn()} />);

      // Privacy Notice is displayed
      expect(screen.getByText(/Privacy & Data Protection Notice/i)).toBeInTheDocument();
      const checkbox = screen.getByRole('checkbox');
      const submitBtn = screen.getByRole('button', { name: /Get Verified Rewrites/i });

      // Initially disabled because privacy not acknowledged and no token
      expect(checkbox).not.toBeChecked();
      expect(submitBtn).toBeDisabled();

      // Check the privacy box
      await userEvent.click(checkbox);
      expect(checkbox).toBeChecked();

      // Still disabled because no Turnstile token yet
      expect(submitBtn).toBeDisabled();
    });

    it('renders capacity fallback banner when isLimited is true', () => {
      render(
        <AiReviewPanel
          sentences={mockSentences}
          onReview={vi.fn()}
          isLimited={true}
          limitMessage="Daily AI review capacity reached. Please try again tomorrow."
        />
      );

      const banner = screen.getByTestId('capacity-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent(/Daily AI review capacity reached/i);
    });

    it('renders suggested rewrite with copy button when improved: true', () => {
      const mockReviewData = {
        summary: '1 of 1 sentences improved by at least one grade level.',
        sentences: [
          {
            id: 's0',
            original: 'The ancient library was filled with magnificent historical manuscripts.',
            whyHard: 'High polysyllabic vocabulary.',
            rewrite: 'The old library was filled with historic books and manuscripts.',
            gradeBefore: 14.5,
            gradeAfter: 8.2,
            improved: true,
          },
        ],
      };

      render(
        <AiReviewPanel
          sentences={mockSentences}
          onReview={vi.fn()}
          reviewData={mockReviewData}
        />
      );

      expect(screen.getByText(mockReviewData.summary)).toBeInTheDocument();
      expect(screen.getByText(/Suggested Rewrite/i)).toBeInTheDocument();
      expect(
        screen.getByText('"The old library was filled with historic books and manuscripts."')
      ).toBeInTheDocument();
      expect(screen.getByText('Grade 14.5 → 8.2 (-6.3)')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Copy/i })).toBeInTheDocument();
    });

    it('renders "no safe rewrite found" badge when improved: false', () => {
      const mockUnimprovedData = {
        summary: '0 of 1 sentences improved by at least one grade level.',
        sentences: [
          {
            id: 's0',
            original: 'The ancient library was filled with magnificent historical manuscripts.',
            whyHard: 'Complex syntax.',
            rewrite: 'The ancient library was filled with magnificent historical manuscripts.',
            gradeBefore: 14.5,
            gradeAfter: 14.5,
            improved: false,
          },
        ],
      };

      render(
        <AiReviewPanel
          sentences={mockSentences}
          onReview={vi.fn()}
          reviewData={mockUnimprovedData}
        />
      );

      const noSafeBadge = screen.getByTestId('no-safe-rewrite-s0');
      expect(noSafeBadge).toBeInTheDocument();
      expect(noSafeBadge).toHaveTextContent(/no safe rewrite found/i);
    });
  });
});
