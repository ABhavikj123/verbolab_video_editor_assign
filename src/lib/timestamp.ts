import { supabase } from "./client";

type SavedTimestamp = {
  id: number;
  start: number;
  end: number;
  text: string;
};

const tableName = "texttimestamp";

function getSupabaseClient() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Add VITE_PUBLIC_SUPABASE_URL and an anon or publishable key to .env.",
    );
  }

  return supabase;
}

function toSavedTimestamp(row: {
  id: number;
  starttime: number;
  endtime: number;
  inputtext: string;
}): SavedTimestamp {
  return {
    id: row.id,
    start: row.starttime,
    end: row.endtime,
    text: row.inputtext,
  };
}

/** Load every saved caption range for this single-video assignment. */
export async function getTimestamps(): Promise<SavedTimestamp[]> {
  const { data, error } = await getSupabaseClient()
    .from(tableName)
    .select("id, starttime, endtime, inputtext")
    .order("created_at", { ascending: true });

  if (error) throw error;

  return data.map(toSavedTimestamp);
}

/** Save a caption range in the textTimestamp table. */
export async function saveTimestamp(
  start: number,
  end: number,
  text: string,
): Promise<SavedTimestamp> {
  // The SQL in the assignment creates unquoted PostgreSQL identifiers, which
  // PostgreSQL stores in lowercase (texttimestamp, starttime, endtime, inputtext).
  const { data, error } = await getSupabaseClient()
    .from(tableName)
    .insert({
      starttime: Math.round(start),
      endtime: Math.round(end),
      inputtext: text,
    })
    .select("id, starttime, endtime, inputtext")
    .single();

  if (error) throw error;

  return toSavedTimestamp(data);
}

/** Update an existing caption range after its start or end time is edited. */
export async function updateTimestamp(
  id: number,
  start: number,
  end: number,
): Promise<SavedTimestamp> {
  const { data, error } = await getSupabaseClient()
    .from(tableName)
    .update({
      starttime: Math.round(start),
      endtime: Math.round(end),
    })
    .eq("id", id)
    .select("id, starttime, endtime, inputtext")
    .single();

  if (error) throw error;

  return toSavedTimestamp(data);
}

/** Remove a caption range from the database. */
export async function deleteTimestamp(id: number): Promise<void> {
  const { error } = await getSupabaseClient()
    .from(tableName)
    .delete()
    .eq("id", id);

  if (error) throw error;
}
