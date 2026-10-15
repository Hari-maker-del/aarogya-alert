export type Priority = "High" | "Medium" | "Low";
export type AlertStatus = "Needs review" | "Under investigation" | "Monitoring";

export type AlertItem = {
  id: string;
  region: string;
  regionId?: string;
  indicator: string;
  change: number;
  priority: Priority;
  status: AlertStatus;
  reason: string;
};
