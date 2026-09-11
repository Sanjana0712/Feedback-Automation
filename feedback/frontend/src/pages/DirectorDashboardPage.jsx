import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Search, ExternalLink, Copy, Eye, X, TrendingUp, TrendingDown, Minus, LogOut } from "lucide-react";
import { fetchResponses, fetchDistinct } from "../lib/supabase";
import { NUMERIC_QUESTION_COLS } from "../lib/responseSchema";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function toFloat(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function groupSessions(rows) {
  const map = new Map();
  for (const r of rows) {
    const date = r.date_time ? r.date_time.slice(0, 10) : "—";
    const key = [r.institution, r.category, r.program, r.batch, r.instructor, date].join("||");
    if (!map.has(key)) {
      map.set(key, { key, institution: r.institution, category: r.category, program: r.program, batch: r.batch, instructor: r.instructor, date, responses: [] });
    }
    map.get(key).responses.push(r);
  }
  return [...map.values()].map((s) => {
    const perResp = s.responses.map((r) => {
      const vals = NUMERIC_QUESTION_COLS.map((c) => toFloat(r[c])).filter((v) => v !== null);
      if (vals.length === 0) return { avg: null, hasNeg: false };
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      return { avg, hasNeg: vals.some((v) => v <= 3) };
    });
    const respAvgs = perResp.map((p) => p.avg).filter((v) => v !== null);
    const avgScore = respAvgs.length > 0 ? Math.round((respAvgs.reduce((a, b) => a + b, 0) / respAvgs.length) * 100) / 100 : null;
    const negCount = perResp.filter((p) => p.hasNeg).length;
    return { ...s, respCount: s.responses.length, avgScore, negCount };
  });
}

const RESPONSE_COLS = [
  { key: "date_time", label: "Submitted Date & Time" },
  { key: "institution", label: "Institution" },
  { key: "category", label: "Category" },
  { key: "program", label: "Program" },
  { key: "batch", label: "Batch" },
  { key: "instructor", label: "Instructor" },
  { key: "how_would_you_rate_the_overall_content_of_the_session?", label: "Overall content" },
  { key: "were_the_topics_covered_relevant_to_your_needs_and_expectations", label: "Topics relevant" },
  { key: "rate_the_clarity_and_depth_of_the_information_provided", label: "Clarity & depth" },
  { key: "how_knowledgeable_was_the_instructor_about the_subject_matter?", label: "Instructor knowledge" },
  { key: "how_engaging_was_the_instructor_in_delivering_the_content?", label: "Instructor engagement" },
  { key: "rate_the_instructor's_ability_to_answer_questions_and_provide_e", label: "Q&A ability" },
  { key: "how_would_you_rate_the_overall_organization_and_flow_of_the_ses", label: "Organisation & flow" },
  { key: "rate_the_activities/exercises_conducted_during_the_session_to_u", label: "Activities" },
  { key: "rate_the_overall_interaction_and_engagement_opportunities_durin", label: "Interaction" },
  { key: "what_did_you_like_most_about_the_session?", label: "What did you like most?" },
  { key: "what_areas_do_you_think_need_improvement", label: "Areas for improvement" },
];

// ─── Response Modal ────────────────────────────────────────────────────────────
function ResponseModal({ session, onClose }) {
  const rows = session.responses;
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);
  const scoreColor = (val) => { const n = toFloat(val); if (n === null) return ""; if (n >= 4) return "text-emerald-600 font-medium"; return "text-red-600 font-bold"; };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.45)" }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-screen mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between px-6 py-5 border-b border-[var(--line)] shrink-0">
          <div>
            <h2 className="font-display text-xl font-semibold text-[var(--ink)]">Session Responses</h2>
            <p className="text-xs text-[var(--muted)] mt-1">{rows.length} response{rows.length !== 1 ? "s" : ""}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--field)] text-[var(--muted)] hover:text-[var(--ink)] transition-colors"><X size={18} /></button>
        </div>
        <div className="overflow-x-auto flex-1 px-6 py-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-[var(--line)]">
                <th className="py-2 pr-3 text-[var(--ink)] font-semibold">#</th>
                {RESPONSE_COLS.map((c) => <th key={c.key} className="py-2 pr-3 text-[var(--ink)] font-semibold">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const negCount = NUMERIC_QUESTION_COLS.filter(c => { const n = toFloat(row[c]); return n !== null && n <= 3; }).length;
                return (
                  <tr key={row.id ?? i} className="border-b border-[var(--line)] last:border-0" style={{ backgroundColor: negCount >= 3 ? "#fff8e1" : "transparent" }}>
                    <td className="py-2.5 pr-3 text-[var(--muted)]">{i + 1}</td>
                    {RESPONSE_COLS.map((c) => {
                      const val = row[c.key];
                      const isNumeric = NUMERIC_QUESTION_COLS.includes(c.key);
                      return (
                        <td key={c.key} className={`py-2.5 pr-3 ${isNumeric ? scoreColor(val) : "text-[var(--ink-soft)]"}`} style={{ maxWidth: "200px" }}>
                          <span title={val || "—"} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: isNumeric ? "nowrap" : "normal" }}>{val || "—"}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Instructor Overview ───────────────────────────────────────────────────────
function avgScoreForResponses(responses) {
  const allVals = responses.flatMap((r) => NUMERIC_QUESTION_COLS.map((c) => toFloat(r[c])).filter((v) => v !== null));
  if (allVals.length === 0) return null;
  return Math.round((allVals.reduce((a, b) => a + b, 0) / allVals.length) * 100) / 100;
}
function negCountForResponses(responses) {
  return responses.filter((r) => NUMERIC_QUESTION_COLS.some((c) => { const n = toFloat(r[c]); return n !== null && n <= 3; })).length;
}
function negRowsForResponses(responses) {
  return responses.filter((r) => NUMERIC_QUESTION_COLS.filter((c) => { const n = toFloat(r[c]); return n !== null && n <= 3; }).length >= 3).length;
}
function groupBySession(rows) {
  const map = new Map();
  for (const r of rows) {
    const date = r.date_time ? r.date_time.slice(0, 10) : "—";
    const key = [r.institution, r.category, r.program, r.batch, date].join("||");
    if (!map.has(key)) map.set(key, { key, date, institution: r.institution, category: r.category, program: r.program, batch: r.batch, responses: [] });
    map.get(key).responses.push(r);
  }
  return [...map.values()].map((s) => ({ ...s, respCount: s.responses.length, avg: avgScoreForResponses(s.responses), negs: negCountForResponses(s.responses), negRows: negRowsForResponses(s.responses) })).sort((a, b) => (a.date > b.date ? 1 : -1));
}
function ScoreBadge({ score }) {
  if (score === null) return <span className="text-[var(--muted)]">—</span>;
  const color = score >= 4 ? "text-emerald-600 font-semibold" : score > 3 ? "text-amber-500 font-medium" : "text-red-600 font-semibold";
  return <span className={color}>{score.toFixed(2)}</span>;
}
function TrendBadge({ current, previous }) {
  if (previous === null || current === null) return <span className="text-[var(--muted)] text-xs">—</span>;
  const diff = current - previous;
  if (Math.abs(diff) < 0.005) return <span className="flex items-center gap-1 text-[var(--muted)] text-xs"><Minus size={13} /> Same</span>;
  if (diff > 0) return <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium"><TrendingUp size={13} /> +{diff.toFixed(2)}</span>;
  return <span className="flex items-center gap-1 text-red-500 text-xs font-medium"><TrendingDown size={13} /> {diff.toFixed(2)}</span>;
}

// programEntries is an array of { program, institution } pairs the director
// manages — kept paired (rather than two separate flat lists) so a program
// name that's reused across institutions doesn't get conflated.
function InstructorOverview({ programEntries, onClose }) {
  const [instructors, setInstructors] = useState([]);
  const [selected, setSelected] = useState("");
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [analysing, setAnalysing] = useState(false);

  useEffect(() => {
    // Fetch all responses for this director's program+institution pairs,
    // then extract unique instructors.
    (async () => {
      try {
        const allRows = [];
        for (const { program, institution } of programEntries) {
          const rows = await fetchResponses({ program, institution });
          allRows.push(...rows);
        }
        const instructorSet = new Set(allRows.map((r) => r.instructor).filter(Boolean));
        setInstructors([...instructorSet].sort());
      } catch (e) {
        // silently fail
      }
    })();
  }, [programEntries]);

  const onSelect = async (instructor) => {
    setSelected(instructor);
    setSessions([]);
    setFetched(false);
    setAnalysis(null);
    if (!instructor) return;
    setLoading(true);
    try {
      const rows = await fetchResponses({ instructor });
      // Filter to only sessions for this director's program+institution pairs
      const filtered = rows.filter((r) =>
        programEntries.some((e) => e.program === r.program && e.institution === r.institution)
      );
      setSessions(groupBySession(filtered));
      setFetched(true);
    } catch (e) {
      toast.error(`Failed to load: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const onAnalyse = async () => {
    setAnalysing(true);
    setAnalysis(null);
    try {
      const allResponses = sessions.flatMap(s => s.responses);
      const likedText = allResponses.map(r => r["what_did_you_like_most_about_the_session?"]).filter(v => v && v.trim() && v.trim().toLowerCase() !== "na" && v.trim() !== "-").join("\n");
      const improvementText = allResponses.map(r => r["what_areas_do_you_think_need_improvement"]).filter(v => v && v.trim() && v.trim().toLowerCase() !== "na" && v.trim() !== "-").join("\n");
      if (!likedText && !improvementText) { toast.info("No qualitative feedback found."); return; }
      const prompt = `You are analysing student feedback for an instructor across multiple sessions.
WHAT STUDENTS LIKED:\n${likedText || "No responses"}
AREAS FOR IMPROVEMENT:\n${improvementText || "No responses"}
Identify patterns. Respond ONLY with JSON, no markdown:
{"top_praises":["praise 1","praise 2","praise 3"],"repeated_complaints":["complaint 1","complaint 2","complaint 3"],"overall_sentiment":"positive or mixed or negative"}`;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.REACT_APP_GEMINI_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
      const data = await res.json();
      if (!res.ok) throw new Error(`Gemini error: ${data?.error?.message || res.status}`);
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      setAnalysis(JSON.parse(raw.replace(/```json|```/g, "").trim()));
    } catch (e) {
      toast.error(`Analysis failed: ${e.message}`);
    } finally {
      setAnalysing(false);
    }
  };

  const dropdownStyle = { backgroundImage: "url(\"data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231a1416' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", backgroundSize: "14px" };

  return (
    <div className="mt-10 border-t border-[var(--line)] pt-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-2xl font-semibold">Instructor Overview</h2>
        </div>
        <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--field)] text-[var(--muted)] hover:text-[var(--ink)] transition-colors"><X size={18} /></button>
      </div>

      <div className="mb-6 max-w-sm">
        <label className="block text-[15px] font-medium mb-2">Instructor</label>
        <select className="field appearance-none cursor-pointer pr-10" value={selected} onChange={(e) => onSelect(e.target.value)} style={dropdownStyle}>
          <option value="">Select an instructor</option>
          {instructors.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </div>

      {loading && <p className="text-sm text-[var(--muted)]">Loading sessions...</p>}
      {fetched && sessions.length === 0 && <p className="text-sm text-[var(--muted)]">No sessions found.</p>}

      {fetched && sessions.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 mb-6 max-w-sm">
            <div className="bg-[var(--card)] rounded-2xl p-5">
              <p className="text-xs text-[var(--muted)] mb-1">Sessions</p>
              <p className="text-2xl font-semibold text-[var(--ink)]">{sessions.length}</p>
            </div>
            <div className="bg-[var(--card)] rounded-2xl p-5">
              <p className="text-xs text-[var(--muted)] mb-1">Total Responses</p>
              <p className="text-2xl font-semibold text-[var(--ink)]">{sessions.reduce((a, s) => a + s.respCount, 0)}</p>
            </div>
          </div>

          <div className="bg-[var(--card)] rounded-2xl p-6 md:p-8">
            <h3 className="font-display text-lg font-semibold mb-4">Session History</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--ink)] font-semibold border-b border-[var(--line)]">
                    <th className="py-3 pr-4">#</th>
                    <th className="py-3 pr-4">Date</th>
                    <th className="py-3 pr-4">Program</th>
                    <th className="py-3 pr-4">Batch</th>
                    <th className="py-3 pr-4 text-center">Responses – Negatives</th>
                    <th className="py-3 pr-4 text-center">Avg Score</th>
                    <th className="py-3 pr-4 text-center">Highlighted Rows</th>
                    <th className="py-3 pr-4 text-center">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s, i) => {
                    const prev = i > 0 ? sessions[i - 1].avg : null;
                    return (
                      <tr key={s.key} className="border-b border-[var(--line)] last:border-0 text-[var(--ink-soft)]" style={{ backgroundColor: s.negRows >= 1 ? "#fff8e1" : "transparent" }}>
                        <td className="py-3 pr-4 text-[var(--muted)]">{i + 1}</td>
                        <td className="py-3 pr-4 whitespace-nowrap">{s.date}</td>
                        <td className="py-3 pr-4">{s.program || "—"}</td>
                        <td className="py-3 pr-4">{s.batch || "—"}</td>
                        <td className="py-3 pr-4 text-center">{s.respCount} – {s.negs}</td>
                        <td className="py-3 pr-4 text-center"><ScoreBadge score={s.avg} /></td>
                        <td className="py-3 pr-4 text-center"><span className={s.negRows > 0 ? "text-red-500 font-medium" : ""}>{s.negRows}</span></td>
                        <td className="py-3 pr-4 text-center"><TrendBadge current={s.avg} previous={prev} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6">
            <button type="button" className="btn-ghost border border-[var(--line)] flex items-center gap-2" onClick={onAnalyse} disabled={analysing}>
              {analysing ? "Analysing..." : "✦ Analyse feedback"}
            </button>
            {analysis && (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[var(--card)] rounded-2xl p-5">
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-3">What students liked</p>
                  <ul className="space-y-2">{analysis.top_praises.map((p, i) => <li key={i} className="text-sm text-[var(--ink-soft)] flex gap-2"><span className="text-emerald-500 mt-0.5">•</span><span>{p}</span></li>)}</ul>
                </div>
                <div className="bg-[var(--card)] rounded-2xl p-5">
                  <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-3">Repeated complaints</p>
                  {analysis.repeated_complaints.length === 0 ? <p className="text-sm text-[var(--muted)]">None found.</p> : <ul className="space-y-2">{analysis.repeated_complaints.map((c, i) => <li key={i} className="text-sm text-[var(--ink-soft)] flex gap-2"><span className="text-red-400 mt-0.5">•</span><span>{c}</span></li>)}</ul>}
                </div>
                <div className="bg-[var(--card)] rounded-2xl px-5 py-4 flex items-center gap-3">
                  <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Overall sentiment</p>
                  <span className={`text-sm font-semibold capitalize ${analysis.overall_sentiment === "positive" ? "text-emerald-600" : analysis.overall_sentiment === "negative" ? "text-red-500" : "text-amber-500"}`}>{analysis.overall_sentiment}</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Director Dashboard ───────────────────────────────────────────────────
export default function DirectorDashboardPage({ director, onLogout }) {
  // director is now an array of rows e.g. [{name, program, institution, username}, ...]
  const directorRows = Array.isArray(director) ? director : [director];
  const directorName = directorRows[0]?.name || directorRows[0]?.username || "Director";

  const programs = [...new Set(directorRows.map((r) => r.program).filter(Boolean))];

  // Paired program+institution list — kept alongside the flat `programs`
  // list so a program name reused across institutions doesn't get
  // conflated when scoping fetches.
  const programEntries = directorRows
    .map((r) => ({ program: r.program, institution: r.institution }))
    .filter((e) => e.program);

  const [selectedProgram, setSelectedProgram] = useState(programs.length === 1 ? programs[0] : "");
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [sessions, setSessions] = useState([]);
  const [allFetchedRows, setAllFetchedRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [combinedCsvUrl, setCombinedCsvUrl] = useState("");
  const [generatingCombined, setGeneratingCombined] = useState(false);
  const [viewSession, setViewSession] = useState(null);
  const [showInstructorOverview, setShowInstructorOverview] = useState(false);

  // Institution paired with the currently selected program — looked up from
  // the director's own rows (sourced from program_director at login), not
  // fetched separately.
  const selectedInstitution = directorRows.find((r) => r.program === selectedProgram)?.institution;

  // Reload batches when selected program (or its institution) changes
  useEffect(() => {
    if (!selectedProgram) { setBatches([]); setSelectedBatch(""); return; }
    (async () => {
      try {
        const rows = await fetchResponses({ program: selectedProgram, institution: selectedInstitution });
        const batchSet = new Set(rows.map((r) => r.batch).filter(Boolean));
        setBatches([...batchSet].sort());
        setSelectedBatch("");
      } catch (e) {}
    })();
  }, [selectedProgram, selectedInstitution]);

  const onFetch = async () => {
    if (!selectedProgram) { toast.error("Please select a program."); return; }
    setLoading(true);
    setCombinedCsvUrl("");
    try {
      const rows = await fetchResponses({
        program: selectedProgram,
        batch: selectedBatch || undefined,
        institution: selectedInstitution,
      });
      setAllFetchedRows(rows);
      setSessions(groupSessions(rows));
      setFetched(true);
      if (rows.length === 0) { toast.info("No feedback responses found."); return; }

      setGeneratingCombined(true);
      try {
        const activeFilterCount = [selectedProgram, selectedBatch].filter(Boolean).length;
        const res = await axios.post(`${API}/export/csv`, { responses: rows, include_email: false, include_avg_row: activeFilterCount >= 2 });
        const url = res.data.url.startsWith("http") ? res.data.url : `${process.env.REACT_APP_BACKEND_URL}${res.data.url}`;
        setCombinedCsvUrl(url);
        toast.success(`CSV ready (${rows.length} response${rows.length === 1 ? "" : "s"})`);
      } catch (e) {
        toast.error(`CSV export failed: ${e.message}`);
      } finally {
        setGeneratingCombined(false);
      }
    } catch (e) {
      toast.error(`Fetch failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const triggerDownload = async (url, filename) => {
    const resp = await axios.get(url, { responseType: "blob" });
    const blobUrl = URL.createObjectURL(resp.data);
    const a = document.createElement("a"); a.href = blobUrl; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  };

  const copyUrl = async () => {
    if (!combinedCsvUrl) return;
    try { await navigator.clipboard.writeText(combinedCsvUrl); toast.success("Link copied"); }
    catch { toast.error("Copy failed"); }
  };

  const dropdownStyle = { backgroundImage: "url(\"data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231a1416' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", backgroundSize: "14px" };

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-10">
      {viewSession && <ResponseModal session={viewSession} onClose={() => setViewSession(null)} />}

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-semibold">Dashboard</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Welcome, <span className="font-medium text-[var(--ink)]">{directorName}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-ghost border border-[var(--line)] flex items-center gap-2 text-sm" onClick={() => setShowInstructorOverview((v) => !v)}>
            {showInstructorOverview ? "Hide Instructor Overview" : "Instructor Overview"}
          </button>
          <button type="button" className="btn-ghost border border-[var(--line)] flex items-center gap-2 text-sm" onClick={onLogout}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 max-w-xl">
        <div>
          <label className="block text-[15px] font-medium mb-2">Program</label>
          <select className="field appearance-none cursor-pointer pr-10" value={selectedProgram} onChange={(e) => { setSelectedProgram(e.target.value); setFetched(false); }} style={dropdownStyle}>
            <option value="">Select a program</option>
            {programs.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[15px] font-medium mb-2">Batch</label>
          <select className="field appearance-none cursor-pointer pr-10" value={selectedBatch} onChange={(e) => setSelectedBatch(e.target.value)} disabled={!selectedProgram} style={dropdownStyle}>
            <option value="">All batches</option>
            {batches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>

      <div className="flex justify-center mb-10">
        <button type="button" className="btn-primary flex items-center gap-2" onClick={onFetch} disabled={loading || !selectedProgram}>
          <Search size={14} /> {loading ? "Fetching..." : "Fetch"}
        </button>
      </div>

      {/* Results */}
      {fetched && (
        <div className="bg-[var(--card)] rounded-2xl p-6 md:p-8">
          {sessions.length === 0 ? (
            <div className="text-center text-[var(--muted)] py-8 text-sm">No matching sessions.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--ink)] font-semibold border-b border-[var(--line)]">
                    <th className="py-3 pr-3">Program</th>
                    <th className="py-3 pr-3">Batch</th>
                    <th className="py-3 pr-3">Instructor</th>
                    <th className="py-3 pr-3">Date</th>
                    <th className="py-3 pr-3 text-center">Responses</th>
                    <th className="py-3 pr-3 text-center">Average score</th>
                    <th className="py-3 pr-3 text-center">Negatives</th>
                    <th className="py-3 pr-3 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.key} className="border-b border-[var(--line)] last:border-0 text-[var(--ink-soft)]" style={{ backgroundColor: s.negCount >= 3 ? "#fff8e1" : "transparent" }}>
                      <td className="py-3 pr-3">{s.program || "—"}</td>
                      <td className="py-3 pr-3">{s.batch || "—"}</td>
                      <td className="py-3 pr-3">{s.instructor || "—"}</td>
                      <td className="py-3 pr-3">{s.date}</td>
                      <td className="py-3 pr-3 text-center">{s.respCount}</td>
                      <td className="py-3 pr-3 text-center font-medium text-[var(--ink)]">{s.avgScore !== null ? s.avgScore.toFixed(2) : "—"}</td>
                      <td className="py-3 pr-3 text-center">{s.negCount}</td>
                      <td className="py-3 pr-3 text-right">
                        <button type="button" className="btn-ghost text-[var(--accent-strong)] flex items-center gap-1.5" onClick={() => setViewSession(s)}>
                          <Eye size={14} /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* CSV link */}
      <div className="mt-8">
        <label className="block text-[15px] font-medium mb-2">CSV link</label>
        <div className="flex gap-2 items-stretch">
          <input type="text" className="field" readOnly value={generatingCombined ? "Generating..." : combinedCsvUrl} placeholder="Click Fetch to generate the CSV link" />
          <button type="button" className="btn-ghost border border-[var(--line)] flex items-center gap-1.5" disabled={!combinedCsvUrl} onClick={copyUrl}>
            <Copy size={14} /> Copy
          </button>
          <button
            type="button"
            disabled={!allFetchedRows.length || generatingCombined}
            onClick={async () => {
              try {
                const filename = `feedback_${(selectedProgram || "program").replace(/[^a-z0-9]+/gi, "_")}_${selectedBatch || "all_batches"}.xlsx`;
                const activeFilterCount = [selectedProgram, selectedBatch].filter(Boolean).length;
                const res = await axios.post(`${API}/export/xlsx`, { responses: allFetchedRows, title: `Feedback – ${selectedProgram} – ${selectedBatch || "All batches"}`, include_email: false, include_avg_row: activeFilterCount >= 2 });
                const url = res.data.url.startsWith("http") ? res.data.url : `${process.env.REACT_APP_BACKEND_URL}${res.data.url}`;
                await triggerDownload(url, filename);
                toast.success("Excel downloaded");
              } catch (e) {
                toast.error(`Download failed: ${e.message}`);
              }
            }}
            className="btn-ghost border border-[var(--line)] flex items-center gap-1.5"
          >
            <ExternalLink size={14} /> Download
          </button>
        </div>
        {allFetchedRows.length > 0 && <p className="text-xs text-[var(--muted)] mt-2">{allFetchedRows.length} response{allFetchedRows.length === 1 ? "" : "s"} included.</p>}
      </div>

      {/* Instructor Overview */}
      {showInstructorOverview && (
        <InstructorOverview programEntries={programEntries} onClose={() => setShowInstructorOverview(false)} />
      )}
    </div>
  );
}
