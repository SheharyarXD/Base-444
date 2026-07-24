import { Link } from "react-router-dom";
import { Wrench, Zap, Sparkles, Paintbrush, TreePine, Wind, Hammer, Home, Package, Truck } from "lucide-react";

const categoryIcons = {
  "Plumbing": Wrench,
  "Electrical": Zap,
  "Cleaning": Sparkles,
  "Painting": Paintbrush,
  "Landscaping": TreePine,
  "HVAC": Wind,
  "Carpentry": Hammer,
  "Roofing": Home,
  "General Handyman": Package,
  "Moving": Truck,
};

const categoryColors = {
  "Plumbing": "bg-blue-50 text-blue-600",
  "Electrical": "bg-amber-50 text-amber-600",
  "Cleaning": "bg-emerald-50 text-emerald-600",
  "Painting": "bg-purple-50 text-purple-600",
  "Landscaping": "bg-green-50 text-green-600",
  "HVAC": "bg-cyan-50 text-cyan-600",
  "Carpentry": "bg-orange-50 text-orange-600",
  "Roofing": "bg-red-50 text-red-600",
  "General Handyman": "bg-slate-50 text-slate-600",
  "Moving": "bg-indigo-50 text-indigo-600",
};

export default function CategoryCard({ category }) {
  const Icon = categoryIcons[category] || Package;
  const colorClass = categoryColors[category] || "bg-muted text-muted-foreground";

  return (
    <Link
      to={`/browse?category=${encodeURIComponent(category)}`}
      className="group flex flex-col items-center gap-3 p-4 rounded-2xl bg-card border border-border hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
    >
      <div className={`w-14 h-14 rounded-2xl ${colorClass} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
        <Icon className="w-6 h-6" />
      </div>
      <span className="text-xs font-semibold text-foreground text-center leading-tight">{category}</span>
    </Link>
  );
}

export { categoryIcons, categoryColors };