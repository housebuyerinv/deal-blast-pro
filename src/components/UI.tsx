import React, { useState, useRef, useEffect } from 'react';

export const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center px-2 mb-2">
    <span className="text-[11px] font-bold text-white/50 uppercase tracking-wider sidebar-label">
      {children}
    </span>
  </div>
);

export const NavButton: React.FC<{
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
  badge?: number;
  badgeVariant?: 'blue' | 'red';
}> = ({ active, icon, label, onClick, badge, badgeVariant = 'blue' }) => (
  <button
    onClick={onClick}
    className={`relative flex items-center justify-between px-4 py-3 rounded-xl transition-all cursor-pointer group w-full overflow-hidden ${
      active ? 'bg-white/[0.07] text-white' : 'text-white/60 hover:text-white/90 hover:bg-white/[0.03]'
    }`}
  >
    {active && <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${badgeVariant === 'red' && badge ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]'}`} />}
    <div className="flex items-center gap-4">
      <span className={`material-symbols-outlined text-[20px] transition-colors ${active ? (badgeVariant === 'red' && badge ? 'text-red-400' : 'text-blue-400') : 'text-current opacity-40 group-hover:opacity-100'}`}>{icon}</span>
      <span className={`text-[12px] font-bold uppercase transition-colors ${active ? 'text-white' : 'text-white/70'}`}>{label}</span>
    </div>
    {badge !== undefined && badge > 0 && (
      <span className={`${badgeVariant === 'red' ? 'bg-red-500' : 'bg-blue-500'} text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-lg`}>{badge}</span>
    )}
  </button>
);

export const PillButton: React.FC<{
  icon?: React.ReactNode; 
  children: React.ReactNode;
  variant?: 'filled' | 'outline' | 'solid' | 'danger'; 
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit" | "reset";
}> = ({ icon, children, variant = 'filled', onClick, disabled, className = '', type = "button" }) => {
  const base = 'flex items-center gap-2 justify-center w-full h-[40px] rounded-xl font-bold uppercase text-[11px] transition-all cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed select-none active:scale-[0.98] border';
  const variants: Record<string, string> = {
    filled: 'bg-[#1a1a1a] hover:bg-[#252525] border-white/10 text-white px-4',
    outline: 'bg-transparent border-white/20 hover:border-white/40 text-white/80 hover:text-white px-4',
    solid: 'bg-white hover:bg-blue-50 border-white text-black px-4 shadow-[0_10px_30px_rgba(255,255,255,0.1)]',
    danger: 'bg-red-500/10 hover:bg-red-600 border-red-500/40 text-red-500 hover:text-white px-4',
  };
  return (
    <button type={type} className={`${base} ${variants[variant]} ${className}`} onClick={onClick} disabled={disabled}>
      {icon && <span className="flex items-center justify-center">{icon}</span>}
      <span>{children}</span>
    </button>
  );
};

function useOnClickOutside(ref: React.RefObject<HTMLElement | null>, handler: (e: MouseEvent | TouchEvent) => void) {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) return;
      handler(event);
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => { 
      document.removeEventListener('mousedown', listener); 
      document.removeEventListener('touchstart', listener); 
    };
  }, [ref, handler]);
}

