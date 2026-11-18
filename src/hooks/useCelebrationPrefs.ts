import { useSettings } from './useData';

export function useCelebrationsEnabled(): boolean {
  return useSettings()?.celebrationsEnabled ?? true;
}
