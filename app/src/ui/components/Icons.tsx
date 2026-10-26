import type { ReactElement, SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 20): SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
});
const mk = (d: ReactElement) => ({ size, ...rest }: P) => <svg {...base(size)} {...rest}>{d}</svg>;

export const IconUpload = mk(<><path d="M12 16V4" /><path d="m6 10 6-6 6 6" /><path d="M4 20h16" /></>);
export const IconDownload = mk(<><path d="M12 4v12" /><path d="m6 10 6 6 6-6" /><path d="M4 20h16" /></>);
export const IconCheck = mk(<path d="m5 12 5 5L20 7" />);
export const IconStar = mk(<path d="m12 3 2.2 5.4L20 9l-4.4 3.8L17 19l-5-3.2L7 19l1.4-6.2L4 9l5.8-.6z" />);
export const IconPlay = mk(<polygon points="6 4 20 12 6 20 6 4" />);
export const IconPause = mk(<><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>);
export const IconBack = mk(<path d="m15 18-6-6 6-6" />);
export const IconUndo = mk(<><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>);
export const IconRedo = mk(<><path d="m15 14 5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></>);
export const IconEye = mk(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>);
export const IconEyeOff = mk(<><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.8 9.8 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>);
export const IconUp = mk(<path d="m18 15-6-6-6 6" />);
export const IconDown = mk(<path d="m6 9 6 6 6-6" />);
export const IconTrash = mk(<><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></>);
export const IconBulb = mk(<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />);
export const IconCode = mk(<><path d="m16 18 6-6-6-6" /><path d="m8 6-6 6 6 6" /></>);
export const IconLink = mk(<><path d="M9 17H7A5 5 0 0 1 7 7h2" /><path d="M15 7h2a5 5 0 0 1 0 10h-2" /><path d="M8 12h8" /></>);
export const IconUsb = mk(<><path d="M8 3h8v6H8z" /><rect x="5" y="9" width="14" height="12" rx="2" /><path d="M10 5h1M13 5h1" /></>);
export const IconPrint = mk(<><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="2" /><path d="M7 14h10v7H7z" /></>);
export const IconSave = mk(<><path d="M5 3h11l3 3v15H5z" /><path d="M8 3v5h7V3" /><rect x="8" y="13" width="8" height="5" /></>);
export const IconPlus = mk(<path d="M12 5v14M5 12h14" />);
export const IconSkipBack = mk(<><path d="M6 5v14" /><path d="m18 5-9 7 9 7z" /></>);
export const IconSkipFwd = mk(<><path d="M18 5v14" /><path d="m6 5 9 7-9 7z" /></>);
export const IconReset = mk(<><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>);
export const IconX = mk(<path d="M6 6l12 12M18 6 6 18" />);

/** The spool logo. */
export function Spool({ size = 40 }: { size?: number }) {
  return (
    <svg className="np-spool" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="6" y="3" width="28" height="6" rx="3" fill="#D4A86F" />
      <rect x="10" y="9" width="20" height="22" fill="#C2255C" />
      <path d="M10 13h20M10 17h20M10 21h20M10 25h20" stroke="#8F1A44" strokeWidth="1.5" />
      <rect x="6" y="31" width="28" height="6" rx="3" fill="#D4A86F" />
      <path d="M30 19c6 2 7 9 2 13" fill="none" stroke="#C2255C" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Spool that unwinds while something is working. */
export function BusySpool({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <g className="np-wobble">
        <rect x="14" y="6" width="36" height="8" rx="4" fill="#D4A86F" />
        <rect x="20" y="14" width="24" height="34" fill="#C2255C" />
        <path d="M20 20h24M20 26h24M20 32h24M20 38h24M20 44h24" stroke="#8F1A44" strokeWidth="1.5" />
        <rect x="14" y="48" width="36" height="8" rx="4" fill="#D4A86F" />
      </g>
      <path d="M44 30c12 2 14 14 4 22s-20 6-26 10" fill="none" stroke="#C2255C" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="6 4" style={{ animation: 'np-unwind 1s linear infinite' }} />
    </svg>
  );
}