export const FieldDropdown: React.FC<{
  label: string; 
  value: string; 
  options: string[];
  onChange: (val: string) => void; 
  className?: string;
  error?: boolean;
  required?: boolean;
}> = ({ label, value, options, onChange, className = '', error, required }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOnClickOutside(ref, () => setIsOpen(false));

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button 
        type="button" 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full text-left border ${error ? 'border-red-500/40 ring-1 ring-red-500/10' : 'border-white/15'} hover:border-white/30 transition-all rounded-xl flex flex-col gap-0 justify-center pb-2.5 pl-4 pr-1 pt-1.5 select-none focus:outline-none bg-black/40 min-h-[52px] group`}
      >
        <p className={`text-[10px] font-bold uppercase tracking-tight transition-colors ${error ? 'text-red-400' : 'text-white/40 group-hover:text-blue-400'}`}>
          {label}
          {required && <span className="text-red-500 ml-1 font-bold">*</span>}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-white truncate pr-2 uppercase">{value || 'Select...'}</span>
          <span className={`material-symbols-outlined text-[20px] text-white/30 mr-1 transition-transform ${isOpen ? 'rotate-180' : ''}`}>keyboard_arrow_down</span>
        </div>
      </button>
      {isOpen && (
        <div className="absolute z-[9999] top-[calc(100%+8px)] left-0 w-full bg-[#0f1117] border border-white/15 rounded-2xl overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.8)] backdrop-blur-3xl animate-fade-in origin-top">
          <div className="max-h-64 overflow-y-auto py-1">
            {options.map((opt) => (
              <button 
                key={opt} 
                type="button"
                className={`w-full text-left px-5 py-3.5 text-[12px] font-bold hover:bg-white/[0.04] transition-colors border-b border-white/5 last:border-0 uppercase ${value === opt ? 'bg-blue-500/10 text-blue-400' : 'text-white/70'}`}
                onClick={() => { onChange(opt); setIsOpen(false); }}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const DragNumberField: React.FC<{
  label: string; 
  value: number | string; 
  min?: number; 
  max?: number;
  step?: number; 
  suffix?: string; 
  onChange: (val: number | string) => void; 
  className?: string;
  error?: boolean;
  required?: boolean;
}> = ({ label, value, min = 0, max = 999999999, step = 1, suffix = '', onChange, className = '', error, required }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ startY: number; startVal: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (!isEditing) setEditValue(String(value ?? ""));
  }, [value, isEditing]);

  const numValue = typeof value === 'string' 
    ? parseFloat(value.replace(/[^0-9.]/g, '')) || 0 
    : (Number(value) || 0);

  const commitEdit = (raw: string) => {
    if (raw === "") {
      onChange(""); 
      setIsEditing(false);
      return;
    }
    
    const parsed = parseFloat(raw.replace(/[^0-9.]/g, ''));
    if (!isNaN(parsed)) {
      const final = Math.min(max, Math.max(min, parsed));
      onChange(final);
    }
    setIsEditing(false);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isEditing) return;
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startVal: numValue, moved: false };
    
    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      if (Math.abs(ev.clientY - dragRef.current.startY) > 3) dragRef.current.moved = true;
      if (dragRef.current.moved) {
        const delta = dragRef.current.startY - ev.clientY;
        const newVal = Math.round((dragRef.current.startVal + delta * step) / step) * step;
        onChange(Math.min(max, Math.max(min, newVal)));
        document.body.style.cursor = 'ns-resize';
      }
    };
    
    const handleMouseUp = () => {
      const wasDrag = dragRef.current?.moved;
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      if (!wasDrag) {
        setEditValue(String(value ?? ""));
        setIsEditing(true);
        setTimeout(() => inputRef.current?.select(), 0);
      }
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const formatDisplay = (val: string | number) => {
    if (val === "" || val === undefined) return "Not Provided";
    const n = typeof val === 'string' ? parseFloat(val.replace(/[^0-9.]/g, '')) : val;
    if (isNaN(n)) return "Not Provided";
    
    const hasDecimal = String(n).includes('.');
    const formatted = n.toLocaleString(undefined, {
      minimumFractionDigits: hasDecimal ? 2 : 0,
      maximumFractionDigits: 5
    });

    return suffix === '$' ? `$${formatted}` : `${formatted}${suffix}`;
  };

  return (
    <div className={`border ${error ? 'border-red-500/40 ring-1 ring-red-500/10' : 'border-white/15'} hover:border-white/30 rounded-xl flex flex-col gap-0 justify-center pb-2.5 pl-4 pr-1 pt-1.5 select-none transition-all min-h-[52px] bg-black/40 ${isEditing ? 'border-blue-500 ring-2 ring-blue-500/10' : 'cursor-ns-resize'} ${className}`}
      onMouseDown={handleMouseDown}>
      <p className={`text-[10px] font-bold uppercase tracking-tight transition-colors ${error ? 'text-red-400' : 'text-white/40'}`}>
        {label}
        {required && <span className="text-red-500 ml-1 font-bold">*</span>}
      </p>
      <div className="flex items-center justify-between">
        {isEditing ? (
          <input 
            ref={inputRef} 
            type="text" 
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => { 
              if (e.key === 'Enter') commitEdit(editValue); 
              if (e.key === 'Escape') setIsEditing(false); 
            }}
            onBlur={() => commitEdit(editValue)}
            className="bg-transparent text-[14px] font-bold text-white outline-none w-full border-none p-0 m-0" 
            autoFocus 
          />
        ) : (
          <>
            <span className="text-[14px] font-bold text-white cursor-text">
              {formatDisplay(value)}
            </span>
            <div className="flex flex-col items-center mr-1.5 text-white/30">
              <span className="material-symbols-outlined text-[18px]">unfold_more</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export const TextInput: React.FC<{
  label?: string;
  value: string; 
  onChange: (val: string) => void; 
  placeholder?: string;
  className?: string;
  id?: string;
  error?: boolean;
  required?: boolean;
}> = ({ label, value, onChange, placeholder, className = '', id, error, required }) => (
  <div className="flex flex-col gap-2 w-full group" id={id}>
    {label && (
      <p className={`text-[10px] font-bold uppercase tracking-tight px-2 transition-colors ${error ? 'text-red-400' : 'text-white/40 group-hover:text-blue-400'}`}>
        {label}
        {required && <span className="text-red-500 ml-1 font-bold">*</span>}
      </p>
    )}
    <textarea 
      value={value} 
      onChange={(e) => onChange(e.target.value)} 
      placeholder={placeholder}
      className={`border ${error ? 'border-red-500/40 ring-1 ring-red-500/10' : 'border-white/15'} hover:border-white/30 focus:border-blue-500 bg-black/40 rounded-xl w-full h-[50px] px-5 py-3.5 resize-none text-[13px] font-medium text-white placeholder-white/10 focus:outline-none transition-all shadow-inner ${className}`} 
    />
  </div>
);

export const Badge: React.FC<{ 
  children: React.ReactNode; 
  variant?: 'blue' | 'red' | 'green' | 'orange' | 'yellow' | 'gray';
  className?: string;
}> = ({ children, variant = 'gray', className = '' }) => {
  const styles = {
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
    green: 'bg-green-500/10 text-green-400 border-green-500/20',
    orange: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    gray: 'bg-white/5 text-white/50 border-white/10',
  };
  return (
    <span className={`px-2 py-0.5 rounded border text-[9px] font-bold uppercase whitespace-nowrap inline-flex items-center justify-center ${styles[variant]} ${className}`}>
      {children}
    </span>
  );
};

export const Toast: React.FC<{
  message: string | null;
  onClose: () => void;
}> = ({ message, onClose }) => {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(onClose, 3000);
      return () => clearTimeout(timer);
    }
  }, [message, onClose]);
  if (!message) return null;
  return (
    <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[3000] animate-fade-in pointer-events-none">
      <div className="bg-white text-black px-8 py-5 rounded-2xl shadow-[0_40px_100px_rgba(0,0,0,0.8)] flex items-center gap-5 border border-white/20 backdrop-blur-3xl">
        <span className="material-symbols-outlined text-[24px] text-blue-600">verified</span>
        <span className="text-[12px] font-bold uppercase">{message}</span>
      </div>
    </div>
  );
};

export const SegmentedToggle: React.FC<{
  value: string; items: { value: string; label: string; icon?: React.ReactNode }[];
  onChange: (val: string) => void;
}> = ({ value, items, onChange }) => (
  <div className="flex w-full items-center border border-white/10 rounded-2xl overflow-hidden bg-black/40 p-1.5 gap-1.5">
    {items.map((item) => (
      <button key={item.value} type="button" onClick={() => onChange(item.value)}
        className={`flex-1 flex items-center justify-center gap-3 h-[42px] px-4 rounded-xl text-[12px] font-bold uppercase transition-all cursor-pointer ${
          value === item.value ? 'bg-white text-black shadow-2xl' : 'text-white/50 hover:text-white hover:bg-white/[0.03]'
        }`}>
        {item.icon}<span>{item.label}</span>
      </button>
    ))}
  </div>
);

export const AlertBanner: React.FC<{ children: React.ReactNode; variant?: 'info' | 'warning' | 'error'; icon?: string }> = ({ children, variant = 'info', icon }) => {
  const styles = {
    info: 'bg-blue-500/10 border-blue-500/20 text-blue-300',
    warning: 'bg-orange-500/10 border-orange-500/20 text-orange-300',
    error: 'bg-red-500/10 border-red-500/20 text-red-400'
  };
  return (
    <div className={`px-6 py-4 rounded-2xl border flex items-start gap-4 animate-fade-in ${styles[variant]}`}>
       <span className="material-symbols-outlined text-[20px] mt-0.5">{icon || (variant === 'info' ? 'info' : 'report')}</span>
       <p className="text-[12px] font-bold uppercase leading-relaxed">{children}</p>
    </div>
  );
};

export const Card: React.FC<{ children: React.ReactNode; className?: string; onClick?: () => void }> = ({ children, className = '', onClick }) => (
  <div 
    onClick={onClick}
    className={`bg-[#111111] border border-white/10 rounded-3xl p-8 shadow-2xl transition-all ${onClick ? 'cursor-pointer hover:border-white/30 hover:bg-white/[0.01]' : ''} ${className}`}
  >
    {children}
  </div>
);

export const Modal: React.FC<{ isOpen: boolean; onClose: () => void; children: React.ReactNode; title: string; size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' }> = ({ isOpen, onClose, children, title, size = 'md' }) => {
  if (!isOpen) return null;
  const sizes = { 
    sm: 'max-w-sm', 
    md: 'max-w-2xl', 
    lg: 'max-w-5xl', 
    xl: 'max-w-[90vw]',
    full: 'max-w-full'
  };
  
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 lg:p-10">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={onClose} />
      <div className={`relative w-full ${sizes[size]} h-full bg-[#0c0c0c] border border-white/15 rounded-[40px] overflow-hidden shadow-[0_50px_100px_rgba(0,0,0,0.9)] animate-fade-in flex flex-col max-h-[95vh]`}>
        <div className="px-10 py-7 border-b border-white/10 bg-white/[0.01] flex items-center justify-between">
           <h3 className="text-[16px] font-bold text-white uppercase">{title}</h3>
           <button onClick={onClose} className="w-10 h-10 rounded-full flex items-center justify-center text-red-500 hover:text-white transition-all bg-red-500/10 hover:bg-red-600 border border-red-500/30 cursor-pointer">
              <span className="material-symbols-outlined text-[20px]">close</span>
           </button>
        </div>
        <div className="flex-1 overflow-y-auto dark-scrollbar p-10">{children}</div>
      </div>
    </div>
  );
};

