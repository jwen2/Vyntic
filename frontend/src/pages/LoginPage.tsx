import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login, register } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import LandingButton from "@/components/landing/ui/LandingButton";
import LandingContainer from "@/components/landing/ui/LandingContainer";
import LandingEyebrow from "@/components/landing/ui/LandingEyebrow";
import LandingHeading from "@/components/landing/ui/LandingHeading";
import LandingInput from "@/components/landing/ui/LandingInput";
import LandingPanel from "@/components/landing/ui/LandingPanel";
import LandingText from "@/components/landing/ui/LandingText";

export default function LoginPage() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const data = isLogin
        ? await login(email, password)
        : await register(email, password, fullName);
      setUser(data.user);
      navigate("/app");
    } catch (err) {
      console.error("Auth error:", err);
      const message = err instanceof Error ? err.message : "";
      try {
        const parsed = JSON.parse(message);
        setError(parsed.detail || "Authentication failed");
      } catch {
        setError(message || "Authentication failed");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="landing-shell min-h-screen bg-[var(--landing-bg)]">
      <LandingContainer className="flex min-h-screen flex-col">
        <div className="flex items-center justify-between py-4 sm:py-6">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--landing-inverse)] text-sm font-semibold text-white">
              V
            </div>
            <div>
              <div className="text-sm font-semibold tracking-[-0.03em] text-[var(--landing-text)]">
                Vyntic
              </div>
              <div className="font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]">
                Deal Intelligence
              </div>
            </div>
          </Link>

          <LandingButton to="/" variant="ghost">
            Back
          </LandingButton>
        </div>

        <div className="flex flex-1 items-center justify-center py-8 sm:py-12">
          <LandingPanel className="w-full max-w-[460px]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--landing-inverse)] text-sm font-semibold text-white">
                V
              </div>
              <div>
                <LandingEyebrow>{isLogin ? "Sign In" : "Create Account"}</LandingEyebrow>
                <div className="mt-1 text-sm font-medium text-[var(--landing-text)]">
                  {isLogin ? "Continue to Vyntic" : "Create your Vyntic account"}
                </div>
              </div>
            </div>

            <div className="mt-8">
              <LandingHeading size="card">
                {isLogin ? "Sign in" : "Create account"}
              </LandingHeading>
              <LandingText className="mt-3">
                {isLogin
                  ? "Enter your credentials to access the workspace."
                  : "Create an account to access the workspace."}
              </LandingText>
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              {!isLogin && (
                <Field label="Full name" htmlFor="fullName">
                  <LandingInput
                    id="fullName"
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    required={!isLogin}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                  />
                </Field>
              )}

              <Field label="Email address" htmlFor="email">
                <LandingInput
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@firm.com"
                />
              </Field>

              <Field label="Password" htmlFor="password">
                <LandingInput
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isLogin ? "Enter your password" : "Create a password"}
                />
              </Field>

              {error && (
                <div className="rounded-[1.25rem] border border-black/10 bg-black/5 px-4 py-3 text-sm leading-6 text-[var(--landing-text)]">
                  {error}
                </div>
              )}

              <LandingButton
                type="submit"
                disabled={isLoading}
                className="w-full"
              >
                {isLoading
                  ? "Please wait..."
                  : isLogin
                    ? "Continue"
                    : "Create account"}
              </LandingButton>
            </form>

            <div className="mt-8 border-t border-[var(--landing-border)] pt-5">
              <div className="flex flex-col gap-2">
                <div className="text-sm text-[var(--landing-muted)]">
                  {isLogin ? "Don’t have an account?" : "Already have an account?"}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin((value) => !value);
                    setError(null);
                  }}
                  className="w-fit text-sm font-medium text-[var(--landing-text)] underline decoration-black/15 underline-offset-4 transition-colors hover:decoration-black/40"
                >
                  {isLogin ? "Create account" : "Back to sign in"}
                </button>
              </div>
            </div>
          </LandingPanel>
        </div>
      </LandingContainer>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block font-mono-plex text-[10px] uppercase tracking-[0.18em] text-[var(--landing-muted)]"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
