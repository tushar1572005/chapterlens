import { useMutation } from '@tanstack/react-query';
import { requestAiReview } from '../lib/api.js';

/**
 * TanStack Query hook wrapper for calling the AI Review API.
 */
export function useAiReview() {
  const mutation = useMutation({
    mutationFn: requestAiReview,
  });

  return {
    reviewData: mutation.data && !mutation.data.limited ? mutation.data : null,
    isLimited: Boolean(mutation.data?.limited),
    limitMessage: mutation.data?.message || null,
    isReviewing: mutation.isPending,
    error: mutation.error ? mutation.error.message : null,
    requestReview: mutation.mutateAsync,
    resetReview: mutation.reset,
  };
}
