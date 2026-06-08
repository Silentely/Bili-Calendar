export {};

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface AggregateConfigState {
  enabled?: boolean;
  rawSources?: string;
}

interface AggregateConfigResult {
  enabled?: boolean;
  sources?: string[];
  error?: string;
}

interface AggregateConfigApi {
  get(): AggregateConfigState;
  apply(config?: AggregateConfigState): AggregateConfigResult;
}

declare global {
  interface Navigator {
    userLanguage?: string;
    modelContext?: {
      provideContext(context: unknown): void;
    };
  }

  interface Window {
    i18n?: unknown;
    errorHandler?: unknown;
    userGuide?: unknown;
    cacheManager?: unknown;
    animePreview?: unknown;
    notifier?: unknown;
    pushService?: unknown;
    showToast?: (message: string, type?: ToastType, duration?: number) => void;
    toggleTheme?: () => void;
    aggregateConfig?: AggregateConfigApi;
    copyToClipboard?: () => void;
    precheckRate?: (uid: string) => Promise<unknown>;
    handlePreview?: () => Promise<void> | void;
    handleSubscribe?: () => Promise<void> | void;
    cycleLanguage?: () => void;
    currentGenerateCallback?: (() => void) | null;
  }
}
