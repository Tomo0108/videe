import {useCallback,useEffect,useRef,type ReactNode} from 'react';
import {X} from 'lucide-react';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closed = useRef(false);
  const dismiss = useCallback(() => {
    const dialog = ref.current;
    if (closed.current || !dialog || dialog.hasAttribute('data-leaving')) return;
    if (document.documentElement.dataset.motion === 'off') { closed.current = true; onClose(); return; }
    dialog.setAttribute('data-leaving', '');
    const finish = (event?: AnimationEvent) => {
      if (event && (event.target !== dialog || event.animationName !== 'videe-sheet-out')) return;
      if (closed.current) return;
      closed.current = true;
      window.clearTimeout(timer);
      dialog.removeEventListener('animationend', finish);
      onClose();
    };
    const timer = window.setTimeout(() => finish(), 500);
    dialog.addEventListener('animationend', finish);
  }, [onClose]);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  // Marks a sheet whose content continues below the fold, so a fade hints that it scrolls.
  useEffect(() => {
    const dialog = ref.current!;
    const sync = () => { dialog.toggleAttribute('data-more', dialog.scrollTop + dialog.clientHeight < dialog.scrollHeight - 4); };
    const observer = new ResizeObserver(sync); observer.observe(dialog); for (const child of Array.from(dialog.children)) observer.observe(child);
    const mutations = new MutationObserver(sync); mutations.observe(dialog, { childList: true, subtree: true });
    dialog.addEventListener('scroll', sync, { passive: true }); sync();
    return () => { observer.disconnect(); mutations.disconnect(); dialog.removeEventListener('scroll', sync); };
  }, []);
  return <dialog ref={ref} onCancel={e => { e.preventDefault(); dismiss(); }} onClick={e => { if(e.target === e.currentTarget) {const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dismiss();} }} aria-label={title} className="modal"><div className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label="Close" title="Close" onClick={dismiss}><X size={18} strokeWidth={1.8} aria-hidden="true"/></button></div>{children}</dialog>;
}
