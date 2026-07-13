import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, Search, LocateFixed } from "lucide-react";
import { toast } from "sonner";

// Vite serves the leaflet marker images as URLs; wire them up so the default
// pin renders (the library's CSS-relative paths break under bundlers).
const pinIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export interface PickedLocation {
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  lat: number;
  lng: number;
}

const NOMINATIM = "https://nominatim.openstreetmap.org";

/** Map a Nominatim `address` object to our shipping-address fields. */
function toLocation(result: any): PickedLocation {
  const a = result.address || {};
  const road = [a.road, a.house_number].filter(Boolean).join(" ");
  const street = road || a.neighbourhood || a.suburb || result.name || "";
  return {
    address: street,
    city: a.city || a.town || a.village || a.municipality || a.county || "",
    state: a.state || a.region || a.state_district || "",
    zipCode: a.postcode || "",
    country: a.country || "",
    lat: Number(result.lat),
    lng: Number(result.lon),
  };
}

/** Imperatively re-centre the map when the marker moves programmatically. */
function Recenter({ position }: { position: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(position, Math.max(map.getZoom(), 13));
  }, [position, map]);
  return null;
}

export const LocationPicker = ({ onSelect }: { onSelect: (loc: PickedLocation) => void }) => {
  const [position, setPosition] = useState<[number, number]>([48.8566, 2.3522]); // Paris default
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounced forward geocoding (respects Nominatim's ~1 req/s policy).
  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `${NOMINATIM}/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(query)}`,
          { headers: { "Accept-Language": navigator.language || "en" } },
        );
        setResults(res.ok ? await res.json() : []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const choose = (result: any) => {
    const loc = toLocation(result);
    setPosition([loc.lat, loc.lng]);
    setResults([]);
    setQuery(result.display_name || "");
    onSelect(loc);
  };

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const res = await fetch(
        `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}`,
        { headers: { "Accept-Language": navigator.language || "en" } },
      );
      if (res.ok) {
        const data = await res.json();
        onSelect({ ...toLocation(data), lat, lng });
      } else {
        onSelect({ address: "", city: "", state: "", zipCode: "", country: "", lat, lng });
      }
    } catch {
      onSelect({ address: "", city: "", state: "", zipCode: "", country: "", lat, lng });
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation isn't supported by your browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setPosition([latitude, longitude]);
        reverseGeocode(latitude, longitude).finally(() => setLocating(false));
      },
      () => {
        toast.error("Couldn't get your location. Please allow location access or search instead.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search for your address…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
          {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
          {results.length > 0 && (
            <div className="absolute z-[1000] mt-1 w-full bg-popover border rounded-md shadow-lg max-h-56 overflow-y-auto">
              {results.map((r) => (
                <button
                  key={r.place_id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-start gap-2"
                  onClick={() => choose(r)}
                >
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <span>{r.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Button type="button" variant="outline" onClick={useMyLocation} disabled={locating}>
          {locating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LocateFixed className="h-4 w-4 mr-2" />}
          My location
        </Button>
      </div>

      <div className="h-64 rounded-lg overflow-hidden border">
        <MapContainer center={position} zoom={12} className="h-full w-full" scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Recenter position={position} />
          <Marker
            position={position}
            icon={pinIcon}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const { lat, lng } = (e.target as L.Marker).getLatLng();
                setPosition([lat, lng]);
                reverseGeocode(lat, lng);
              },
            }}
          />
        </MapContainer>
      </div>
      <p className="text-xs text-muted-foreground">
        Search, drag the pin, or use your location. The address fields below fill automatically and stay editable.
      </p>
    </div>
  );
};
