import { useEffect, useMemo, useRef, useState } from "react";
import { UploadCloud, FileText, Pencil, CheckCircle2, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  fetchMeetingById,
  fetchMeetingByIdAndDate,
  fetchAllInstructors,
  instructorName,
  insertFeedbackResponses,
  findProgramBatch,
} from "../lib/supabase";
import { usePersistedState } from "../context/PageStateContext";

const FIELDS = [
  { key: "meeting_id", label: "Meeting ID" },
  { key: "date", label: "Date" },
  { key: "institution", label: "Institution" },
  { key: "category", label: "Category" },
  { key: "program", label: "Program" },
  { key: "instructor", label: "Instructor" },
  { key: "batch", label: "Batch" },
];

const COLUMN_MAP = {
  meeting_id: ["meeting_id", "meetingId", "Meeting ID", "id"],
  date: ["date", "Date"],
  institution: ["institution", "Institution"],
  category: ["category", "Category"],
  program: ["program", "Program"],
  batch: ["batch", "Batch"],
  instructor: ["instructor", "Instructor"],
};

// const CSV_TO_DB = {
//   "how would you rate the overall content of the session?":
//     "how_would_you_rate_the_overall_content_of_the_session?",
//   "were the topics covered relevant to your needs and expectations?":
//     "were_the_topics_covered_relevant_to_your_needs_and_expectations",
//   "rate the clarity and depth of the information provided.":
//     "rate_the_clarity_and_depth_of_the_information_provided",
//   "how knowledgeable was the instructor about the subject matter?":
//     "how_knowledgeable_was_the_instructor_about the_subject_matter?",
//   "how engaging was the instructor in delivering the content?":
//     "how_engaging_was_the_instructor_in_delivering_the_content?",
//   "rate the instructor's ability to answer questions and provide explanations.":
//     "rate_the_instructor's_ability_to_answer_questions_and_provide_e",
//   "how would you rate the overall organization and flow of the session?":
//     "how_would_you_rate_the_overall_organization_and_flow_of_the_ses",
//   "rate the activities/exercises conducted during the session to understand the concepts?":
//     "rate_the_activities/exercises_conducted_during_the_session_to_u",
//   "rate the overall interaction and engagement opportunities during the session.":
//     "rate_the_overall_interaction_and_engagement_opportunities_durin",
//   "what did you like most about the session?":
//     "what_did_you_like_most_about_the_session?",
//   "what areas do you think need improvement":
//     "what_areas_do_you_think_need_improvement",
//   "email address": "email_address",
// };

