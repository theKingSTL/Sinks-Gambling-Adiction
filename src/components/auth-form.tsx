"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, signupAction, type FormState } from "@/app/actions";

const field =
  "w-full rounded-xl border border-line-strong bg-sunken px-4 py-3 outline-none focus:border-accent aria-[invalid=true]:border-loss";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    mode === "login" ? loginAction : signupAction,
    undefined,
  );
  const signup = mode === "signup";

  return (
    <div className="mx-auto max-w-sm pt-6">
      <h1 className="display text-4xl font-extrabold">{signup ? "Join Sinks" : "Welcome back"}</h1>
      <p className="mt-1 text-sm text-muted">
        {signup ? "Start with $1,000 in play money. No card, no deposits." : "Log in to place bets and tail friends."}
      </p>

      <form action={action} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next} />
        <div className="space-y-1.5">
          <label htmlFor="username" className="text-sm font-medium">
            Username
          </label>
          <input id="username" name="username" autoComplete="username" required minLength={3} maxLength={20} className={field} />
        </div>
        {signup && (
          <div className="space-y-1.5">
            <label htmlFor="displayName" className="text-sm font-medium">
              Display name
            </label>
            <input id="displayName" name="displayName" autoComplete="nickname" required maxLength={40} className={field} />
          </div>
        )}
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            required
            minLength={8}
            maxLength={128}
            aria-invalid={!!state?.error}
            aria-describedby={state?.error ? "form-error" : undefined}
            className={field}
          />
        </div>
        {state?.error && (
          <p id="form-error" role="alert" className="text-sm text-loss">
            {state.error}
          </p>
        )}
        <button
          disabled={pending}
          className="w-full rounded-xl bg-accent py-3 font-semibold text-accent-ink hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "One sec…" : signup ? "Create account" : "Log in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {signup ? "Have an account? " : "New here? "}
        <Link href={signup ? "/login" : "/signup"} className="font-semibold text-accent hover:underline">
          {signup ? "Log in" : "Create one"}
        </Link>
      </p>
    </div>
  );
}
