import { useState } from "react";
import { format, isValid } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * A controlled date picker that stores value as "YYYY-MM-DD" string.
 * Props: value (string), onChange (fn), min (string), className
 */
export default function DatePickerInput({ value, onChange, min, className }) {
  const [open, setOpen] = useState(false);

  function parseLocalDate(str) {
    if (!str) return undefined;
    const [y, m, d] = str.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return isValid(date) ? date : undefined;
  }

  const selected = parseLocalDate(value);
  const minDate = parseLocalDate(min);

  function handleSelect(date) {
    if (!date) return;
    onChange(format(date, "yyyy-MM-dd"));
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal border-input bg-background hover:bg-secondary/50",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {selected ? format(selected, "MM/dd/yyyy") : "mm/dd/yyyy"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          disabled={minDate ? (date) => date < minDate : undefined}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}