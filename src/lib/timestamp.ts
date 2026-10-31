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

export async function getTimestamps(): Promise<SavedTimestamp[]> {
  const { data, error } = await getSupabaseClient()
    .from(tableName)
    .select("id, starttime, endtime, inputtext")
    .order("created_at", { ascending: true });

  if (error) throw error;

  return data.map(toSavedTimestamp);
}

export async function saveTimestamp(
  start: number,
  end: number,
  text: string,
): Promise<SavedTimestamp> {
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

export async function updateTimestamp(
  id: number,
  start: number,
  end: number,
  text: string,
): Promise<SavedTimestamp> {
  const { data, error } = await getSupabaseClient()
    .from(tableName)
    .update({
      starttime: Math.round(start),
      endtime: Math.round(end),
      inputtext: text,
    })
    .eq("id", id)
    .select("id, starttime, endtime, inputtext")
    .single();

  if (error) throw error;

  return toSavedTimestamp(data);
}

export async function deleteTimestamp(id: number): Promise<void> {
  const { error } = await getSupabaseClient()
    .from(tableName)
    .delete()
    .eq("id", id);

  if (error) throw error;
}