function normalizeHeader(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Canonical question text → DB column mapping (using normalized keys)
const QUESTION_MAP = [
  { match: "how would you rate the overall content of the session", db: "how_would_you_rate_the_overall_content_of_the_session?" },
  { match: "were the topics covered relevant to your needs and expectations", db: "were_the_topics_covered_relevant_to_your_needs_and_expectations" },
  { match: "rate the clarity and depth of the information provided", db: "rate_the_clarity_and_depth_of_the_information_provided" },
  { match: "how knowledgeable was the instructor about the subject matter", db: "how_knowledgeable_was_the_instructor_about the_subject_matter?" },
  { match: "how engaging was the instructor in delivering the content", db: "how_engaging_was_the_instructor_in_delivering_the_content?" },
  { match: "rate the instructor s ability to answer questions and provide explanations", db: "rate_the_instructor's_ability_to_answer_questions_and_provide_e" },
  { match: "how would you rate the overall organization and flow of the session", db: "how_would_you_rate_the_overall_organization_and_flow_of_the_ses" },
  { match: "rate the activities exercises conducted during the session to understand the concepts", db: "rate_the_activities/exercises_conducted_during_the_session_to_u" },
  { match: "rate the overall interaction and engagement opportunities during the session", db: "rate_the_overall_interaction_and_engagement_opportunities_durin" },
  { match: "what did you like most about the session", db: "what_did_you_like_most_about_the_session?" },
  { match: "what areas do you think need improvement", db: "what_areas_do_you_think_need_improvement" },
  { match: "email address", db: "email_address" },
];

function csvHeaderToDb(header) {
  const norm = normalizeHeader(header);
  const found = QUESTION_MAP.find((q) => norm.includes(q.match) || q.match.includes(norm));
  return found ? found.db : null;
}

function pick(row, keys) {
  for (const k of keys) {
    if (row && row[k] !== undefined && row[k] !== null && row[k] !== "") {
      return String(row[k]);
    }
  }
  return "";
}

function normalize(row) {
  return {
    meeting_id: pick(row, COLUMN_MAP.meeting_id),
    date: pick(row, COLUMN_MAP.date),
    institution: pick(row, COLUMN_MAP.institution),
    category: pick(row, COLUMN_MAP.category),
    program: pick(row, COLUMN_MAP.program),
    batch: pick(row, COLUMN_MAP.batch),
    instructor: pick(row, COLUMN_MAP.instructor),
  };
}

function parseCsvForMeetingId(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;

  const splitLine = (line) => {
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
      else { cur += ch; }
    }
    out.push(cur);
    return out.map((s) => s.trim().replace(/^"|"$/g, ""));
  };

  const meetingIdNames = ["meeting/webinar id", "meeting id", "webinar id", "meetingid"];
  const startTimeNames = ["actual start time", "start time", "starttime"];

  let meetingId = null;
  let date = null;

  for (let i = 0; i < lines.length; i++) {
    const cells = splitLine(lines[i]).map((c) => c.toLowerCase());
    
    const meetingIdx = cells.findIndex((c) => meetingIdNames.includes(c));
    const startTimeIdx = cells.findIndex((c) => startTimeNames.includes(c));

    if (meetingIdx !== -1 || startTimeIdx !== -1) {
      for (let j = i + 1; j < lines.length; j++) {
        const dataCells = splitLine(lines[j]);
        
        if (meetingIdx !== -1 && !meetingId) {
          const v = dataCells[meetingIdx];
          if (v && v.trim().length > 0) meetingId = v.trim();
        }
        
        if (startTimeIdx !== -1 && !date) {
          const v = dataCells[startTimeIdx];
          if (v && v.trim().length > 0) {
            // Extract just the date part from datetime string
            const parsed = new Date(v.trim());
            if (!isNaN(parsed)) {
              date = parsed.toISOString().slice(0, 10); // "YYYY-MM-DD"
            } else {
              // Try extracting date from strings like "06/21/2026 10:00:00"
              const match = v.trim().match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
              if (match) {
                date = `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
              }
            }
          }
        }

        if (meetingId && date) break;
      }
      break;
    }
  }

  return { meetingId, date };
}

function parseCsvResponses(text) {
  const lines = text.split(/\r?\n/);

  const splitLine = (line) => {
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
      else { cur += ch; }
    }
    out.push(cur);
    return out.map((s) => s.trim().replace(/^"|"$/g, ""));
  };

  let headerIdx = -1;
  let headers = [];
  for (let i = 0; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    if (cells.some((c) => c.trim().toLowerCase() === "user name")) {
      headerIdx = i;
      headers = cells.map((c) => c.trim().toLowerCase());
      break;
    }
  }

  if (headerIdx === -1) return [];

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = splitLine(lines[i]);
    if (cells.length < 3) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] ?? ""; });
    rows.push(row);
  }

  return rows;
}

export default function UploadPage() {
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = usePersistedState("upload:fileName", "");
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = usePersistedState("upload:confirmed", false);
  const [csvText, setCsvText] = usePersistedState("upload:csvText", "");
  const [data, setData] = usePersistedState("upload:data", {
    meeting_id: "",
    date: "",
    institution: "",
    category: "",
    program: "",
    batch: "",
    instructor: "",
  });

  const [editingInstructor, setEditingInstructor] = useState(false);
  const [allInstructors, setAllInstructors] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [instructorNotFound, setInstructorNotFound] = usePersistedState("upload:instructorNotFound", false);

  // Institution + Program + Batch must exist together as a registered
  // combination in the program_batch table before an upload can proceed.
  const [programBatchNotFound, setProgramBatchNotFound] = usePersistedState("upload:programBatchNotFound", false);

  useEffect(() => {
    fetchAllInstructors()
      .then((list) => setAllInstructors(list.map(instructorName).filter(Boolean)))
      .catch(() => {});
  }, []);

  const suggestions = useMemo(() => {
    if (!data.instructor) return allInstructors.slice(0, 8);
    const q = data.instructor.toLowerCase();
    return allInstructors.filter((n) => n.toLowerCase().includes(q)).slice(0, 8);
  }, [data.instructor, allInstructors]);

  const checkInstructor = (name, instructorList) => {
    if (!name) { setInstructorNotFound(false); return; }
    const found = instructorList.some(
      (n) => n.toLowerCase().trim() === name.toLowerCase().trim()
    );
    setInstructorNotFound(!found);
  };

  // Checks the institution + program + batch combo against the program_batch
  // registry. All three are validated together since one row there represents
  // one valid combination — we can't tell which single field is "wrong" if
  // the combo doesn't match, so all three get flagged.
  const checkProgramBatch = async (institution, program, batch) => {
    if (!institution || !program || !batch) {
      setProgramBatchNotFound(false);
      return;
    }
    try {
      const found = await findProgramBatch(institution, program, batch);
      setProgramBatchNotFound(!found);
    } catch (e) {
      // Network/lookup failure — don't block the upload on our own error,
      // same fail-open behavior as the instructor check above.
    }
  };

  const resetState = () => {
    setData({ meeting_id: "", date: "", institution: "", category: "", program: "", batch: "", instructor: "" });
    setFileName("");
    setConfirmed(false);
    setEditingInstructor(false);
    setCsvText("");
    setInstructorNotFound(false);
    setProgramBatchNotFound(false);
  };

  const handleFile = async (file) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      toast.error("Please upload a .csv file");
      return;
    }
    setFileName(file.name);
    setLoading(true);
    setConfirmed(false);
    setEditingInstructor(false);
    setInstructorNotFound(false);
    setProgramBatchNotFound(false);
  
    try {
      const text = await file.text();
      setCsvText(text);
      const { meetingId, date } = parseCsvForMeetingId(text);
  
      if (!meetingId) {
        toast.error("Could not find 'Meeting/Webinar ID' column in the CSV");
        setLoading(false);
        return;
      }
  
      // Try matching by both meeting_id AND date first, then fall back to meeting_id only
      let result = null;
      if (date) {
        result = await fetchMeetingByIdAndDate(meetingId, date);
      }
      if (!result) {
        result = await fetchMeetingById(meetingId);
      }
  
      if (!result) {
        toast.error(`Meeting ID ${meetingId} not found in database`);
        setData((d) => ({ ...d, meeting_id: meetingId }));
        setLoading(false);
        return;
      }
  
      const normalized = normalize(result.row);
      if (!normalized.meeting_id) normalized.meeting_id = meetingId;
      setData(normalized);
      toast.success("Session details auto-filled");
  
      if (normalized.instructor) {
        const list = await fetchAllInstructors();
        const names = list.map(instructorName).filter(Boolean);
        setAllInstructors(names);
        checkInstructor(normalized.instructor, names);
      }

      // Verify institution + program + batch are registered together
      await checkProgramBatch(normalized.institution, normalized.program, normalized.batch);
    } catch (e) {
      toast.error(`Failed to load: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const onConfirm = async () => {
    if (instructorNotFound) {
      toast.error("Please resolve the instructor issue before confirming");
      return;
    }
    if (programBatchNotFound) {
      toast.error("Please ask your admin to add this program/batch before confirming");
      return;
    }
    if (!csvText) {
      toast.error("No CSV data found");
      return;
    }

    try {
      const rows = parseCsvResponses(csvText);
      if (rows.length === 0) {
        toast.error("No response rows found in CSV");
        return;
      }

      // const records = rows.map((row) => {
      //   const record = {
      //     institution: data.institution || null,
      //     category: data.category || null,
      //     program: data.program || null,
      //     batch: data.batch || null,
      //     instructor: data.instructor || null,
      //     date_time: data.date ? new Date(data.date).toISOString() : null,
      //   };
      //   Object.entries(CSV_TO_DB).forEach(([csvCol, dbCol]) => {
      //     const val = row[csvCol];
      //     record[dbCol] = val !== undefined && val !== "" ? val : null;
      //   });
      //   return record;
      // });

      const records = rows.map((row) => {
        const record = {
          institution: data.institution || null,
          category: data.category || null,
          program: data.program || null,
          batch: data.batch || null,
          instructor: data.instructor || null,
          date_time: data.date ? new Date(data.date).toISOString() : null,
        };
        Object.entries(row).forEach(([csvCol, val]) => {
          const dbCol = csvHeaderToDb(csvCol);
          if (dbCol && val !== undefined && val !== "") {
            record[dbCol] = val;
          }
        });
        return record;
      });

      await insertFeedbackResponses(records);
      setConfirmed(true);
      setEditingInstructor(false);
      toast.success(`${records.length} responses saved successfully`);
    } catch (e) {
      toast.error(`Error: ${e.message}`);
    }
  };

  const isFilled = !!data.meeting_id;

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-10 py-10">
      <div className="mb-8">
        <h1
          className="font-display text-3xl md:text-4xl font-semibold text-[var(--ink)]"
          data-testid="upload-heading"
        >
          Upload Session Feedback
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2">
          Drop a Zoom poll CSV and we'll auto-fill the session details from the database.
        </p>
      </div>

      <div
        className="dropzone mb-10"
        data-dragging={dragging}
        data-testid="csv-dropzone"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div className="flex flex-col items-center gap-3">
          {fileName ? (
            <>
              <FileText size={28} className="text-[var(--accent-strong)]" />
              <div className="flex items-center gap-2 text-[var(--ink)] font-medium">
                <span data-testid="csv-filename">{fileName}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); resetState(); }}
                  className="text-[var(--muted)] hover:text-[var(--accent-strong)]"
                  data-testid="csv-clear"
                  aria-label="Clear file"
                >
                  <X size={16} />
                </button>
              </div>
              <span className="text-xs text-[var(--muted)]">Click to replace or drop another file</span>
            </>
          ) : (
            <>
              <UploadCloud size={32} className="text-[var(--accent)]" />
              <div className="text-[15px] text-[var(--ink-soft)]">
                {loading ? "Reading CSV..." : "Drop Zoom CSV here or click to browse"}
              </div>
              <span className="text-xs text-[var(--muted)]">.csv only</span>
            </>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          data-testid="csv-file-input"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {/* Instructor not found warning */}
      {instructorNotFound && data.instructor && (
        <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
          <p className="text-sm">
            Instructor <span className="font-semibold">"{data.instructor}"</span> is not registered in the system.
            Please ask your admin to add this instructor before confirming.
          </p>
        </div>
      )}

      {/* Institution / Program / Batch not registered warning */}
      {programBatchNotFound && data.institution && data.program && data.batch && (
        <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
          <p className="text-sm">
            <span className="font-semibold">{data.program}</span> / <span className="font-semibold">{data.batch}</span> at{" "}
            <span className="font-semibold">{data.institution}</span> is not registered in the system.
            Please ask your admin to add this program/batch before confirming.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
        {FIELDS.map((f) => {
          const isInstructor = f.key === "instructor";
          const isProgramBatchField = f.key === "institution" || f.key === "program" || f.key === "batch";
          const disabled =
            confirmed ||
            (!editingInstructor && isFilled) ||
            (editingInstructor && !isInstructor);

          const showNotRegistered =
            (isInstructor && instructorNotFound) || (isProgramBatchField && programBatchNotFound);

          return (
            <div key={f.key} className="relative">
              <label className="block text-[15px] font-medium text-[var(--ink)] mb-2">
                {f.label}
                {showNotRegistered && (
                  <span className="ml-2 text-xs font-normal text-amber-600">Not registered</span>
                )}
              </label>
              <input
                type="text"
                className={`field ${showNotRegistered ? "border-amber-400" : ""}`}
                value={data[f.key]}
                disabled={disabled || !isFilled}
                readOnly={!editingInstructor || !isInstructor}
                onChange={(e) => {
                  if (editingInstructor && isInstructor) {
                    setData({ ...data, instructor: e.target.value });
                    setShowSuggestions(true);
                    setInstructorNotFound(false);
                  }
                }}
                onFocus={() => {
                  if (editingInstructor && isInstructor) setShowSuggestions(true);
                }}
                onBlur={() => {
                  setTimeout(() => {
                    setShowSuggestions(false);
                    if (editingInstructor && isInstructor) {
                      checkInstructor(data.instructor, allInstructors);
                    }
                  }, 150);
                }}
                placeholder=""
                data-testid={`field-${f.key}`}
              />

              {isInstructor && editingInstructor && showSuggestions && suggestions.length > 0 && (
                <div
                  className="absolute left-0 right-0 top-full mt-1 bg-white border border-[var(--line)] rounded-lg shadow-md max-h-60 overflow-y-auto z-20"
                  data-testid="instructor-suggestions"
                >
                  {suggestions.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className="block w-full text-left px-4 py-2 text-sm hover:bg-[var(--field)] transition-colors"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setData((d) => ({ ...d, instructor: name }));
                        setShowSuggestions(false);
                        setInstructorNotFound(false);
                      }}
                      data-testid={`instructor-suggestion-${name.replace(/\s+/g, "-")}`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-3 mt-12">
        {isFilled && !confirmed && !editingInstructor && (
          <button
            type="button"
            className="btn-ghost flex items-center gap-1.5 border border-[var(--line)]"
            onClick={() => setEditingInstructor(true)}
            data-testid="edit-instructor-button"
          >
            <Pencil size={14} /> Edit Instructor
          </button>
        )}

        {editingInstructor && (
          <button
            type="button"
            className="btn-ghost border border-[var(--line)]"
            onClick={() => {
              setEditingInstructor(false);
              checkInstructor(data.instructor, allInstructors);
            }}
            data-testid="cancel-edit-button"
          >
            Done
          </button>
        )}

        <button
          type="button"
          className="btn-primary flex items-center gap-2"
          disabled={!isFilled || confirmed || instructorNotFound || programBatchNotFound}
          onClick={onConfirm}
          data-testid="confirm-button"
        >
          {confirmed ? (
            <>
              <CheckCircle2 size={16} /> Confirmed
            </>
          ) : (
            "Confirm"
          )}
        </button>
      </div>
    </div>
  );
}
