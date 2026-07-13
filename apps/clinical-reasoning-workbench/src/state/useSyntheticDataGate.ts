import { createContext, useContext } from "react";

export type SyntheticDataGateValue = {
  guardFreeTextEdit: (resume: () => void) => void;
};

export const SyntheticDataGateContext = createContext<
  SyntheticDataGateValue | undefined
>(undefined);

export function useSyntheticDataGate(): SyntheticDataGateValue {
  const context = useContext(SyntheticDataGateContext);
  if (!context) {
    throw new Error(
      "useSyntheticDataGate must be used inside SyntheticDataGateProvider",
    );
  }
  return context;
}
