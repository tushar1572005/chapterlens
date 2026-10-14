import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TextInput, { MAX_CHARS } from '../src/components/TextInput.jsx';
import ScoreCard from '../src/components/ScoreCard.jsx';
import HighlightedText from '../src/components/HighlightedText.jsx';
import SentenceList from '../src/components/SentenceList.jsx';
import DarkModeToggle from '../src/components/DarkModeToggle.jsx';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App, { SAMPLE_CHAPTER } from '../src/App.jsx';

describe('TextInput Component', () => {
  it('renders textarea with empty guard: Analyze button is disabled initially', () => {
    render(<TextInput value="" onChange={() => {}} onAnalyze={() => {}} />);
    const textarea = screen.getByPlaceholderText(/Paste your chapter text here/i);
    const analyzeBtn = screen.getByRole('button', { name: /Analyze Chapter/i });

    expect(textarea).toBeInTheDocument();
    expect(analyzeBtn).toBeDisabled();
  });

  it('enables Analyze button when text is entered', () => {
    render(<TextInput value="Some chapter text here." onChange={() => {}} onAnalyze={() => {}} />);
    const analyzeBtn = screen.getByRole('button', { name: /Analyze Chapter/i });
    expect(analyzeBtn).toBeEnabled();
  });

  it('triggers onAnalyze callback when clicked', async () => {
    const handleAnalyze = vi.fn();
    render(<TextInput value="Valid chapter content" onChange={() => {}} onAnalyze={handleAnalyze} />);
    const analyzeBtn = screen.getByRole('button', { name: /Analyze Chapter/i });

    await userEvent.click(analyzeBtn);
    expect(handleAnalyze).toHaveBeenCalledTimes(1);
  });

  it('enforces max input guard (200,000 chars) and shows friendly alert', () => {
    const longText = 'a'.repeat(MAX_CHARS + 5);
    render(<TextInput value={longText} onChange={() => {}} onAnalyze={() => {}} />);

    const analyzeBtn = screen.getByRole('button', { name: /Analyze Chapter/i });
    expect(analyzeBtn).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/exceeds the maximum length of 200,000 characters/i);
  });

  it('loads sample chapter when onLoadSample is provided and clicked', async () => {
    const handleLoadSample = vi.fn();
    render(
      <TextInput
        value=""
        onChange={() => {}}
        onAnalyze={() => {}}
        onLoadSample={handleLoadSample}
      />
    );
    const loadSampleBtn = screen.getByRole('button', { name: /Load Sample Chapter/i });
    await userEvent.click(loadSampleBtn);
    expect(handleLoadSample).toHaveBeenCalledTimes(1);
  });
});

describe('ScoreCard Component', () => {
  const mockResult = {
    readability: {
      fleschRE: 65.4,
      fkGrade: 8.2,
      label: 'Standard',
    },
    hardest: [],
    stats: {
      words: 450,
      sentences: 24,
      paragraphs: 5,
    },
  };

  it('renders Flesch score, FK grade, qualitative label, and document counts', () => {
    render(<ScoreCard result={mockResult} />);

    expect(screen.getByTestId('score-card')).toBeInTheDocument();
    expect(screen.getByText('65')).toBeInTheDocument();
    expect(screen.getByText('Grade 8.2')).toBeInTheDocument();
    expect(screen.getByTestId('readability-label')).toHaveTextContent('Standard');
    expect(screen.getByText('450')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});

describe('HighlightedText Component', () => {
  const text = 'First simple sentence. Second very complicated and convoluted sentence here. Third ending sentence.';
  const hardest = [
    {
      id: 's1',
      start: 23,
      end: 77,
      text: 'Second very complicated and convoluted sentence here.',
      metrics: { words: 7, avgSyllables: 1.8, longWords: 2, commas: 0 },
      score: 55.4,
      tooLongForAi: false,
    },
  ];

  it('renders mark span with id and rank badge without dangerouslySetInnerHTML', () => {
    render(<HighlightedText text={text} hardest={hardest} />);

    const mark = document.getElementById('mark-s1');
    expect(mark).toBeInTheDocument();
    expect(mark).toHaveTextContent('#1');
    expect(mark).toHaveTextContent('Second very complicated and convoluted sentence here.');
  });

  it('renders "too long for AI review" badge when tooLongForAi is true', () => {
    const hardestWithLong = [
      {
        ...hardest[0],
        tooLongForAi: true,
      },
    ];
    render(<HighlightedText text={text} hardest={hardestWithLong} />);
    expect(screen.getByTestId('badge-too-long-s1')).toBeInTheDocument();
    expect(screen.getByText(/too long for AI review/i)).toBeInTheDocument();
  });
});

describe('SentenceList Component', () => {
  const hardest = [
    {
      id: 's0',
      start: 0,
      end: 60,
      text: 'This is the first difficult sentence with complex language.',
      metrics: { words: 9, avgSyllables: 1.6, longWords: 2, commas: 0 },
      score: 68.5,
      tooLongForAi: false,
    },
  ];

  it('renders sentence cards with metrics and calls onSelectSentence on click', async () => {
    const handleSelect = vi.fn();
    render(<SentenceList hardest={hardest} onSelectSentence={handleSelect} />);

    const card = screen.getByTestId('sentence-card-s0');
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent('Score 68.5');
    expect(card).toHaveTextContent('9 words');

    await userEvent.click(card);
    expect(handleSelect).toHaveBeenCalledWith('s0');
  });
});

describe('DarkModeToggle Component', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('switches between light and dark mode on button click', async () => {
    render(<DarkModeToggle />);
    const btn = screen.getByRole('button', { name: /Switch to (dark|light) mode/i });

    await userEvent.click(btn);
    const isDarkNow = document.documentElement.classList.contains('dark');
    expect(localStorage.getItem('theme')).toBe(isDarkNow ? 'dark' : 'light');

    await userEvent.click(btn);
    expect(document.documentElement.classList.contains('dark')).toBe(!isDarkNow);
  });
});

describe('App Integration', () => {
  it('loads sample chapter and runs analysis successfully', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    );

    const loadSampleBtn = screen.getByRole('button', { name: /Load Sample Chapter/i });
    await userEvent.click(loadSampleBtn);

    const textarea = screen.getByPlaceholderText(/Paste your chapter text here/i);
    expect(textarea.value).toBe(SAMPLE_CHAPTER);

    const analyzeBtn = screen.getByRole('button', { name: /Analyze Chapter/i });
    expect(analyzeBtn).toBeEnabled();

    await userEvent.click(analyzeBtn);

    // After analysis completes, score card and highlighted text render
    expect(await screen.findByTestId('score-card')).toBeInTheDocument();
    expect(screen.getByTestId('highlighted-text')).toBeInTheDocument();
    expect(screen.getByTestId('sentence-list')).toBeInTheDocument();
  });
});
