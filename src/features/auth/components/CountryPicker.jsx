import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { COUNTRIES } from '../constants/countries';
import './CountryPicker.css';

// Some systems (e.g. Windows) draw flag emoji as two plain letters, which look misaligned.
// Detect it by drawing a flag on a canvas: a real flag has coloured pixels, fallback letters don't.
// (Checking the user agent isn't enough — DevTools device mode on Windows reports Android.)
let flagEmojiSupport = null;
function supportsFlagEmoji() {
  if (flagEmojiSupport !== null) return flagEmojiSupport;
  flagEmojiSupport = false;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 24;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return flagEmojiSupport;
    ctx.textBaseline = 'top';
    ctx.font = '20px sans-serif';
    ctx.fillText('🇮🇳', 0, 0);
    const { data } = ctx.getImageData(0, 0, 24, 24);
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a > 0 && (Math.abs(r - g) > 30 || Math.abs(g - b) > 30 || Math.abs(r - b) > 30)) {
        flagEmojiSupport = true;
        break;
      }
    }
  } catch {
    flagEmojiSupport = false;
  }
  return flagEmojiSupport;
}

function Flag({ country }) {
  if (supportsFlagEmoji()) {
    return <span className="cp-flag" aria-hidden="true">{country.flag}</span>;
  }
  return <span className="cp-flag cp-flag-iso" aria-hidden="true">{country.iso}</span>;
}

/**
 * Country-code picker for the phone field: a trigger showing flag + code and a searchable,
 * keyboard-navigable list. Render it inside a `position: relative` container; the list
 * is positioned against that container so it can span the whole phone field.
 */
export default function CountryPicker({ value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\+/, '');
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.iso.toLowerCase() === q ||
        item.code.replace('+', '').startsWith(q),
    );
  }, [query]);

  const openList = () => {
    if (disabled) return;
    setQuery('');
    setActiveIndex(Math.max(0, COUNTRIES.findIndex((item) => item.iso === value.iso)));
    setOpen(true);
  };

  const closeList = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const choose = (country) => {
    onChange(country);
    closeList();
  };

  // Focus the search box when the list opens — except on touch screens, where the
  // on-screen keyboard would cover the short list.
  useEffect(() => {
    if (!open) return;
    const isTouch = window.matchMedia?.('(pointer: coarse)').matches;
    if (!isTouch) searchRef.current?.focus();
  }, [open]);

  // Close on outside click / tap.
  useEffect(() => {
    if (!open) return undefined;
    const handlePointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointer);
    return () => document.removeEventListener('pointerdown', handlePointer);
  }, [open]);

  // Keep the highlighted option visible while using the arrow keys.
  useEffect(() => {
    if (!open) return;
    const option = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    option?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const handleSearchKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(Math.max(filtered.length - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (filtered[activeIndex]) choose(filtered[activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeList();
    } else if (event.key === 'Tab') {
      closeList(false);
    }
  };

  const handleTriggerKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openList();
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      closeList();
    }
  };

  const activeOptionId = filtered[activeIndex] ? `${listId}-${filtered[activeIndex].iso}` : undefined;

  return (
    <div className="cp-root" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`cp-trigger ${open ? 'open' : ''}`}
        onClick={() => (open ? closeList() : openList())}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Country code: ${value.name} ${value.code}. Change country`}
        disabled={disabled}
      >
        <Flag country={value} />
        <span className="cp-code">{value.code}</span>
        <svg className="cp-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="cp-panel">
          <div className="cp-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search country or code"
              aria-label="Search country"
              aria-controls={listId}
              aria-activedescendant={activeOptionId}
              role="combobox"
              aria-expanded="true"
              autoComplete="off"
            />
          </div>

          <ul className="cp-list" role="listbox" id={listId} ref={listRef} aria-label="Countries">
            {filtered.length === 0 ? (
              <li className="cp-empty">No country found</li>
            ) : (
              filtered.map((item, index) => {
                const selected = item.iso === value.iso;
                return (
                  <li
                    key={item.iso}
                    id={`${listId}-${item.iso}`}
                    data-index={index}
                    role="option"
                    aria-selected={selected}
                    className={`cp-option ${index === activeIndex ? 'active' : ''} ${selected ? 'selected' : ''}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(item)}
                  >
                    <Flag country={item} />
                    <span className="cp-option-name">{item.name}</span>
                    <span className="cp-option-code">{item.code}</span>
                    <svg className="cp-check" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M5 12l4 4L19 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
