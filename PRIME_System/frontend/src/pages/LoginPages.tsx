import { Eye, EyeOff, Lock, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, get, post } from "../api/client";
import type { EnrollOut, LoginOut, MeOut, TokenOut } from "../api/types";
import { Button } from "../components/Button";
import { LogoMark } from "../components/Logo";
import { useAuth } from "../store/auth";
import { socket } from "../ws/socket";

/** Sign-in frame: one card in the middle of the page with the PRIME logo above it. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-canvas px-4 py-10">
      <svg viewBox="0 0 400 260" className="pointer-events-none absolute -bottom-10 left-1/2 w-[900px] -translate-x-1/2 opacity-[0.07]" aria-hidden fill="none">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <path key={i} d={`M20 ${230 - i * 28} C 120 ${222 - i * 28}, 260 ${238 - i * 28}, 380 ${228 - i * 28}`}
            stroke={i % 2 ? "#1F5F8B" : "#2E7D32"} strokeWidth={14} strokeLinecap="round" />
        ))}
      </svg>
      <div className="relative flex w-full max-w-[440px] flex-col items-center">
        <div className="mb-6 flex flex-col items-center gap-3 text-center" data-testid="login-logo">
          <LogoMark className="h-16 w-16" />
          <div>
            <div className="text-2xl font-bold tracking-wide text-text">PRIME</div>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">AI-powered concrete 3D printing</div>
          </div>
        </div>
        <div className="w-full rounded-card bg-surface p-8 shadow-md">{children}</div>
        <p className="mt-6 flex items-center gap-2 text-xs text-text-muted">
          <Lock aria-hidden className="h-4 w-4" /> Secured with 2-factor authentication · encrypted in transit and at rest
        </p>
      </div>
    </div>
  );
}

async function finishLogin(t: TokenOut | LoginOut, nav: ReturnType<typeof useNavigate>) {
  const st = useAuth.getState();
  st.setToken(t.access_token ?? null);
  st.setMfa(null);
  const me = await get<MeOut>("/me");
  st.setMe(me);
  socket.connect(t.access_token!);
  const ob = me.onboarding as Record<string, boolean>;
  nav(ob && !ob.welcome_done && !ob.dismissed ? "/onboarding/welcome" : "/dashboard", { replace: true });
}

export function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await post<LoginOut>("/auth/login", { email, password, remember_device: remember });
      if (!r.mfa_required) return await finishLogin(r, nav);
      useAuth.getState().setMfa(r.mfa_token ?? null, r.enroll_required ?? false);
      nav(r.enroll_required ? "/login/enroll" : "/login/verify");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Can't reach the server. Is the backend running?");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Frame>
      <h1 className="text-2xl font-semibold">Sign in to PRIME</h1>
      <p className="mt-1 text-sm text-text-muted">Use your work email and password.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="text-sm font-medium">Email</label>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-ctl border border-border px-3 py-2.5 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-50" />
        </div>
        <div>
          <label htmlFor="pw" className="text-sm font-medium">Password</label>
          <div className="relative mt-1">
            <input id="pw" type={show ? "text" : "password"} autoComplete="current-password" required value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-ctl border border-border px-3 py-2.5 pr-10 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-50" />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-[var(--brand-600)]" />
          Remember this device for 30 days
        </label>
        {err && <p role="alert" className="rounded-ctl bg-critical-50 px-3 py-2 text-sm text-critical">{err}</p>}
        <Button type="submit" className="w-full py-3 text-base" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
      </form>
      <p className="mt-6 text-xs text-text-muted">Demo: admin@prime.demo / admin123 · engineer@prime.demo / engineer123 · code 246810</p>
    </Frame>
  );
}

function CodeBoxes({ onComplete, disabled }: { onComplete: (code: string) => void; disabled?: boolean }) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => refs.current[0]?.focus(), []);
  const set = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "");
    if (clean.length > 1) {                       // pasted the whole code
      const all = clean.slice(0, 6).split("");
      const next = [...digits].map((_, k) => all[k] ?? "");
      setDigits(next);
      if (all.length === 6) onComplete(all.join(""));
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) refs.current[i + 1]?.focus();
    if (next.every((d) => d)) onComplete(next.join(""));
  };
  return (
    <div className="flex gap-2" role="group" aria-label="6-digit code">
      {digits.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} inputMode="numeric" maxLength={6} value={d} disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => set(i, e.target.value)}
          onKeyDown={(e) => { if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus(); }}
          className="tabular h-14 w-12 rounded-ctl border border-border text-center text-2xl font-semibold focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-50" />
      ))}
    </div>
  );
}

export function MfaPage() {
  const nav = useNavigate();
  const mfaToken = useAuth((s) => s.mfaToken);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0);
  useEffect(() => { if (!mfaToken) nav("/login", { replace: true }); }, [mfaToken, nav]);
  const verify = async (code: string) => {
    setBusy(true);
    setErr(null);
    try {
      await finishLogin(await post<TokenOut>("/auth/mfa/verify", { mfa_token: mfaToken, code }), nav);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Something went wrong.");
      setKey((k) => k + 1);
      if (e instanceof ApiError && e.code.startsWith("MFA_TOKEN")) setTimeout(() => nav("/login"), 1500);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Frame>
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-700"><ShieldCheck className="h-6 w-6" /></span>
      <h1 className="mt-4 text-2xl font-semibold">Enter the 6-digit code</h1>
      <p className="mt-1 text-sm text-text-muted">Open your authenticator app and type the code for PRIME.</p>
      <div className="mt-6"><CodeBoxes key={key} onComplete={verify} disabled={busy} /></div>
      {err && <p role="alert" className="mt-4 rounded-ctl bg-critical-50 px-3 py-2 text-sm text-critical">{err}</p>}
      <p className="mt-6 text-xs text-text-muted">Demo accounts can use the code 246810.</p>
      <Button variant="ghost" className="mt-4 px-0" onClick={() => nav("/login")}>Back to sign in</Button>
    </Frame>
  );
}

export function EnrollPage() {
  const nav = useNavigate();
  const mfaToken = useAuth((s) => s.mfaToken);
  const [data, setData] = useState<EnrollOut | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (!mfaToken) { nav("/login", { replace: true }); return; }
    post<EnrollOut>("/auth/mfa/enroll", { mfa_token: mfaToken }).then(setData).catch((e) => setErr(e instanceof ApiError ? e.message : "Error"));
  }, [mfaToken, nav]);
  const confirm = async (code: string) => {
    try {
      await finishLogin(await post<TokenOut>("/auth/mfa/enroll/confirm", { mfa_token: mfaToken, code }), nav);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Error");
      setKey((k) => k + 1);
    }
  };
  return (
    <Frame>
      <h1 className="text-2xl font-semibold">Set up 2-factor authentication</h1>
      <p className="mt-1 text-sm text-text-muted">Scan this code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…), then enter the 6-digit code it shows.</p>
      {data && (
        <div className="mt-4 rounded-card border border-border p-4">
          <div className="mx-auto w-44" dangerouslySetInnerHTML={{ __html: data.qr_svg.replace("<svg", '<svg width="176" height="176"') }} />
          <p className="mt-2 break-all text-center font-mono text-xs text-text-muted">{data.secret}</p>
        </div>
      )}
      <div className="mt-4"><CodeBoxes key={key} onComplete={confirm} /></div>
      {err && <p role="alert" className="mt-4 rounded-ctl bg-critical-50 px-3 py-2 text-sm text-critical">{err}</p>}
    </Frame>
  );
}
