import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);

  const loginMutation = useMutation({
    mutationFn: (payload: {
      username: string;
      password: string;
      remember: boolean;
    }) => login(payload.username, payload.password, payload.remember),
    onSuccess: () => navigate("/", { replace: true }),
    onError: (err) => {
      console.error("login mutation failed", err);
    },
  });

  const submit = () => {
    if (!username || !password || loginMutation.isPending) return;
    loginMutation.mutate({ username, password, remember });
  };

  if (isAuthenticated) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-base-200">
      <form
        // Form lives on a route the SPA controls — there's no server endpoint
        // at the page URL that would do anything useful, so prevent every
        // submission attempt and route through the mutation instead.
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          submit();
          return false;
        }}
        className="bg-base-100 rounded-box shadow-xl w-full max-w-sm p-8 space-y-5"
      >
        <h1 className="font-display text-5xl text-center tracking-[0.2em] uppercase font-medium text-base-content">
          Medusa
        </h1>

        <fieldset className="fieldset">
          <legend className="fieldset-legend">Username</legend>
          <input
            className="input w-full"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
            autoComplete="username"
          />
        </fieldset>

        <fieldset className="fieldset">
          <legend className="fieldset-legend">Password</legend>
          <input
            type="password"
            className="input w-full"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </fieldset>

        <label className="cursor-pointer flex items-center gap-2">
          <input
            type="checkbox"
            className="toggle toggle-sm"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span className="label-text text-sm">Remember me</span>
          <span className="text-xs text-base-content/50 ml-auto">
            {remember ? "Up to 30 days" : "Until tab closes"}
          </span>
        </label>

        {loginMutation.isError && (
          <div className="alert alert-soft alert-error text-sm py-2">
            Invalid username or password.
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending ? (
            <span className="loading loading-spinner loading-sm" />
          ) : (
            "Log in"
          )}
        </button>
      </form>
    </div>
  );
}
