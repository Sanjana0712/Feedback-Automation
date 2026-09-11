import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Calendar as CalendarIcon, Search, ExternalLink, Copy, Eye, X, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Send } from "lucide-react";
import { format } from "date-fns";
import { fetchDistinct, fetchResponses, fetchInstructorEmail } from "../lib/supabase";
import { NUMERIC_QUESTION_COLS } from "../lib/responseSchema";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Calendar } from "../components/ui/calendar";
import { usePersistedState } from "../context/PageStateContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const FILTER_COLUMNS = [
  { key: "institution", label: "Institution" },
  { key: "category", label: "Category" },
  { key: "program", label: "Program" },
  { key: "batch", label: "Batch" },
  { key: "instructor", label: "Instructor" },
];

const RESPONSE_COLS = [
  { key: "date_time", label: "Submitted Date & Time" },
  { key: "institution", label: "Institution" },
  { key: "category", label: "Category" },
  { key: "program", label: "Program" },
  { key: "batch", label: "Batch" },
  { key: "instructor", label: "Instructor" },
  { key: "how_would_you_rate_the_overall_content_of_the_session?", label: "How would you rate the overall content of the session?" },
  { key: "were_the_topics_covered_relevant_to_your_needs_and_expectations", label: "Were the topics covered relevant to your needs and expectations?" },
  { key: "rate_the_clarity_and_depth_of_the_information_provided", label: "Rate the clarity and depth of the information provided." },
  { key: "how_knowledgeable_was_the_instructor_about the_subject_matter?", label: "How knowledgeable was the instructor about the subject matter?" },
  { key: "how_engaging_was_the_instructor_in_delivering_the_content?", label: "How engaging was the instructor in delivering the content?" },
  { key: "rate_the_instructor's_ability_to_answer_questions_and_provide_e", label: "Rate the instructor's ability to answer questions and provide explanations." },
  { key: "how_would_you_rate_the_overall_organization_and_flow_of_the_ses", label: "How would you rate the overall organization and flow of the session?" },
  { key: "rate_the_activities/exercises_conducted_during_the_session_to_u", label: "Rate the activities/exercises conducted during the session to understand the concepts?" },
  { key: "rate_the_overall_interaction_and_engagement_opportunities_durin", label: "Rate the overall interaction and engagement opportunities during the session." },
  { key: "what_did_you_like_most_about_the_session?", label: "What did you like most about the session?" },
  { key: "what_areas_do_you_think_need_improvement", label: "What areas do you think need improvement" },
  { key: "email_address", label: "Email" },
];

// Builds a stable, filter-derived key used as the export filename so that
// re-fetching the exact same filter combination overwrites the same backend
// file instead of minting a new random one — meaning a link already copied
// or emailed to an instructor keeps working and reflects the latest data.
function buildSessionKey(f) {
  return [f.institution, f.category, f.program, f.batch, f.instructor]
    .map((v) => (v && v.trim() ? v.trim() : "all"))
    .join("_");
}

