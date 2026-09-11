import { useEffect, useState } from "react";
import { Calendar as CalendarIcon, Search, Copy, ExternalLink, FileDown } from "lucide-react";
import { format } from "date-fns";
import axios from "axios";
import { toast } from "sonner";
import { fetchDistinct, fetchResponses, fetchAllSpoc, matchSpoc } from "../lib/supabase";
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

// All question columns to display (short labels for header)
const QUESTION_COLS = [
  {
    key: "how_would_you_rate_the_overall_content_of_the_session?",
    label: "Overall content",
  },
  {
    key: "were_the_topics_covered_relevant_to_your_needs_and_expectations",
    label: "Topics relevant",
  },
  {
    key: "rate_the_clarity_and_depth_of_the_information_provided",
    label: "Clarity & depth",
  },
  {
    key: "how_knowledgeable_was_the_instructor_about the_subject_matter?",
    label: "Instructor knowledge",
  },
  {
    key: "how_engaging_was_the_instructor_in_delivering_the_content?",
    label: "Instructor engagement",
  },
  {
    key: "rate_the_instructor's_ability_to_answer_questions_and_provide_e",
    label: "Q&A ability",
  },
  {
    key: "how_would_you_rate_the_overall_organization_and_flow_of_the_ses",
    label: "Organisation & flow",
  },
  {
    key: "rate_the_activities/exercises_conducted_during_the_session_to_u",
    label: "Activities",
  },
  {
    key: "rate_the_overall_interaction_and_engagement_opportunities_durin",
    label: "Interaction",
  },
];

const TEXT_COLS = [
  { key: "what_did_you_like_most_about_the_session?", label: "Liked most" },
  { key: "what_areas_do_you_think_need_improvement", label: "Needs improvement" },
];