export const Table = {
  Root: ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div className={`w-full overflow-x-auto dark-scrollbar ${className}`}>
      <table className="w-full text-left border-collapse min-w-full">{children}</table>
    </div>
  ),
  Header: ({ children }: { children: React.ReactNode }) => (
    <thead className="bg-white/[0.03] border-b border-white/10">{children}</thead>
  ),
  Row: ({ children, className = '', onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) => (
    <tr onClick={onClick} className={`hover:bg-white/[0.01] transition-all border-b border-white/5 last:border-0 ${onClick ? 'cursor-pointer' : ''} ${className}`}>{children}</tr>
  ),
  Head: ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <th className={`px-6 py-5 text-[11px] font-bold text-white/40 uppercase ${className}`}>{children}</th>
  ),
  Cell: ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <td className={`px-6 py-5 text-[13px] text-white/90 ${className}`}>{children}</td>
  )
};

export const SearchBar: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string }> = ({ value, onChange, placeholder = 'Global search...' }) => (
  <div className="relative w-full group">
    <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-white/20 text-[22px] group-hover:text-blue-400 transition-colors">search</span>
    <input 
      type="text" 
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-[56px] bg-black/40 border border-white/15 rounded-2xl pl-14 pr-6 text-[14px] font-medium text-white/90 placeholder-white/10 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all shadow-inner"
    />
  </div>
);

