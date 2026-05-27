import React, { useState } from 'react';

interface OutputCardProps {
  title: string;
  content: string | string[];
  icon: string;
  expandable?: boolean;
}

export const OutputCard: React.FC<OutputCardProps> = ({ title, content, icon, expandable = false }) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(!expandable);

  const textToCopy = Array.isArray(content) ? content.join('\n') : content;

  const handleCopy = () => {
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[#1a1a1a] border border-[rgba(218,220,224,0.1)] rounded-2xl overflow-hidden flex flex-col group transition-all hover:border-[rgba(218,220,224,0.2)]">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-white/40">{icon}</span>
          <h3 className="text-[12px] font-medium text-white/90 tracking-wide uppercase">{title}</h3>
        </div>
        <div className="flex items-center gap-1">
          {expandable && (
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 text-white/40 transition-colors"
            >
              <span className={`material-symbols-outlined text-[18px] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>expand_more</span>
            </button>
          )}
          <button 
            onClick={handleCopy}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/5 text-white/40 transition-colors relative"
          >
            <span className="material-symbols-outlined text-[18px]">{copied ? 'check' : 'content_copy'}</span>
          </button>
        </div>
      </div>
      
      {isExpanded && (
        <div className="p-4">
          <div className="text-[13px] leading-relaxed text-white/70 whitespace-pre-wrap select-text">
            {Array.isArray(content) ? (
              <ul className="list-disc pl-4 flex flex-col gap-2">
                {content.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            ) : content}
          </div>
        </div>
      )}
    </div>
  );
};
