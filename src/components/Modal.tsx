import { ReactNode } from 'react';

type ModalProps = {
  open: boolean;
  title?: string;
  children: ReactNode;
  onClose: () => void;
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
  confirmDisabled?: boolean;
  maxWidth?: string;
};

export function Modal({ open, title, children, onClose, onConfirm, confirmText = 'Salvar', cancelText = 'Cancelar', confirmDisabled, maxWidth = 'max-w-lg' }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative bg-white rounded-lg shadow-lg w-full ${maxWidth} border border-slate-200 max-h-[85vh] flex flex-col`}>
        {title && <div className="px-4 py-3 border-b border-slate-200 text-slate-900 font-semibold text-sm">{title}</div>}
        <div className="p-4 overflow-y-auto flex-1 min-h-0">
          {children}
        </div>
        <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded bg-slate-200 text-slate-800 text-sm">{cancelText}</button>
          {onConfirm && (
            <button onClick={onConfirm} disabled={Boolean(confirmDisabled)} className="px-3 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">{confirmText}</button>
          )}
        </div>
      </div>
    </div>
  );
}