export const StorageBanner: React.FC = () => (
  <div className="w-full bg-yellow-500/10 border-b border-yellow-500/20 py-3 px-8 flex items-center justify-between animate-fade-in relative z-[1000] backdrop-blur-xl">
    <div className="flex items-center gap-4">
      <span className="material-symbols-outlined text-yellow-500 text-[22px]">warning</span>
      <p className="text-[11px] font-bold text-yellow-100/70 uppercase">
        Persistence Restricted: Data exists in temporary session only. Export backup before exit.
      </p>
    </div>
    <Badge variant="yellow" className="!bg-yellow-500 !text-black border-none !px-4">Live Session</Badge>
  </div>
);

export const ConfirmModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
}> = ({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'default' }) => (
  <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
    <div className="flex flex-col gap-6">
      <p className="text-[13px] text-white/70 leading-relaxed italic">{message}</p>
      <div className="flex gap-3">
        <PillButton variant="outline" onClick={onClose} className="flex-1">{cancelLabel}</PillButton>
        <PillButton variant={variant === 'danger' ? 'danger' : 'solid'} onClick={onConfirm} className="flex-1">{confirmLabel}</PillButton>
      </div>
    </div>
  </Modal>
);

export const EmptyState: React.FC<{ icon: string; title: string; message: string }> = ({ icon, title, message }) => (
  <div className="py-20 flex flex-col items-center justify-center opacity-20 text-center animate-fade-in border-2 border-dashed border-white/5 rounded-[40px]">
    <span className="material-symbols-outlined text-[64px] mb-4">{icon}</span>
    <h3 className="text-sm font-black uppercase tracking-[3px] text-white">{title}</h3>
    <p className="text-[11px] mt-2 max-w-[250px] uppercase font-bold">{message}</p>
  </div>
);

