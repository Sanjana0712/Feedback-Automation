import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { useAdmin } from "../context/AdminContext";
import {
  addInstructor,
  addProgramBatch,
  fetchDistinctProgramBatch,
} from "../lib/supabase";
import { Lock } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TITLES = ["None", "Prof."];

const DROPDOWN_ARROW_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231a1416' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
  backgroundSize: "14px",
};

const ADD_NEW_VALUE = "__add_new__";

function AdminLogin() {
  const { login } = useAdmin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await axios.post(`${API}/admin/login`, { email, password });
      if (res.data?.success) {
        login(res.data.token);
        toast.success("Welcome back, admin");
      } else {
        toast.error("Invalid credentials");
      }
    } catch (err) {
      const msg = err.response?.data?.detail || "Login failed";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-16 flex justify-center">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md bg-[var(--card)] rounded-2xl p-8 md:p-10"
        data-testid="admin-login-form"
      >
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
            <Lock size={16} className="text-[var(--accent-strong)]" />
          </div>
          <h2 className="font-display text-2xl font-semibold">Admin Login</h2>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-2 text-[var(--ink-soft)]">
              Email
            </label>
            <input
              type="email"
              required
              className="field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="admin-email-input"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-[var(--ink-soft)]">
              Password
            </label>
            <input
              type="password"
              required
              className="field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="admin-password-input"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn-primary w-full mt-4"
            disabled={busy}
            data-testid="admin-signin-button"
          >
            {busy ? "Signing in..." : "Sign In"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Reusable "pick existing, or add new" select ───────────────────────────────
// Renders a dropdown of known options plus a trailing "+ Add new …" entry.
// Picking that entry swaps to a plain text input so the admin can type a
// brand-new value, which becomes the field's value directly (nothing is
// written to the DB until the parent form submits).
function AddNewSelect({
  label,
  options,
  value,
  onValueChange,
  placeholder,
  disabled = false,
  disabledMessage,
  testIdPrefix,
}) {
  const isKnownValue = value !== "" && options.includes(value);
  const [mode, setMode] = useState(value && !isKnownValue ? "new" : "select");

  // If the parent clears the value out from under us (e.g. institution
  // changed so program was reset), fall back to select mode.
  useEffect(() => {
    if (!value) setMode("select");
  }, [value]);

  const handleSelectChange = (e) => {
    const v = e.target.value;
    if (v === ADD_NEW_VALUE) {
      setMode("new");
      onValueChange("");
    } else {
      onValueChange(v);
    }
  };

  return (
    <div>
      <label className="block text-[15px] font-medium mb-2">{label}</label>
      {mode === "select" ? (
        <select
          className="field appearance-none cursor-pointer pr-10 bg-[var(--card)]"
          value={isKnownValue ? value : ""}
          onChange={handleSelectChange}
          disabled={disabled}
          data-testid={`${testIdPrefix}-select`}
          style={DROPDOWN_ARROW_STYLE}
        >
          <option value="" disabled>
            {disabled ? disabledMessage || "Select the field above first" : `Select ${label.toLowerCase()}`}
          </option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          <option value={ADD_NEW_VALUE}>+ Add new {label.toLowerCase()}</option>
        </select>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            className="field bg-[var(--card)]"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder={placeholder}
            data-testid={`${testIdPrefix}-new-input`}
            autoFocus
          />
          {options.length > 0 && (
            <button
              type="button"
              className="btn-ghost border border-[var(--line)] text-sm whitespace-nowrap"
              onClick={() => {
                setMode("select");
                onValueChange("");
              }}
            >
              Choose existing
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AddInstructorForm() {
  const [title, setTitle] = useState("Prof.");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [institution, setInstitution] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [institutionOptions, setInstitutionOptions] = useState([]);

  // Institutions come from the program_batch registry, not free text —
  // keeps instructor.institution consistent with what's registered there.
  useEffect(() => {
    fetchDistinctProgramBatch("institution").then(setInstitutionOptions).catch(() => {});
  }, []);

  const fullName = useMemo(() => {
    const parts = [];
    if (title && title !== "None") parts.push(title);
    if (firstName.trim()) parts.push(firstName.trim());
    if (lastName.trim()) parts.push(lastName.trim());
    return parts.join(" ");
  }, [title, firstName, lastName]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!firstName.trim()) {
      toast.error("First name is required");
      return;
    }
    setBusy(true);
    try {
      await addInstructor(fullName, institution.trim(), email.trim());
      toast.success(`Instructor "${fullName}" added`);
      setFirstName("");
      setLastName("");
      setTitle("Prof.");
      setInstitution("");
      setEmail("");
    } catch (err) {
      toast.error(`Failed to add instructor: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-10">
        <h1
          className="font-display text-3xl md:text-4xl font-semibold"
          data-testid="add-instructor-heading"
        >
          Add new instructor
        </h1>
      </div>

      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div>
            <label className="block text-[15px] font-medium mb-2">Title</label>
            <select
              className="field appearance-none cursor-pointer pr-10 bg-[var(--card)]"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="instructor-title-select"
              style={DROPDOWN_ARROW_STYLE}
            >
              {TITLES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[15px] font-medium mb-2">First name</label>
            <input
              type="text"
              className="field bg-[var(--card)]"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              data-testid="instructor-firstname-input"
            />
          </div>

          <div>
            <label className="block text-[15px] font-medium mb-2">
              Last name <span className="text-[var(--muted)] font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              className="field bg-[var(--card)]"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              data-testid="instructor-lastname-input"
            />
          </div>
        </div>

        {/* Institution + Email — full width row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-[15px] font-medium mb-2">Institution</label>
            <select
              className="field appearance-none cursor-pointer pr-10 bg-[var(--card)]"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              data-testid="instructor-institution-select"
              style={DROPDOWN_ARROW_STYLE}
            >
              <option value="">
                {institutionOptions.length ? "Select institution" : "No institutions registered yet"}
              </option>
              {institutionOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            {institutionOptions.length === 0 && (
              <p className="text-xs text-[var(--muted)] mt-1.5">
                Add one first under the "Add Program/Batch" tab.
              </p>
            )}
          </div>

          <div>
            <label className="block text-[15px] font-medium mb-2">Email</label>
            <input
              type="email"
              className="field bg-[var(--card)]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. instructor@example.com"
              data-testid="instructor-email-input"
            />
          </div>
        </div>

        <div className="mb-8">
          <label className="block text-[15px] font-medium mb-2">Full name preview</label>
          <div
            className="field min-h-[64px] flex items-center text-[var(--ink-soft)] bg-[var(--field)]"
            data-testid="instructor-fullname-preview"
          >
            {fullName || (
              <span className="text-[var(--muted)] italic">
                Preview will appear here
              </span>
            )}
          </div>
        </div>

        <div className="flex justify-center">
          <button
            type="submit"
            className="btn-primary"
            disabled={busy || !firstName.trim()}
            data-testid="add-instructor-button"
          >
            {busy ? "Adding..." : "Add Instructor"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AddProgramBatchForm() {
  const [institution, setInstitution] = useState("");
  const [program, setProgram] = useState("");
  const [batch, setBatch] = useState("");
  const [busy, setBusy] = useState(false);

  const [institutionOptions, setInstitutionOptions] = useState([]);
  const [programOptions, setProgramOptions] = useState([]);

  const refreshInstitutions = async () => {
    const insts = await fetchDistinctProgramBatch("institution").catch(() => []);
    setInstitutionOptions(insts);
    return insts;
  };

  const refreshPrograms = async (forInstitution) => {
    if (!forInstitution) {
      setProgramOptions([]);
      return [];
    }
    const progs = await fetchDistinctProgramBatch("program", { institution: forInstitution }).catch(() => []);
    setProgramOptions(progs);
    return progs;
  };

  // Load every known institution once, for the dropdown.
  useEffect(() => {
    refreshInstitutions();
  }, []);

  // Re-scope program suggestions to whichever institution is currently
  // selected/typed. A brand-new institution has no registered programs yet.
  useEffect(() => {
    refreshPrograms(institution.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institution]);

  const handleInstitutionChange = (v) => {
    setInstitution(v);
    setProgram(""); // program list depends on institution — reset selection
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const inst = institution.trim();
    const prog = program.trim();
    const bat = batch.trim();
    if (!inst || !prog || !bat) {
      toast.error("Institution, program, and batch are all required");
      return;
    }
    setBusy(true);
    try {
      await addProgramBatch(inst, prog, bat);
      toast.success(`"${prog}" / "${bat}" added for ${inst}`);
      setBatch("");
      // Refresh both lists so a newly-added institution/program is
      // immediately available as an "existing" choice for the next entry.
      await refreshInstitutions();
      await refreshPrograms(inst);
    } catch (err) {
      toast.error(`Failed to add: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-10">
        <h1
          className="font-display text-3xl md:text-4xl font-semibold"
          data-testid="add-program-batch-heading"
        >
          Add program / batch
        </h1>
      </div>

      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <AddNewSelect
            label="Institution"
            options={institutionOptions}
            value={institution}
            onValueChange={handleInstitutionChange}
            placeholder="e.g. IIT Guwahati"
            testIdPrefix="program-batch-institution"
          />

          <AddNewSelect
            label="Program"
            options={programOptions}
            value={program}
            onValueChange={setProgram}
            placeholder="e.g. Executive PGDM"
            disabled={!institution.trim()}
            disabledMessage="Select an institution first"
            testIdPrefix="program-batch-program"
          />

          <div>
            <label className="block text-[15px] font-medium mb-2">Batch</label>
            <input
              type="text"
              className="field bg-[var(--card)]"
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              placeholder="e.g. 2026 Jan"
              data-testid="program-batch-batch-input"
            />
          </div>
        </div>

        <div className="flex justify-center">
          <button
            type="submit"
            className="btn-primary"
            disabled={busy || !institution.trim() || !program.trim() || !batch.trim()}
            data-testid="add-program-batch-button"
          >
            {busy ? "Adding..." : "Add Program/Batch"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AdminTools() {
  const [tab, setTab] = useState("instructor");

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-10">
      <div className="flex gap-1 mb-10 border-b border-[var(--line)]">
        <button
          type="button"
          onClick={() => setTab("instructor")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === "instructor"
              ? "border-[var(--ink)] text-[var(--ink)]"
              : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
          data-testid="admin-tab-instructor"
        >
          Add Instructor
        </button>
        <button
          type="button"
          onClick={() => setTab("program-batch")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === "program-batch"
              ? "border-[var(--ink)] text-[var(--ink)]"
              : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
          data-testid="admin-tab-program-batch"
        >
          Add Program/Batch
        </button>
      </div>

      {tab === "instructor" ? <AddInstructorForm /> : <AddProgramBatchForm />}
    </div>
  );
}

export default function AdminPage() {
  const { isAdmin } = useAdmin();
  return isAdmin ? <AdminTools /> : <AdminLogin />;
}
