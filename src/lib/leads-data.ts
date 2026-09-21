import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAuditEvent } from "@/lib/audit-logger";

export type WhatsappLead = {
  id: string;
  contact_name: string;
  phone: string | null;
  message: string;
  ai_summary: string | null;
  intent: string | null;
  status: string;
  ai_paused: boolean | null;
  customer_type?: string | null;
  created_at: string;
  last_message_at?: string | null;
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
      supabase
        .from("whatsapp_leads")
        .select("*")
        .order("last_message_at", { ascending: false, nullsFirst: false }),
      supabase.from("accident_cases").select("*").order("created_at", { ascending: false }),
    ]);
    const fetchedLeads = (lRes.data ?? []) as WhatsappLead[];
    fetchedLeads.sort((a, b) => {
      const timeA = new Date(a.last_message_at || a.created_at).getTime();
      const timeB = new Date(b.last_message_at || b.created_at).getTime();
      return timeB - timeA;
    });
    setLeads(fetchedLeads);
    setAccidents((aRes.data ?? []) as AccidentCase[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();

    const channel = supabase
      .channel("crm-data-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_leads" },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "accident_cases" },
        () => void refresh(),
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`[LeadsData] Realtime sync status: ${status}`);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const setLeadStatus = useCallback(
    async (id: string, status: string) => {
      const target = leads.find((l) => l.id === id);
      await supabase.from("whatsapp_leads").update({ status }).eq("id", id);
      await logAuditEvent({
        actionType: "lead_status_updated",
        targetTable: "whatsapp_leads",
        targetId: id,
        details: {
          contact_name: target?.contact_name,
          phone: target?.phone,
          previous_status: target?.status,
          new_status: status,
        },
      });
      await refresh();
    },
    [leads, refresh],
  );

  const deleteLead = useCallback(
    async (id: string) => {
      const target = leads.find((l) => l.id === id);
      await supabase.from("whatsapp_leads").delete().eq("id", id);
      await logAuditEvent({
        actionType: "lead_deleted",
        targetTable: "whatsapp_leads",
        targetId: id,
        details: {
          contact_name: target?.contact_name,
          phone: target?.phone,
        },
      });
      await refresh();
    },
    [leads, refresh],
  );

  const setAccidentStatus = useCallback(
    async (id: string, status: string) => {
      const target = accidents.find((a) => a.id === id);
      await supabase.from("accident_cases").update({ status }).eq("id", id);
      await logAuditEvent({
        actionType: "accident_case_status_updated",
        targetTable: "accident_cases",
        targetId: id,
        details: {
          reg: target?.reg,
          driver_name: target?.driver_name,
          previous_status: target?.status,
          new_status: status,
        },
      });
      await refresh();
    },
    [accidents, refresh],
  );

  const deleteAccident = useCallback(
    async (id: string) => {
      const target = accidents.find((a) => a.id === id);
      await supabase.from("accident_cases").delete().eq("id", id);
      await logAuditEvent({
        actionType: "accident_case_deleted",
        targetTable: "accident_cases",
        targetId: id,
        details: {
          reg: target?.reg,
          driver_name: target?.driver_name,
        },
      });
      await refresh();
    },
    [accidents, refresh],
  );

  return {
    leads,
    accidents,
    loading,
    refresh,
    setLeadStatus,
    deleteLead,
    setAccidentStatus,
    deleteAccident,
  };
}