export const LoadingSpinner: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <div className="flex items-center justify-center p-4">
    <span className="material-symbols-outlined animate-spin text-blue-500" style={{ fontSize: size }}>refresh</span>
  </div>
);

export const MultiSelectPills: React.FC<{ label: string; options: string[]; selected: string[]; onChange: (vals: string[]) => void }> = ({ label, options, selected, onChange }) => {
  const toggle = (opt: string) => {
    const next = selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt];
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>{label}</SectionLabel>
      <div className="flex flex-wrap gap-1.5 px-2">
        {options.map(opt => (
          <button key={opt} onClick={() => toggle(opt)} className={`px-2.5 py-1.5 rounded-xl text-[9px] font-black uppercase border transition-all ${selected.includes(opt) ? 'bg-blue-600 border-blue-500 text-white shadow-lg' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/30'}`}>{opt}</button>
        ))}
      </div>
    </div>
  );
};

export const StarRating: React.FC<{ rating: number; onChange?: (r: number) => void }> = ({ rating, onChange }) => (
  <div className="flex items-center gap-1">
    {[1, 2, 3, 4, 5].map(i => (
      <button key={i} onClick={() => onChange?.(i)} className={`material-symbols-outlined text-[18px] transition-colors ${i <= rating ? 'text-yellow-400 fill-current' : 'text-white/10'}`}>star</button>
    ))}
  </div>
);

export const Tooltip: React.FC<{ text: string; children: React.ReactNode }> = ({ text, children }) => (
  <div className="group relative">
    {children}
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-[#0f1117] border border-white/10 rounded-lg text-[10px] font-bold text-white uppercase whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-[9999] shadow-2xl">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#0f1117]" />
    </div>
  </div>
);

export const Tabs: React.FC<{ items: { id: string; label: string; icon?: string }[]; activeId: string; onChange: (id: string) => void }> = ({ items, activeId, onChange }) => (
  <div className="flex bg-white/5 p-1 rounded-2xl gap-1 overflow-x-auto no-scrollbar">
    {items.map(item => (
      <button key={item.id} onClick={() => onChange(item.id)} className={`flex-1 flex items-center justify-center gap-2.5 py-2.5 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeId === item.id ? 'bg-white text-black shadow-xl' : 'text-white/40 hover:text-white'}`}>
        {item.icon && <span className="material-symbols-outlined text-[16px]">{item.icon}</span>}
        {item.label}
      </button>
    ))}
  </div>
);
