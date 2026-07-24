import { useState, useEffect, useMemo } from "react";
import { Search, SlidersHorizontal, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";
import ContractorCard from "../components/ContractorCard";
import { motion } from "framer-motion";

const allCategories = [
  "Plumbing", "Electrical", "Cleaning", "Painting", "Landscaping",
  "HVAC", "Carpentry", "Roofing", "General Handyman", "Moving"
];

export default function Browse() {
  const [contractors, setContractors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState("rating");
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cat = params.get("category");
    const search = params.get("search");
    if (cat) setSelectedCategory(cat);
    if (search) setSearchQuery(search);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const filter = {};
      if (selectedCategory) filter.category = selectedCategory;
      const sortField = sortBy === "rating" ? "-rating" : sortBy === "price_low" ? "hourly_rate" : "-hourly_rate";
      
      let results;
      if (Object.keys(filter).length > 0) {
        results = await base44.entities.Contractor.filter(filter, sortField, 50);
      } else {
        results = await base44.entities.Contractor.list(sortField, 50);
      }
      setContractors(results);
      setLoading(false);
    }
    load();
  }, [selectedCategory, sortBy]);

  const handlePullRefresh = (e) => {
    if (window.scrollY !== 0) return;
    setPullY(Math.max(0, e.touches[0].clientY - 50));
  };

  const handlePullEnd = () => {
    if (pullY > 100) {
      setRefreshing(true);
      setTimeout(() => {
        setContractors([]);
        setLoading(true);
        (async () => {
          const sortField = sortBy === "rating" ? "-rating" : sortBy === "price_low" ? "hourly_rate" : "-hourly_rate";
          const results = selectedCategory
            ? await base44.entities.Contractor.filter({ category: selectedCategory }, sortField, 50)
            : await base44.entities.Contractor.list(sortField, 50);
          setContractors(results);
          setLoading(false);
          setRefreshing(false);
        })();
      }, 300);
    }
    setPullY(0);
  };

  useEffect(() => {
    window.addEventListener("touchmove", handlePullRefresh);
    window.addEventListener("touchend", handlePullEnd);
    return () => {
      window.removeEventListener("touchmove", handlePullRefresh);
      window.removeEventListener("touchend", handlePullEnd);
    };
  }, [pullY, sortBy, selectedCategory]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return contractors;
    const q = searchQuery.toLowerCase();
    return contractors.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.category?.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        c.location?.toLowerCase().includes(q) ||
        c.skills?.some((s) => s.toLowerCase().includes(q))
    );
  }, [contractors, searchQuery]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-12" style={{ transform: `translateY(${Math.min(pullY, 80)}px)` }}>
      {pullY > 0 && (
        <div className="flex justify-center mb-4">
          <motion.div animate={{ rotate: refreshing ? 360 : 0 }} transition={{ duration: 0.6, repeat: refreshing ? Infinity : 0 }}>
            <RefreshCw className={`w-5 h-5 ${refreshing ? "text-primary" : "text-muted-foreground"}`} />
          </motion.div>
        </div>
      )}
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-heading font-bold text-2xl md:text-3xl bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent mb-1">
          Browse Contractors
        </h1>
        <p className="text-muted-foreground text-sm">
          {filtered.length} professional{filtered.length !== 1 ? "s" : ""} available
        </p>
      </div>

      {/* Search & Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, skill, or location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-card border border-border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
          />
        </div>
        <Button
          variant="outline"
          className="rounded-xl px-4 shrink-0"
          onClick={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal className="w-4 h-4" />
        </Button>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="bg-card rounded-2xl border border-border p-5 mb-4 overflow-hidden"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading font-semibold text-sm">Sort by</h3>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              { value: "rating", label: "Top Rated" },
              { value: "price_low", label: "Price: Low to High" },
              { value: "price_high", label: "Price: High to Low" },
            ].map((s) => (
              <Badge
                key={s.value}
                variant={sortBy === s.value ? "default" : "outline"}
                className="cursor-pointer px-3 py-1.5 text-xs"
                onClick={() => setSortBy(s.value)}
              >
                {s.label}
              </Badge>
            ))}
          </div>
        </motion.div>
      )}

      {/* Category Chips */}
      <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
        <Badge
          variant={selectedCategory === "" ? "default" : "outline"}
          className="cursor-pointer px-4 py-2 text-xs whitespace-nowrap shrink-0 rounded-full font-semibold"
          onClick={() => setSelectedCategory("")}
        >
          All
        </Badge>
        {allCategories.map((cat, idx) => {
          const colors = ['bg-blue-100 text-blue-700 hover:bg-blue-200', 'bg-purple-100 text-purple-700 hover:bg-purple-200', 'bg-pink-100 text-pink-700 hover:bg-pink-200', 'bg-green-100 text-green-700 hover:bg-green-200', 'bg-amber-100 text-amber-700 hover:bg-amber-200'];
          const color = colors[idx % colors.length];
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(selectedCategory === cat ? "" : cat)}
              className={`px-4 py-2 text-xs whitespace-nowrap shrink-0 rounded-full font-semibold transition-all ${
                selectedCategory === cat
                  ? `${color} shadow-md`
                  : `${color} opacity-60 hover:opacity-100`
              }`}
            >
              {cat}
              {selectedCategory === cat && <X className="w-3 h-3 ml-1 inline" />}
            </button>
          );
        })}
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-card rounded-2xl border border-border animate-pulse">
              <div className="h-48 bg-muted rounded-t-2xl" />
              <div className="p-5 space-y-3">
                <div className="h-5 w-2/3 bg-muted rounded" />
                <div className="h-4 w-1/3 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-2xl border border-border mt-4">
          <p className="text-muted-foreground text-lg mb-2">No contractors found</p>
          <p className="text-sm text-muted-foreground">Try adjusting your search or filters.</p>
          {(selectedCategory || searchQuery) && (
            <Button
              variant="ghost"
              className="mt-4"
              onClick={() => {
                setSelectedCategory("");
                setSearchQuery("");
              }}
            >
              Clear all filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-4">
          {filtered.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
            >
              <ContractorCard contractor={c} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}