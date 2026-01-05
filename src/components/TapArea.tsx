import React, { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { useTap } from '@/hooks/useTap';

type TapAreaProps = {
  onTap: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
  as?: 'div' | 'button';
  type?: 'button' | 'submit' | 'reset';
};

const TapArea = forwardRef<HTMLElement, TapAreaProps>(
  ({ onTap, disabled = false, className, children, as = 'div', type = 'button' }, ref) => {
    const tap = useTap({ onTap });

    if (as === 'button') {
      return (
        <button
          ref={ref as any}
          type={type}
          disabled={disabled}
          {...tap}
          className={cn(className)}
        >
          {children}
        </button>
      );
    }

    return (
      <div
        ref={ref as any}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        {...tap}
        className={cn(disabled && 'pointer-events-none opacity-50', className)}
      >
        {children}
      </div>
    );
  }
);

TapArea.displayName = 'TapArea';

export default TapArea;
