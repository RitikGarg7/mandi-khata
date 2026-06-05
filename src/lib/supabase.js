import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function userId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");
  return user.id;
}

export const db = {
  async getAll(table) {
    const { data, error } = await supabase.from(table).select("id, data, updated_at").order("updated_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  async upsert(table, id, encryptedData) {
    const uid = await userId();
    const row = { data: encryptedData, updated_at: new Date().toISOString(), user_id: uid };
    if (id) row.id = id;
    const { data, error } = await supabase.from(table).upsert(row).select("id").single();
    if (error) throw error;
    return data.id;
  },

  async delete(table, id) {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw error;
  },

  async getSettings() {
    const { data, error } = await supabase.from("settings").select("id, data").maybeSingle();
    if (error) throw error;
    return data;
  },

  async saveSettings(id, encryptedData) {
    const uid = await userId();
    const row = { data: encryptedData, updated_at: new Date().toISOString(), user_id: uid };
    if (id) row.id = id;
    const { data, error } = await supabase.from("settings").upsert(row).select("id").single();
    if (error) throw error;
    return data.id;
  },
};
