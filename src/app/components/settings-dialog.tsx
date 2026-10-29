"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { type NameState, saveName, type SettingsData, settingsData } from "@/app/actions/settings";
import { ui } from "@/content/ui";
import { askSession } from "@/lib/session-client";
import { saveSpelling, type SpellingPref, useSpelling } from "@/lib/spelling-pref";
import {
  COUNTING_KEY,
  type CountingPref,
  DEFAULT_THEME,
  globalPrivacyControl,
  MOTION_KEY,
  type MotionPref,
  resolveTheme,
  THEME_KEY,
  type ThemePref,
  visitCountingOn,
} from "@/lib/theme";
import { ChartIcon, CloseIcon, GearIcon, MonitorIcon, MoonIcon, PenIcon, SunIcon, UserIcon } from "./icons";
import { OPEN_SAMPLES_EVENT } from "./samples-dialog";
import { UsageRows } from "./usage-bars";

const copy = ui.settings;
type Section = "general" | "writing" | "profile" | "usage";
const SECTION_ICONS: Record<Section, (p: { size?: number }) => ReactNode> = { general: GearIcon, writing: PenIcon, profile: UserIcon, usage: ChartIcon };

function read<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const value = localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows can refuse storage; the choice still applies until the page closes.
  }
}

const prefersLight = () => window.matchMedia("(prefers-color-scheme: light)").matches;

function applyTheme(pref: ThemePref) {
  document.documentElement.dataset.theme = resolveTheme(pref, prefersLight());
}

function applyMotion(pref: MotionPref) {
  if (pref === "reduced") document.documentElement.dataset.motion = "reduced";
  else delete document.documentElement.dataset.motion;
}

/**
 * signedIn: what the page already knows. Otherwise the session is asked for once on load, so Profile
 * and Usage are listed the moment Settings opens, before their details arrive (Cam, 16 Oct).
 */
