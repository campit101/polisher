// Small line icons drawn for this site. Decorative unless given a label by the caller.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

// Cog outline from Lucide (lucide.dev, ISC licence).
export const GearIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);
export const SunIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Icon>
);
export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
  </Icon>
);
export const MonitorIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="12.5" rx="2" />
    <path d="M8.5 20.5h7M12 16.5v4" />
  </Icon>
);
export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);
export const ArrowUpIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
  </Icon>
);
export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);
export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const DocIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Icon>
);
export const SparkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5Z" />
    <path d="M19 16.5c.25 1.4.85 2 2.25 2.25-1.4.25-2 .85-2.25 2.25-.25-1.4-.85-2-2.25-2.25 1.4-.25 2-.85 2.25-2.25Z" />
  </Icon>
);
export const PenIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
    <path d="m13.5 6.5 4 4" />
  </Icon>
);
export const ClipboardIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="6" y="4.5" width="12" height="16" rx="2" />
    <path d="M9.5 3h5v3h-5zM9.5 11h5M9.5 15h3" />
  </Icon>
);

// User and chart-column outlines from Lucide (lucide.dev, ISC licence).
export const UserIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="5" />
    <path d="M20 21a8 8 0 0 0-16 0" />
  </Icon>
);
// Padlock outline from Lucide (lucide.dev, ISC licence).
export const LockIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </Icon>
);
export const ChartIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 3v16a2 2 0 0 0 2 2h16" />
    <path d="M18 17V9M13 17V5M8 17v-3" />
  </Icon>
);

/** The Polisher mark: a rounded square with a spark. */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-[8px] bg-accent text-accent-ink"
      style={{ width: size, height: size }}
    >
      <SparkIcon size={Math.round(size * 0.62)} strokeWidth={2} />
    </span>
  );
}

// Google's four-colour "G" mark, as Google's sign-in branding guidelines ask for on its button.
export const GoogleIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);
