'use client';

import { useState } from 'react';

export interface LogDrawerEntry {
  log_id: number;
  medication_id: string;
  medication_name: string;
  time_taken: string | null;
  scheduled_time: string;
  has_photo: boolean;
}

export interface LogDrawerDay {
  date: string;
  label: string;
  taken: number;
  total: number;
  entries: LogDrawerEntry[];
}

interface Props {
  days: LogDrawerDay[];
}

export default function LogDrawer({ days }: Props) {
  const [open, setOpen] = useState(false);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function openPhoto(logId: number) {
    setPhotoError(null);
    setLoadingId(logId);
    try {
      const res = await fetch(`/api/log/${logId}/photo`);
      if (!res.ok) {
        throw new Error('Foto kon niet geladen worden');
      }
      const body = (await res.json()) as { photo?: string };
      if (!body.photo) throw new Error('Geen foto');
      setPhotoUrl(body.photo);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Onbekende fout');
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <>
      <div className="w-full max-w-md mx-auto px-4 pb-6">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full bg-white/15 hover:bg-white/25 backdrop-blur text-white py-3 px-5 rounded-2xl flex items-center justify-between transition-colors border border-white/20"
        >
          <span className="font-semibold flex items-center gap-2">
            <span>📋</span>
            <span>Logboek</span>
          </span>
          <span className={`transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
        </button>

        {open && (
          <div className="mt-3 bg-white/95 backdrop-blur rounded-2xl shadow-xl p-3 animate-slide-up">
            {days.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-6">Nog geen logs.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {days.map((day) => {
                  const isExpanded = expandedDate === day.date;
                  const allTaken = day.taken === day.total && day.total > 0;
                  return (
                    <li key={day.date}>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedDate((prev) => (prev === day.date ? null : day.date))
                        }
                        className="w-full flex items-center justify-between py-3 px-2 text-left hover:bg-slate-50 rounded-lg transition-colors"
                      >
                        <span className="font-medium text-slate-800 capitalize">{day.label}</span>
                        <span className="flex items-center gap-2">
                          <span
                            className={`text-sm font-semibold ${
                              allTaken ? 'text-green-600' : 'text-slate-500'
                            }`}
                          >
                            {day.taken}/{day.total}
                          </span>
                          <span
                            className={`text-slate-400 transition-transform ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          >
                            ▾
                          </span>
                        </span>
                      </button>
                      {isExpanded && (
                        <ul className="pb-3 px-2 space-y-2 animate-slide-up">
                          {day.entries.length === 0 && (
                            <li className="text-sm text-slate-400 italic px-2">
                              Niets ingenomen.
                            </li>
                          )}
                          {day.entries.map((entry, i) => (
                            <li
                              key={`${entry.medication_id}-${i}`}
                              className="flex items-center gap-3 bg-slate-50 rounded-xl p-2"
                            >
                              <div className="shrink-0 w-12 h-12 rounded-lg bg-slate-200 flex items-center justify-center text-slate-400 text-xl">
                                💊
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-800 truncate">
                                  {entry.medication_name}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {entry.time_taken
                                    ? `Genomen om ${entry.time_taken}`
                                    : `Gepland ${entry.scheduled_time}`}
                                </p>
                                {entry.has_photo && (
                                  <button
                                    type="button"
                                    onClick={() => openPhoto(entry.log_id)}
                                    disabled={loadingId === entry.log_id}
                                    className="text-xs mt-1 text-luna-accent hover:underline disabled:opacity-50"
                                  >
                                    {loadingId === entry.log_id
                                      ? 'Laden…'
                                      : '📷 Foto bekijken'}
                                  </button>
                                )}
                              </div>
                              <span className="text-green-600 text-xl">✓</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {photoError && (
              <p className="text-xs text-red-600 px-2 pt-2">{photoError}</p>
            )}
          </div>
        )}
      </div>

      {photoUrl && (
        <button
          type="button"
          onClick={() => setPhotoUrl(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          aria-label="Sluit foto"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt="Foto"
            className="max-w-full max-h-full rounded-2xl shadow-2xl"
          />
        </button>
      )}
    </>
  );
}
