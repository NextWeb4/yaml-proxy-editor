import type { ProxyProvider } from "../../types/domain";

export const DEFAULT_PROVIDER_DRAFT_NAME = "新订阅";

export interface ProviderSelectionState {
  selectedProviderName?: string;
  subscriptionName: string;
  subscriptionUrl: string;
}

export function createProviderDraftSelection(): ProviderSelectionState {
  return {
    selectedProviderName: undefined,
    subscriptionName: DEFAULT_PROVIDER_DRAFT_NAME,
    subscriptionUrl: "",
  };
}

export function syncProviderSelectionFromYaml(
  providers: ProxyProvider[],
  currentProviderName?: string,
): ProviderSelectionState {
  if (providers.length === 0) {
    return createProviderDraftSelection();
  }

  const provider = providers.find((item) => item.name === currentProviderName) ?? providers[0];
  return {
    selectedProviderName: provider.name,
    subscriptionName: provider.name,
    subscriptionUrl: provider.url ?? "",
  };
}
