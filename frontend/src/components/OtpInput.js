import React, { useRef, useState, useEffect } from 'react';

// Reusable segmented OTP input: one box per digit, with auto-advance, backspace,
// arrow-key navigation and full-code paste. Controlled via `digits` / `setDigits`
// (an array of single-character strings). Length is inferred from digits.length.
export default function OtpInput({ digits, setDigits, onEnterComplete, disabled, brand = '#223872', autoFocus = true }) {
  const LEN = digits.length;
  const refs = useRef([]);
  const [focused, setFocused] = useState(-1);

  useEffect(() => {
    if (!autoFocus) return;
    const firstEmpty = digits.findIndex((d) => !d);
    const idx = firstEmpty === -1 ? LEN - 1 : firstEmpty;
    const el = refs.current[idx];
    if (el) el.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusIdx = (i) => { const el = refs.current[i]; if (el) el.focus(); };

  const handleChange = (i, e) => {
    const raw = (e.target.value || '').replace(/\D/g, '');
    const next = [...digits];
    if (!raw) { next[i] = ''; setDigits(next); return; }
    let idx = i;
    for (const ch of raw.split('')) {
      if (idx > LEN - 1) break;
      next[idx] = ch; idx++;
    }
    setDigits(next);
    focusIdx(Math.min(idx, LEN - 1));
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace') {
      const next = [...digits];
      if (digits[i]) { next[i] = ''; setDigits(next); }
      else if (i > 0) { next[i - 1] = ''; setDigits(next); focusIdx(i - 1); }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && i > 0) { focusIdx(i - 1); e.preventDefault(); }
    else if (e.key === 'ArrowRight' && i < LEN - 1) { focusIdx(i + 1); e.preventDefault(); }
    else if (e.key === 'Enter') { if (digits.every((d) => d)) onEnterComplete && onEnterComplete(); }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const paste = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, LEN);
    if (!paste) return;
    const next = Array(LEN).fill('');
    paste.split('').forEach((ch, k) => { next[k] = ch; });
    setDigits(next);
    focusIdx(Math.min(paste.length, LEN - 1));
  };

  return (
    <div style={{ display: 'flex', gap: '9px', justifyContent: 'center' }} onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          type="text" inputMode="numeric" maxLength={1} value={d}
          disabled={disabled}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => { setFocused(i); e.target.select(); }}
          onBlur={() => setFocused(-1)}
          style={{
            width: '46px', height: '56px', textAlign: 'center', fontSize: '24px', fontWeight: 700,
            color: brand, background: disabled ? '#f6f7f9' : '#fff',
            border: `2px solid ${focused === i ? brand : d ? '#9db0d6' : '#d5dbe6'}`,
            borderRadius: '10px', outline: 'none',
            boxShadow: focused === i ? '0 0 0 3px rgba(34,56,114,0.12)' : 'none',
            transition: 'border-color .12s, box-shadow .12s',
          }}
        />
      ))}
    </div>
  );
}
