import type { Medication, Slot } from './types';

export const MEDICATIONS: Medication[] = [
  {
    id: 'levothyroxine',
    name: 'Levothyroxine',
    slot: 'ochtend',
    time: '07:30',
    notes: 'Op een lege maag, 30 min voor ontbijt',
    type: 'medicatie',
    required: true,
  },
  {
    id: 'vitamine-d',
    name: 'Vitamine D3',
    slot: 'ochtend',
    time: '08:00',
    notes: 'Met ontbijt, vetoplosbaar',
    type: 'supplement',
    required: true,
  },
  {
    id: 'magnesium-ochtend',
    name: 'Magnesium',
    slot: 'ochtend',
    time: '08:00',
    notes: 'Met ontbijt',
    type: 'supplement',
    required: false,
  },
  {
    id: 'omega-3',
    name: 'Omega-3',
    slot: 'middag',
    time: '13:00',
    notes: 'Met de lunch',
    type: 'supplement',
    required: false,
  },
  {
    id: 'ijzer',
    name: 'IJzer',
    slot: 'middag',
    time: '15:00',
    notes: 'Liefst met vitamine C, niet met koffie/thee',
    type: 'supplement',
    required: true,
  },
  {
    id: 'pil',
    name: 'Anticonceptiepil',
    slot: 'avond',
    time: '21:00',
    notes: 'Elke dag op hetzelfde tijdstip',
    type: 'medicatie',
    required: true,
  },
  {
    id: 'magnesium-avond',
    name: 'Magnesium',
    slot: 'avond',
    time: '22:00',
    notes: 'Voor het slapen, helpt bij ontspanning',
    type: 'supplement',
    required: false,
  },
];

export const SLOT_ORDER: Slot[] = ['ochtend', 'middag', 'avond'];

export const SLOT_LABEL: Record<Slot, string> = {
  ochtend: 'Ochtend',
  middag: 'Middag',
  avond: 'Avond',
};

export const SLOT_EMOJI: Record<Slot, string> = {
  ochtend: '🌅',
  middag: '☀️',
  avond: '🌙',
};

export const SLOT_DEFAULT_TIME: Record<Slot, string> = {
  ochtend: '08:00',
  middag: '13:00',
  avond: '21:00',
};

export function slotForTime(time: string): Slot {
  const [h] = time.split(':').map(Number);
  if (h < 12) return 'ochtend';
  if (h < 18) return 'middag';
  return 'avond';
}

export function getMedicationById(id: string): Medication | undefined {
  return MEDICATIONS.find((m) => m.id === id);
}

export function nameToMedicationId(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export function prettifyMedicationId(id: string): string {
  const spaced = id.replace(/-/g, ' ').trim();
  if (!spaced) return id;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function groupBySlot<T extends Medication>(meds: T[]): Record<Slot, T[]> {
  const groups: Record<Slot, T[]> = { ochtend: [], middag: [], avond: [] };
  for (const m of meds) groups[m.slot].push(m);
  for (const slot of SLOT_ORDER) {
    groups[slot].sort((a, b) => a.time.localeCompare(b.time));
  }
  return groups;
}
