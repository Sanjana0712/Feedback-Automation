// Lightweight Supabase REST client using fetch + publishable key.
// RLS is disabled per user instruction.

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_KEY;
const MEETINGS_TABLE_PRIMARY = process.env.REACT_APP_MEETINGS_TABLE || "feedback_system";
const INSTRUCTORS_TABLE = process.env.REACT_APP_INSTRUCTORS_TABLE || "instructor";
const RESPONSES_TABLE = "feedback_responses";
const SPOC_TABLE = process.env.REACT_APP_SPOC_TABLE || "spoc";
const PROGRAM_BATCH_TABLE = process.env.REACT_APP_PROGRAM_BATCH_TABLE || "program_batch";

const baseHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

async function request(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...baseHeaders, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ---------------- meetings (feedback_system) ----------------

async function queryMeetings(column, value) {
  const tables = [MEETINGS_TABLE_PRIMARY, "feedback_system", "meetings", "meeting"].filter(
    (t, i, arr) => arr.indexOf(t) === i
  );
  for (const table of tables) {
    try {
      const data = await request(
        `${table}?${encodeURIComponent(column)}=eq.${encodeURIComponent(
          value
        )}&select=*&limit=1`
      );
      if (Array.isArray(data) && data.length > 0) return data[0];
    } catch (e) {
      continue;
    }
  }
  return null;
}

export async function fetchMeetingById(meetingId) {
  const tryColumns = ["meeting_id", "meeting id", "Meeting ID", "meetingId", "id"];
  for (const col of tryColumns) {
    const row = await queryMeetings(col, meetingId);
    if (row) return { row, matchedColumn: col };
  }
  return null;
}

export async function fetchMeetingByIdAndDate(meetingId, date) {
  // date is already in YYYY-MM-DD format from parseCsvForMeetingId
  const tables = [MEETINGS_TABLE_PRIMARY, "feedback_system", "meetings", "meeting"].filter(
    (t, i, arr) => arr.indexOf(t) === i
  );

  for (const table of tables) {
    try {
      const data = await request(
        `${table}?meeting_id=eq.${encodeURIComponent(meetingId)}&date=eq.${encodeURIComponent(date)}&select=*&limit=1`
      );
      if (Array.isArray(data) && data.length > 0) return { row: data[0] };
    } catch (e) {
      continue;
    }
  }
  return null;
}

// ---------------- instructors ----------------

export async function fetchAllInstructors() {
  const attempts = [
    `${INSTRUCTORS_TABLE}?select=*&order=name.asc`,
    `${INSTRUCTORS_TABLE}?select=*&order=Name.asc`,
    `${INSTRUCTORS_TABLE}?select=*`,
  ];
  for (const path of attempts) {
    try {
      const data = await request(path);
      if (Array.isArray(data)) return data;
    } catch (e) {
      continue;
    }
  }
  return [];
}

export function instructorName(row) {
  if (!row) return "";
  return row.name || row.Name || row.full_name || row.FullName || "";
}

export async function findInstructor(fullName, institution = null) {
  // Case-insensitive match on name (and optional institution)
  let path = `${INSTRUCTORS_TABLE}?name=ilike.${encodeURIComponent(fullName)}&select=*`;
  if (institution) {
    path += `&institution=ilike.${encodeURIComponent(institution)}`;
  }
  try {
    const data = await request(path);
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (e) {
    return null;
  }
}

export async function addInstructor(fullName, institution, email = "") {
  // Duplicate check (case-insensitive, name + institution)
  const dup = await findInstructor(fullName, institution);
  if (dup) {
    const err = new Error(
      `Instructor "${fullName}" already exists for ${institution || "(no institution)"}.`
    );
    err.code = "duplicate";
    throw err;
  }

  return await request(`${INSTRUCTORS_TABLE}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([{ name: fullName, institution, email: email || null }]),
  });
}

// ---------------- spoc ----------------
// Table: spoc(id, spoc_name, program, batch, email, institution)
// Used to auto-resolve who a piece of negative feedback should be "Allotted to".

export async function fetchAllSpoc() {
  try {
    const data = await request(`${SPOC_TABLE}?select=*&limit=10000`);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function norm(v) {
  return (v ?? "").toString().trim().toLowerCase();
}

// Given the full spoc list (fetched once) and a row's institution/program/batch,
// find the matching spoc_name. Falls back progressively if an exact 3-way match
// isn't found (institution+program, then institution only).
export function matchSpoc(spocList, institution, program, batch) {
  if (!Array.isArray(spocList) || spocList.length === 0) return "";
  const inst = norm(institution);
  const prog = norm(program);
  const bat = norm(batch);

  let match = spocList.find(
    (s) => norm(s.institution) === inst && norm(s.program) === prog && norm(s.batch) === bat
  );
  if (!match && inst && prog) {
    match = spocList.find((s) => norm(s.institution) === inst && norm(s.program) === prog);
  }
  if (!match && inst) {
    match = spocList.find((s) => norm(s.institution) === inst);
  }
  return match ? match.spoc_name || "" : "";
}

export async function findSpoc(institution, program, batch) {
  try {
    let path = `${SPOC_TABLE}?select=*`;
    if (institution) path += `&institution=eq.${encodeURIComponent(institution)}`;
    if (program) path += `&program=eq.${encodeURIComponent(program)}`;
    if (batch) path += `&batch=eq.${encodeURIComponent(batch)}`;
    const data = await request(path);
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (e) {
    return null;
  }
}

// ---------------- feedback_responses ----------------

export async function insertFeedbackResponses(rows) {
  if (!rows || rows.length === 0) return { inserted: [], skipped: 0 };

  // Collect ALL keys across every row so every row has the same shape
  const allKeys = new Set();
  for (const r of rows) Object.keys(r).forEach((k) => allKeys.add(k));

  const normalized = rows.map((r) => {
    const obj = {};
    for (const k of allKeys) {
      obj[k] = r[k] !== undefined ? r[k] : null;
    }
    return obj;
  });

  // Dedup check
  const firstRow = normalized[0];
  const existingPairs = new Set();
  if (firstRow.instructor) {
    try {
      const existing = await request(
        `${RESPONSES_TABLE}?instructor=eq.${encodeURIComponent(
          firstRow.instructor
        )}&select=date_time,email_address&limit=10000`
      );
      if (Array.isArray(existing)) {
        for (const e of existing) {
          existingPairs.add(`${e.date_time || ""}||${e.email_address || ""}`);
        }
      }
    } catch (e) {
      // proceed without dedup
    }
  }

  const toInsert = normalized.filter(
    (r) => !existingPairs.has(`${r.date_time || ""}||${r.email_address || ""}`)
  );
  const skipped = normalized.length - toInsert.length;
  if (toInsert.length === 0) return { inserted: [], skipped };

  const inserted = await request(`${RESPONSES_TABLE}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(toInsert),
  });
  return { inserted, skipped };
}

export async function fetchResponses(filters = {}) {
  const parts = ["select=*"];
  if (filters.institution) parts.push(`institution=eq.${encodeURIComponent(filters.institution)}`);
  if (filters.category) parts.push(`category=eq.${encodeURIComponent(filters.category)}`);
  if (filters.program) parts.push(`program=eq.${encodeURIComponent(filters.program)}`);
  if (filters.batch) parts.push(`batch=eq.${encodeURIComponent(filters.batch)}`);
  if (filters.instructor) parts.push(`instructor=eq.${encodeURIComponent(filters.instructor)}`);
  if (filters.date) {
    // date_time is timestamp — filter to that day
    const start = `${filters.date}T00:00:00`;
    const end = `${filters.date}T23:59:59`;
    parts.push(`date_time=gte.${encodeURIComponent(start)}`);
    parts.push(`date_time=lte.${encodeURIComponent(end)}`);
  }
  parts.push("order=date_time.asc");
  parts.push("limit=10000");
  const data = await request(`${RESPONSES_TABLE}?${parts.join("&")}`);
  return Array.isArray(data) ? data : [];
}

export async function fetchDistinct(column) {
  // PostgREST doesn't have DISTINCT directly; fetch all + dedupe client-side.
  try {
    const data = await request(
      `${RESPONSES_TABLE}?select=${encodeURIComponent(column)}&limit=10000`
    );
    if (!Array.isArray(data)) return [];
    const set = new Set(
      data.map((r) => r[column]).filter((v) => v !== null && v !== undefined && v !== "")
    );
    return [...set].sort();
  } catch (e) {
    return [];
  }
}

export async function fetchDirectorByCredentials(username, passcode) {
  try {
    const data = await request(
      `program_director?username=eq.${encodeURIComponent(username)}&passcode=eq.${encodeURIComponent(passcode)}&select=*`
    );
    return Array.isArray(data) && data.length > 0 ? data : null;
  } catch (e) {
    return null;
  }
}

// ---------------- program_batch ----------------
// Table: program_batch(id, institution, program, batch)
// Registry of valid institution + program + batch combinations. Used to
// (a) power autocomplete suggestions on the "Add Program/Batch" admin form,
// and (b) later validate CSV uploads the same way the instructor table does.

export async function fetchDistinctProgramBatch(column, filters = {}) {
  // PostgREST doesn't have DISTINCT directly; fetch matching rows + dedupe client-side.
  try {
    const parts = [`select=${encodeURIComponent(column)}`];
    if (filters.institution) parts.push(`institution=eq.${encodeURIComponent(filters.institution)}`);
    if (filters.program) parts.push(`program=eq.${encodeURIComponent(filters.program)}`);
    parts.push("limit=10000");
    const data = await request(`${PROGRAM_BATCH_TABLE}?${parts.join("&")}`);
    if (!Array.isArray(data)) return [];
    const set = new Set(
      data.map((r) => r[column]).filter((v) => v !== null && v !== undefined && v !== "")
    );
    return [...set].sort();
  } catch (e) {
    return [];
  }
}

export async function findProgramBatch(institution, program, batch) {
  // Case-insensitive match on all three fields
  try {
    const path =
      `${PROGRAM_BATCH_TABLE}?institution=ilike.${encodeURIComponent(institution)}` +
      `&program=ilike.${encodeURIComponent(program)}` +
      `&batch=ilike.${encodeURIComponent(batch)}&select=*`;
    const data = await request(path);
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (e) {
    return null;
  }
}

export async function addProgramBatch(institution, program, batch) {
  const dup = await findProgramBatch(institution, program, batch);
  if (dup) {
    const err = new Error(
      `"${program}" / "${batch}" already exists for ${institution}.`
    );
    err.code = "duplicate";
    throw err;
  }

  return await request(`${PROGRAM_BATCH_TABLE}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([{ institution, program, batch }]),
  });
}

export async function fetchInstructorEmail(instructorName) {
  try {
    const data = await request(
      `${INSTRUCTORS_TABLE}?name=ilike.${encodeURIComponent(instructorName)}&select=email&limit=1`
    );
    return Array.isArray(data) && data.length > 0 ? data[0].email || null : null;
  } catch (e) {
    return null;
  }
}