import * as React from "react";
import type { Column } from "@tanstack/react-table";
import { Check, PlusCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

interface Tag {
  id: string;
  name: string;
  color: string | null;
}

interface DataTableTagFilterProps<TData, TValue> {
  column?: Column<TData, TValue>;
  title?: string;
}

export function DataTableTagFilter<TData, TValue>({
  column,
  title = "Tags",
}: DataTableTagFilterProps<TData, TValue>) {
  const [facets, setFacets] = React.useState<Map<string, number> | undefined>(
    undefined
  );
  const [selectedValues, setSelectedValues] = React.useState<Set<string>>(
    new Set()
  );
  const [availableTags, setAvailableTags] = React.useState<Tag[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  // Load available tags
  React.useEffect(() => {
    const loadTags = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/tags');
        if (response.ok) {
          const tags = await response.json();
          setAvailableTags(tags);
        }
      } catch (error) {
        console.error('Error loading tags:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTags();
  }, []);

  React.useEffect(() => {
    if (column) {
      setFacets(column.getFacetedUniqueValues());
      const filterValue = column.getFilterValue() as string[] | undefined;
      setSelectedValues(new Set(filterValue || []));
    }
  }, [column]);

  const selectedTags = availableTags.filter(tag => selectedValues.has(tag.name));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          <PlusCircle />
          {title}
          {selectedValues?.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              <Badge
                variant="secondary"
                className="rounded-sm px-1 font-normal lg:hidden"
              >
                {selectedValues.size}
              </Badge>
              <div className="hidden space-x-1 lg:flex">
                {selectedValues.size > 2 ? (
                  <Badge
                    variant="secondary"
                    className="rounded-sm px-1 font-normal"
                  >
                    {selectedValues.size} selected
                  </Badge>
                ) : (
                  selectedTags.map((tag) => (
                    <Badge
                      variant="secondary"
                      key={tag.id}
                      className="rounded-sm px-1 font-normal"
                      style={tag.color ? { backgroundColor: tag.color + "20", color: tag.color } : {}}
                    >
                      {tag.name}
                    </Badge>
                  ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>
              {isLoading ? "Loading tags..." : "No tags found."}
            </CommandEmpty>
            <CommandGroup>
              {availableTags.map((tag) => {
                const isSelected = selectedValues.has(tag.name);
                return (
                  <CommandItem
                    key={tag.id}
                    onSelect={() => {
                      const newSelectedValues = new Set(selectedValues);
                      if (isSelected) {
                        newSelectedValues.delete(tag.name);
                      } else {
                        newSelectedValues.add(tag.name);
                      }
                      const filterValues = Array.from(newSelectedValues);
                      column?.setFilterValue(
                        filterValues.length ? filterValues : undefined
                      );
                      setSelectedValues(newSelectedValues);
                    }}
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible"
                      )}
                    >
                      <Check />
                    </div>
                    <div
                      className="w-3 h-3 rounded-full mr-2"
                      style={{ backgroundColor: tag.color || "#64748b" }}
                    />
                    <span>{tag.name}</span>
                    {facets?.get(tag.name) && (
                      <span className="ml-auto flex h-4 w-4 items-center justify-center font-mono text-xs">
                        {facets.get(tag.name)}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selectedValues.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      column?.setFilterValue(undefined);
                      setSelectedValues(new Set());
                    }}
                    className="justify-center text-center"
                  >
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
} 