export function SettingsButton({ signedIn: known }: { signedIn?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [section, setSection] = useState<Section>("general");
  const [theme, setTheme] = useState<ThemePref>(DEFAULT_THEME);
  const [motion, setMotion] = useState<MotionPref>("system");
  const [counting, setCounting] = useState<CountingPref>("on");
  const [gpc, setGpc] = useState(false);
  // Account parts load when the dialog opens: null while loading, "failed" if the server didn't answer.
  const [account, setAccount] = useState<SettingsData | null | "failed">(null);
  const spelling = useSpelling();
  const [sessionSignedIn, setSessionSignedIn] = useState(known ?? false);

  useEffect(() => {
    if (known !== undefined) return;
    let live = true;
    void askSession().then((answer) => {
      if (live) setSessionSignedIn(answer.signedIn);
    });
    return () => {
      live = false;
    };
  }, [known]);

  // Follow the device when "Match your device" is chosen.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      if (read<ThemePref>(THEME_KEY, DEFAULT_THEME, ["system", "light", "dark"]) === "system") applyTheme("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  function open() {
    setTheme(read<ThemePref>(THEME_KEY, DEFAULT_THEME, ["system", "light", "dark"]));
    setMotion(read<MotionPref>(MOTION_KEY, "system", ["system", "reduced"]));
    setCounting(visitCountingOn() ? "on" : "off");
    setGpc(globalPrivacyControl());
    setAccount(null);
    dialog.current?.showModal();
    settingsData()
      .then(setAccount)
      .catch(() => setAccount("failed"));
  }

  function chooseTheme(pref: ThemePref) {
    setTheme(pref);
    save(THEME_KEY, pref);
    applyTheme(pref);
  }

  function chooseMotion(pref: MotionPref) {
    setMotion(pref);
    save(MOTION_KEY, pref);
    applyMotion(pref);
  }

  function chooseCounting(pref: CountingPref) {
    setCounting(pref);
    save(COUNTING_KEY, pref);
  }

  const data = account !== null && account !== "failed" && account.signedIn ? account : null;
  const signedIn = data !== null || (account === null && (known ?? sessionSignedIn));
  const sections: Section[] = signedIn ? ["general", "writing", "profile", "usage"] : ["general", "writing"];
  const shown = sections.includes(section) ? section : "general";

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        className="inline-flex size-9 items-center justify-center rounded-full text-fg-2 transition-transform hover:bg-surface hover:text-fg active:scale-90"
      >
        <GearIcon />
        <span className="visually-hidden">{copy.open}</span>
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="settings-title"
        className="settings m-auto w-[min(100%-2rem,52rem)] rounded-2xl border border-line-strong bg-surface p-0 text-fg shadow-[var(--shadow)]"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="relative grid min-h-[27rem] sm:grid-cols-[13rem_1fr]">
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="absolute right-3 top-3 z-10 inline-flex size-9 items-center justify-center rounded-full text-fg-2 hover:bg-raised hover:text-fg sm:right-4 sm:top-4"
          >
            <CloseIcon />
            <span className="visually-hidden">{copy.close}</span>
          </button>
          {/* One set of section buttons: a row on phones, a side list on wider screens. */}
          <nav aria-label={copy.title} className="border-b border-line py-3 pl-3 pr-14 sm:border-b-0 sm:border-r sm:pr-3">
            <p className="hidden px-2.5 pb-2 pt-1 text-[0.8125rem] text-fg-3 sm:block">{copy.title}</p>
            <ul className="flex gap-1 overflow-x-auto sm:grid">
              {sections.map((value) => {
                const SectionIcon = SECTION_ICONS[value];
                const current = shown === value;
                return (
                  <li key={value}>
                    <button
                      type="button"
                      aria-current={current ? "page" : undefined}
                      onClick={() => setSection(value)}
                      className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-sm whitespace-nowrap transition-transform active:scale-[0.97] ${
                        current ? "border-line-strong bg-raised font-medium text-fg" : "border-transparent text-fg-2 hover:bg-raised hover:text-fg"
                      }`}
                    >
                      <span className="hidden sm:inline-flex">
                        <SectionIcon size={16} />
                      </span>
                      {copy.sections[value]}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="p-6 sm:p-8">
            <h2 id="settings-title" className="visually-hidden">
              {copy.title}
            </h2>

            {shown === "general" ? (
              <>
                <h3 className="text-lg font-semibold tracking-tight">{copy.appearance}</h3>
                <Row label={copy.theme} id="theme-label">
                  <div className="segmented" role="radiogroup" aria-labelledby="theme-label">
                    <Choice name="theme" value="system" checked={theme === "system"} onChange={() => chooseTheme("system")} label={copy.themeOptions.system}>
                      <MonitorIcon size={17} />
                    </Choice>
                    <Choice name="theme" value="light" checked={theme === "light"} onChange={() => chooseTheme("light")} label={copy.themeOptions.light}>
                      <SunIcon size={17} />
                    </Choice>
                    <Choice name="theme" value="dark" checked={theme === "dark"} onChange={() => chooseTheme("dark")} label={copy.themeOptions.dark}>
                      <MoonIcon size={17} />
                    </Choice>
                  </div>
                </Row>

                <Row label={copy.motion} hint={copy.motionHint} id="motion-label">
                  <div className="segmented" role="radiogroup" aria-labelledby="motion-label">
                    <Choice name="motion" value="system" checked={motion === "system"} onChange={() => chooseMotion("system")}>
                      {copy.motionOptions.system}
                    </Choice>
                    <Choice name="motion" value="reduced" checked={motion === "reduced"} onChange={() => chooseMotion("reduced")}>
                      {copy.motionOptions.reduced}
                    </Choice>
                  </div>
                </Row>

                <h3 className="mt-8 text-lg font-semibold tracking-tight">{copy.privacy}</h3>
                <Row label={copy.counting} hint={gpc ? copy.countingGpc : copy.countingHint} id="counting-label">
                  <div className="segmented" role="radiogroup" aria-labelledby="counting-label">
                    <Choice name="counting" value="on" checked={counting === "on" && !gpc} disabled={gpc} onChange={() => chooseCounting("on")}>
                      {copy.countingOptions.on}
                    </Choice>
                    <Choice name="counting" value="off" checked={counting === "off" || gpc} disabled={gpc} onChange={() => chooseCounting("off")}>
                      {copy.countingOptions.off}
                    </Choice>
                  </div>
                </Row>
                <p className="mt-6 text-[0.8125rem] text-fg-3">{copy.saved}</p>
              </>
            ) : null}

            {shown === "writing" ? (
              <>
                <h3 className="text-lg font-semibold tracking-tight">{copy.sections.writing}</h3>
                <Row label={copy.spelling} hint={copy.spellingHint} id="spelling-label">
                  <div className="segmented" role="radiogroup" aria-labelledby="spelling-label">
                    {(["uk", "us"] as SpellingPref[]).map((value) => (
                      <Choice key={value} name="spelling" value={value} checked={spelling === value} onChange={() => saveSpelling(value)}>
                        {copy.spellingOptions[value]}
                      </Choice>
                    ))}
                  </div>
                </Row>
                <Row
                  label={copy.samples}
                  hint={account === null ? copy.loading : data ? copy.samplesHint(data.samples, data.words) : copy.samplesSignedOut}
                  id="samples-label"
                >
                  {signedIn ? (
                    <Link
                      href="/app?samples=1"
                      onClick={() => {
                        dialog.current?.close();
                        window.dispatchEvent(new Event(OPEN_SAMPLES_EVENT));
                      }}
                      className="btn btn-quiet btn-sm"
                    >
                      {copy.samplesButton}
                    </Link>
                  ) : account !== null ? (
                    <Link href="/sign-in" className="btn btn-quiet btn-sm">
                      {copy.signIn}
                    </Link>
                  ) : null}
                </Row>
                <p className="mt-6 text-[0.8125rem] text-fg-3">{copy.saved}</p>
              </>
            ) : null}

            {(shown === "profile" || shown === "usage") && account === null ? <p className="text-sm text-fg-3">{copy.loading}</p> : null}

            {shown === "profile" && data ? (
              <ProfileForm key={`${data.firstName}|${data.lastName}`} firstName={data.firstName} lastName={data.lastName} />
            ) : null}

            {shown === "usage" && data ? (
              <>
                <h3 className="text-lg font-semibold tracking-tight">{copy.sections.usage}</h3>
                <p className="mb-6 mt-1 text-sm text-fg-3">{data.usage.tier === "paid" ? copy.usageIntroPaid : copy.usageIntro}</p>
                <UsageRows usage={data.usage} />
              </>
            ) : null}

            {account === "failed" && (shown === "profile" || shown === "usage") ? <p className="text-sm text-mark">{copy.loadFailed}</p> : null}
          </div>
        </div>
      </dialog>
    </>
  );
}

function ProfileForm({ firstName, lastName }: { firstName: string; lastName: string }) {
  const [state, action, pending] = useActionState(saveName, { status: "idle", message: "" } as NameState);
  const field =
    "w-full rounded-xl border border-line-strong bg-canvas px-4 py-2.5 text-[1rem] text-fg placeholder:text-fg-3 focus:border-accent-text focus:outline-none";
  return (
    <form action={action} className="grid gap-4">
      <div>
        <h3 className="text-lg font-semibold tracking-tight">{copy.sections.profile}</h3>
        <p className="mt-1 text-sm text-fg-3">{copy.profileIntro}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label htmlFor="settings-first-name" className="text-sm font-medium">
            {copy.firstName}
          </label>
          <input id="settings-first-name" name="first_name" defaultValue={firstName} maxLength={50} autoComplete="given-name" className={field} />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="settings-last-name" className="text-sm font-medium">
            {copy.lastName}
          </label>
          <input id="settings-last-name" name="last_name" defaultValue={lastName} maxLength={50} autoComplete="family-name" className={field} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
          {pending ? copy.savingName : copy.saveName}
        </button>
        <p aria-live="polite" className={`text-sm ${state.status === "error" ? "font-medium text-mark" : "text-good"}`}>
          {state.status === "idle" ? "" : state.message}
        </p>
      </div>
    </form>
  );
}

function Row({ label, hint, id, children }: { label: string; hint?: string; id: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line py-5 last-of-type:border-b-0">
      <div className="max-w-[22rem]">
        <p id={id} className="font-medium">
          {label}
        </p>
        {hint ? <p className="text-sm text-fg-3">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Choice(props: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  label?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label title={props.label}>
      <input type="radio" name={props.name} value={props.value} checked={props.checked} disabled={props.disabled} onChange={props.onChange} aria-label={props.label} />
      {props.children}
    </label>
  );
}
