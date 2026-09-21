import React from 'react';

export default function HallmarkStamp({ alert = false, large = false }) {
  return (
    <div className={`stamp ${large ? 'stamp-lg' : ''} ${alert ? 'is-alert' : ''}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4Z" />
        <path d="m8.5 12 2.3 2.3L15.5 9.5" />
      </svg>
    </div>
  );
}
