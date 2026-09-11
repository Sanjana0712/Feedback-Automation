import { NavLink, useNavigate } from "react-router-dom";
import { useAdmin } from "../context/AdminContext";
import { LogOut } from "lucide-react";

const tabs = [
  { to: "/", label: "Upload", end: true, testId: "nav-upload" },
  { to: "/dashboard", label: "Dashboard", testId: "nav-dashboard" },
  { to: "/negative-feedback", label: "Negative Feedback", testId: "nav-negative" },
];

function PillLink({ to, end, testId, label, alwaysActive }) {
  return (
    <NavLink to={to} end={end} data-testid={testId}>
      {({ isActive }) => (
        <span
          data-active={alwaysActive || isActive}
          className="nav-pill"
        >
          {label}
        </span>
      )}
    </NavLink>
  );
}

export default function NavBar() {
  const { isAdmin, logout } = useAdmin();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <header className="w-full bg-[var(--surface)] border-b border-[var(--line)]">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-5 flex items-center justify-between gap-6">
        <div
          className="font-display text-2xl md:text-[26px] font-semibold tracking-tight"
          data-testid="app-title"
        >
          Feedback System
        </div>

        <nav className="hidden md:flex items-center gap-2">
          {tabs.map((t) => (
            <PillLink key={t.to} {...t} />
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <PillLink to="/admin" testId="nav-admin" label="Admin" alwaysActive />
          {isAdmin && (
            <button
              onClick={handleLogout}
              data-testid="admin-logout-button"
              className="btn-ghost flex items-center gap-1.5"
              title="Sign out"
            >
              <LogOut size={14} /> Sign out
            </button>
          )}
        </div>
      </div>

      {/* Mobile nav */}
      <div className="md:hidden flex items-center gap-2 px-4 pb-3 overflow-x-auto">
        {tabs.map((t) => (
          <PillLink key={`m-${t.to}`} {...t} testId={`${t.testId}-mobile`} />
        ))}
      </div>
    </header>
  );
}
