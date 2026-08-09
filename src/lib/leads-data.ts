import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type WhatsappLead = {
  id: string;
  contact_name: string;
  phone: string | null;
  message: string;
  ai_summary: string | null;
  intent: string | null;
  status: string;
  created_at: string;
};

export type AccidentCase = {
  id: string;
  reg: string;
  driver_name: string | null;
  incident_date: string;
  location: string | null;
  description: string;
  ai_summary: string | null;
  severity: string;
  status: string;
  created_at: string;
};

export function useLeadsData() {
  const [leads, setLeads] = useState<WhatsappLead[]>([]);
  const [accidents, setAccidents] = useState<AccidentCase[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [lRes, aRes] = await Promise.all([
      supabase.from("whatsapp_leads").select("*").order("created_at", { ascending: false }),
      supabase.from("accident_cases").select("*").order("created_at", { ascending: false }),
    ]);
    setLeads((lRes.data ?? []) as WhatsappLead[]);
    setAccidents((aRes.data ?? []) as AccidentCase[]);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const setLeadStatus = useCallback(async (id: string, status: string) => {
    await supabase.from("whatsapp_leads").update({ status }).eq("id", id);
    await refresh();
  }, [refresh]);

  const deleteLead = useCallback(async (id: string) => {
    await supabase.from("whatsapp_leads").delete().eq("id", id);
    await refresh();
  }, [refresh]);

  const setAccidentStatus = useCallback(async (id: string, status: string) => {
    await supabase.from("accident_cases").update({ status }).eq("id", id);
    await refresh();
  }, [refresh]);

  const deleteAccident = useCallback(async (id: string) => {
    await supabase.from("accident_cases").delete().eq("id", id);
    await refresh();
  }, [refresh]);

  return { leads, accidents, loading, refresh, setLeadStatus, deleteLead, setAccidentStatus, deleteAccident };
}
