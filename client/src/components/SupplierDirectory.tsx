import { useEffect, useMemo, useState } from "react";
import {
  getSupplierDirectory,
  getCountries,
  type DirectorySupplier,
  type Country,
  type DirectoryFilters,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { SupplierGrid } from "@/components/SupplierGrid";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

const CATEGORIES = ["silicone", "fabric", "tyvek", "vinyl", "event"];
const SORTS: { value: NonNullable<DirectoryFilters["sort"]>; label: string }[] = [
  { value: "rating", label: "Top rated" },
  { value: "popular", label: "Most popular" },
  { value: "newest", label: "Newest" },
];

/**
 * Country-aware supplier browser: shows the customer's country first by default,
 * with filters for country, category, rating and sort. Reused on the homepage
 * and the customer dashboard.
 */
export const SupplierDirectory = () => {
  const [countries, setCountries] = useState<Country[]>([]);
  const [myCountry, setMyCountry] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<DirectorySupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  // Filter state. `countrySel` is a pseudo-value: "local" | "all" | ISO code.
  const [countrySel, setCountrySel] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [minRating, setMinRating] = useState<string>("0");
  const [sort, setSort] = useState<NonNullable<DirectoryFilters["sort"]>>("rating");
  const [query, setQuery] = useState("");

  // Bootstrap: countries + the customer's country (default to local-first).
  useEffect(() => {
    (async () => {
      const [cs, user] = await Promise.all([getCountries().catch(() => []), getCurrentUser().catch(() => null)]);
      setCountries(cs);
      if (user?.countryCode) {
        setMyCountry(user.countryCode);
        setCountrySel("local");
      }
      setReady(true);
    })();
  }, []);

  const filters: DirectoryFilters = useMemo(() => {
    const f: DirectoryFilters = { sort };
    if (category !== "all") f.category = category;
    if (Number(minRating) > 0) f.minRating = Number(minRating);
    if (countrySel === "local" && myCountry) f.near = myCountry;
    else if (countrySel !== "local" && countrySel !== "all") f.country = countrySel;
    return f;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countrySel, category, minRating, sort, myCountry]);

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    getSupplierDirectory(filters)
      .then(setSuppliers)
      .catch(() => setSuppliers([]))
      .finally(() => setLoading(false));
  }, [ready, filters]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search suppliers by name, city or country…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <Filter label="Country">
          <Select value={countrySel} onValueChange={setCountrySel}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {myCountry && <SelectItem value="local">My country first</SelectItem>}
              <SelectItem value="all">All countries</SelectItem>
              {countries.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Filter>

        <Filter label="Category">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-40 capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Filter>

        <Filter label="Rating">
          <Select value={minRating} onValueChange={setMinRating}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Any rating</SelectItem>
              <SelectItem value="3">3★ &amp; up</SelectItem>
              <SelectItem value="4">4★ &amp; up</SelectItem>
              <SelectItem value="4.5">4.5★ &amp; up</SelectItem>
            </SelectContent>
          </Select>
        </Filter>

        <Filter label="Sort by">
          <Select value={sort} onValueChange={(v) => setSort(v as NonNullable<DirectoryFilters["sort"]>)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Filter>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <SupplierGrid
          suppliers={suppliers.filter((s) => {
            const q = query.trim().toLowerCase();
            if (!q) return true;
            return [s.companyName, s.city, s.country, s.countryCode]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q));
          })}
          emptyText="No suppliers match your search or filters."
        />
      )}
    </div>
  );
};

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
