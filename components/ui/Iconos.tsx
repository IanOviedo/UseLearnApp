import type { SVGProps } from "react";

export type PropsIcono = SVGProps<SVGSVGElement>;

// Base común: trazo, sin relleno, hereda el color del texto (currentColor).
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function IconoAjustes({ className = "h-4 w-4" }: PropsIcono) {
  return (
    <svg {...base} className={className}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

export function IconoDocumento({ className = "h-4 w-4" }: PropsIcono) {
  return (
    <svg {...base} className={className}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}

export function IconoDestello({ className = "h-4 w-4" }: PropsIcono) {
  return (
    <svg {...base} className={className}>
      <path d="M11 3l1.5 4.1L16.6 8.6l-4.1 1.5L11 14.2 9.5 10.1 5.4 8.6l4.1-1.5z" />
      <path d="M18 15.5l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" />
    </svg>
  );
}

export function IconoCargador({ className = "h-4 w-4" }: PropsIcono) {
  return (
    <svg {...base} className={`animate-spin ${className}`}>
      <path d="M21 12a9 9 0 1 1-6.2-8.6" />
    </svg>
  );
}

export function IconoPlay({ className = "h-4 w-4" }: PropsIcono) {
  return (
    <svg {...base} className={className}>
      <path d="M7.5 5.2v13.6L19 12z" />
    </svg>
  );
}

export function IconoFlecha({ className = "h-4 w-4" }: PropsIcono) {
  return (
    <svg {...base} className={className}>
      <path d="M4.5 12h14" />
      <path d="m13 6.5 5.5 5.5L13 17.5" />
    </svg>
  );
}

export function IconoChevron({ className = "h-4 w-4" }: PropsIcono) {
  return (
    <svg {...base} className={className}>
      <path d="m9.5 6 6 6-6 6" />
    </svg>
  );
}

export function IconoHistorial({ className = "h-4 w-4" }: PropsIcono) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.2 2" />
    </svg>
  );
}

export function IconoCerrar({ className = "h-4 w-4" }: PropsIcono) {
  return (
    <svg {...base} className={className}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

export function IconoEliminar({ className = "h-4 w-4" }: PropsIcono) {
  return (
    <svg {...base} className={className}>
      <path d="M4.5 7h15" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6.5 7l.9 12a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9l.9-12" />
      <path d="M9.5 7V5.2A1.7 1.7 0 0 1 11.2 3.5h1.6A1.7 1.7 0 0 1 14.5 5.2V7" />
    </svg>
  );
}

export function IconoAdjuntar({ className = "h-4 w-4" }: PropsIcono) {
  return (
    <svg {...base} className={className}>
      <path d="M18.5 10.5l-7.2 7.2a4 4 0 0 1-5.7-5.7l7.6-7.6a2.7 2.7 0 0 1 3.8 3.8l-7.6 7.6a1.35 1.35 0 0 1-1.9-1.9l6.9-6.9" />
    </svg>
  );
}

export function IconoCheck({ className = "h-4 w-4" }: PropsIcono) {
  return (
    <svg {...base} className={className}>
      <path d="m5 12.8 4.3 4.2L19 6.5" />
    </svg>
  );
}

export function IconoEquis({ className = "h-4 w-4" }: PropsIcono) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15 9-6 6M9 9l6 6" />
    </svg>
  );
}

export function IconoAlerta({ className = "h-4 w-4" }: PropsIcono) {
  return (
    <svg {...base} className={className}>
      <path d="M12 4.2 3.3 19.2a.9.9 0 0 0 .8 1.3h15.8a.9.9 0 0 0 .8-1.3z" />
      <path d="M12 9.5v4.2" />
      <path d="M12 17.2h.01" />
    </svg>
  );
}

export function IconoObjetivo({ className = "h-4 w-4" }: PropsIcono) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="12" cy="12" r="0.8" />
    </svg>
  );
}

export function IconoGrafo({ className = "h-4 w-4" }: PropsIcono) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="5" r="2.4" />
      <circle cx="5.5" cy="18.5" r="2.4" />
      <circle cx="18.5" cy="18.5" r="2.4" />
      <path d="M12 7.4v4.2M10.3 12.8l-3.1 3.6M13.7 12.8l3.1 3.6" />
    </svg>
  );
}