function toFloat(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// Per-respondent average across all numeric question columns
function respondentAvg(row) {
  const vals = NUMERIC_QUESTION_COLS.map((c) => toFloat(row[c])).filter((v) => v !== null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// NPS classification on a 1–5 scale:
//   Detractor : avg <= 3         (1, 2, 3)
//   Neutral   : avg > 3 and < 4  (3.1 – 3.9)
//   Promoter  : avg >= 4         (4.0 – 5.0)
function classifyNps(avg) {
  if (avg === null) return null;
  if (avg >= 4) return "promoter";
  if (avg > 3) return "neutral";
  return "detractor";
}

function calcNpsScore(responses) {
  const classified = responses
    .map((r) => classifyNps(respondentAvg(r)))
    .filter(Boolean);
  if (classified.length === 0) return { promoters: 0, neutrals: 0, detractors: 0, nps: null, total: 0 };
  const promoters = classified.filter((c) => c === "promoter").length;
  const neutrals = classified.filter((c) => c === "neutral").length;
  const detractors = classified.filter((c) => c === "detractor").length;
  const total = classified.length;
  const nps = Math.round(((promoters - detractors) / total) * 100);
  return { promoters, neutrals, detractors, nps, total };
}

function groupSessions(rows) {
  const map = new Map();
  for (const r of rows) {
    const date = r.date_time ? r.date_time.slice(0, 10) : "—";
    const key = [r.institution, r.category, r.program, r.batch, r.instructor, date].join("||");
    if (!map.has(key)) {
      map.set(key, {
        key,
        institution: r.institution,
        category: r.category,
        program: r.program,
        batch: r.batch,
        instructor: r.instructor,
        date,
        responses: [],
      });
    }
    map.get(key).responses.push(r);
  }

  return [...map.values()].map((s) => {
    const responses = s.responses;
    const perResp = responses.map((r) => {
      const vals = NUMERIC_QUESTION_COLS.map((c) => toFloat(r[c])).filter((v) => v !== null);
      if (vals.length === 0) return { avg: null, hasNeg: false };
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const hasNeg = vals.some((v) => v <= 3);
      return { avg, hasNeg };
    });
    const respAvgs = perResp.map((p) => p.avg).filter((v) => v !== null);
    const avgScore =
      respAvgs.length > 0
        ? Math.round((respAvgs.reduce((a, b) => a + b, 0) / respAvgs.length) * 100) / 100
        : null;
    const negCount = perResp.filter((p) => p.hasNeg).length;
    return { ...s, respCount: responses.length, avgScore, negCount };
  });
}

// ─── Response Modal ───────────────────────────────────────────────────────────
function ResponseModal({ session, onClose }) {
  const rows = session.responses;
  const pageRows = rows;

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const scoreColor = (val) => {
    const n = toFloat(val);
    if (n === null) return "";
    if (n >= 4) return "text-emerald-600 font-medium";
    return "text-red-600 font-bold";
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-screen mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between px-6 py-5 border-b border-[var(--line)] shrink-0">
          <div>
            <h2 className="font-display text-xl font-semibold text-[var(--ink)]">Session Responses</h2>
            <p className="text-xs text-[var(--muted)] mt-1">{rows.length} response{rows.length !== 1 ? "s" : ""}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--field)] text-[var(--muted)] hover:text-[var(--ink)] transition-colors" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-x-auto flex-1 px-6 py-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b border-[var(--line)]">
                <th className="py-2 pr-3 text-[var(--ink)] font-semibold">#</th>
                {RESPONSE_COLS.map((c) => (
                  <th key={c.key} className="py-2 pr-3 text-[var(--ink)] font-semibold">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, i) => {
                const negCount = NUMERIC_QUESTION_COLS.filter(c => {
                  const n = toFloat(row[c]);
                  return n !== null && n <= 3;
                }).length;
                const rowHighlight = negCount >= 3;
                return (
                  <tr key={row.id ?? i} className="border-b border-[var(--line)] last:border-0" style={{ backgroundColor: rowHighlight ? "#fff8e1" : "transparent" }}>
                    <td className="py-2.5 pr-3 text-[var(--muted)]">{i + 1}</td>
                    {RESPONSE_COLS.map((c) => {
                      const val = row[c.key];
                      const isNumeric = NUMERIC_QUESTION_COLS.includes(c.key);
                      return (
                        <td key={c.key} className={`py-2.5 pr-3 ${isNumeric ? scoreColor(val) : "text-[var(--ink-soft)]"}`} style={{ maxWidth: "200px" }}>
                          <span title={val || "—"} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: isNumeric ? "nowrap" : "normal" }}>
                            {val || "—"}
                          </span>
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

// ─── Instructor Overview ──────────────────────────────────────────────────────
function avgScoreForResponses(responses) {
  const allVals = responses.flatMap((r) =>
    NUMERIC_QUESTION_COLS.map((c) => toFloat(r[c])).filter((v) => v !== null)
  );
  if (allVals.length === 0) return null;
  return Math.round((allVals.reduce((a, b) => a + b, 0) / allVals.length) * 100) / 100;
}

function negCountForResponses(responses) {
  return responses.filter((r) =>
    NUMERIC_QUESTION_COLS.some((c) => {
      const n = toFloat(r[c]);
      return n !== null && n <= 3;
    })
  ).length;
}

function negRowsForResponses(responses) {
  return responses.filter((r) =>
    NUMERIC_QUESTION_COLS.filter((c) => {
      const n = toFloat(r[c]);
      return n !== null && n <= 3;
    }).length >= 3
  ).length;
}

function groupBySession(rows) {
  const map = new Map();
  for (const r of rows) {
    const date = r.date_time ? r.date_time.slice(0, 10) : "—";
    const key = [r.institution, r.category, r.program, r.batch, date].join("||");
    if (!map.has(key)) {
      map.set(key, { key, date, institution: r.institution, category: r.category, program: r.program, batch: r.batch, responses: [] });
    }
    map.get(key).responses.push(r);
  }
  return [...map.values()]
    .map((s) => ({
      ...s,
      respCount: s.responses.length,
      avg: avgScoreForResponses(s.responses),
      negs: negCountForResponses(s.responses),
      negRows: negRowsForResponses(s.responses),
    }))
    .sort((a, b) => (a.date > b.date ? 1 : -1));
}

function ScoreBadge({ score }) {
  if (score === null) return <span className="text-[var(--muted)]">—</span>;
  const color =
    score >= 4 ? "text-emerald-600 font-semibold"
    : score > 3 ? "text-amber-500 font-medium"
    : "text-red-600 font-semibold";
  return <span className={color}>{score.toFixed(2)}</span>;
}

function TrendBadge({ current, previous }) {
  if (previous === null || current === null) return <span className="text-[var(--muted)] text-xs">—</span>;
  const diff = current - previous;
  if (Math.abs(diff) < 0.005)
    return <span className="flex items-center gap-1 text-[var(--muted)] text-xs"><Minus size={13} /> Same</span>;
  if (diff > 0)
    return <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium"><TrendingUp size={13} /> +{diff.toFixed(2)}</span>;
  return <span className="flex items-center gap-1 text-red-500 text-xs font-medium"><TrendingDown size={13} /> {diff.toFixed(2)}</span>;
}

function InstructorOverview({ onClose }) {
  const [instructors, setInstructors] = useState([]);
  const [selected, setSelected] = useState("");
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [analysing, setAnalysing] = useState(false);

  useEffect(() => {
    fetchDistinct("instructor").then(setInstructors).catch(() => {});
  }, []);

  const onSelect = async (instructor) => {
    setSelected(instructor);
    setSessions([]);
    setFetched(false);
    setAnalysis(null);
    if (!instructor) return;
    setLoading(true);
    try {
      const rows = await fetchResponses({ instructor });
      setSessions(groupBySession(rows));
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
      const likedText = allResponses
        .map(r => r["what_did_you_like_most_about_the_session?"])
        .filter(v => v && v.trim() && v.trim().toLowerCase() !== "na" && v.trim() !== "-")
        .join("\n");
      const improvementText = allResponses
        .map(r => r["what_areas_do_you_think_need_improvement"])
        .filter(v => v && v.trim() && v.trim().toLowerCase() !== "na" && v.trim() !== "-")
        .join("\n");
      if (!likedText && !improvementText) {
        toast.info("No qualitative feedback found for this instructor.");
        return;
      }
      const prompt = `You are analysing student feedback for an instructor across multiple sessions.
WHAT STUDENTS LIKED:
${likedText || "No responses"}
AREAS FOR IMPROVEMENT:
${improvementText || "No responses"}
Identify patterns across all sessions. Respond ONLY with a JSON object, no markdown, no explanation:
{
  "top_praises": ["most common praise 1", "most common praise 2", "most common praise 3"],
  "repeated_complaints": ["most repeated complaint 1", "most repeated complaint 2", "most repeated complaint 3"],
  "improvement_suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"],
  "overall_sentiment": "positive or mixed or negative"
}`;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.REACT_APP_GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(`Gemini API error: ${res.status} — ${data?.error?.message || "unknown"}`);
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const clean = raw.replace(/```json|```/g, "").trim();
      setAnalysis(JSON.parse(clean));
    } catch (e) {
      toast.error(`Analysis failed: ${e.message}`);
    } finally {
      setAnalysing(false);
    }
  };

  return (
    <div className="mt-10 border-t border-[var(--line)] pt-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-2xl font-semibold">Instructor Overview</h2>
          <p className="text-sm text-[var(--muted)] mt-1">Select an instructor to see their session history and performance trend.</p>
        </div>
        <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--field)] text-[var(--muted)] hover:text-[var(--ink)] transition-colors" aria-label="Close overview">
          <X size={18} />
        </button>
      </div>

      <div className="mb-6 max-w-sm">
        <label className="block text-[15px] font-medium mb-2">Instructor</label>
        <select
          className="field appearance-none cursor-pointer pr-10"
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
          style={{
            backgroundImage: "url(\"data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231a1416' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 12px center",
            backgroundSize: "14px",
          }}
        >
          <option value="">Select an instructor</option>
          {instructors.map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </div>

      {loading && <p className="text-sm text-[var(--muted)]">Loading sessions...</p>}
      {fetched && sessions.length === 0 && <p className="text-sm text-[var(--muted)]">No sessions found for this instructor.</p>}

      {fetched && sessions.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
                    <th className="py-3 pr-4">Institution</th>
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
                    const rowBg = s.negRows >= 1 ? "#fff8e1" : "transparent";
                    return (
                      <tr key={s.key} className="border-b border-[var(--line)] last:border-0 text-[var(--ink-soft)]" style={{ backgroundColor: rowBg }}>
                        <td className="py-3 pr-4 text-[var(--muted)]">{i + 1}</td>
                        <td className="py-3 pr-4 whitespace-nowrap">{s.date}</td>
                        <td className="py-3 pr-4">{s.institution || "—"}</td>
                        <td className="py-3 pr-4">{s.program || "—"}</td>
                        <td className="py-3 pr-4">{s.batch || "—"}</td>
                        <td className="py-3 pr-4 text-center">{s.respCount} – {s.negs}</td>
                        <td className="py-3 pr-4 text-center"><ScoreBadge score={s.avg} /></td>
                        <td className="py-3 pr-4 text-center">
                          <span className={s.negRows > 0 ? "text-red-500 font-medium" : ""}>{s.negRows}</span>
                        </td>
                        <td className="py-3 pr-4 text-center"><TrendBadge current={s.avg} previous={prev} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6">
            <button
              type="button"
              className="btn-ghost border border-[var(--line)] flex items-center gap-2"
              onClick={onAnalyse}
              disabled={analysing}
            >
              {analysing ? "Analysing..." : "✦ Analyse feedback"}
            </button>
            {analysis && (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[var(--card)] rounded-2xl p-5">
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-3">What students liked</p>
                  <ul className="space-y-2">
                    {analysis.top_praises.map((p, i) => (
                      <li key={i} className="text-sm text-[var(--ink-soft)] flex gap-2">
                        <span className="text-emerald-500 mt-0.5">•</span><span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-[var(--card)] rounded-2xl p-5">
                  <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-3">Repeated complaints</p>
                  {analysis.repeated_complaints.length === 0 ? (
                    <p className="text-sm text-[var(--muted)]">No repeated complaints found.</p>
                  ) : (
                    <ul className="space-y-2">
                      {analysis.repeated_complaints.map((c, i) => (
                        <li key={i} className="text-sm text-[var(--ink-soft)] flex gap-2">
                          <span className="text-red-400 mt-0.5">•</span><span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="md:col-span-2 bg-[var(--card)] rounded-2xl px-5 py-4 flex items-center gap-3 mt-2">
                  <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Overall sentiment</p>
                  <span className={`text-sm font-semibold capitalize ${
                    analysis.overall_sentiment === "positive" ? "text-emerald-600"
                    : analysis.overall_sentiment === "negative" ? "text-red-500"
                    : "text-amber-500"
                  }`}>{analysis.overall_sentiment}</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── NPS View ─────────────────────────────────────────────────────────────────
// Adapted NPS for a 1–5 rating scale, per respondent's average across all
// numeric question columns:
//   Promoter  : avg >= 4.5
//   Neutral   : avg >= 3.5 and < 4.5
//   Detractor : avg < 3.5
// NPS score  = % Promoters − % Detractors  (−100 to +100)

function NpsBar({ promoters, neutrals, detractors, total }) {
  if (total === 0) return null;
  const pPct = Math.round((promoters / total) * 100);
  const nPct = Math.round((neutrals / total) * 100);
  const dPct = 100 - pPct - nPct;
  return (
    <div className="flex rounded-full overflow-hidden h-3 w-full" style={{ minWidth: "120px" }}>
      {pPct > 0 && <div style={{ width: `${pPct}%`, backgroundColor: "#34d399" }} title={`Promoters ${pPct}%`} />}
      {nPct > 0 && <div style={{ width: `${nPct}%`, backgroundColor: "#fbbf24" }} title={`Neutrals ${nPct}%`} />}
      {dPct > 0 && <div style={{ width: `${dPct}%`, backgroundColor: "#f87171" }} title={`Detractors ${dPct}%`} />}
    </div>
  );
}

function NpsBadge({ score }) {
  if (score === null) return <span className="text-[var(--muted)]">—</span>;
  const color =
    score >= 50 ? "text-emerald-600 font-bold"
    : score >= 0 ? "text-amber-500 font-semibold"
    : "text-red-600 font-bold";
  return <span className={color}>{score > 0 ? `+${score}` : score}</span>;
}

function NpsTrend({ current, previous }) {
  if (previous === null || current === null) return <span className="text-[var(--muted)] text-xs">—</span>;
  const diff = current - previous;
  if (diff === 0) return <span className="flex items-center gap-1 text-[var(--muted)] text-xs"><Minus size={13} /> Same</span>;
  if (diff > 0) return <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium"><TrendingUp size={13} /> +{diff}</span>;
  return <span className="flex items-center gap-1 text-red-500 text-xs font-medium"><TrendingDown size={13} /> {diff}</span>;
}

function groupNpsBySession(rows) {
  const map = new Map();
  for (const r of rows) {
    const date = r.date_time ? r.date_time.slice(0, 10) : "—";
    const key = [r.institution, r.category, r.program, r.batch, r.instructor, date].join("||");
    if (!map.has(key)) {
      map.set(key, {
        key,
        date,
        institution: r.institution,
        category: r.category,
        program: r.program,
        batch: r.batch,
        instructor: r.instructor,
        responses: [],
      });
    }
    map.get(key).responses.push(r);
  }
  return [...map.values()]
    .map((s) => ({ ...s, ...calcNpsScore(s.responses) }))
    .sort((a, b) => (a.date > b.date ? 1 : -1));
}

// ─── Student history helper ───────────────────────────────────────────────────
// Groups all responses by email, classifies each one, then buckets students
// into constant-promoter / constant-neutral / constant-detractor / mixed.
// Only students who appear in MORE THAN ONE session are included (single
// appearances can't show a pattern).
function buildStudentHistory(sessions) {
  // Map: email → array of { date, sessionLabel, avg, classification }
  const byEmail = new Map();

  for (const session of sessions) {
    const sessionLabel = [session.date, session.instructor || ""].filter(Boolean).join(" · ");
    for (const r of session.responses) {
      const email = (r.email_address || "").trim().toLowerCase();
      if (!email) continue;
      const avg = respondentAvg(r);
      const cls = classifyNps(avg);
      if (!cls) continue;
      if (!byEmail.has(email)) byEmail.set(email, []);
      byEmail.get(email).push({
        date: session.date,
        sessionLabel,
        avg: avg !== null ? Math.round(avg * 100) / 100 : null,
        classification: cls,
      });
    }
  }

  const promoters = [], neutrals = [], detractors = [], mixed = [];

  for (const [email, entries] of byEmail.entries()) {
    // Sort chronologically
    entries.sort((a, b) => (a.date > b.date ? 1 : -1));
    if (entries.length < 2) continue; // need at least 2 sessions to be "constant"

    const classes = entries.map((e) => e.classification);
    const allSame = classes.every((c) => c === classes[0]);

    const student = { email, entries };
    if (allSame) {
      if (classes[0] === "promoter") promoters.push(student);
      else if (classes[0] === "neutral") neutrals.push(student);
      else detractors.push(student);
    } else {
      mixed.push(student);
    }
  }

  return { promoters, neutrals, detractors, mixed };
}

const CLS_CONFIG = {
  promoter:  { label: "Constant Promoters",  color: "text-emerald-600", bg: "#f0fdf4", dot: "#34d399" },
  neutral:   { label: "Constant Neutrals",   color: "text-amber-500",   bg: "#fffbeb", dot: "#fbbf24" },
  detractor: { label: "Constant Detractors", color: "text-red-500",     bg: "#fff1f2", dot: "#f87171" },
  mixed:     { label: "Mixed",               color: "text-[var(--ink-soft)]", bg: "transparent", dot: "#94a3b8" },
};

function ClassificationDot({ cls }) {
  const cfg = CLS_CONFIG[cls] || CLS_CONFIG.mixed;
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full"
      style={{ backgroundColor: cfg.dot }}
      title={cls}
    />
  );
}

function StudentConsistencySection({ sessions }) {
  const [activeTab, setActiveTab] = useState("promoter");
  const { promoters, neutrals, detractors, mixed } = useMemo(
    () => buildStudentHistory(sessions),
    [sessions]
  );

  const tabData = {
    promoter:  promoters,
    neutral:   neutrals,
    detractor: detractors,
    mixed,
  };

  const tabs = [
    { key: "promoter",  label: `Promoters (${promoters.length})` },
    { key: "neutral",   label: `Neutrals (${neutrals.length})` },
    { key: "detractor", label: `Detractors (${detractors.length})` },
    { key: "mixed",     label: `Mixed (${mixed.length})` },
  ];

  const students = tabData[activeTab] || [];
  const cfg = CLS_CONFIG[activeTab];

  return (
    <div className="mt-8">
      <div className="mb-4">
        <h3 className="font-display text-lg font-semibold">Promoters, Neutrals & Detractors</h3>

      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-[var(--line)]">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === t.key
                ? `border-[var(--ink)] ${CLS_CONFIG[t.key].color}`
                : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {students.length === 0 ? (
        <p className="text-sm text-[var(--muted)] py-4">
          No students in this category across multiple sessions.
        </p>
      ) : (
        <div className="bg-[var(--card)] rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink)] font-semibold border-b border-[var(--line)]">
                <th className="py-3 px-5">#</th>
                <th className="py-3 px-5">Email</th>
                <th className="py-3 px-5">Session history</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => (
                <tr
                  key={s.email}
                  className="border-b border-[var(--line)] last:border-0"
                  style={{ backgroundColor: i % 2 === 0 ? cfg.bg : "transparent" }}
                >
                  <td className="py-3 px-5 text-[var(--muted)]">{i + 1}</td>
                  <td className="py-3 px-5 font-medium text-[var(--ink)] whitespace-nowrap">
                    {s.email}
                  </td>
                  <td className="py-3 px-5">
                    <div className="flex flex-wrap gap-2">
                      {s.entries.map((e, j) => (
                        <span
                          key={j}
                          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-[var(--line)] bg-white"
                          title={`Avg: ${e.avg ?? "—"}`}
                        >
                          <ClassificationDot cls={e.classification} />
                          <span className="text-[var(--ink-soft)]">{e.date}</span>
                          {e.avg !== null && (
                            <span className={`font-medium ${CLS_CONFIG[e.classification]?.color || ""}`}>
                              {e.avg.toFixed(2)}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NPSView({ initialFilters, onClose }) {
  const [distinct, setDistinct] = useState({ institution: [], category: [], program: [], batch: [] });
  const [sel, setSel] = useState({
    institution: initialFilters?.institution || "",
    category: initialFilters?.category || "",
    program: initialFilters?.program || "",
    batch: initialFilters?.batch || "",
  });
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [showStudents, setShowStudents] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchDistinct("institution"),
      fetchDistinct("category"),
      fetchDistinct("program"),
      fetchDistinct("batch"),
    ]).then(([institution, category, program, batch]) => {
      setDistinct({ institution, category, program, batch });
    }).catch(() => {});
  }, []);

  // If parent filters change and we haven't fetched yet, keep in sync
  useEffect(() => {
    setSel({
      institution: initialFilters?.institution || "",
      category: initialFilters?.category || "",
      program: initialFilters?.program || "",
      batch: initialFilters?.batch || "",
    });
  }, [initialFilters?.institution, initialFilters?.category, initialFilters?.program, initialFilters?.batch]);

  const updateSel = (k, v) => setSel((s) => ({ ...s, [k]: v }));

  const onFetch = async () => {
    setLoading(true);
    setSessions([]);
    try {
      // Fetch ALL sessions for the selected program+batch (across all dates/instructors)
      // so we can compare current performance against historical
      const rows = await fetchResponses({
        institution: sel.institution || undefined,
        category: sel.category || undefined,
        program: sel.program || undefined,
        batch: sel.batch || undefined,
      });
      if (rows.length === 0) {
        toast.info("No responses found for the selected filters.");
        setFetched(true);
        setSessions([]);
        return;
      }
      setSessions(groupNpsBySession(rows));
      setFetched(true);
    } catch (e) {
      toast.error(`Failed to load NPS data: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Aggregated across all sessions shown
  const overall = useMemo(() => {
    if (sessions.length === 0) return null;
    const allResponses = sessions.flatMap((s) => s.responses);
    return calcNpsScore(allResponses);
  }, [sessions]);

  const latestNps = sessions.length > 0 ? sessions[sessions.length - 1].nps : null;
  const firstNps = sessions.length > 0 ? sessions[0].nps : null;

  const dropdownStyle = {
    backgroundImage: "url(\"data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231a1416' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
    backgroundSize: "14px",
  };

  return (
    <div className="mt-10 border-t border-[var(--line)] pt-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="font-display text-2xl font-semibold">NPS View</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-[var(--field)] text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
          aria-label="Close NPS view"
        >
          <X size={18} />
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { key: "institution", label: "Institution" },
          { key: "category", label: "Category" },
          { key: "program", label: "Program" },
          { key: "batch", label: "Batch" },
        ].map((f) => (
          <div key={f.key}>
            <label className="block text-[14px] font-medium mb-1.5">{f.label}</label>
            <select
              className="field appearance-none cursor-pointer pr-10 text-sm"
              value={sel[f.key]}
              onChange={(e) => updateSel(f.key, e.target.value)}
              style={dropdownStyle}
            >
              <option value="">All</option>
              {distinct[f.key]?.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        ))}
      </div>

      <div className="flex justify-center mb-8">
        <button
          type="button"
          className="btn-primary flex items-center gap-2"
          onClick={onFetch}
          disabled={loading}
        >
          <Search size={14} /> {loading ? "Loading..." : "Load NPS"}
        </button>
      </div>

      

      {/* Per-session breakdown table */}
      {fetched && sessions.length === 0 && (
        <p className="text-sm text-[var(--muted)] text-center py-8">No data found for the selected filters.</p>
      )}

      {/* How we classify — always visible once loaded */}
      {fetched && sessions.length > 0 && (
        <div className="mb-6 rounded-xl border border-[var(--line)] px-5 py-4 text-sm text-[var(--ink-soft)] bg-[var(--field)]">
          <div className="flex flex-wrap gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span><strong>Promoter</strong> — Avg ≥ 4.0</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span><strong>Neutral</strong> — Avg 3.1–3.9</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-400" />
              <span><strong>Detractor</strong> — Avg ≤ 3.0</span>
            </span>
          </div>
        </div>
      )}

      {fetched && sessions.length > 0 && (
        <div className="bg-[var(--card)] rounded-2xl p-6 md:p-8">
          <h3 className="font-display text-lg font-semibold mb-4">Session-by-session breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--ink)] font-semibold border-b border-[var(--line)]">
                  <th className="py-3 pr-4">#</th>
                  <th className="py-3 pr-4">Date</th>
                  <th className="py-3 pr-4">Institution</th>
                  <th className="py-3 pr-4">Program</th>
                  <th className="py-3 pr-4">Batch</th>
                  <th className="py-3 pr-4">Instructor</th>
                  <th className="py-3 pr-4 text-center">Responses</th>
                  <th className="py-3 pr-4 text-center">Promoters</th>
                  <th className="py-3 pr-4 text-center">Neutrals</th>
                  <th className="py-3 pr-4 text-center">Detractors</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => {
                  const pPct = s.total > 0 ? Math.round((s.promoters / s.total) * 100) : 0;
                  const dPct = s.total > 0 ? Math.round((s.detractors / s.total) * 100) : 0;
                  return (
                    <tr
                      key={s.key}
                      className="border-b border-[var(--line)] last:border-0 text-[var(--ink-soft)]"
                    >
                      <td className="py-3 pr-4 text-[var(--muted)]">{i + 1}</td>
                      <td className="py-3 pr-4 whitespace-nowrap">{s.date}</td>
                      <td className="py-3 pr-4">{s.institution || "—"}</td>
                      <td className="py-3 pr-4">{s.program || "—"}</td>
                      <td className="py-3 pr-4">{s.batch || "—"}</td>
                      <td className="py-3 pr-4">{s.instructor || "—"}</td>
                      <td className="py-3 pr-4 text-center">{s.total}</td>
                      <td className="py-3 pr-4 text-center text-emerald-600 font-medium">
                        {s.promoters} <span className="text-xs text-[var(--muted)] font-normal">({pPct}%)</span>
                      </td>
                      <td className="py-3 pr-4 text-center text-amber-500 font-medium">
                        {s.neutrals} <span className="text-xs text-[var(--muted)] font-normal">({s.total > 0 ? Math.round((s.neutrals / s.total) * 100) : 0}%)</span>
                      </td>
                      <td className="py-3 pr-4 text-center text-red-500 font-medium">
                        {s.detractors} <span className="text-xs text-[var(--muted)] font-normal">({dPct}%)</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Student consistency toggle */}
      {fetched && sessions.length > 0 && (
        <div className="mt-8 border-t border-[var(--line)] pt-6">
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="btn-ghost border border-[var(--line)] text-sm"
              onClick={() => setShowStudents((v) => !v)}
            >
              {showStudents ? "Hide" : "Show students"}
            </button>
          </div>

          {showStudents && <StudentConsistencySection sessions={sessions} />}
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [filters, setFilters] = usePersistedState("dashboard:filters", {
    date: "", institution: "", category: "", program: "", batch: "", instructor: "",
  });
  const [distinct, setDistinct] = useState({
    institution: [], category: [], program: [], batch: [], instructor: [],
  });
  const [sessions, setSessions] = usePersistedState("dashboard:sessions", []);
  const [allFetchedRows, setAllFetchedRows] = usePersistedState("dashboard:allFetchedRows", []);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = usePersistedState("dashboard:fetched", false);
  const [combinedCsvUrl, setCombinedCsvUrl] = usePersistedState("dashboard:combinedCsvUrl", "");
  const [generatingCombined, setGeneratingCombined] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewSession, setViewSession] = useState(null);
  const [showInstructorOverview, setShowInstructorOverview] = usePersistedState("dashboard:showInstructorOverview", false);
  const [showNps, setShowNps] = usePersistedState("dashboard:showNps", false);
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    (async () => {
      const result = {};
      await Promise.all(FILTER_COLUMNS.map(async (f) => { result[f.key] = await fetchDistinct(f.key); }));
      setDistinct(result);
    })();
  }, []);

  const updateFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const onFetch = async () => {
    setLoading(true);
    setCombinedCsvUrl("");
    try {
      const rows = await fetchResponses(filters);
      setAllFetchedRows(rows);
      setSessions(groupSessions(rows));
      setFetched(true);
      if (rows.length === 0) { toast.info("No feedback responses match these filters."); return; }

      setGeneratingCombined(true);
try {
  // Uses XLSX rather than CSV specifically so the average row and rows
  // with repeated negative scores get real cell highlighting — plain CSV
  // has no way to carry cell colors/formatting, only XLSX does (see
  // build_xlsx on the backend). session_key still makes this overwrite
  // in place so a previously shared/emailed link stays valid.
  const res = await axios.post(`${API}/export/xlsx`, {
    responses: rows,
    include_email: false,
    include_avg_row: true,
    session_key: buildSessionKey(filters),
  });

  const url = res.data.url.startsWith("http") ? res.data.url : `${process.env.REACT_APP_BACKEND_URL}${res.data.url}`;
  setCombinedCsvUrl(url);
  toast.success(`Report link ready (${rows.length} response${rows.length === 1 ? "" : "s"})`);
} catch (e) {
  toast.error(`Export failed: ${e.message}`);
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
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  };

  const copyUrl = async () => {
    if (!combinedCsvUrl) return;
    try {
      await navigator.clipboard.writeText(combinedCsvUrl);
      toast.success("Link copied");
    } catch (e) {
      toast.error("Copy failed");
    }
  };

  // Looks up the selected instructor's email in Supabase, then asks the
  // backend to send the already-generated CSV link to them via Gmail SMTP.
  const onSendToInstructor = async () => {
    if (!filters.instructor) {
      toast.error("Select an instructor first.");
      return;
    }
    if (!combinedCsvUrl) {
      toast.error("Generate the CSV link first by clicking Fetch.");
      return;
    }
    setSendingEmail(true);
    try {
      const email = await fetchInstructorEmail(filters.instructor);
      if (!email) {
        toast.error(`No email on file for ${filters.instructor}. Add one in the Admin panel.`);
        return;
      }
      await axios.post(`${API}/export/send-email`, {
        instructor_email: email,
        instructor_name: filters.instructor,
        csv_url: combinedCsvUrl,
        session_label: filters.date || "",
      });
      toast.success(`Emailed report to ${filters.instructor}`);
    } catch (e) {
      toast.error(`Send failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-10">
      {viewSession && <ResponseModal session={viewSession} onClose={() => setViewSession(null)} />}

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-semibold" data-testid="dashboard-heading">Dashboard</h1>
          <p className="text-sm text-[var(--muted)] mt-2">Filter feedback by session attributes and view aggregated scores.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-ghost border border-[var(--line)] flex items-center gap-2 text-sm"
            onClick={() => setShowNps((v) => !v)}
          >
            {showNps ? "Hide NPS" : "View NPS"}
          </button>
          <button
            type="button"
            className="btn-ghost border border-[var(--line)] flex items-center gap-2 text-sm"
            onClick={() => setShowInstructorOverview((v) => !v)}
          >
            {showInstructorOverview ? "Hide Instructor Overview" : "Instructor Overview"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div>
          <label className="block text-[15px] font-medium mb-2">Date</label>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="field flex items-center justify-between text-left" data-testid="filter-date-trigger">
                <span className={filters.date ? "" : "text-[var(--muted)]"}>{filters.date || "Select a date"}</span>
                <CalendarIcon size={14} className="text-[var(--muted)]" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.date ? new Date(filters.date) : undefined}
                onSelect={(d) => { updateFilter("date", d ? format(d, "yyyy-MM-dd") : ""); setCalendarOpen(false); }}
              />
              {filters.date && (
                <div className="p-2 border-t flex justify-end">
                  <button type="button" onClick={() => { updateFilter("date", ""); setCalendarOpen(false); }} className="text-xs text-[var(--muted)] hover:text-[var(--ink)]" data-testid="filter-date-clear">Clear</button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {FILTER_COLUMNS.map((f) => (
          <div key={f.key}>
            <label className="block text-[15px] font-medium mb-2">{f.label}</label>
            <select
              className="field appearance-none cursor-pointer pr-10"
              value={filters[f.key]}
              onChange={(e) => updateFilter(f.key, e.target.value)}
              data-testid={`filter-${f.key}`}
              style={{
                backgroundImage: "url(\"data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231a1416' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 12px center",
                backgroundSize: "14px",
              }}
            >
              <option value="">All</option>
              {distinct[f.key]?.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        ))}
      </div>

      <div className="flex justify-center mb-10">
        <button type="button" className="btn-primary flex items-center gap-2" onClick={onFetch} disabled={loading} data-testid="dashboard-fetch-button">
          <Search size={14} /> {loading ? "Fetching..." : "Fetch"}
        </button>
      </div>

      {/* Results */}
      {fetched && (
        <div className="bg-[var(--card)] rounded-2xl p-6 md:p-8" data-testid="dashboard-results">
          {sessions.length === 0 ? (
            <div className="text-center text-[var(--muted)] py-8 text-sm">No matching sessions.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--ink)] font-semibold border-b border-[var(--line)]">
                    <th className="py-3 pr-3">Institution</th>
                    <th className="py-3 pr-3">Category</th>
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
                    <tr key={s.key} className="border-b border-[var(--line)] last:border-0 text-[var(--ink-soft)]" style={{ backgroundColor: s.negCount >= 3 ? "#fff8e1" : "transparent" }} data-testid={`session-row-${s.key}`}>
                      <td className="py-3 pr-3">{s.institution || "—"}</td>
                      <td className="py-3 pr-3">{s.category || "—"}</td>
                      <td className="py-3 pr-3">{s.program || "—"}</td>
                      <td className="py-3 pr-3">{s.batch || "—"}</td>
                      <td className="py-3 pr-3">{s.instructor || "—"}</td>
                      <td className="py-3 pr-3">{s.date}</td>
                      <td className="py-3 pr-3 text-center">{s.respCount}</td>
                      <td className="py-3 pr-3 text-center font-medium text-[var(--ink)]">{s.avgScore !== null ? s.avgScore.toFixed(2) : "—"}</td>
                      <td className="py-3 pr-3 text-center">{s.negCount}</td>
                      <td className="py-3 pr-3 text-right">
                        <button type="button" className="btn-ghost text-[var(--accent-strong)] flex items-center gap-1.5" onClick={() => setViewSession(s)} data-testid={`view-button-${s.key}`}>
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
          <input type="text" className="field" readOnly value={generatingCombined ? "Generating..." : combinedCsvUrl} placeholder="Click Fetch above to generate the combined CSV link" data-testid="combined-csv-input" />
          <button type="button" className="btn-ghost border border-[var(--line)] flex items-center gap-1.5" disabled={!combinedCsvUrl} onClick={copyUrl} data-testid="copy-csv-button">
            <Copy size={14} /> Copy
          </button>
          <button
  type="button"
  disabled={!allFetchedRows.length || generatingCombined}
  onClick={async () => {
    try {
      const instructor = filters.instructor ? filters.instructor.replace(/[^a-z0-9]+/gi, "_") : "all";
      const meetingLabel = filters.date ? filters.date : "all_dates";
      const filename = `feedback_${instructor}_${meetingLabel}.xlsx`;
      // Deliberately NOT passing session_key here — Download should only ever
      // contain the rows from the current fetch (allFetchedRows), scoped to
      // whatever filters are currently selected. Passing session_key would
      // make the backend merge in rows from every past fetch under this same
      // filter combo (that behavior is intentional only for the CSV link /
      // Send to Instructor flow, which is meant to be a durable, cumulative
      // report).
      const res = await axios.post(`${API}/export/xlsx`, {
        responses: allFetchedRows,
        title: `Feedback – ${filters.instructor || "All"} – ${filters.date || "All dates"}`,
        include_email: false,
        include_avg_row: true,
      });
      const url = res.data.url.startsWith("http") ? res.data.url : `${process.env.REACT_APP_BACKEND_URL}${res.data.url}`;
      await triggerDownload(url, filename);
      toast.success("Excel downloaded");
    } catch (e) {
      toast.error(`Download failed: ${e.message}`);
    }
  }}
  className="btn-ghost border border-[var(--line)] flex items-center gap-1.5"
  data-testid="open-csv-link"
>
  <ExternalLink size={14} /> Download
</button>
          <button
            type="button"
            disabled={!combinedCsvUrl || !filters.instructor || sendingEmail}
            onClick={onSendToInstructor}
            className="btn-ghost border border-[var(--line)] flex items-center gap-1.5"
            data-testid="send-instructor-email"
            title={!filters.instructor ? "Select an instructor above to enable sending" : undefined}
          >
            <Send size={14} /> {sendingEmail ? "Sending..." : "Send to instructor"}
          </button>
        </div>
        {allFetchedRows.length > 0 && (
          <p className="text-xs text-[var(--muted)] mt-2">{allFetchedRows.length} response{allFetchedRows.length === 1 ? "" : "s"} included.</p>
        )}
        {!filters.instructor && combinedCsvUrl && (
          <p className="text-xs text-[var(--muted)] mt-1">Select an instructor filter above to enable "Send to instructor".</p>
        )}
      </div>

      {/* NPS View — rendered inline below */}
      {showNps && (
        <NPSView
          initialFilters={filters}
          onClose={() => setShowNps(false)}
        />
      )}

      {/* Instructor Overview — rendered inline below */}
      {showInstructorOverview && (
        <InstructorOverview onClose={() => setShowInstructorOverview(false)} />
      )}
    </div>
  );
}