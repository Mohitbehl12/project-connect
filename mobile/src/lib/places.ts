import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CITIES, COUNTRIES } from "@shared/constants";
import { api } from "@/lib/api";

export type Place = { key: string; label: string; countryName: string };

const POPULAR: Place[] = Object.entries(CITIES).map(([k, c]) => ({ key: k, label: k, countryName: COUNTRIES[c.country]?.name ?? c.country }));

/** Popular cities until two letters are typed; then every matching town or city in the world. */
export function usePlaces(query: string) {
  const [q, setQ] = useState(query.trim());
  useEffect(() => { const t = setTimeout(() => setQ(query.trim()), 200); return () => clearTimeout(t); }, [query]);
  const typed = q.length >= 2;
  const res = useQuery({ queryKey: ["places", q], enabled: typed, staleTime: 3600_000, queryFn: () => api<{ places: Place[] }>(`/api/places?q=${encodeURIComponent(q)}`) });
  return { places: typed ? res.data?.places ?? [] : POPULAR, typed, loading: typed && res.isFetching };
}
