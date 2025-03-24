"use client";
import { columns } from "./columns";
import { DataTable } from "./data-table";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { labels, priorities, statuses } from "./data/data";

export default function Tests() {
  const [selectedTest, setSelectedTest] = useState<(typeof tasks)[0] | null>(
    null
  );
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const tasks = [
    {
      id: "TASK-8782",
      title:
        "You can't compress the program without quantifying the open-source SSD pixel!",
      status: "in progress",
      label: "documentation",
      priority: "medium",
    },
    {
      id: "TASK-7878",
      title:
        "Try to calculate the EXE feed, maybe it will index the multi-byte pixel!",
      status: "backlog",
      label: "documentation",
      priority: "medium",
    },
    {
      id: "TASK-7839",
      title: "We need to bypass the neural TCP card!",
      status: "todo",
      label: "bug",
      priority: "high",
    },
    {
      id: "TASK-5562",
      title:
        "The SAS interface is down, bypass the open-source pixel so we can back up the PNG bandwidth!",
      status: "backlog",
      label: "feature",
      priority: "medium",
    },
    {
      id: "TASK-8686",
      title:
        "I'll parse the wireless SSL protocol, that should driver the API panel!",
      status: "canceled",
      label: "feature",
      priority: "medium",
    },
    {
      id: "TASK-1280",
      title:
        "Use the digital TLS panel, then you can transmit the haptic system!",
      status: "done",
      label: "bug",
      priority: "high",
    },
    {
      id: "TASK-7262",
      title:
        "The UTF8 application is down, parse the neural bandwidth so we can back up the PNG firewall!",
      status: "done",
      label: "feature",
      priority: "high",
    },
    {
      id: "TASK-1138",
      title:
        "Generating the driver won't do anything, we need to quantify the 1080p SMTP bandwidth!",
      status: "in progress",
      label: "feature",
      priority: "medium",
    },
    {
      id: "TASK-7184",
      title: "We need to program the back-end THX pixel!",
      status: "todo",
      label: "feature",
      priority: "low",
    },
    {
      id: "TASK-5160",
      title:
        "Calculating the bus won't do anything, we need to navigate the back-end JSON protocol!",
      status: "in progress",
      label: "documentation",
      priority: "high",
    },
    {
      id: "TASK-5618",
      title:
        "Generating the driver won't do anything, we need to index the online SSL application!",
      status: "done",
      label: "documentation",
      priority: "medium",
    },
    {
      id: "TASK-6699",
      title:
        "I'll transmit the wireless JBOD capacitor, that should hard drive the SSD feed!",
      status: "backlog",
      label: "documentation",
      priority: "medium",
    },
    {
      id: "TASK-9892",
      title:
        "If we back up the application, we can get to the UDP application through the multi-byte THX capacitor!",
      status: "done",
      label: "documentation",
      priority: "high",
    },
    {
      id: "TASK-9616",
      title: "We need to synthesize the cross-platform ASCII pixel!",
      status: "in progress",
      label: "feature",
      priority: "medium",
    },
    {
      id: "TASK-9744",
      title:
        "Use the back-end IP card, then you can input the solid state hard drive!",
      status: "done",
      label: "documentation",
      priority: "low",
    },
    {
      id: "TASK-1376",
      title:
        "Generating the alarm won't do anything, we need to generate the mobile IP capacitor!",
      status: "backlog",
      label: "documentation",
      priority: "low",
    },
    {
      id: "TASK-7382",
      title:
        "If we back up the firewall, we can get to the RAM alarm through the primary UTF8 pixel!",
      status: "todo",
      label: "feature",
      priority: "low",
    },
    {
      id: "TASK-2290",
      title:
        "I'll compress the virtual JSON panel, that should application the UTF8 bus!",
      status: "canceled",
      label: "documentation",
      priority: "high",
    },
    {
      id: "TASK-1533",
      title:
        "You can't input the firewall without overriding the wireless TCP firewall!",
      status: "done",
      label: "bug",
      priority: "high",
    },
    {
      id: "TASK-4424",
      title:
        "Try to hack the HEX alarm, maybe it will connect the optical pixel!",
      status: "in progress",
      label: "documentation",
      priority: "medium",
    },
    {
      id: "TASK-3922",
      title:
        "You can't back up the capacitor without generating the wireless PCI program!",
      status: "backlog",
      label: "bug",
      priority: "low",
    },
    {
      id: "TASK-4921",
      title:
        "I'll index the open-source IP feed, that should system the GB application!",
      status: "canceled",
      label: "bug",
      priority: "low",
    },
    {
      id: "TASK-5814",
      title: "We need to calculate the 1080p AGP feed!",
      status: "backlog",
      label: "bug",
      priority: "high",
    },
    {
      id: "TASK-2645",
      title:
        "Synthesizing the system won't do anything, we need to navigate the multi-byte HDD firewall!",
      status: "todo",
      label: "documentation",
      priority: "medium",
    },
    {
      id: "TASK-4535",
      title:
        "Try to copy the JSON circuit, maybe it will connect the wireless feed!",
      status: "in progress",
      label: "feature",
      priority: "low",
    },
    {
      id: "TASK-4463",
      title: "We need to copy the solid state AGP monitor!",
      status: "done",
      label: "documentation",
      priority: "low",
    },
  ];

  return (
    <div className="flex h-full flex-col space-y-4 p-4">
      <DataTable
        data={tasks}
        columns={columns}
        onRowClick={(row) => {
          setSelectedTest(row.original);
          setIsSheetOpen(true);
        }}
      />

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="xl:max-w-[700px] lg:max-w-[600px] md:max-w-[500px] sm:max-w-[400px] overflow-y-auto">
          {selectedTest && (
            <>
              <SheetHeader>
                <SheetTitle className="mt-4">{selectedTest.title}</SheetTitle>
                <SheetDescription>Task ID: {selectedTest.id}</SheetDescription>
              </SheetHeader>
              <div className="py-6 space-y-6">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Status</h3>
                  <div className="flex items-center space-x-2">
                    {(() => {
                      const status = statuses.find(
                        (s) => s.value === selectedTest.status
                      );
                      return status ? (
                        <>
                          {status.icon && (
                            <status.icon className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span>{status.label}</span>
                        </>
                      ) : null;
                    })()}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Priority</h3>
                  <div>
                    {(() => {
                      const priority = priorities.find(
                        (p) => p.value === selectedTest.priority
                      );
                      return priority ? priority.label : selectedTest.priority;
                    })()}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Label</h3>
                  <div>
                    {(() => {
                      const label = labels.find(
                        (l) => l.value === selectedTest.label
                      );
                      return label ? (
                        <Badge variant="outline">{label.label}</Badge>
                      ) : null;
                    })()}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