function toFloat(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function scoreColor(val) {
  const n = toFloat(val);
  if (n === null) return "text-[var(--ink-soft)]";
  if (n <= 3) return "text-red-600 font-bold";
  return "text-emerald-600 font-medium";
}

// A row is "negative" if it has at least one score ≤ 3
function isNegativeRow(row) {
  return NUMERIC_QUESTION_COLS.some((c) => {
    const n = toFloat(row[c]);
    return n !== null && n <= 3;
  });
}

function rowKey(row, i) {
  return row.id ?? `idx-${i}`;
}

export default function NegativeFeedbackPage() {
  const [filters, setFilters] = usePersistedState("negativeFeedback:filters", {
    date: "",
    institution: "",
    category: "",
    program: "",
    batch: "",
    instructor: "",
  });
  const [distinct, setDistinct] = useState({
    institution: [],
    category: [],
    program: [],
    batch: [],
    instructor: [],
  });
  const [rows, setRows] = usePersistedState("negativeFeedback:rows", []);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = usePersistedState("negativeFeedback:fetched", false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [gcsUrl, setGcsUrl] = usePersistedState("negativeFeedback:gcsUrl", "");
  const [generatingCsv, setGeneratingCsv] = useState(false);
  const [allFetchedRows, setAllFetchedRows] = usePersistedState("negativeFeedback:allFetchedRows", []);

  // editable fields keyed by rowKey -> { allotted_to, feedback }
  const [editedFields, setEditedFields] = usePersistedState("negativeFeedback:editedFields", {});

  useEffect(() => {
    (async () => {
      const result = {};
      await Promise.all(
        FILTER_COLUMNS.map(async (f) => {
          result[f.key] = await fetchDistinct(f.key);
        })
      );
      setDistinct(result);
    })();
  }, []);

  const updateFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const updateEditedField = (key, field, value) => {
    setEditedFields((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const onFetch = async () => {
    setLoading(true);
    setGcsUrl("");
    try {
      const allRows = await fetchResponses(filters);
      const negRows = allRows.filter(isNegativeRow);
      setAllFetchedRows(negRows);
      setRows(negRows);
      setFetched(true);

      if (negRows.length === 0) {
        toast.info("No negative feedback responses found.");
        setEditedFields({});
        return;
      }

      // Resolve "Allotted to" for each row from the spoc table
      // (institution + program + batch match, with progressive fallback).
      const spocList = await fetchAllSpoc();
      const initialEdits = {};
      negRows.forEach((row, i) => {
        const key = rowKey(row, i);
        initialEdits[key] = {
          allotted_to: matchSpoc(spocList, row.institution, row.program, row.batch),
          feedback: "",
        };
      });
      setEditedFields(initialEdits);
    } catch (e) {
      toast.error(`Fetch failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const mergeEditedFields = (rowsArr) =>
    rowsArr.map((row, i) => {
      const key = rowKey(row, i);
      const edited = editedFields[key] || {};
      return {
        ...row,
        allotted_to: edited.allotted_to || "",
        feedback: edited.feedback || "",
      };
    });

  const onGenerateCsv = async () => {
    if (!allFetchedRows.length) return;
    setGeneratingCsv(true);
    try {
      const merged = mergeEditedFields(allFetchedRows);
      const res = await axios.post(`${API}/export/csv`, {
        responses: merged,
        include_email: true,
        include_avg_row: false,
        include_extra_cols: true, // Only this page shows Allotted To / Feedback columns
      });
      const url = res.data.url.startsWith("http")
        ? res.data.url
        : `${process.env.REACT_APP_BACKEND_URL}${res.data.url}`;
      setGcsUrl(url);
      toast.success("CSV generated");
    } catch (e) {
      toast.error(`CSV export failed: ${e.message}`);
    } finally {
      setGeneratingCsv(false);
    }
  };

  const copyUrl = async () => {
    if (!gcsUrl) return;
    try {
      await navigator.clipboard.writeText(gcsUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Copy failed");
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

  return (
    <div className="max-w-full mx-auto px-6 lg:px-10 py-10">
      {/* Page heading */}
      <div className="mb-8">
        <h1 className="font-display text-3xl md:text-4xl font-semibold" data-testid="negative-feedback-heading">
          Negative Feedback
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2">
          Responses that contain at least one rating of 3 or below.
        </p>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Date */}
        <div>
          <label className="block text-[15px] font-medium mb-2">Date</label>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="field flex items-center justify-between text-left"
                data-testid="neg-filter-date-trigger"
              >
                <span className={filters.date ? "" : "text-[var(--muted)]"}>
                  {filters.date || "Select a date"}
                </span>
                <CalendarIcon size={14} className="text-[var(--muted)]" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.date ? new Date(filters.date) : undefined}
                onSelect={(d) => {
                  updateFilter("date", d ? format(d, "yyyy-MM-dd") : "");
                  setCalendarOpen(false);
                }}
              />
              {filters.date && (
                <div className="p-2 border-t flex justify-end">
                  <button
                    type="button"
                    onClick={() => { updateFilter("date", ""); setCalendarOpen(false); }}
                    className="text-xs text-[var(--muted)] hover:text-[var(--ink)]"
                    data-testid="neg-filter-date-clear"
                  >
                    Clear
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {/* Dynamic filter dropdowns */}
        {FILTER_COLUMNS.map((f) => (
          <div key={f.key}>
            <label className="block text-[15px] font-medium mb-2">{f.label}</label>
            <select
              className="field appearance-none cursor-pointer pr-10"
              value={filters[f.key]}
              onChange={(e) => updateFilter(f.key, e.target.value)}
              data-testid={`neg-filter-${f.key}`}
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231a1416' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 12px center",
                backgroundSize: "14px",
              }}
            >
              <option value="">All</option>
              {distinct[f.key]?.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Fetch button */}
      <div className="flex justify-center mb-10">
        <button
          type="button"
          className="btn-primary flex items-center gap-2"
          onClick={onFetch}
          disabled={loading}
          data-testid="neg-fetch-button"
        >
          <Search size={14} /> {loading ? "Fetching..." : "Fetch"}
        </button>
      </div>

      {/* Results table */}
      {fetched && (
        <div className="bg-[var(--card)] rounded-2xl p-6 md:p-8 mb-8" data-testid="neg-results">
          {rows.length === 0 ? (
            <div className="text-center text-[var(--muted)] py-8 text-sm">
              No negative feedback responses found.
            </div>
          ) : (
            <>
              <p className="text-sm text-[var(--muted)] mb-4">
                {rows.length} negative response{rows.length !== 1 ? "s" : ""}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left border-b border-[var(--line)]">
                      <th className="py-2 pr-3 text-[var(--ink)] font-semibold whitespace-nowrap">#</th>
                      <th className="py-2 pr-3 text-[var(--ink)] font-semibold whitespace-nowrap">Institution</th>
                      <th className="py-2 pr-3 text-[var(--ink)] font-semibold whitespace-nowrap">Category</th>
                      <th className="py-2 pr-3 text-[var(--ink)] font-semibold whitespace-nowrap">Program</th>
                      <th className="py-2 pr-3 text-[var(--ink)] font-semibold whitespace-nowrap">Batch</th>
                      <th className="py-2 pr-3 text-[var(--ink)] font-semibold whitespace-nowrap">Instructor</th>
                      <th className="py-2 pr-3 text-[var(--ink)] font-semibold whitespace-nowrap">Date</th>
                      {QUESTION_COLS.map((q) => (
                        <th
                          key={q.key}
                          className="py-2 pr-3 text-[var(--ink)] font-semibold"
                          style={{ minWidth: "110px", maxWidth: "140px" }}
                          title={q.label}
                        >
                          <span
                            style={{
                              display: "block",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {q.label}
                          </span>
                        </th>
                      ))}
                      {TEXT_COLS.map((q) => (
                        <th
                          key={q.key}
                          className="py-2 pr-3 text-[var(--ink)] font-semibold"
                          style={{ minWidth: "150px" }}
                        >
                          {q.label}
                        </th>
                      ))}
                      <th className="py-2 pr-3 text-[var(--ink)] font-semibold whitespace-nowrap">
                        Student email
                      </th>
                      <th
                        className="py-2 pr-3 text-[var(--ink)] font-semibold"
                        style={{ minWidth: "150px" }}
                      >
                        Allotted to
                      </th>
                      <th
                        className="py-2 pr-3 text-[var(--ink)] font-semibold"
                        style={{ minWidth: "180px" }}
                      >
                        Feedback
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      // Highlight row if 3+ negative scores
                      const negCount = NUMERIC_QUESTION_COLS.filter((c) => {
                        const n = toFloat(row[c]);
                        return n !== null && n <= 3;
                      }).length;
                      const rowBg = negCount >= 3 ? "#fff8e1" : "transparent";
                      const key = rowKey(row, i);
                      const edited = editedFields[key] || { allotted_to: "", feedback: "" };

                      return (
                        <tr
                          key={key}
                          className="border-b border-[var(--line)] last:border-0"
                          style={{ backgroundColor: rowBg }}
                          data-testid={`neg-row-${i}`}
                        >
                          <td className="py-2.5 pr-3 text-[var(--muted)]">{i + 1}</td>
                          <td className="py-2.5 pr-3 text-[var(--ink-soft)] whitespace-nowrap">
                            {row.institution || "—"}
                          </td>
                          <td className="py-2.5 pr-3 text-[var(--ink-soft)] whitespace-nowrap">
                            {row.category || "—"}
                          </td>
                          <td className="py-2.5 pr-3 text-[var(--ink-soft)] whitespace-nowrap">
                            {row.program || "—"}
                          </td>
                          <td className="py-2.5 pr-3 text-[var(--ink-soft)] whitespace-nowrap">
                            {row.batch || "—"}
                          </td>
                          <td className="py-2.5 pr-3 text-[var(--ink-soft)] whitespace-nowrap">
                            {row.instructor || "—"}
                          </td>
                          <td className="py-2.5 pr-3 text-[var(--ink-soft)] whitespace-nowrap">
                            {row.date_time ? row.date_time.slice(0, 10) : "—"}
                          </td>
                          {QUESTION_COLS.map((q) => {
                            const val = row[q.key];
                            return (
                              <td
                                key={q.key}
                                className={`py-2.5 pr-3 text-center ${scoreColor(val)}`}
                              >
                                {val ?? "—"}
                              </td>
                            );
                          })}
                          {TEXT_COLS.map((q) => {
                            const val = row[q.key];
                            return (
                              <td
                                key={q.key}
                                className="py-2.5 pr-3 text-[var(--ink-soft)]"
                                style={{ maxWidth: "200px" }}
                              >
                                <span
                                  title={val || "—"}
                                  style={{
                                    display: "block",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "normal",
                                  }}
                                >
                                  {val || "—"}
                                </span>
                              </td>
                            );
                          })}
                          <td className="py-2.5 pr-3 text-[var(--ink-soft)] whitespace-nowrap">
                            {row.email_address || "—"}
                          </td>
                          <td className="py-2.5 pr-3">
                            <input
                              type="text"
                              className="field py-1 px-2 text-sm"
                              style={{ minWidth: "140px" }}
                              value={edited.allotted_to}
                              placeholder="Unassigned"
                              onChange={(e) =>
                                updateEditedField(key, "allotted_to", e.target.value)
                              }
                              data-testid={`neg-allotted-${i}`}
                            />
                          </td>
                          <td className="py-2.5 pr-3">
                            <input
                              type="text"
                              className="field py-1 px-2 text-sm"
                              style={{ minWidth: "170px" }}
                              value={edited.feedback}
                              placeholder="Add a note..."
                              onChange={(e) =>
                                updateEditedField(key, "feedback", e.target.value)
                              }
                              data-testid={`neg-feedback-${i}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Generate CSV button - link is only created when this is clicked */}
              <div className="flex justify-center mt-6">
                <button
                  type="button"
                  className="btn-primary flex items-center gap-2"
                  onClick={onGenerateCsv}
                  disabled={generatingCsv}
                  data-testid="neg-generate-csv-button"
                >
                  <FileDown size={14} /> {generatingCsv ? "Generating..." : "Generate CSV"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* GCS / CSV link section */}
      <div>
        <label className="block text-[15px] font-medium mb-2">CSV link</label>
        <div className="flex gap-2 items-stretch">
          <input
            type="text"
            className="field flex-1"
            readOnly
            value={generatingCsv ? "Generating..." : gcsUrl}
            placeholder="Click Generate CSV above to create the link"
            data-testid="neg-gcs-input"
          />
          <button
            type="button"
            className="btn-ghost border border-[var(--line)] flex items-center gap-1.5"
            disabled={!gcsUrl}
            onClick={copyUrl}
            data-testid="neg-copy-button"
          >
            <Copy size={14} /> Copy
          </button>
          <button
            type="button"
            disabled={!allFetchedRows.length || generatingCsv}
            onClick={async () => {
              try {
                const instructor = filters.instructor
                  ? filters.instructor.replace(/[^a-z0-9]+/gi, "_")
                  : "all";
                const meetingLabel = filters.date ? filters.date : "all_dates";
                const filename = `negative_feedback_${instructor}_${meetingLabel}.xlsx`;
                const merged = mergeEditedFields(allFetchedRows);

                const res = await axios.post(`${API}/export/xlsx`, {
                    responses: merged,
                    title: `Negative Feedback – ${filters.instructor || "All"} – ${filters.date || "All dates"}`,
                    include_email: true,
                    include_avg_row: false,
                    include_extra_cols: true, // Only this page shows Allotted To / Feedback columns
                  });

                const url = res.data.url.startsWith("http")
                  ? res.data.url
                  : `${process.env.REACT_APP_BACKEND_URL}${res.data.url}`;

                await triggerDownload(url, filename);
                toast.success("Excel downloaded");
              } catch (e) {
                toast.error(`Download failed: ${e.message}`);
              }
            }}
            className="btn-ghost border border-[var(--line)] flex items-center gap-1.5"
            data-testid="neg-download-button"
          >
            <ExternalLink size={14} /> Download
          </button>
        </div>
        {allFetchedRows.length > 0 && (
          <p className="text-xs text-[var(--muted)] mt-2">
            {allFetchedRows.length} negative response{allFetchedRows.length === 1 ? "" : "s"} included.
          </p>
        )}
      </div>
    </div>
  );
}
