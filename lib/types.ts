export type Slot = 'ochtend' | 'middag' | 'avond';
export type MedicationType = 'medicatie' | 'supplement';

export interface Medication {
  id: string;
  name: string;
  slot: Slot;
  time: string;
  notes?: string;
  type: MedicationType;
  required: boolean;
}

export interface LogEntry {
  id: number;
  date: string;
  time_taken: string | null;
  medication_id: string;
  taken: number;
  photo_path: string | null;
  notes: string | null;
  created_at: string;
}

export type MedicationStatus = 'pending' | 'taken' | 'missed';

export interface MedicationWithStatus extends Medication {
  status: MedicationStatus;
  log?: LogEntry;
}
