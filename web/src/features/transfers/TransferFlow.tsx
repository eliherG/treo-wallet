import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { TransferDraft } from './draft';

type Flow = {
  draft: TransferDraft | null;
  save: (value: TransferDraft) => void;
  clear: () => void;
};
const TransferContext = createContext<Flow | null>(null);

/** An unfinished review lives in memory only. It is not a receipt or a persisted transaction. */
export function TransferFlowProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<TransferDraft | null>(null);
  const value = useMemo(() => ({ draft, save: setDraft, clear: () => setDraft(null) }), [draft]);
  return <TransferContext.Provider value={value}>{children}</TransferContext.Provider>;
}
export function useTransferFlow(): Flow {
  const value = useContext(TransferContext);
  if (!value) throw new Error('TransferFlowProvider requerido');
  return value;
}
