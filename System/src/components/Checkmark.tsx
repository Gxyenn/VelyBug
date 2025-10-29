
import React from 'react';

const Checkmark: React.FC = () => {
  return (
    <svg
      className="h-24 w-24 text-green-400"
      viewBox="0 0 52 52"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        className="checkmark__circle"
        cx="26"
        cy="26"
        r="25"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="checkmark__check"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        d="M14.1 27.2l7.1 7.2 16.7-16.8"
      />
      <style>{`
        .checkmark__circle {
          stroke-dasharray: 166;
          stroke-dashoffset: 166;
          animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
        }
        .checkmark__check {
          transform-origin: 50% 50%;
          stroke-dasharray: 48;
          stroke-dashoffset: 48;
          animation: stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.8s forwards;
        }
        @keyframes stroke {
          100% {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </svg>
  );
};

export default Checkmark;
