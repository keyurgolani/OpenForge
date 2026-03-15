/**
 * useMutationFeedback - Standard mutation feedback hook
 *
 * Provides consistent feedback for mutations (create, update, delete operations)
 * with loading states, success/error notifications, and automatic cache invalidation.
 *
 * Usage:
 *   const { mutate, isLoading, error } = useMutationFeedback({
 *     mutationFn: (data) => api.createItem(data),
 *     successMessage: 'Item created successfully',
 *     errorMessage: 'Failed to create item',
 *     invalidateQueries: [['items']],
 *   });
 */

import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { useToast } from '@/components/shared/ToastProvider';

interface MutationFeedbackOptions<TData, TError, TVariables> extends Omit<UseMutationOptions<TData, TError, TVariables>, 'onSuccess' | 'onError'> {
  /** Success message to show (or function to generate message from result) */
  successMessage?: string | ((data: TData) => string);
  /** Error message to show (or function to generate message from error) */
  errorMessage?: string | ((error: TError) => string);
  /** Query keys to invalidate on success */
  invalidateQueries?: unknown[][];
  /** Callback on success (after toast) */
  onSuccess?: (data: TData, variables: TVariables) => void;
  /** Callback on error (after toast) */
  onError?: (error: TError, variables: TVariables) => void;
}

export function useMutationFeedback<TData = unknown, TError = Error, TVariables = void>(
  options: MutationFeedbackOptions<TData, TError, TVariables>
) {
  const { success, error: showError } = useToast();
  const queryClient = useQueryClient();

  const {
    successMessage,
    errorMessage,
    invalidateQueries,
    onSuccess,
    onError,
    ...mutationOptions
  } = options;

  return useMutation<TData, TError, TVariables>({
    ...mutationOptions,
    onSuccess: (data, variables, context) => {
      // Show success toast
      if (successMessage) {
        const message = typeof successMessage === 'function' ? successMessage(data) : successMessage;
        success(message);
      }

      // Invalidate queries
      if (invalidateQueries) {
        invalidateQueries.forEach((queryKey) => {
          queryClient.invalidateQueries({ queryKey });
        });
      }

      // Call custom success handler
      onSuccess?.(data, variables);
    },
    onError: (err, variables, context) => {
      // Show error toast
      if (errorMessage) {
        const message = typeof errorMessage === 'function' ? errorMessage(err) : errorMessage;
        showError('Operation failed', message);
      }

      // Call custom error handler
      onError?.(err, variables);
    },
  });
}

export default useMutationFeedback;
