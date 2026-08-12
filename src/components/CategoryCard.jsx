import { Link } from "react-router-dom";
import { Wrench, Zap, Sparkles, Paintbrush, TreePine, Wind, Hammer, Home, Package, Truck, Car, SprayCan, Building2, Droplets, Fence, Container, DoorOpen, TreeDeciduous, Refrigerator, Cog, Construction } from "lucide-react";

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
  "Mobile Mechanic": Car,
  "Mobile Detailer": SprayCan,
  "Lawn Care": TreePine,
  "Other": Package,
  "Contractors": Building2,
  "Pressure Washing Services": Droplets,
  "Fencing Services": Fence,
  "Heavy Wheel Mechanic": Container,
  "Garage Door Specialists": DoorOpen,
  "Tree Services": TreeDeciduous,
  "Appliance Repair": Refrigerator,
  "Small Engine Repair": Cog,
  "Towing Service": Truck,
  "Concrete Services": Construction,
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
  "Mobile Mechanic": "bg-rose-50 text-rose-600",
  "Mobile Detailer": "bg-teal-50 text-teal-600",
  "Lawn Care": "bg-lime-50 text-lime-600",
  "Other": "bg-gray-50 text-gray-600",
  "Contractors": "bg-sky-50 text-sky-600",
  "Pressure Washing Services": "bg-violet-50 text-violet-600",
  "Fencing Services": "bg-stone-50 text-stone-600",
  "Heavy Wheel Mechanic": "bg-zinc-50 text-zinc-600",
  "Garage Door Specialists": "bg-fuchsia-50 text-fuchsia-600",
  "Tree Services": "bg-green-100 text-green-700",
  "Appliance Repair": "bg-blue-100 text-blue-700",
  "Small Engine Repair": "bg-orange-100 text-orange-700",
  "Towing Service": "bg-yellow-50 text-yellow-700",
  "Concrete Services": "bg-neutral-50 text-neutral-600",
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