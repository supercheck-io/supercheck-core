"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { 
  ChevronLeft, 
  Edit, 
  Globe, 
  ArrowUpRight, 
  Activity,
  CheckCircle2,
  CheckCircle,
  Clock,
  CalendarIcon,
} from "lucide-react";
import Link from "next/link";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { monitorStatuses, monitorTypes } from "@/components/monitors/data";
import { Monitor } from "@/components/monitors/schema";
import { formatDistanceToNow, format, addDays, startOfDay, endOfDay } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MonitorDetailClientProps {
  monitor: Monitor;
}

export function MonitorDetailClient({ monitor }: MonitorDetailClientProps) {
  // Track component mount state to prevent state updates on unmounted components
  const isMounted = useRef(false);
  const [isClient, setIsClient] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5; // Show 5 items per page to avoid scrolling

  useEffect(() => {
    // Set mounted flag to true and mark as client-side rendered
    isMounted.current = true;
    setIsClient(true);
    
    // Cleanup on unmount
    return () => {
      isMounted.current = false;
    };
  }, []);
  
  const status = monitorStatuses.find(s => s.value === monitor.status);
  const type = monitorTypes.find(t => t.value === monitor.method);
  
  // Format the uptime as a number for the chart
  const uptimeValue = typeof monitor.uptime === 'number' 
    ? monitor.uptime 
    : parseFloat(monitor.uptime || '0');
  
  // Format last checked time
  const lastCheckedFormatted = monitor.lastCheckedAt
    ? formatDistanceToNow(new Date(monitor.lastCheckedAt), { addSuffix: true })
    : 'Unknown';
  
  // Format interval
  const intervalFormatted = monitor.interval < 60 
    ? `${monitor.interval}s` 
    : `${Math.floor(monitor.interval / 60)}m`;

  // Format date consistently to prevent hydration errors
  const formatDate = (date: string | Date | undefined) => {
    if (!isClient || !date) return ""; // Return empty during SSR or if date is undefined
    
    const d = new Date(date);
    return `${d.getUTCDate().toString().padStart(2, '0')}/${(d.getUTCMonth() + 1).toString().padStart(2, '0')}/${d.getUTCFullYear()}`;
  };

  // Ensure responseTime is a number
  const responseTime = monitor.responseTime || 342; // Default to 342ms if undefined

  // Generate mock check results across different days
  const generateCheckResults = () => {
    // Create results for the last 90 days to cover all time periods
    const results = [];
    for (let i = 0; i < 90; i++) {
      // Create 3-5 entries per day
      const entriesPerDay = 3 + Math.floor(Math.random() * 3);
      const dayDate = new Date();
      dayDate.setDate(dayDate.getDate() - i);
      
      for (let j = 0; j < entriesPerDay; j++) {
        const time = new Date(dayDate);
        time.setHours(Math.floor(Math.random() * 24));
        time.setMinutes(Math.floor(Math.random() * 60));
        
        results.push({
          time,
          responseTime: Math.floor(responseTime * (0.8 + Math.random() * 0.4)),
          status: Math.random() > 0.1 ? "up" : "down",
          region: Math.random() > 0.5 ? "US East" : "Europe"
        });
      }
    }
    return results;
  };

  const allCheckResults = generateCheckResults();

  // Filter results by selected date
  const filteredResults = selectedDate 
    ? allCheckResults.filter(check => {
        const checkDate = new Date(check.time);
        return checkDate.getDate() === selectedDate.getDate() && 
               checkDate.getMonth() === selectedDate.getMonth() && 
               checkDate.getFullYear() === selectedDate.getFullYear();
      })
    : allCheckResults.slice(0, 50); // Default to showing most recent entries

  // Calculate pagination
  const totalPages = Math.max(1, Math.ceil(filteredResults.length / itemsPerPage));
  const paginatedResults = filteredResults.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Generate uptime statistics for various time periods
  const getUptimeStats = () => {
    return [
      {
        period: "Today",
        uptime: "100.000%",
        downtime: "none",
        avgResponse: responseTime - 15,
      },
      {
        period: "Last 7 days",
        uptime: "99.982%",
        downtime: "12 minutes",
        avgResponse: responseTime,
      },
      {
        period: "Last 30 days",
        uptime: "99.991%",
        downtime: "12 minutes",
        avgResponse: responseTime + 8,
      },
      {
        period: "Last 3 months",
        uptime: "99.987%",
        downtime: "38 minutes",
        avgResponse: responseTime + 12,
      },
      {
        period: "Last 6 months",
        uptime: "99.979%",
        downtime: "1.5 hours",
        avgResponse: responseTime + 14,
      },
      
    ];
  };

  const uptimeStats = getUptimeStats();

  // Handle preset date selection
  const handleDatePreset = (value: string) => {
    if (!isMounted.current) return;
    
    let newDate: Date;
    
    switch(value) {
      case "0":
        newDate = new Date(); // Today
        break;
      case "-1":
        newDate = addDays(new Date(), -1); // Yesterday
        break;
      case "-7":
        newDate = addDays(new Date(), -7); // Last week
        break;
      default:
        newDate = addDays(new Date(), parseInt(value));
    }
    
    setSelectedDate(newDate);
    setCurrentPage(1); // Reset to first page when changing date
  };

  return (
    <div className="container py-4 px-4 ">
      <div className="border rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="icon"
              className="h-7 w-7"
              asChild
            >
              <Link href="/monitors">
                <ChevronLeft className="h-3.5 w-3.5" />
                <span className="sr-only">Back to monitors</span>
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-bold">
                {monitor.name}
              </h1>
              <div className="text-muted-foreground text-xs flex items-center gap-2">
                <Globe className="h-3 w-3" />
                <span className="truncate max-w-md">{monitor.url}</span>
                {type && (
                  <Badge variant="outline" className="ml-2 capitalize">
                    <type.icon className={`mr-1 h-2.5 w-2.5 ${type.color}`} />
                    {type.label}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex gap-2">
            <div className="flex flex-col items-end gap-1 mr-3">
              <div className="text-xs text-muted-foreground">
                Last checked: <span className="font-medium">{lastCheckedFormatted}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Created: <span className="font-medium">{formatDate(monitor.createdAt)}</span>
              </div>
            </div>
            
            <Button size="sm" className="h-7 px-2 py-0 text-xs" asChild>
              <Link href={`/monitors/${monitor.id}/edit`}>
                <Edit className="mr-1 h-3.5 w-3.5" />
                Edit
              </Link>
            </Button>
          </div>
        </div>

        {/* Status cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
          <div className="bg-muted/30 rounded-lg p-2 border flex items-center">
            {status && (
              <status.icon className={`h-6 w-6 mr-2 ${status.color}`} />
            )}
            <div>
              <div className="text-xs font-medium text-muted-foreground">Status</div>
              <div className="text-sm font-semibold">{status?.label || 'Unknown'}</div>
            </div>
          </div>
          
          <div className="bg-muted/30 rounded-lg p-2 border flex items-center">
            <Activity className="h-6 w-6 mr-2 text-emerald-500" />
            <div>
              <div className="text-xs font-medium text-muted-foreground">Uptime</div>
              <div className="text-sm font-semibold">{uptimeValue.toFixed(2)}%</div>
            </div>
          </div>
          
          <div className="bg-muted/30 rounded-lg p-2 border flex items-center">
            <Clock className="h-6 w-6 mr-2 text-blue-500" />
            <div>
              <div className="text-xs font-medium text-muted-foreground">Response Time</div>
              <div className="text-sm font-semibold">{responseTime} ms</div>
            </div>
          </div>
          
          <div className="bg-muted/30 rounded-lg p-2 border flex items-center">
            <CheckCircle className="h-6 w-6 mr-2 text-purple-500" />
            <div>
              <div className="text-xs font-medium text-muted-foreground">Check Interval</div>
              <div className="text-sm font-semibold">{intervalFormatted}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 h-full">
        {/* Left column - Response time graph and uptime stats */}
        <div className="space-y-6">
          {/* Response time graph */}
          <Card className="h-auto">
            <CardHeader className="pb-2 px-6 pt-6">
              <CardTitle className="text-base font-medium flex items-center">
                <Activity className="h-5 w-5 mr-2 text-muted-foreground" />
                Response Times
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="w-full h-[240px] rounded bg-slate-900 overflow-hidden relative">
                {/* Simulate response time graph */}
                <svg width="100%" height="100%" viewBox="0 0 1000 240" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="grad1" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" style={{ stopColor: 'rgb(16, 185, 129)', stopOpacity: 0.2 }} />
                      <stop offset="100%" style={{ stopColor: 'rgb(16, 185, 129)', stopOpacity: 0 }} />
                    </linearGradient>
                  </defs>
                  
                  {/* Background grid lines */}
                  <line x1="0" y1="60" x2="1000" y2="60" stroke="#374151" strokeWidth="1" strokeDasharray="4" />
                  <line x1="0" y1="120" x2="1000" y2="120" stroke="#374151" strokeWidth="1" strokeDasharray="4" />
                  <line x1="0" y1="180" x2="1000" y2="180" stroke="#374151" strokeWidth="1" strokeDasharray="4" />
                  
                  {/* Generate a spiky response curve that matches the image */}
                  {(() => {
                    // Generate a spiky pattern more similar to the image
                    const points = [];
                    const baseY = 170; // Base Y value (lower value = higher on graph)
                    
                    // Starting portion - low spikes
                    for (let i = 0; i < 200; i++) {
                      const x = i;
                      const randomFactor = Math.random() * 30;
                      const y = baseY - 10 - randomFactor - (i < 150 ? Math.sin(i/20) * 20 : 0);
                      points.push(`${x},${y}`);
                    }
                    
                    // Middle portion - large spike
                    for (let i = 200; i < 400; i++) {
                      const x = i;
                      const progress = (i - 200) / 200;
                      const peakFactor = Math.sin(progress * Math.PI);
                      const y = baseY - 10 - peakFactor * 120;
                      points.push(`${x},${y}`);
                    }
                    
                    // Later portion - medium spikes
                    for (let i = 400; i < 1000; i++) {
                      const x = i;
                      const randomFactor = Math.random() * 20;
                      // Add a small peak around position 600
                      const secondaryPeak = i > 580 && i < 650 ? 40 * Math.sin((i-580)/70 * Math.PI) : 0;
                      const y = baseY - 15 - randomFactor - secondaryPeak;
                      points.push(`${x},${y}`);
                    }
                    
                    // Create path for line
                    const linePath = `M${points.join(' L')}`;
                    
                    // Create path for area fill, extended to bottom
                    const areaPath = `${linePath} L1000,240 L0,240 Z`;
                    
                    return (
                      <>
                        {/* Fill area under curve */}
                        <path d={areaPath} fill="url(#grad1)" />
                        {/* Draw the actual line */}
                        <path d={linePath} fill="none" stroke="#10B981" strokeWidth="2" />
                      </>
                    );
                  })()}

                  {/* Simulate a brief outage with a red segment */}
                  <circle cx="780" cy="190" r="3" fill="#EF4444" />
                  <circle cx="790" cy="190" r="3" fill="#EF4444" />
                  <circle cx="800" cy="190" r="3" fill="#EF4444" />
                </svg>
                
                {/* Y-axis labels */}
                <div className="absolute top-0 left-0 h-full text-xs text-slate-400 p-2 flex flex-col justify-between">
                  <div>8.00</div>
                  <div>6.00</div>
                  <div>4.00</div>
                  <div>2.00</div>
                  <div>0.00</div>
                </div>
                
                {/* X-axis labels */}
                <div className="absolute bottom-0 left-0 w-full text-xs text-slate-400 p-1 flex justify-between">
                  <div>00:00</div>
                  <div>06:00</div>
                  <div>12:00</div>
                  <div>18:00</div>
                  <div>00:00</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Uptime statistics */}
          <Card className="h-auto">
            <CardHeader className="pb-2 px-6 pt-5">
              <CardTitle className="text-base font-medium flex items-center">
                <CheckCircle2 className="h-5 w-5 mr-2 text-muted-foreground" />
                Uptime Statistics
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left py-2 px-4 font-medium">Time Period</th>
                      <th className="text-left py-2 px-4 font-medium">Availability</th>
                      <th className="text-left py-2 px-4 font-medium">Downtime</th>
                      <th className="text-left py-2 px-4 font-medium">Avg. Response</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {uptimeStats.map((stat, index) => (
                      <tr key={index} className="hover:bg-muted/20">
                        <td className="py-2 px-4">{stat.period}</td>
                        <td className="py-2 px-4 font-medium text-green-500">{stat.uptime}</td>
                        <td className="py-2 px-4">{stat.downtime}</td>
                        <td className="py-2 px-4">{stat.avgResponse} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column - Check Results */}
        <Card className="flex flex-col">
          <CardHeader className="pb-2 px-6 pt-5 flex flex-row justify-between items-center">
            <CardTitle className="text-base font-medium flex items-center">
              <CheckCircle2 className="h-5 w-5 mr-2 text-muted-foreground" />
              Check Results
            </CardTitle>
            
            {/* Date Picker with Presets */}
            <div className="flex items-center">
            
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="flex w-auto flex-col space-y-2 p-2"
                >
                  <Select
                    onValueChange={handleDatePreset}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value="0">Today</SelectItem>
                      <SelectItem value="-1">Yesterday</SelectItem>
                      <SelectItem value="-7">Last week</SelectItem>
                      <SelectItem value="-30">Last month</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="rounded-md border">
                    <Calendar 
                      mode="single" 
                      selected={selectedDate} 
                      onSelect={(date) => isMounted.current && setSelectedDate(date)} 
                      initialFocus 
                    />
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </CardHeader>
          <CardContent className="px-0 py-0 flex-1 h-full">
            <div className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b">
                  <tr>
                    <th className="text-left py-2 px-4 font-medium">Time</th>
                    <th className="text-left py-2 px-4 font-medium">Status</th>
                    <th className="text-left py-2 px-4 font-medium">Response</th>
                    <th className="text-left py-2 px-4 font-medium">Region</th>
                  </tr>
                </thead>
                <tbody className="divide-y max-h-[calc(100%-2rem)]">
                  {paginatedResults.length > 0 ? (
                    paginatedResults.map((check, i) => {
                      const statusObj = monitorStatuses.find(s => s.value === check.status);
                      
                      return (
                        <tr key={i} className="hover:bg-muted/20">
                          <td className="py-2 px-4">
                            <div className="flex flex-col">
                              <span>{isClient ? format(check.time, "HH:mm:ss") : ''}</span>
                              <span className="text-xs text-muted-foreground">
                                {isClient ? format(check.time, "dd/MM/yyyy") : ''}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-4">
                            <div className="flex items-center">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className={`py-0 px-2 h-6 ${check.status === 'up' ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20 hover:text-green-600' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-600'}`}
                              >
                                {statusObj && (
                                  <>
                                    <statusObj.icon className={`h-3 w-3 mr-1 ${statusObj.color}`} />
                                    <span className="text-xs font-medium">{statusObj.label}</span>
                                  </>
                                )}
                              </Button>
                            </div>
                          </td>
                          <td className="py-2 px-4 font-mono">
                            {check.responseTime} ms
                          </td>
                          <td className="py-2 px-4">
                            {check.region}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-muted-foreground">
                        No check results for the selected date
                      </td>
                    </tr>
                  )}

                  {/* Add empty rows if we have fewer results than itemsPerPage */}
                  {paginatedResults.length > 0 && paginatedResults.length < itemsPerPage && (
                    Array.from({ length: itemsPerPage - paginatedResults.length }).map((_, i) => (
                      <tr key={`empty-${i}`} className="h-[52px]">
                        <td colSpan={4}></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between items-center border-t py-3 px-4">
            {/* Pagination centered */}
            <div className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </div>
            <Pagination className="w-auto">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    onClick={() => isMounted.current && setCurrentPage(prev => Math.max(prev - 1, 1))}
                    className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
                
                {[...Array(Math.min(totalPages, 3))].map((_, i) => {
                  const pageNumber = i + 1;
                  const isActive = pageNumber === currentPage;
                  
                  return (
                    <PaginationItem key={pageNumber}>
                      <PaginationLink 
                        isActive={isActive}
                        onClick={() => isMounted.current && setCurrentPage(pageNumber)}
                        className="cursor-pointer"
                      >
                        {pageNumber}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
                
                {totalPages > 3 && (
                  <PaginationItem>
                    <PaginationEllipsis />
                  </PaginationItem>
                )}
                
                <PaginationItem>
                  <PaginationNext 
                    onClick={() => isMounted.current && setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
} 